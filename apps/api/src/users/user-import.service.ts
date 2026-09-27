import { Injectable } from '@nestjs/common';
import {
  IMPORT_FIELD_LABELS,
  fullName,
  normalizeForSearch,
  transliterate,
  userSearchText,
  type ImportField,
  type Role,
} from '@ijod/shared';
import { fileTypeFromBuffer } from 'file-type';
import { AccessService } from '../access/access.service.js';
import { AuditService } from '../audit/audit.service.js';
import { generateTemporaryPassword, hashPassword } from '../auth/passwords.js';
import type { AuthUser } from '../common/auth-user.js';
import { dateOnly } from '../common/dates.js';
import { badRequest, conflict, notFound } from '../common/errors.js';
import type { UploadedFileData } from '../common/uploaded-file.js';
import { ExcelJS, addTableSheet, newWorkbook, workbookToBuffer } from '../common/xlsx.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UsersService } from './users.service.js';

export const IMPORT_MAX_BYTES = 5 * 1024 * 1024;
export const IMPORT_MAX_ROWS = 2000;
const LOGIN_PATTERN = /^[a-z0-9._-]{3,50}$/;

type Mapping = Partial<Record<ImportField, number | null>>;

export interface ImportOptions {
  mapping: Mapping;
  defaultRole: 'STUDENT' | 'TEACHER';
  skipRows: number[];
}

interface StoredRow {
  rowNumber: number;
  cells: string[];
}

export type PreviewStatus = 'ok' | 'warning' | 'error' | 'skipped';

export interface PreviewRow {
  rowNumber: number;
  cells: string[];
  status: PreviewStatus;
  errors: string[];
  warnings: string[];
  resolved: {
    lastName: string;
    firstName: string;
    middleName: string | null;
    role: Role | null;
    className: string | null;
    classId: string | null;
    login: string | null;
  };
}

/** Sarlavhalarni avtomatik moslashtirish uchun kalit so‘zlar (tartib muhim). */
const HEADER_RULES: [ImportField, (header: string) => boolean][] = [
  ['fullName', (h) => /f\.?\s*i\.?\s*sh|ф\.?\s*и\.?\s*о|familiya,? ism|full ?name|to'liq ism/.test(h)],
  ['middleName', (h) => /otasining|sharif|отчество|middle|patronymic/.test(h)],
  ['lastName', (h) => /familiya|фамилия|last ?name|surname/.test(h)],
  ['firstName', (h) => /^ism|^исм|имя|first ?name|^name$/.test(h)],
  ['role', (h) => /^rol|роль|^role|lavozim/.test(h)],
  ['className', (h) => /sinf|класс|^class|guruh/.test(h)],
  ['login', (h) => /login|логин|user ?name/.test(h)],
];

const ROLE_ALIASES: Record<string, Role> = {
  "o'quvchi": 'STUDENT',
  oquvchi: 'STUDENT',
  "ўқувчи": 'STUDENT',
  ученик: 'STUDENT',
  учащийся: 'STUDENT',
  student: 'STUDENT',
  "o'qituvchi": 'TEACHER',
  oqituvchi: 'TEACHER',
  "ўқитувчи": 'TEACHER',
  учитель: 'TEACHER',
  преподаватель: 'TEACHER',
  teacher: 'TEACHER',
};

/** “9a”, “9 A”, “9-«А»” → “9-A”. */
export function normalizeClassName(value: string): string | null {
  const clean = transliterate(value).toUpperCase().replace(/["«»“”'‘’]/g, '').trim();
  const match = /^(\d{1,2})\s*[-–—_/ ]?\s*([A-Z0-9]{1,10})$/.exec(clean);
  return match ? `${Number(match[1])}-${match[2]}` : null;
}

const cellText = (cell: ExcelJS.Cell): string => {
  const text = cell.text ?? '';
  return String(text).replace(/\s+/g, ' ').trim();
};

@Injectable()
export class UserImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  // ------------------------------------------------------------ Yuklash

  async upload(viewer: AuthUser, file: UploadedFileData | undefined) {
    if (!file) throw badRequest('NO_FILE', 'Excel faylini tanlang.');
    if (file.size > IMPORT_MAX_BYTES) throw badRequest('FILE_TOO_LARGE', 'Fayl hajmi 5 MB dan oshmasligi kerak.');
    const type = await fileTypeFromBuffer(file.buffer);
    if (type?.ext !== 'xlsx') {
      throw badRequest('UNSUPPORTED_FILE', 'Faqat Excel (.xlsx) fayli qabul qilinadi.');
    }

    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(file.buffer as unknown as ArrayBuffer);
    } catch {
      throw badRequest('UNREADABLE_FILE', 'Faylni o‘qib bo‘lmadi. U buzilmaganini tekshiring.');
    }
    const sheet = workbook.worksheets[0];
    if (!sheet) throw badRequest('EMPTY_FILE', 'Faylda varaq topilmadi.');

    let headers: string[] | null = null;
    const rows: StoredRow[] = [];
    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      const cells: string[] = [];
      for (let column = 1; column <= Math.min(row.cellCount, 50); column += 1) {
        cells.push(cellText(row.getCell(column)));
      }
      if (cells.every((value) => !value)) return;
      if (!headers) headers = cells;
      else rows.push({ rowNumber, cells });
    });
    if (!headers || rows.length === 0) {
      throw badRequest('EMPTY_FILE', 'Faylda sarlavha va kamida bitta ma’lumot qatori bo‘lishi kerak.');
    }
    if (rows.length > IMPORT_MAX_ROWS) {
      throw badRequest('TOO_MANY_ROWS', `Bir martada ko‘pi bilan ${IMPORT_MAX_ROWS} ta qator import qilinadi.`);
    }

    const batch = await this.prisma.importBatch.create({
      data: {
        createdById: viewer.id,
        fileName: file.originalname.slice(0, 200),
        headers,
        rows: rows as unknown as Prisma.InputJsonValue,
      },
    });
    const options: ImportOptions = {
      mapping: this.suggestMapping(headers),
      defaultRole: 'STUDENT',
      skipRows: [],
    };
    return this.preview(viewer, batch.id, options);
  }

  suggestMapping(headers: string[]): Mapping {
    const mapping: Mapping = {};
    const used = new Set<number>();
    headers.forEach((raw, index) => {
      const header = normalizeForSearch(raw);
      if (!header) return;
      for (const [field, test] of HEADER_RULES) {
        if (mapping[field] === undefined && !used.has(index) && test(header)) {
          mapping[field] = index;
          used.add(index);
          break;
        }
      }
    });
    // F.I.Sh. ustuni bo‘lsa-yu, alohida familiya/ism ham topilsa — alohidalari ustun.
    if (mapping.lastName !== undefined && mapping.firstName !== undefined) delete mapping.fullName;
    return mapping;
  }

  private async loadBatch(viewer: AuthUser, batchId: string) {
    const batch = await this.prisma.importBatch.findUnique({ where: { id: batchId } });
    if (!batch || batch.createdById !== viewer.id) throw notFound('Import');
    return {
      ...batch,
      headers: batch.headers as string[],
      rows: batch.rows as unknown as StoredRow[],
    };
  }

  // ------------------------------------------------------------ Tekshirish

  async preview(viewer: AuthUser, batchId: string, options: ImportOptions) {
    const batch = await this.loadBatch(viewer, batchId);
    const rows = await this.validateRows(batch.rows, options);
    await this.prisma.importBatch.update({
      where: { id: batch.id },
      data: { summary: { lastOptions: options } as unknown as Prisma.InputJsonValue },
    });
    return {
      batchId: batch.id,
      fileName: batch.fileName,
      committedAt: batch.committedAt,
      headers: batch.headers,
      mapping: options.mapping,
      defaultRole: options.defaultRole,
      fieldLabels: IMPORT_FIELD_LABELS,
      rows,
      counts: countStatuses(rows),
    };
  }

  private async validateRows(stored: StoredRow[], options: ImportOptions): Promise<PreviewRow[]> {
    const { mapping } = options;
    const hasNames =
      (mapping.fullName ?? null) !== null ||
      ((mapping.lastName ?? null) !== null && (mapping.firstName ?? null) !== null);
    if (!hasNames) {
      throw badRequest(
        'MAPPING_INCOMPLETE',
        '“F.I.Sh.” ustunini yoki alohida “Familiya” va “Ism” ustunlarini moslashtiring.',
      );
    }
    const value = (row: StoredRow, field: ImportField) => {
      const index = mapping[field];
      return index === null || index === undefined ? '' : (row.cells[index] ?? '').trim();
    };

    const year = await this.access.currentYear();
    const classes = year
      ? await this.prisma.class.findMany({ where: { academicYearId: year.id, archivedAt: null } })
      : [];
    const classByName = new Map(classes.map((item) => [item.name.toUpperCase(), item]));

    const skip = new Set(options.skipRows);
    const seenKeys = new Map<string, number>();
    const fileLogins = new Map<string, number>();
    const result: PreviewRow[] = [];

    for (const row of stored) {
      const errors: string[] = [];
      const warnings: string[] = [];

      let lastName = value(row, 'lastName');
      let firstName = value(row, 'firstName');
      let middleName: string | null = value(row, 'middleName') || null;
      if ((mapping.fullName ?? null) !== null && (!lastName || !firstName)) {
        const parts = value(row, 'fullName').split(' ').filter(Boolean);
        lastName = parts[0] ?? '';
        firstName = parts[1] ?? '';
        middleName = parts.slice(2).join(' ') || middleName;
      }
      if (!lastName) errors.push('Familiya ko‘rsatilmagan');
      if (!firstName) errors.push('Ism ko‘rsatilmagan');
      if (lastName.length > 80 || firstName.length > 80) errors.push('Ism yoki familiya juda uzun');

      const roleText = value(row, 'role');
      let role: Role | null = options.defaultRole;
      if (roleText) {
        role = ROLE_ALIASES[normalizeForSearch(roleText)] ?? null;
        if (!role) errors.push(`Rol noma’lum: “${roleText}” (o‘quvchi yoki o‘qituvchi bo‘lishi kerak)`);
      }

      const classText = value(row, 'className');
      let className: string | null = null;
      let classId: string | null = null;
      if (classText) {
        className = normalizeClassName(classText);
        const found = className ? classByName.get(className) : undefined;
        if (!found) errors.push(`Sinf topilmadi: “${classText}” (joriy o‘quv yilida bunday sinf yo‘q)`);
        else if (role !== 'STUDENT') warnings.push('Sinf faqat o‘quvchilar uchun hisobga olinadi');
        else classId = found.id;
      } else if (role === 'STUDENT') {
        warnings.push('Sinf ko‘rsatilmagan — o‘quvchi keyinroq sinfga biriktiriladi');
      }

      let login: string | null = value(row, 'login').toLowerCase() || null;
      if (login && !LOGIN_PATTERN.test(login)) {
        errors.push('Login faqat lotin harflari, raqam, nuqta, chiziqcha va pastki chiziqdan iborat bo‘lishi kerak (3–50 belgi)');
      }
      if (login) {
        const previous = fileLogins.get(login);
        if (previous !== undefined) errors.push(`Login faylda takrorlangan (${previous}-qator)`);
        else fileLogins.set(login, row.rowNumber);
      }

      const key = normalizeForSearch(`${lastName} ${firstName} ${middleName ?? ''} ${className ?? ''}`);
      const duplicateOf = seenKeys.get(key);
      if (lastName && firstName && duplicateOf !== undefined) {
        errors.push(`Faylda takroriy yozuv (${duplicateOf}-qator bilan bir xil)`);
      } else if (lastName && firstName) {
        seenKeys.set(key, row.rowNumber);
      }

      result.push({
        rowNumber: row.rowNumber,
        cells: row.cells,
        status: 'ok',
        errors,
        warnings,
        resolved: { lastName, firstName, middleName, role, className, classId, login },
      });
    }

    // Bazadagi loginlar va shu ismli foydalanuvchilar bilan solishtirish.
    const explicitLogins = result.map((row) => row.resolved.login).filter((login): login is string => Boolean(login));
    const takenLogins = new Set(
      (
        await this.prisma.user.findMany({ where: { login: { in: explicitLogins } }, select: { login: true } })
      ).map((user) => user.login),
    );
    // Maktabdagi hisoblar soni bir necha mingdan oshmaydi — ismlarni xotirada solishtiramiz.
    const nameKey = (person: { lastName: string; firstName: string; middleName?: string | null }) =>
      normalizeForSearch(fullName(person));
    const namesakeIds = new Map<string, number>();
    for (const user of await this.prisma.user.findMany({
      select: { internalId: true, lastName: true, firstName: true, middleName: true },
    })) {
      namesakeIds.set(nameKey(user), user.internalId);
    }

    for (const row of result) {
      if (row.resolved.login && takenLogins.has(row.resolved.login)) {
        row.errors.push(`“${row.resolved.login}” logini tizimda band`);
      }
      const namesake = namesakeIds.get(nameKey(row.resolved));
      if (namesake !== undefined) {
        row.warnings.push(`Tizimda shu ism-familiyali foydalanuvchi bor (ID ${String(namesake).padStart(6, '0')}) — takror emasligini tekshiring`);
      }
      row.status = skip.has(row.rowNumber)
        ? 'skipped'
        : row.errors.length
          ? 'error'
          : row.warnings.length
            ? 'warning'
            : 'ok';
    }
    return result;
  }

  // ------------------------------------------------------------ Tasdiqlash

  async commit(viewer: AuthUser, batchId: string, options: ImportOptions) {
    const batch = await this.loadBatch(viewer, batchId);
    if (batch.committedAt) throw conflict('ALREADY_COMMITTED', 'Bu import allaqachon tasdiqlangan.');
    const rows = await this.validateRows(batch.rows, options);
    const importable = rows.filter((row) => row.status === 'ok' || row.status === 'warning');
    if (importable.length === 0) throw badRequest('NOTHING_TO_IMPORT', 'Import qilinadigan to‘g‘ri qator yo‘q.');

    const year = await this.access.currentYear();

    // Parollarni oldindan xeshlaymiz (Argon2 sekin, tranzaksiyani uzoq ushlab turmaslik uchun).
    const prepared: { row: PreviewRow; password: string; hash: string }[] = [];
    for (let index = 0; index < importable.length; index += 8) {
      const chunk = importable.slice(index, index + 8);
      prepared.push(
        ...(await Promise.all(
          chunk.map(async (row) => {
            const password = generateTemporaryPassword();
            return { row, password, hash: await hashPassword(password) };
          }),
        )),
      );
    }

    const created = await this.prisma.$transaction(
      async (tx) => {
        const reserved = new Set<string>(
          importable.map((row) => row.resolved.login).filter((login): login is string => Boolean(login)),
        );
        const output: {
          rowNumber: number;
          id: string;
          internalId: number;
          fullName: string;
          login: string;
          temporaryPassword: string;
          role: Role;
          className: string | null;
        }[] = [];
        for (const { row, password, hash } of prepared) {
          const { lastName, firstName, middleName, role, classId, className } = row.resolved;
          const login =
            row.resolved.login ?? (await this.users.uniqueLogin(firstName, lastName, reserved, tx));
          reserved.add(login);
          const user = await tx.user.create({
            data: {
              login,
              passwordHash: hash,
              mustChangePassword: true,
              lastName,
              firstName,
              middleName,
              searchText: userSearchText({ lastName, firstName, middleName, login }),
              roles: { create: [{ role: role!, grantedById: viewer.id }] },
            },
          });
          if (classId && year) {
            await tx.enrollment.create({
              data: {
                studentId: user.id,
                classId,
                academicYearId: year.id,
                startsOn: dateOnly() > year.startsOn ? dateOnly() : year.startsOn,
              },
            });
          }
          output.push({
            rowNumber: row.rowNumber,
            id: user.id,
            internalId: user.internalId,
            fullName: fullName({ lastName, firstName, middleName }),
            login,
            temporaryPassword: password,
            role: role!,
            className: classId ? className : null,
          });
        }
        await tx.importBatch.update({
          where: { id: batch.id },
          data: {
            committedAt: new Date(),
            summary: {
              lastOptions: options,
              created: output.length,
              failedRows: rows.filter((row) => row.status === 'error').map((row) => row.rowNumber),
            } as unknown as Prisma.InputJsonValue,
          },
        });
        await this.audit.log(
          'user.import',
          { type: 'ImportBatch', id: batch.id },
          { fileName: batch.fileName, created: output.length, userIds: output.map((item) => item.id) },
          { tx },
        );
        return output;
      },
      { timeout: 120_000 },
    );

    const workbook = newWorkbook();
    const sheet = addTableSheet(
      workbook,
      'Kirish ma’lumotlari',
      [
        { header: '№', key: 'n', width: 6 },
        { header: 'Ichki ID', key: 'internalId', width: 10 },
        { header: 'F.I.Sh.', key: 'fullName', width: 36 },
        { header: 'Rol', key: 'role', width: 14 },
        { header: 'Sinf', key: 'className', width: 8 },
        { header: 'Login', key: 'login', width: 24 },
        { header: 'Vaqtinchalik parol', key: 'password', width: 20 },
      ],
      created.map((item, index) => ({
        n: index + 1,
        internalId: String(item.internalId).padStart(6, '0'),
        fullName: item.fullName,
        role: item.role === 'STUDENT' ? 'O‘quvchi' : 'O‘qituvchi',
        className: item.className ?? '',
        login: item.login,
        password: item.temporaryPassword,
      })),
    );
    sheet.addRow([]);
    sheet.addRow(['Birinchi kirishda vaqtinchalik parolni almashtirish talab qilinadi. Fayl maxfiy — tarqatilgach o‘chirib tashlang.']);

    return {
      created: created.map(({ temporaryPassword: _password, ...rest }) => rest),
      createdCount: created.length,
      errorCount: rows.filter((row) => row.status === 'error').length,
      skippedCount: rows.filter((row) => row.status === 'skipped').length,
      credentialsFileName: `kirish-malumotlari-${batch.id.slice(0, 8)}.xlsx`,
      credentialsXlsxBase64: (await workbookToBuffer(workbook)).toString('base64'),
    };
  }

  /** Xato qatorlarni sababi bilan alohida Excel faylga chiqaradi. */
  async errorsWorkbook(viewer: AuthUser, batchId: string) {
    const batch = await this.loadBatch(viewer, batchId);
    const options = (batch.summary as { lastOptions?: ImportOptions } | null)?.lastOptions;
    if (!options) throw badRequest('NO_PREVIEW', 'Avval import ko‘rinishini tekshiring.');
    const rows = (await this.validateRows(batch.rows, options)).filter((row) => row.status === 'error');
    const workbook = newWorkbook();
    addTableSheet(
      workbook,
      'Xato qatorlar',
      [
        { header: 'Qator', key: 'rowNumber', width: 8 },
        ...batch.headers.map((header, index) => ({ header: header || `Ustun ${index + 1}`, key: `c${index}`, width: 18 })),
        { header: 'Xato sababi', key: 'reason', width: 60 },
      ],
      rows.map((row) => ({
        rowNumber: row.rowNumber,
        ...Object.fromEntries(batch.headers.map((_, index) => [`c${index}`, row.cells[index] ?? ''])),
        reason: row.errors.join('; '),
      })),
    );
    return {
      fileName: `import-xatolari-${batch.id.slice(0, 8)}.xlsx`,
      buffer: await workbookToBuffer(workbook),
    };
  }
}

function countStatuses(rows: PreviewRow[]) {
  const counts = { total: rows.length, ok: 0, warning: 0, error: 0, skipped: 0 };
  for (const row of rows) counts[row.status] += 1;
  return counts;
}
