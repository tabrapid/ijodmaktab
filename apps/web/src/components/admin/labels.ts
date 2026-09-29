/**
 * Administrator bo‘limi uchun o‘zbekcha nomlar: rollar (ko‘plikda), a’zolik yakuni sabablari,
 * import holatlari va audit jurnalidagi amallar.
 */
import type { Role } from '@ijod/shared';
import type { BadgeTone } from '@/components/ui/badge';
import type { ImportPreviewRow } from '@/lib/types';

export const ROLE_PLURAL_LABELS: Record<Role, string> = {
  STUDENT: 'O‘quvchilar',
  TEACHER: 'O‘qituvchilar',
  DEPUTY: 'Direktor o‘rinbosarlari',
  ADMIN: 'Administratorlar',
  SUPER_ADMIN: 'Super adminlar',
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  STUDENT: 'Testlarni topshiradi va portfolio yuritadi.',
  TEACHER: 'Test yaratadi va o‘tkazadi, biriktirilgan sinflar bilan ishlaydi.',
  DEPUTY: 'Butun maktab ko‘rsatkichlari, portfolio tasdiqlash, o‘qituvchi va o‘quvchi hisoblari, cheklangan audit.',
  ADMIN: 'Hisoblar va maktab tuzilmasini boshqaradi (o‘quv natijalarisiz).',
  SUPER_ADMIN: 'Tizim boshqaruvi. Boshqa rollar bilan birlashtirilmaydi.',
};

/** Administrator beradigan rollar (umumiy paketdan; bu yerdan eski importlar uchun qayta eksport). */
export { ADMIN_GRANTABLE_ROLES } from '@ijod/shared';

// ---------------------------------------------------------------- Sinfga a’zolik

export type EnrollmentEndReason = 'TRANSFER' | 'GRADUATED' | 'LEFT' | 'OTHER';

export const ENROLLMENT_END_REASON_LABELS: Record<EnrollmentEndReason, string> = {
  TRANSFER: 'Boshqa sinfga ko‘chirildi',
  GRADUATED: 'Maktabni bitirdi',
  LEFT: 'Maktabdan ketdi',
  OTHER: 'Boshqa sabab',
};

/** A’zolikni qo‘lda tugatishda tanlanadigan sabablar (ko‘chirish alohida amal). */
export const END_ENROLLMENT_REASONS = ['LEFT', 'GRADUATED', 'OTHER'] as const;

export const endReasonLabel = (reason: string | null) =>
  reason ? (ENROLLMENT_END_REASON_LABELS[reason as EnrollmentEndReason] ?? reason) : '—';

// ---------------------------------------------------------------- Import

type ImportStatus = ImportPreviewRow['status'];

export const IMPORT_STATUS_LABELS: Record<ImportStatus, string> = {
  ok: 'To‘g‘ri',
  warning: 'Ogohlantirish',
  error: 'Xato',
  skipped: 'O‘tkazib yuboriladi',
};

export const IMPORT_STATUS_TONES: Record<ImportStatus, BadgeTone> = {
  ok: 'green',
  warning: 'amber',
  error: 'red',
  skipped: 'gray',
};

// ---------------------------------------------------------------- Audit

/** Audit jurnalidagi amal kodlarining o‘zbekcha tavsifi (kod ham yonida ko‘rsatiladi). */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  'auth.login': 'Tizimga kirish',
  'auth.logout': 'Tizimdan chiqish',
  'auth.login_failed': 'Muvaffaqiyatsiz kirish urinishi',
  'auth.login_blocked': 'Bloklangan hisobga kirish urinishi',
  'auth.account_locked': 'Hisob vaqtincha bloklandi',
  'auth.password_changed': 'Parol almashtirildi',
  'auth.password_change_failed': 'Parolni almashtirishda xato',
  'auth.mfa_enabled': 'Ikki bosqichli kirish yoqildi',
  'auth.mfa_disabled': 'Ikki bosqichli kirish o‘chirildi',
  'auth.mfa_verified': 'Ikki bosqichli tasdiqdan o‘tildi',
  'auth.mfa_failed': 'Noto‘g‘ri tasdiqlash kodi',
  'user.create': 'Foydalanuvchi yaratildi',
  'user.update': 'Foydalanuvchi ma’lumotlari o‘zgartirildi',
  'user.roles_changed': 'Rollar o‘zgartirildi',
  'user.status_changed': 'Hisob holati o‘zgartirildi',
  'user.password_reset': 'Parol tiklandi',
  'user.unlocked': 'Hisob blokdan chiqarildi',
  'user.sessions_revoked': 'Sessiyalar bekor qilindi',
  'user.delete': 'Foydalanuvchi o‘chirildi',
  'user.import': 'Excel orqali import qilindi',
  'user.avatar_updated': 'Profil rasmi yangilandi',
  'user.avatar_removed': 'Profil rasmi olib tashlandi',
  'school.update': 'Maktab ma’lumotlari o‘zgartirildi',
  'academic_year.create': 'O‘quv yili yaratildi',
  'academic_year.update': 'O‘quv yili o‘zgartirildi',
  'academic_year.make_current': 'Joriy o‘quv yili belgilandi',
  'subject.create': 'Fan yaratildi',
  'subject.update': 'Fan o‘zgartirildi',
  'class.create': 'Sinf yaratildi',
  'class.update': 'Sinf o‘zgartirildi',
  'class.archive': 'Sinf arxivlandi',
  'class.unarchive': 'Sinf arxivdan chiqarildi',
  'enrollment.add': 'O‘quvchilar sinfga qo‘shildi',
  'enrollment.transfer': 'O‘quvchi boshqa sinfga ko‘chirildi',
  'enrollment.end': 'Sinfga a’zolik tugatildi',
  'teaching_assignment.create': 'O‘qituvchi fan va sinfga biriktirildi',
  'teaching_assignment.delete': 'Biriktiruv o‘chirildi',
  'question.create': 'Savol yaratildi',
  'question.update': 'Savol o‘zgartirildi',
  'question.archive': 'Savol arxivlandi',
  'question.school_requested': 'Savol maktab bankiga taklif qilindi',
  'question.school_approved': 'Savol maktab bankiga qabul qilindi',
  'question.school_rejected': 'Savol maktab bankiga qabul qilinmadi',
  'test.create': 'Test yaratildi',
  'test.copied': 'Testdan nusxa olindi',
  'test.shared': 'Test ulashildi',
  'test.unshared': 'Test ulashish bekor qilindi',
  'test.archived': 'Test arxivlandi',
  'test.version_frozen': 'Test versiyasi muzlatildi',
  'test.school_shared': 'Test maktab test bankiga chiqarildi',
  'test.school_unshared': 'Test maktab test bankidan olindi',
  'session.create': 'Sessiya yaratildi',
  'session.started': 'Sessiya boshlandi',
  'session.closed': 'Sessiya yopildi',
  'session.cancelled': 'Sessiya bekor qilindi',
  'session.timing_changed': 'Sessiya vaqti o‘zgartirildi',
  'session.fullscreen_changed': 'To‘liq ekran nazorati o‘zgartirildi',
  'session.code_rotated': 'Kirish kodi almashtirildi',
  'session.assignments_changed': 'Ishtirokchilar ro‘yxati o‘zgartirildi',
  'session.review_opened': 'Javoblarni ko‘rish ochildi',
  'session.results_published': 'Natijalar e’lon qilindi',
  'attempt.start': 'Urinish boshlandi',
  'attempt.submit': 'Urinish topshirildi',
  'attempt.time_extended': 'Vaqt uzaytirildi',
  'attempt.cancelled': 'Urinish bekor qilindi',
  'attempt.invalid_code': 'Noto‘g‘ri kirish kodi kiritildi',
  'attempt.device_takeover': 'Urinish boshqa qurilmada davom ettirildi',
  'attempt.late_answer_rejected': 'Muddatdan keyin kelgan javob qabul qilinmadi',
  'attempt.locked': 'Test to‘xtatildi (to‘liq ekran nazorati)',
  'attempt.unlocked': 'Testga qayta ruxsat berildi',
  'grades.revised': 'Qayta baholandi',
  'results.view': 'Natijalar ko‘rildi',
  'export.requested': 'Eksport so‘raldi',
  'export.downloaded': 'Eksport yuklab olindi',
  'export.download_denied': 'Eksportni yuklab olish rad etildi',
  'portfolio.create': 'Portfolio yozuvi yaratildi',
  'portfolio.update': 'Portfolio yozuvi o‘zgartirildi',
  'portfolio.delete': 'Portfolio yozuvi o‘chirildi',
  'portfolio.submitted': 'Portfolio tekshiruvga yuborildi',
  'portfolio.approved': 'Portfolio yozuvi tasdiqlandi',
  'portfolio.returned': 'Portfolio yozuvi tuzatishga qaytarildi',
  'portfolio.printed': 'Portfolio chop etish uchun ochildi',
  'portfolio.evidence_exported': 'Portfolio sertifikatlari arxivi (ZIP) yuklab olindi',
  'portfolio.directory_exported': 'Portfoliolar ro‘yxati Excelga yuklab olindi',
  'file.uploaded': 'Fayl yuklandi',
  'file.quarantined': 'Fayl karantinga olindi',
};

export const auditActionLabel = (action: string): string | null => AUDIT_ACTION_LABELS[action] ?? null;

export interface AuditPrefix {
  value: string;
  label: string;
  /** Faqat super adminga ko‘rinadigan (xavfsizlik) yozuvlar. */
  securityOnly?: boolean;
}

/** Filtr uchun ko‘p ishlatiladigan amal guruhlari (kod boshlanishi). */
export const AUDIT_PREFIXES: AuditPrefix[] = [
  { value: 'auth.', label: 'Kirish va xavfsizlik', securityOnly: true },
  { value: 'user.', label: 'Foydalanuvchilar' },
  { value: 'session.', label: 'Sessiyalar' },
  { value: 'attempt.', label: 'Urinishlar' },
  { value: 'grades.', label: 'Qayta baholash' },
  { value: 'results.', label: 'Natijalarni ko‘rish' },
  { value: 'export.', label: 'Eksportlar' },
  { value: 'portfolio.', label: 'Portfolio' },
  { value: 'test.', label: 'Testlar' },
  { value: 'question.', label: 'Savollar banki' },
  { value: 'class.', label: 'Sinflar' },
  { value: 'enrollment.', label: 'Sinfga a’zolik' },
  { value: 'teaching_assignment.', label: 'Biriktirishlar' },
  { value: 'academic_year.', label: 'O‘quv yillari' },
  { value: 'subject.', label: 'Fanlar' },
  { value: 'file.', label: 'Fayllar' },
];

export const AUDIT_ENTITY_LABELS: Record<string, string> = {
  User: 'Foydalanuvchi',
  ImportBatch: 'Import',
  School: 'Maktab',
  AcademicYear: 'O‘quv yili',
  Subject: 'Fan',
  Class: 'Sinf',
  TeachingAssignment: 'Biriktiruv',
  Question: 'Savol',
  TestTemplate: 'Test',
  TestVersion: 'Test versiyasi',
  AssessmentSession: 'Sessiya',
  Attempt: 'Urinish',
  ExportJob: 'Eksport',
  PortfolioItem: 'Portfolio yozuvi',
  FileAsset: 'Fayl',
};

export const auditEntityLabel = (type: string | null) => (type ? (AUDIT_ENTITY_LABELS[type] ?? type) : '—');
