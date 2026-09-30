/**
 * O‘qituvchi ma’lumotnomasi: bazadan o‘qiladigan maydonlar va API ko‘rinishlari (o‘qituvchining o‘zi va
 * rahbariyat uchun bir xil shakl).
 */
import {
  INTERNATIONAL_CERTIFICATE_TYPES,
  PORTFOLIO_ITEM_TYPE_LABELS,
  TEACHER_CREDENTIAL_KINDS,
  fullName,
  schoolToday,
  teacherCategoryValidity,
  type InternationalCertificateType,
  type PortfolioItemType,
  type TeacherCredentialKind,
} from '@ijod/shared';
import { avatarUrlOf } from '../common/auth-user.js';
import { isoDateOnly } from '../common/dates.js';
import { num } from '../common/numbers.js';
import type { Prisma } from '../generated/prisma/client.js';
import { resultOf } from '../portfolio/portfolio-common.js';

// ------------------------------------------------------------ Fayl

export const fileRefSelect = {
  id: true,
  originalName: true,
  mimeType: true,
  sizeBytes: true,
  status: true,
  deletedAt: true,
} satisfies Prisma.FileAssetSelect;

type FileRow = Prisma.FileAssetGetPayload<{ select: typeof fileRefSelect }>;

/** Hujjat fayli: o‘chirilgan yoki karantindagi fayl ko‘rsatilmaydi. */
export function fileRef(file: FileRow | null | undefined) {
  if (!file || file.deletedAt || file.status !== 'CLEAN') return null;
  return { id: file.id, originalName: file.originalName, mimeType: file.mimeType, sizeBytes: file.sizeBytes };
}

const dateOf = (value: Date | null | undefined) => (value ? isoDateOnly(value) : null);

// ------------------------------------------------------------ O‘quvchi

/** O‘quvchi: ism, joriy o‘quv yilidagi sinfi va profil rasmi (boshqa shaxsiy ma’lumotsiz). */
export const studentSelect = {
  id: true,
  lastName: true,
  firstName: true,
  middleName: true,
  avatarFileId: true,
  enrollments: {
    where: { endsOn: null, academicYear: { isCurrent: true } },
    select: { class: { select: { name: true } } },
    take: 1,
  },
} satisfies Prisma.UserSelect;

type StudentRow = Prisma.UserGetPayload<{ select: typeof studentSelect }>;

export function studentRef(student: StudentRow) {
  return {
    id: student.id,
    fullName: fullName(student),
    className: student.enrollments[0]?.class.name ?? null,
    avatarUrl: avatarUrlOf(student.avatarFileId),
  };
}

// ------------------------------------------------------------ Asosiy qism (1–3-bandlar)

export const profileInclude = {
  degreeFile: { select: fileRefSelect },
  categoryFile: { select: fileRefSelect },
} satisfies Prisma.TeacherProfileInclude;

type ProfileRow = Prisma.TeacherProfileGetPayload<{ include: typeof profileInclude }>;

/** Ma’lumotnomaning asosiy qismi; yozuv hali bo‘lmasa — bo‘sh qiymatlar. Toifa 5 yil amal qiladi. */
export function profileView(profile: ProfileRow | null, today = schoolToday()) {
  const awardedOn = dateOf(profile?.categoryAwardedOn);
  const category = profile?.category ?? 'NONE';
  const validity = category !== 'NONE' && awardedOn ? teacherCategoryValidity(awardedOn, today) : null;
  return {
    university: profile?.university ?? null,
    graduationYear: profile?.graduationYear ?? null,
    academicDegree: profile?.academicDegree ?? 'NONE',
    degreeFile: fileRef(profile?.degreeFile),
    category,
    categoryAwardedOn: awardedOn,
    categoryValidUntil: validity?.validUntil ?? null,
    categoryExpired: validity?.expired ?? false,
    categoryFile: fileRef(profile?.categoryFile),
  };
}

// ------------------------------------------------------------ Hujjatlar (4–9-bandlar)

export const credentialInclude = {
  subject: { select: { id: true, name: true } },
  file: { select: fileRefSelect },
} satisfies Prisma.TeacherCredentialInclude;

export type CredentialRow = Prisma.TeacherCredentialGetPayload<{ include: typeof credentialInclude }>;

/** Xalqaro sertifikat turi `details` da saqlanadi. */
export function certificateTypeOf(details: Prisma.JsonValue | null): InternationalCertificateType | null {
  if (!details || typeof details !== 'object' || Array.isArray(details)) return null;
  const value = (details as Record<string, unknown>).certificateType;
  return typeof value === 'string' && (INTERNATIONAL_CERTIFICATE_TYPES as readonly string[]).includes(value)
    ? (value as InternationalCertificateType)
    : null;
}

export function credentialView(row: CredentialRow) {
  return {
    id: row.id,
    kind: row.kind as TeacherCredentialKind,
    title: row.title,
    subject: row.subject,
    provider: row.provider,
    level: row.level,
    score: num(row.score),
    certificateNumber: row.certificateNumber,
    issuedOn: dateOf(row.issuedOn),
    validUntil: dateOf(row.validUntil),
    certificateType: certificateTypeOf(row.details),
    file: fileRef(row.file),
    createdAt: row.createdAt,
  };
}

const kindOrder = (kind: string) => TEACHER_CREDENTIAL_KINDS.indexOf(kind as TeacherCredentialKind);

/** Ma’lumotnoma tartibida (4–9-bandlar), har bandda — eng yangi hujjat birinchi. */
export function sortCredentials<T extends Pick<CredentialRow, 'kind' | 'issuedOn' | 'createdAt'>>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const byKind = kindOrder(a.kind) - kindOrder(b.kind);
    if (byKind !== 0) return byKind;
    const aDate = a.issuedOn?.getTime() ?? -Infinity;
    const bDate = b.issuedOn?.getTime() ?? -Infinity;
    if (aDate !== bDate) return bDate - aDate;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });
}

// ------------------------------------------------------------ Ustozlik (10–11-bandlar)

export const mentorshipInclude = {
  portfolioItem: {
    select: {
      id: true,
      type: true,
      title: true,
      details: true,
      result: true,
      date: true,
      status: true,
      owner: { select: studentSelect },
    },
  },
} satisfies Prisma.TeacherMentorshipInclude;

export type MentorshipRow = Prisma.TeacherMentorshipGetPayload<{ include: typeof mentorshipInclude }>;

/** Sertifikat haqida faqat qisqa ma’lumot: dalil fayllari va boshqa yozuvlar ko‘rsatilmaydi. */
export function certificateBrief(item: {
  id: string;
  type: string;
  title: string;
  details: Prisma.JsonValue | null;
  result: string | null;
  date: Date | null;
}) {
  const type = item.type as PortfolioItemType;
  return {
    id: item.id,
    type,
    typeLabel: PORTFOLIO_ITEM_TYPE_LABELS[type],
    title: item.title,
    summary: resultOf({ type: item.type as PortfolioItemType, details: item.details, result: item.result }),
    date: dateOf(item.date),
  };
}

export function mentorshipView(row: MentorshipRow) {
  const item = row.portfolioItem;
  return {
    id: row.id,
    kind: row.kind,
    createdAt: row.createdAt,
    student: studentRef(item.owner),
    // Sertifikat keyin tahrirlanib qayta tasdiqlashga tushgan bo‘lishi mumkin.
    certificate: { ...certificateBrief(item), approved: item.status === 'APPROVED' },
  };
}

export type MentorshipView = ReturnType<typeof mentorshipView>;
