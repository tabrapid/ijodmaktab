import {
  INTERNATIONAL_CERTIFICATE_LABELS,
  INTERNATIONAL_TEACHER_CREDENTIAL_KINDS,
  NATIONAL_TEACHER_CREDENTIAL_KINDS,
  formatDate,
  formatPoints,
  schoolToday,
  teacherCategoryValidity,
  type MentorshipKind,
  type TeacherCategory,
  type TeacherCredentialKind,
} from '@ijod/shared';
import type { TeacherCredentialView } from '@/lib/types';

/** Ma’lumotnoma so‘rovlari kalitlari: barchasi ['teacher-reference', ...] bilan boshlanadi. */
export const referenceKeys = {
  all: ['teacher-reference'] as const,
  own: ['teacher-reference', 'own'] as const,
  teacher: (id: string) => ['teacher-reference', 'teacher', id] as const,
  students: (q: string) => ['teacher-reference', 'students', q] as const,
  candidates: (studentId: string) => ['teacher-reference', 'candidates', studentId] as const,
};

/** Ma’lumotnoma hujjatlari: PDF yoki rasm (server DOCX va WEBP ni ham qabul qiladi). */
export const DOCUMENT_ACCEPT = 'application/pdf,image/png,image/jpeg,.pdf,.png,.jpg,.jpeg';
export const DOCUMENT_EXTENSIONS = ['pdf', 'png', 'jpg', 'jpeg'];
/** Server bilan bir xil chegara (apps/api/src/files/files.service.ts). */
export const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;

/** Qog‘ozdagi ma’lumotnoma tartibi: 4–9-bandlar. */
export const CREDENTIAL_SECTION_NUMBERS: Record<TeacherCredentialKind, number> = {
  SPECIALTY_NATIONAL: 4,
  SPECIALTY_INTERNATIONAL: 5,
  OTHER_NATIONAL: 6,
  OTHER_INTERNATIONAL: 7,
  PROFESSIONAL_DEVELOPMENT: 8,
  CONTEST: 9,
};

/** 10–11-bandlar. */
export const MENTORSHIP_SECTION_NUMBERS: Record<MentorshipKind, number> = { NATIONAL: 10, INTERNATIONAL: 11 };

export type CredentialGroup = 'national' | 'international' | 'course' | 'contest';

export function credentialGroup(kind: TeacherCredentialKind): CredentialGroup {
  if (NATIONAL_TEACHER_CREDENTIAL_KINDS.includes(kind)) return 'national';
  if (INTERNATIONAL_TEACHER_CREDENTIAL_KINDS.includes(kind)) return 'international';
  return kind === 'CONTEST' ? 'contest' : 'course';
}

/** Toifa holati: amal qilish muddati, tugaganmi yoki 6 oydan kam qolganmi. */
export function categoryStatus(category: TeacherCategory, awardedOn: string | null | undefined) {
  if (category === 'NONE' || !awardedOn) return null;
  return teacherCategoryValidity(awardedOn, schoolToday());
}

/** Hujjat muddati o‘tganmi (amal qilish muddati ko‘rsatilgan bo‘lsa). */
export const credentialExpired = (credential: Pick<TeacherCredentialView, 'validUntil'>) =>
  Boolean(credential.validUntil && credential.validUntil < schoolToday());

/** Hujjatning qisqa tafsilotlari (ro‘yxat va rahbariyat ko‘rinishi uchun). */
export function credentialFacts(credential: TeacherCredentialView): { label: string; value: string }[] {
  const group = credentialGroup(credential.kind);
  const facts: { label: string; value: string | null }[] = [
    {
      label: 'Turi',
      value:
        group === 'international' && credential.certificateType
          ? INTERNATIONAL_CERTIFICATE_LABELS[credential.certificateType]
          : null,
    },
    { label: 'Fan', value: credential.subject?.name ?? null },
    { label: group === 'contest' ? 'Natija' : 'Daraja', value: credential.level },
    { label: 'Ball', value: credential.score === null ? null : formatPoints(credential.score) },
    { label: 'Tashkilot', value: credential.provider },
    { label: 'Raqami', value: credential.certificateNumber },
    { label: group === 'course' || group === 'contest' ? 'Sana' : 'Berilgan', value: dateText(credential.issuedOn) },
    { label: 'Amal qiladi', value: credential.validUntil ? `${formatDate(credential.validUntil)} gacha` : null },
  ];
  return facts.filter((fact): fact is { label: string; value: string } => Boolean(fact.value));
}

const dateText = (value: string | null) => (value ? formatDate(value) : null);

/** Bo‘sh tanlov yoki sana `null` sifatida yuboriladi (sxema bo‘sh satrni qabul qilmaydi). */
export const emptyToNull = (value: unknown) => (value === '' || value === undefined ? null : value);

/** Son maydoni: bo‘sh — `null`, vergulli kasr ham qabul qilinadi (7,5); son bo‘lmasa — NaN (xato ko‘rsatiladi). */
export const toNumberOrNull = (value: unknown) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  const text = String(value).trim().replace(',', '.');
  return text === '' ? null : Number(text);
};
