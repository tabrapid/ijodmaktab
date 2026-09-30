import { Injectable } from '@nestjs/common';
import {
  INTERNATIONAL_TEACHER_CREDENTIAL_KINDS,
  NATIONAL_TEACHER_CREDENTIAL_KINDS,
  fullName,
  type TeacherCredentialKind,
  type teacherCredentialSchema,
  type teacherProfileSchema,
} from '@ijod/shared';
import type { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../common/auth-user.js';
import { avatarUrlOf } from '../common/auth-user.js';
import { dateOnly, isoDateOnly } from '../common/dates.js';
import { badRequest, notFound } from '../common/errors.js';
import { toJson } from '../common/json.js';
import { Prisma, type TeacherCredential } from '../generated/prisma/client.js';
import { PrismaService, type Tx } from '../prisma/prisma.service.js';
import { MentorshipService, specialtyRequired } from './mentorship.service.js';
import {
  certificateTypeOf,
  credentialInclude,
  credentialView,
  profileInclude,
  profileView,
  sortCredentials,
} from './teacher-reference.view.js';

type ProfileInput = z.output<typeof teacherProfileSchema>;
type CredentialInput = z.output<typeof teacherCredentialSchema>;

/** Fayl qaysi joyga biriktirilmoqda: ma’lumotnomaning asosiy qismi yoki hujjat (yangisida `null`). */
type FileSlot = { profile: 'degree' | 'category' } | { credentialId: string | null };

interface FileRequest {
  field: string;
  id: string | null;
  slot: FileSlot;
}

const FILE_MISSING = 'Fayl topilmadi — hujjatni qayta yuklang.';
const FILE_TWICE = 'Bitta fayl ikki joyga biriktirilmaydi — har bir hujjatni alohida yuklang.';
const FILE_AVATAR = 'Profil rasmi hujjat sifatida ishlatilmaydi — hujjat faylini yuklang.';
const FILE_EVIDENCE = 'Bu fayl portfolio yozuviga dalil sifatida biriktirilgan — hujjatni alohida yuklang.';
const FILE_BUSY = 'Bu fayl ma’lumotnomadagi boshqa hujjatga biriktirilgan — har bir hujjatni alohida yuklang.';

/** Maydon xatosi: veb-forma uni tegishli maydon ostida ko‘rsatadi. */
const fieldError = (code: string, path: string, message: string) => badRequest(code, message, [{ path, message }]);

const isNational = (kind: TeacherCredentialKind) => NATIONAL_TEACHER_CREDENTIAL_KINDS.includes(kind);
const isInternational = (kind: TeacherCredentialKind) => INTERNATIONAL_TEACHER_CREDENTIAL_KINDS.includes(kind);

const isDecimal = (value: unknown): value is { toNumber(): number } =>
  typeof value === 'object' && value !== null && typeof (value as { toNumber?: unknown }).toNumber === 'function';

/** Qiymatlar o‘zgarganini solishtirish uchun (sana — “YYYY-MM-DD”, Decimal — son). */
const comparable = (value: unknown) =>
  value instanceof Date ? isoDateOnly(value) : isDecimal(value) ? value.toNumber() : (value ?? null);

const changedFields = (before: Record<string, unknown>, after: Record<string, unknown>) =>
  Object.keys(after).filter((key) => comparable(before[key]) !== comparable(after[key]));

/**
 * O‘qituvchi ma’lumotnomasi: asosiy qism (1–3-bandlar va mutaxassislik fani) hamda hujjatlar
 * (4–9-bandlar). O‘qituvchi faqat o‘z ma’lumotnomasini o‘zgartiradi; rahbariyat — faqat ko‘radi.
 */
@Injectable()
export class TeacherProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mentorships: MentorshipService,
  ) {}

  // ------------------------------------------------------------ Ko‘rish

  /** To‘liq ma’lumotnoma (o‘qituvchining o‘zi va rahbariyat uchun bir xil shakl). */
  async reference(userId: string) {
    const [user, mentorships] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          lastName: true,
          firstName: true,
          middleName: true,
          avatarFileId: true,
          status: true,
          specialtySubject: { select: { id: true, name: true } },
          teacherProfile: { include: profileInclude },
          teacherCredentials: { include: credentialInclude },
        },
      }),
      this.mentorships.listFor(userId),
    ]);
    if (!user) throw notFound('O‘qituvchi');
    return {
      teacher: {
        id: user.id,
        fullName: fullName(user),
        avatarUrl: avatarUrlOf(user.avatarFileId),
        status: user.status,
      },
      specialtySubject: user.specialtySubject,
      profile: profileView(user.teacherProfile),
      credentials: sortCredentials(user.teacherCredentials).map(credentialView),
      mentorships,
    };
  }

  /** Rahbariyat uchun: faqat o‘qituvchi roli bor hisob (aks holda 404). */
  async leadershipReference(teacherId: string) {
    const teacher = await this.prisma.user.findFirst({
      where: { id: teacherId, roles: { some: { role: 'TEACHER' } } },
      select: { id: true },
    });
    if (!teacher) throw notFound('O‘qituvchi');
    return this.reference(teacherId);
  }

  // ------------------------------------------------------------ Umumiy tekshiruvlar

  /**
   * O‘qituvchi qatorini qulflaydi (bir vaqtdagi o‘zgarishlar navbat bilan bajariladi — bitta fayl ikki
   * joyga biriktirilib qolmaydi) va mutaxassislik fani bilan asosiy qismni qaytaradi.
   */
  private async lockTeacher(tx: Tx, userId: string) {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId}::uuid FOR UPDATE`;
    return tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        specialtySubjectId: true,
        specialtySubject: { select: { id: true, name: true } },
        teacherProfile: true,
      },
    });
  }

  private async assertActiveSubject(tx: Tx, subjectId: string, field: string) {
    const subject = await tx.subject.findUnique({ where: { id: subjectId }, select: { isActive: true } });
    if (!subject?.isActive) throw fieldError('SUBJECT_NOT_FOUND', field, 'Fan topilmadi yoki faol emas.');
  }

  /**
   * Hujjat fayllari: o‘qituvchining o‘zi yuklagan, toza (karantinsiz), o‘chirilmagan bo‘lishi va profil
   * rasmi, portfolio dalili yoki boshqa hujjat sifatida ishlatilmayotgan bo‘lishi kerak (400 FILE_NOT_ALLOWED).
   */
  private async assertFiles(tx: Tx, teacherId: string, requests: FileRequest[]) {
    const wanted = requests.filter((request): request is FileRequest & { id: string } => Boolean(request.id));
    if (wanted.length === 0) return;
    const files = await tx.fileAsset.findMany({
      where: { id: { in: wanted.map((request) => request.id) } },
      select: {
        id: true,
        ownerId: true,
        status: true,
        deletedAt: true,
        avatarOf: { select: { id: true } },
        portfolioItems: { select: { id: true }, take: 1 },
        categoryOf: { select: { userId: true } },
        degreeOf: { select: { userId: true } },
        credentialOf: { select: { id: true } },
      },
    });
    const byId = new Map(files.map((file) => [file.id, file]));
    const used = new Set<string>();
    for (const request of wanted) {
      const file = byId.get(request.id);
      const slot = request.slot;
      let problem: string | null = null;
      if (!file || file.ownerId !== teacherId || file.deletedAt || file.status !== 'CLEAN') problem = FILE_MISSING;
      else if (used.has(file.id)) problem = FILE_TWICE;
      else if (file.avatarOf) problem = FILE_AVATAR;
      else if (file.portfolioItems.length > 0) problem = FILE_EVIDENCE;
      else if (file.categoryOf && !('profile' in slot && slot.profile === 'category')) problem = FILE_BUSY;
      else if (file.degreeOf && !('profile' in slot && slot.profile === 'degree')) problem = FILE_BUSY;
      else if (file.credentialOf && !('credentialId' in slot && slot.credentialId === file.credentialOf.id)) {
        problem = FILE_BUSY;
      }
      if (problem) throw fieldError('FILE_NOT_ALLOWED', request.field, problem);
      used.add(request.id);
    }
  }

  // ------------------------------------------------------------ Asosiy qism (1–3-bandlar)

  /**
   * Ma’lumotnomaning asosiy qismini saqlaydi. Toifa yoki ilmiy daraja “yo‘q” bo‘lsa, ularning sanasi va
   * hujjati olib tashlanadi. Almashtirilgan eski fayl yetim fayllar qatori tozalanadi. Mutaxassislik fani
   * o‘zgarsa, milliy sertifikatlar 4- va 6-bandlar orasida fanga qarab qayta taqsimlanadi.
   */
  async updateProfile(viewer: AuthUser, input: ProfileInput) {
    const hasCategory = input.category !== 'NONE';
    const data = {
      university: input.university ?? null,
      graduationYear: input.graduationYear ?? null,
      academicDegree: input.academicDegree,
      degreeFileId: input.academicDegree === 'NONE' ? null : (input.degreeFileId ?? null),
      category: input.category,
      categoryAwardedOn: hasCategory && input.categoryAwardedOn ? dateOnly(input.categoryAwardedOn) : null,
      categoryFileId: hasCategory ? (input.categoryFileId ?? null) : null,
    };
    await this.prisma.$transaction(async (tx) => {
      const before = await this.lockTeacher(tx, viewer.id);
      const specialtyId = input.specialtySubjectId === undefined ? before.specialtySubjectId : input.specialtySubjectId;
      const specialtyChanged = specialtyId !== before.specialtySubjectId;
      if (specialtyChanged && specialtyId) await this.assertActiveSubject(tx, specialtyId, 'specialtySubjectId');
      await this.assertFiles(tx, viewer.id, [
        { field: 'degreeFileId', id: data.degreeFileId, slot: { profile: 'degree' } },
        { field: 'categoryFileId', id: data.categoryFileId, slot: { profile: 'category' } },
      ]);

      await tx.teacherProfile.upsert({
        where: { userId: viewer.id },
        create: { userId: viewer.id, ...data },
        update: data,
      });
      let reclassified = 0;
      if (specialtyChanged) {
        await tx.user.update({ where: { id: viewer.id }, data: { specialtySubjectId: specialtyId } });
        reclassified = await this.reclassifyNational(tx, viewer.id, specialtyId);
      }

      // Jurnalga faqat o‘zgargan maydonlar nomi yoziladi (qiymatlar emas).
      const previous = before.teacherProfile;
      const fields = [
        ...changedFields(
          {
            university: previous?.university,
            graduationYear: previous?.graduationYear,
            academicDegree: previous?.academicDegree ?? 'NONE',
            degreeFileId: previous?.degreeFileId,
            category: previous?.category ?? 'NONE',
            categoryAwardedOn: previous?.categoryAwardedOn,
            categoryFileId: previous?.categoryFileId,
          },
          data,
        ),
        ...(specialtyChanged ? ['specialtySubjectId'] : []),
      ];
      if (fields.length > 0) {
        await this.audit.log(
          'teacher.profile_updated',
          { type: 'TeacherProfile', id: viewer.id },
          { fields, ...(reclassified ? { reclassifiedCredentials: reclassified } : {}) },
          { tx },
        );
      }
    });
    return this.reference(viewer.id);
  }

  /**
   * Milliy sertifikat mutaxassislik fanidan bo‘lsa — 4-band, boshqa fandan bo‘lsa — 6-band. Mutaxassislik
   * o‘zgarganda sertifikatlar shu qoida bo‘yicha qayta taqsimlanadi.
   */
  private async reclassifyNational(tx: Tx, teacherId: string, specialtyId: string | null) {
    const toOther = await tx.teacherCredential.updateMany({
      where: {
        teacherId,
        kind: 'SPECIALTY_NATIONAL',
        ...(specialtyId ? { OR: [{ subjectId: { not: specialtyId } }, { subjectId: null }] } : {}),
      },
      data: { kind: 'OTHER_NATIONAL' },
    });
    if (!specialtyId) return toOther.count;
    const toSpecialty = await tx.teacherCredential.updateMany({
      where: { teacherId, kind: 'OTHER_NATIONAL', subjectId: specialtyId },
      data: { kind: 'SPECIALTY_NATIONAL' },
    });
    return toOther.count + toSpecialty.count;
  }

  // ------------------------------------------------------------ Hujjatlar (4–9-bandlar)

  /**
   * Hujjat turiga xos qoidalar: milliy sertifikat (4 — faqat mutaxassislik fani, 6 — boshqa fan),
   * xalqaro sertifikat turi `details` da saqlanadi; kurs va tanlovda fan bo‘lmaydi.
   */
  private async credentialData(
    tx: Tx,
    teacher: Awaited<ReturnType<TeacherProfileService['lockTeacher']>>,
    input: CredentialInput,
    existing: TeacherCredential | null,
  ) {
    let subjectId: string | null = null;
    if (isNational(input.kind)) {
      // Sxema milliy sertifikatda fanni majburiy qiladi.
      subjectId = input.subjectId ?? null;
      const specialty = teacher.specialtySubject;
      if (input.kind === 'SPECIALTY_NATIONAL') {
        if (!specialty) throw specialtyRequired();
        if (subjectId !== specialty.id) {
          throw fieldError(
            'SUBJECT_NOT_SPECIALTY',
            'subjectId',
            `Bu bandga faqat mutaxassislik faningiz (${specialty.name}) bo‘yicha sertifikat qo‘shiladi. Boshqa fan sertifikatini 6-bandga qo‘shing.`,
          );
        }
      } else if (specialty && subjectId === specialty.id) {
        throw fieldError(
          'SUBJECT_IS_SPECIALTY',
          'subjectId',
          `${specialty.name} — mutaxassislik faningiz. Bu fan sertifikatini 4-bandga qo‘shing.`,
        );
      }
      if (subjectId && subjectId !== specialty?.id && subjectId !== existing?.subjectId) {
        await this.assertActiveSubject(tx, subjectId, 'subjectId');
      }
    }
    return {
      kind: input.kind,
      title: input.title,
      subjectId,
      provider: input.provider ?? null,
      level: input.level ?? null,
      score: input.score ?? null,
      certificateNumber: input.certificateNumber ?? null,
      issuedOn: input.issuedOn ? dateOnly(input.issuedOn) : null,
      validUntil: input.validUntil ? dateOnly(input.validUntil) : null,
      details:
        isInternational(input.kind) && input.certificateType
          ? toJson({ certificateType: input.certificateType })
          : Prisma.DbNull,
      fileId: input.fileId ?? null,
    };
  }

  async createCredential(viewer: AuthUser, input: CredentialInput) {
    const created = await this.prisma.$transaction(async (tx) => {
      const teacher = await this.lockTeacher(tx, viewer.id);
      const data = await this.credentialData(tx, teacher, input, null);
      await this.assertFiles(tx, viewer.id, [{ field: 'fileId', id: data.fileId, slot: { credentialId: null } }]);
      const row = await tx.teacherCredential.create({
        data: { teacherId: viewer.id, ...data },
        include: credentialInclude,
      });
      await this.audit.log(
        'teacher.credential_added',
        { type: 'TeacherCredential', id: row.id },
        { kind: row.kind, withFile: row.fileId !== null },
        { tx },
      );
      return row;
    });
    return credentialView(created);
  }

  async updateCredential(viewer: AuthUser, id: string, input: CredentialInput) {
    const updated = await this.prisma.$transaction(async (tx) => {
      const teacher = await this.lockTeacher(tx, viewer.id);
      const existing = await tx.teacherCredential.findUnique({ where: { id } });
      if (!existing || existing.teacherId !== viewer.id) throw notFound('Hujjat');
      const { details, ...plain } = await this.credentialData(tx, teacher, input, existing);
      await this.assertFiles(tx, viewer.id, [
        { field: 'fileId', id: plain.fileId, slot: { credentialId: existing.id } },
      ]);
      const row = await tx.teacherCredential.update({
        where: { id },
        data: { ...plain, details },
        include: credentialInclude,
      });
      const fields = changedFields(existing, plain);
      if (certificateTypeOf(existing.details) !== certificateTypeOf(row.details)) fields.push('certificateType');
      await this.audit.log(
        'teacher.credential_updated',
        { type: 'TeacherCredential', id },
        { kind: row.kind, fields },
        { tx },
      );
      return row;
    });
    return credentialView(updated);
  }

  async removeCredential(viewer: AuthUser, id: string) {
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.teacherCredential.findUnique({ where: { id } });
      if (!existing || existing.teacherId !== viewer.id) throw notFound('Hujjat');
      await tx.teacherCredential.delete({ where: { id } });
      // Fayl yetim qoladi va 24 soatdan keyin tozalanadi.
      await this.audit.log(
        'teacher.credential_removed',
        { type: 'TeacherCredential', id },
        { kind: existing.kind, withFile: existing.fileId !== null },
        { tx },
      );
    });
    return { ok: true };
  }
}
