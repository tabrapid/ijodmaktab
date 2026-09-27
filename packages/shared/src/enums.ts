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

export const DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  EASY: 'Oson',
  MEDIUM: 'O‘rta',
  HARD: 'Qiyin',
};

export const QUESTION_TYPES = [
  'SINGLE_CHOICE',
  'MULTIPLE_CHOICE',
  'SHORT_ANSWER',
  'MATCHING',
  'ESSAY',
] as const;
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

export const ATTEMPT_STATUSES = [
  'IN_PROGRESS',
  'SUBMITTED',
  'EXPIRED',
  'UNDER_REVIEW',
  'CANCELLED',
] as const;
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
  'POEM',
  'STORY',
  'ESSAY',
  'ARTICLE',
  'TRANSLATION',
  'BOOK_PUBLICATION',
  'CONTEST',
  'OLYMPIAD',
  'RESEARCH_PROJECT',
  'SOFTWARE_PROJECT',
  'CERTIFICATE',
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
  CERTIFICATE: 'Sertifikat',
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

/** Ijodiy ish turlari: eksportda muallifligi alohida ko‘rsatiladi. */
export const CREATIVE_PORTFOLIO_TYPES: readonly PortfolioItemType[] = [
  'POEM',
  'STORY',
  'ESSAY',
  'ARTICLE',
  'TRANSLATION',
  'BOOK_PUBLICATION',
];

export const ACHIEVEMENT_LEVELS = [
  'SCHOOL',
  'DISTRICT',
  'REGION',
  'NATIONAL',
  'INTERNATIONAL',
] as const;
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
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
