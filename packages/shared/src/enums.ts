/**
 * Tizimdagi barcha ro‘yxat (enum) qiymatlari va ularning o‘zbekcha nomlari.
 * Qiymatlar Prisma sxemasidagi enumlar bilan bir xil bo‘lishi shart
 * (apps/api dagi test buni tekshiradi).
 */

// ---------------------------------------------------------------- Rollar

export const ROLES = ['STUDENT', 'TEACHER', 'DEPUTY', 'ADMIN', 'SUPER_ADMIN'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  STUDENT: 'O‘quvchi',
  TEACHER: 'O‘qituvchi',
  DEPUTY: 'Direktor o‘rinbosari',
  ADMIN: 'Administrator',
  SUPER_ADMIN: 'Super admin',
};

/** Rahbariyat va administrator bitta paneldan foydalanadi, lekin ruxsatlari alohida. */
export const STAFF_ROLES: readonly Role[] = ['TEACHER', 'DEPUTY', 'ADMIN', 'SUPER_ADMIN'];

export const USER_STATUSES = ['ACTIVE', 'DEACTIVATED', 'ARCHIVED'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const USER_STATUS_LABELS: Record<UserStatus, string> = {
  ACTIVE: 'Faol',
  DEACTIVATED: 'Faolsizlantirilgan',
  ARCHIVED: 'Arxivlangan',
};

// ---------------------------------------------------------------- Savollar

export const CATEGORIES = ['KNOWLEDGE', 'APPLICATION', 'REASONING'] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  KNOWLEDGE: 'Bilish',
  APPLICATION: 'Qo‘llash',
  REASONING: 'Mulohaza',
};

/**
 * Kategoriyalar bo‘yicha qiymatlarni doimiy tartibda qaytaradi (bilish → qo‘llash → mulohaza).
 * JSON/JSONB kalitlari tartibiga tayanilmaydi.
 */
export function categoryEntries<T>(record: Partial<Record<Category, T>> | null | undefined): [Category, T][] {
  if (!record) return [];
  return CATEGORIES.filter((category) => record[category] !== undefined).map((category) => [
    category,
    record[category] as T,
  ]);
}

export const DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  EASY: 'Oson',
  MEDIUM: 'O‘rta',
  HARD: 'Qiyin',
};

export const QUESTION_TYPES = ['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'SHORT_ANSWER', 'MATCHING', 'ESSAY'] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  SINGLE_CHOICE: 'Bitta to‘g‘ri javobli',
  MULTIPLE_CHOICE: 'Ko‘p javobli',
  SHORT_ANSWER: 'Qisqa javob',
  MATCHING: 'Moslashtirish',
  ESSAY: 'Yozma javob',
};

/** Birinchi relizda faqat bitta to‘g‘ri javobli savollar yoqilgan. */
export const ENABLED_QUESTION_TYPES: readonly QuestionType[] = ['SINGLE_CHOICE'];

export const QUESTION_VISIBILITIES = ['PRIVATE', 'SCHOOL'] as const;
export type QuestionVisibility = (typeof QUESTION_VISIBILITIES)[number];

export const QUESTION_VISIBILITY_LABELS: Record<QuestionVisibility, string> = {
  PRIVATE: 'Shaxsiy',
  SCHOOL: 'Maktab banki',
};

// ---------------------------------------------------------------- Testlar

export const TEST_STATUSES = ['DRAFT', 'ACTIVE', 'ARCHIVED'] as const;
export type TestStatus = (typeof TEST_STATUSES)[number];

export const TEST_STATUS_LABELS: Record<TestStatus, string> = {
  DRAFT: 'Qoralama',
  ACTIVE: 'E’lon qilingan',
  ARCHIVED: 'Arxivlangan',
};

export const TEST_VERSION_STATUSES = ['DRAFT', 'FROZEN'] as const;
export type TestVersionStatus = (typeof TEST_VERSION_STATUSES)[number];

export const SHARE_PERMISSIONS = ['VIEW', 'COPY', 'EDIT'] as const;
export type SharePermission = (typeof SHARE_PERMISSIONS)[number];

export const SHARE_PERMISSION_LABELS: Record<SharePermission, string> = {
  VIEW: 'Faqat ko‘rish',
  COPY: 'Nusxa olish',
  EDIT: 'Birgalikda tahrirlash',
};

export const TEST_VISIBILITIES = ['PRIVATE', 'SCHOOL'] as const;
export type TestVisibility = (typeof TEST_VISIBILITIES)[number];

export const TEST_VISIBILITY_LABELS: Record<TestVisibility, string> = {
  PRIVATE: 'Shaxsiy',
  SCHOOL: 'Maktab test banki',
};

// ---------------------------------------------------------------- Sessiyalar

export const SESSION_STATES = ['SCHEDULED', 'OPEN', 'CLOSED', 'CANCELLED'] as const;
export type SessionState = (typeof SESSION_STATES)[number];

export const SESSION_STATE_LABELS: Record<SessionState, string> = {
  SCHEDULED: 'Rejalashtirilgan',
  OPEN: 'Ochiq',
  CLOSED: 'Yopilgan',
  CANCELLED: 'Bekor qilingan',
};

export const ATTEMPT_POLICIES = ['FIRST', 'LAST', 'BEST'] as const;
export type AttemptPolicy = (typeof ATTEMPT_POLICIES)[number];

export const ATTEMPT_POLICY_LABELS: Record<AttemptPolicy, string> = {
  FIRST: 'Birinchi urinish hisoblanadi',
  LAST: 'Oxirgi urinish hisoblanadi',
  BEST: 'Eng yaxshi urinish hisoblanadi',
};

export const SCORE_VISIBILITIES = ['AFTER_SUBMIT', 'AFTER_ALL_DONE', 'MANUAL'] as const;
export type ScoreVisibility = (typeof SCORE_VISIBILITIES)[number];

export const SCORE_VISIBILITY_LABELS: Record<ScoreVisibility, string> = {
  AFTER_SUBMIT: 'Topshirgandan so‘ng darhol',
  AFTER_ALL_DONE: 'Hamma yakunlagach yoki sessiya yopilgach',
  MANUAL: 'O‘qituvchi e’lon qilganda',
};

export const REVIEW_VISIBILITIES = ['NEVER', 'AFTER_CLOSE', 'MANUAL'] as const;
export type ReviewVisibility = (typeof REVIEW_VISIBILITIES)[number];

export const REVIEW_VISIBILITY_LABELS: Record<ReviewVisibility, string> = {
  NEVER: 'Ko‘rsatilmaydi',
  AFTER_CLOSE: 'Sessiya yopilgach',
  MANUAL: 'O‘qituvchi ochganda',
};

// ---------------------------------------------------------------- Urinishlar

export const ATTEMPT_STATUSES = ['IN_PROGRESS', 'SUBMITTED', 'EXPIRED', 'UNDER_REVIEW', 'CANCELLED'] as const;
export type AttemptStatus = (typeof ATTEMPT_STATUSES)[number];

/** Natijalar jadvalidagi holat: urinish holatlari + “boshlamagan”. */
export const PARTICIPATION_STATUSES = ['NOT_STARTED', ...ATTEMPT_STATUSES] as const;
export type ParticipationStatus = (typeof PARTICIPATION_STATUSES)[number];

export const PARTICIPATION_STATUS_LABELS: Record<ParticipationStatus, string> = {
  NOT_STARTED: 'Boshlamagan',
  IN_PROGRESS: 'Ishlamoqda',
  SUBMITTED: 'Topshirgan',
  EXPIRED: 'Vaqt tugagan (avtomatik yakunlangan)',
  UNDER_REVIEW: 'Tekshirilmoqda',
  CANCELLED: 'Bekor qilingan',
};

/** Yakuniy bahosi bor (yaroqli yakunlangan) urinish holatlari. */
export const FINAL_ATTEMPT_STATUSES: readonly AttemptStatus[] = ['SUBMITTED', 'EXPIRED'];

export const SUBMIT_SOURCES = ['STUDENT', 'TIMEOUT', 'STAFF'] as const;
export type SubmitSource = (typeof SUBMIT_SOURCES)[number];

export const SUBMIT_SOURCE_LABELS: Record<SubmitSource, string> = {
  STUDENT: 'O‘quvchi topshirdi',
  TIMEOUT: 'Vaqt tugagach server yakunladi',
  STAFF: 'Xodim yakunladi',
};

/** Urinish nima uchun to‘xtatildi (o‘qituvchi ruxsatigacha). */
export const ATTEMPT_LOCK_REASONS = ['FULLSCREEN_EXIT', 'PAGE_HIDDEN'] as const;
export type AttemptLockReason = (typeof ATTEMPT_LOCK_REASONS)[number];

export const ATTEMPT_LOCK_REASON_LABELS: Record<AttemptLockReason, string> = {
  FULLSCREEN_EXIT: 'To‘liq ekrandan chiqdi',
  PAGE_HIDDEN: 'Test sahifasidan chiqdi (boshqa oyna yoki ilova)',
};

// ---------------------------------------------------------------- Qayta baholash

export const GRADING_OVERRIDE_MODES = ['EXCLUDE', 'FULL_CREDIT', 'CHANGE_KEY'] as const;
export type GradingOverrideMode = (typeof GRADING_OVERRIDE_MODES)[number];

export const GRADING_OVERRIDE_MODE_LABELS: Record<GradingOverrideMode, string> = {
  EXCLUDE: 'Savolni hisobdan chiqarish',
  FULL_CREDIT: 'Barcha ishtirokchilarga to‘liq ball',
  CHANGE_KEY: 'Javob kalitini tuzatish',
};

// ---------------------------------------------------------------- Portfolio

export const PORTFOLIO_ITEM_TYPES = [
  'NATIONAL_CERTIFICATE',
  'CEFR',
  'IELTS',
  'SAT',
  'OLYMPIAD',
  'CONTEST',
  'CERTIFICATE',
  'POEM',
  'STORY',
  'ESSAY',
  'ARTICLE',
  'TRANSLATION',
  'BOOK_PUBLICATION',
  'RESEARCH_PROJECT',
  'SOFTWARE_PROJECT',
  'METHODICAL_WORK',
  'PROFESSIONAL_DEVELOPMENT',
  'OPEN_LESSON',
  'PUBLICATION',
  'OTHER',
] as const;
export type PortfolioItemType = (typeof PORTFOLIO_ITEM_TYPES)[number];

export const PORTFOLIO_ITEM_TYPE_LABELS: Record<PortfolioItemType, string> = {
  POEM: 'She’r',
  STORY: 'Hikoya',
  ESSAY: 'Esse',
  ARTICLE: 'Maqola',
  TRANSLATION: 'Tarjima',
  BOOK_PUBLICATION: 'Kitobdagi nashr',
  CONTEST: 'Tanlov',
  OLYMPIAD: 'Olimpiada',
  RESEARCH_PROJECT: 'Ilmiy loyiha',
  SOFTWARE_PROJECT: 'Dasturiy loyiha',
  CERTIFICATE: 'Boshqa sertifikat',
  NATIONAL_CERTIFICATE: 'Milliy sertifikat',
  CEFR: 'CEFR sertifikati',
  IELTS: 'IELTS',
  SAT: 'SAT',
  METHODICAL_WORK: 'Metodik ishlanma',
  PROFESSIONAL_DEVELOPMENT: 'Malaka oshirish',
  OPEN_LESSON: 'Ochiq dars',
  PUBLICATION: 'Nashr',
  OTHER: 'Boshqa',
};

/** O‘qituvchilar uchun qo‘shimcha turlar (o‘quvchilarga ko‘rsatilmaydi). */
export const TEACHER_ONLY_PORTFOLIO_TYPES: readonly PortfolioItemType[] = [
  'METHODICAL_WORK',
  'PROFESSIONAL_DEVELOPMENT',
  'OPEN_LESSON',
  'PUBLICATION',
];

/** Sertifikat turlari (sertifikatlar ro‘yxati va yuklab olish uchun). */
export const CERTIFICATE_PORTFOLIO_TYPES: readonly PortfolioItemType[] = [
  'NATIONAL_CERTIFICATE',
  'CEFR',
  'IELTS',
  'SAT',
  'CERTIFICATE',
];

/** Turga xos tuzilgan maydonlari (details) bo‘lgan turlar — @ijod/shared portfolio.ts dagi sxemalar. */
export const STRUCTURED_PORTFOLIO_TYPES = ['NATIONAL_CERTIFICATE', 'CEFR', 'IELTS', 'SAT', 'OLYMPIAD'] as const;
export type StructuredPortfolioType = (typeof STRUCTURED_PORTFOLIO_TYPES)[number];

/** Ijodiy ish turlari: eksportda muallifligi alohida ko‘rsatiladi. */
export const CREATIVE_PORTFOLIO_TYPES: readonly PortfolioItemType[] = [
  'POEM',
  'STORY',
  'ESSAY',
  'ARTICLE',
  'TRANSLATION',
  'BOOK_PUBLICATION',
];

export const ACHIEVEMENT_LEVELS = ['SCHOOL', 'DISTRICT', 'REGION', 'NATIONAL', 'INTERNATIONAL'] as const;
export type AchievementLevel = (typeof ACHIEVEMENT_LEVELS)[number];

export const ACHIEVEMENT_LEVEL_LABELS: Record<AchievementLevel, string> = {
  SCHOOL: 'Maktab',
  DISTRICT: 'Tuman',
  REGION: 'Viloyat',
  NATIONAL: 'Respublika',
  INTERNATIONAL: 'Xalqaro',
};

export const PORTFOLIO_STATUSES = ['DRAFT', 'SUBMITTED', 'APPROVED', 'RETURNED'] as const;
export type PortfolioStatus = (typeof PORTFOLIO_STATUSES)[number];

export const PORTFOLIO_STATUS_LABELS: Record<PortfolioStatus, string> = {
  DRAFT: 'Qoralama',
  SUBMITTED: 'Tekshiruvga yuborildi',
  APPROVED: 'Tasdiqlandi',
  RETURNED: 'Tuzatishga qaytarildi',
};

export const PORTFOLIO_VISIBILITIES = ['PRIVATE', 'STAFF'] as const;
export type PortfolioVisibility = (typeof PORTFOLIO_VISIBILITIES)[number];

export const PORTFOLIO_VISIBILITY_LABELS: Record<PortfolioVisibility, string> = {
  PRIVATE: 'Faqat men va tekshiruvchi',
  STAFF: 'Maktab xodimlari',
};

// ---------------------------------------------------------------- Eksport va bildirishnomalar

export const EXPORT_KINDS = ['SESSION_RESULTS_XLSX', 'SESSION_REPORT_DOCX'] as const;
export type ExportKind = (typeof EXPORT_KINDS)[number];

export const EXPORT_KIND_LABELS: Record<ExportKind, string> = {
  SESSION_RESULTS_XLSX: 'Natijalar (Excel)',
  SESSION_REPORT_DOCX: 'Nazorat ishi bayonnomasi (Word)',
};

export const EXPORT_STATUSES = ['QUEUED', 'RUNNING', 'READY', 'FAILED', 'EXPIRED'] as const;
export type ExportStatus = (typeof EXPORT_STATUSES)[number];

export const EXPORT_STATUS_LABELS: Record<ExportStatus, string> = {
  QUEUED: 'Navbatda',
  RUNNING: 'Tayyorlanmoqda',
  READY: 'Tayyor',
  FAILED: 'Xatolik',
  EXPIRED: 'Muddati o‘tgan',
};

export const NOTIFICATION_TYPES = [
  'TEST_ASSIGNED',
  'TEST_TIME_CHANGED',
  'TEST_STARTING_SOON',
  'TEST_CANCELLED',
  'RESULTS_PUBLISHED',
  'PORTFOLIO_APPROVED',
  'PORTFOLIO_RETURNED',
  'PORTFOLIO_SUBMITTED',
  'EXPORT_READY',
  'GRADES_REVISED',
  'ATTEMPT_CANCELLED',
  'ATTEMPT_LOCKED',
  'QUESTION_SCHOOL_APPROVED',
  'QUESTION_SCHOOL_REJECTED',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

// ---------------------------------------------------------------- Hisoblar va profil rasmlari

/** Direktor o‘rinbosari yarata oladigan va boshqara oladigan hisob rollari. */
export const DEPUTY_MANAGED_ROLES: readonly Role[] = ['TEACHER', 'STUDENT'];

/** Administrator beradigan rollar; ADMIN va SUPER_ADMIN rollarini faqat super admin beradi. */
export const ADMIN_GRANTABLE_ROLES: readonly Role[] = ['STUDENT', 'TEACHER', 'DEPUTY'];

/**
 * Foydalanuvchi bera oladigan (va shu rollardagi hisoblarni boshqara oladigan) rollar.
 * Bir nechta rolli foydalanuvchi uchun eng keng vakolat olinadi.
 */
export function grantableRolesFor(roles: readonly Role[]): readonly Role[] {
  if (roles.includes('SUPER_ADMIN')) return ROLES;
  if (roles.includes('ADMIN')) return ADMIN_GRANTABLE_ROLES;
  if (roles.includes('DEPUTY')) return DEPUTY_MANAGED_ROLES;
  return [];
}

/** Hisobni boshqarish mumkinmi: hisobning har bir roli boshqaruvchi bera oladigan rollar ichida. */
export function canManageRoles(viewerRoles: readonly Role[], targetRoles: readonly Role[]): boolean {
  const grantable = grantableRolesFor(viewerRoles);
  return grantable.length > 0 && targetRoles.every((role) => grantable.includes(role));
}

/** Profil rasmi: yuklanadigan fayl chegarasi (server kichraytirib WEBP ga o‘giradi). */
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
export const AVATAR_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
/** Profil rasmi: eni × bo‘yi chegarasi (40 megapiksel) — undan katta rasmlar qayta ishlanmaydi. */
export const AVATAR_MAX_PIXELS = 40_000_000;
