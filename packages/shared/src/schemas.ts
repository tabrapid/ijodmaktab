/**
 * API kiritish sxemalari. Server ularni har so‘rovda tekshiradi, veb-ilova esa shu sxemalar
 * bilan formalarni oldindan tekshiradi — qoidalar bitta joyda saqlanadi.
 */
import { z } from 'zod';
import {
  ACHIEVEMENT_LEVELS,
  ATTEMPT_POLICIES,
  CATEGORIES,
  DIFFICULTIES,
  EXPORT_KINDS,
  GRADING_OVERRIDE_MODES,
  PARTICIPATION_STATUSES,
  PORTFOLIO_ITEM_TYPES,
  PORTFOLIO_STATUSES,
  PORTFOLIO_VISIBILITIES,
  QUESTION_VISIBILITIES,
  REVIEW_VISIBILITIES,
  ROLES,
  SCORE_VISIBILITIES,
  SHARE_PERMISSIONS,
  USER_STATUSES,
} from './enums.js';
import { hasAtMostTwoDecimals } from './scoring.js';
import { MAX_QUESTION_POINTS } from './validation.js';

// ---------------------------------------------------------------- Yordamchilar

const REQUIRED = 'Majburiy maydon';

export const requiredText = (max: number) =>
  z.string({ error: REQUIRED }).trim().min(1, REQUIRED).max(max, `Ko‘pi bilan ${max} ta belgi`);

/** Bo‘sh satr `null` ga aylantiriladi. */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Ko‘pi bilan ${max} ta belgi`)
    .nullish()
    .transform((value) => (value ? value : null));

export const id = () => z.uuid({ error: 'Noto‘g‘ri identifikator' });

export const isoDate = () => z.iso.date({ error: 'Sana YYYY-MM-DD ko‘rinishida bo‘lishi kerak' });

export const isoDateTime = () =>
  z.iso.datetime({ offset: true, error: 'Sana va vaqt noto‘g‘ri kiritilgan' });

export const points = () =>
  z
    .number({ error: 'Ball son bo‘lishi kerak' })
    .positive('Ball 0 dan katta bo‘lishi kerak')
    .max(MAX_QUESTION_POINTS, `Ball ${MAX_QUESTION_POINTS} dan oshmasligi kerak`)
    .refine(hasAtMostTwoDecimals, 'Ball ko‘pi bilan 2 xonali kasr bo‘lishi mumkin');

export const percentValue = () =>
  z.number().min(0, 'Foiz 0 dan kichik bo‘lmaydi').max(100, 'Foiz 100 dan oshmaydi');

/** Qurilmani (brauzer oynasini) aniqlovchi tasodifiy identifikator. */
export const clientId = () =>
  z
    .string()
    .regex(/^[A-Za-z0-9_-]{8,64}$/, 'Noto‘g‘ri qurilma identifikatori');

const paging = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
};

/** So‘rov satridagi vergul bilan ajratilgan ro‘yxat: “a,b,c”. */
export const csvList = <T extends z.ZodType>(item: T) =>
  z.preprocess(
    (value) =>
      typeof value === 'string'
        ? value.split(',').map((part) => part.trim()).filter(Boolean)
        : value,
    z.array(item),
  );

// ---------------------------------------------------------------- Kirish

export const loginSchema = z.object({
  login: requiredText(100),
  password: z.string({ error: REQUIRED }).min(1, REQUIRED).max(200),
});
export type LoginInput = z.input<typeof loginSchema>;

export const PASSWORD_MIN_LENGTH = 8;

export const newPasswordSchema = z
  .string({ error: REQUIRED })
  .min(PASSWORD_MIN_LENGTH, `Parol kamida ${PASSWORD_MIN_LENGTH} ta belgidan iborat bo‘lishi kerak`)
  .max(128, 'Parol juda uzun')
  .refine((value) => /\p{L}/u.test(value) && /\d/.test(value), 'Parolda harf va raqam bo‘lishi kerak');

export const changePasswordSchema = z
  .object({
    currentPassword: z.string({ error: REQUIRED }).min(1, REQUIRED),
    newPassword: newPasswordSchema,
    confirmPassword: z.string({ error: REQUIRED }).min(1, REQUIRED),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Parollar mos kelmadi',
  })
  .refine((data) => data.newPassword !== data.currentPassword, {
    path: ['newPassword'],
    message: 'Yangi parol eskisidan farq qilishi kerak',
  });
export type ChangePasswordInput = z.input<typeof changePasswordSchema>;

export const totpCodeSchema = z.object({
  code: z
    .string({ error: REQUIRED })
    .trim()
    .regex(/^\d{6}$/, 'Kod 6 ta raqamdan iborat'),
});

// ---------------------------------------------------------------- Foydalanuvchilar

export const personNameShape = {
  lastName: requiredText(80),
  firstName: requiredText(80),
  middleName: optionalText(80),
};

export const loginValue = () =>
  z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9._-]{3,50}$/, 'Login 3–50 ta lotin harfi, raqam, nuqta, chiziqcha yoki pastki chiziqdan iborat bo‘lishi kerak');

export const createUserSchema = z
  .object({
    ...personNameShape,
    roles: z.array(z.enum(ROLES)).min(1, 'Kamida bitta rol tanlang'),
    login: loginValue().optional(),
    /** O‘quvchi uchun: joriy o‘quv yilidagi sinf. */
    classId: id().nullish(),
  })
  .refine((data) => !(data.roles.includes('SUPER_ADMIN') && data.roles.length > 1), {
    path: ['roles'],
    message: 'Super admin hisobi boshqa rollar bilan birlashtirilmaydi',
  });
export type CreateUserInput = z.input<typeof createUserSchema>;

export const updateUserSchema = z.object({
  lastName: requiredText(80).optional(),
  firstName: requiredText(80).optional(),
  middleName: optionalText(80),
  login: loginValue().optional(),
});
export type UpdateUserInput = z.input<typeof updateUserSchema>;

export const setRolesSchema = z.object({
  roles: z.array(z.enum(ROLES)).min(1, 'Kamida bitta rol tanlang'),
});

export const setUserStatusSchema = z.object({
  status: z.enum(USER_STATUSES),
  reason: optionalText(300),
});

export const userListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  role: z.enum(ROLES).optional(),
  status: z.enum(USER_STATUSES).optional(),
  classId: id().optional(),
  sort: z.enum(['name', 'internalId', 'lastActive', 'createdAt']).default('name'),
  order: z.enum(['asc', 'desc']).default('asc'),
  ...paging,
});
export type UserListQuery = z.input<typeof userListQuerySchema>;

/** Excel importida moslashtiriladigan maydonlar. */
export const IMPORT_FIELDS = [
  'lastName',
  'firstName',
  'middleName',
  'role',
  'className',
  'login',
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];

export const IMPORT_FIELD_LABELS: Record<ImportField, string> = {
  lastName: 'Familiya',
  firstName: 'Ism',
  middleName: 'Otasining ismi',
  role: 'Rol',
  className: 'Sinf',
  login: 'Login',
};

export const importMappingSchema = z.object({
  /** Maydon → ustun tartib raqami (0 dan). `null` — ishlatilmaydi. */
  mapping: z.record(z.enum(IMPORT_FIELDS), z.number().int().min(0).max(200).nullable()),
  /** Rol ustuni bo‘lmasa qo‘llanadigan rol. */
  defaultRole: z.enum(['STUDENT', 'TEACHER']).default('STUDENT'),
});
export type ImportMappingInput = z.input<typeof importMappingSchema>;

// ---------------------------------------------------------------- Maktab tuzilmasi

export const schoolSettingsSchema = z.object({
  name: requiredText(200),
  shortName: optionalText(60),
});

export const academicYearSchema = z
  .object({
    name: requiredText(40),
    startsOn: isoDate(),
    endsOn: isoDate(),
    isCurrent: z.boolean().default(false),
  })
  .refine((data) => data.endsOn > data.startsOn, {
    path: ['endsOn'],
    message: 'Tugash sanasi boshlanishidan keyin bo‘lishi kerak',
  });
export type AcademicYearInput = z.input<typeof academicYearSchema>;

export const classSchema = z.object({
  academicYearId: id(),
  gradeLevel: z.number().int().min(1, '1–11 oralig‘ida').max(11, '1–11 oralig‘ida'),
  section: z
    .string()
    .trim()
    .min(1, REQUIRED)
    .max(10)
    .transform((value) => value.toUpperCase()),
  homeroomTeacherId: id().nullish(),
});
export type ClassInput = z.input<typeof classSchema>;

export const updateClassSchema = z.object({
  section: z
    .string()
    .trim()
    .min(1, REQUIRED)
    .max(10)
    .transform((value) => value.toUpperCase())
    .optional(),
  homeroomTeacherId: id().nullish(),
});

export const subjectSchema = z.object({
  name: requiredText(120),
  shortName: optionalText(30),
  isActive: z.boolean().default(true),
});
export type SubjectInput = z.input<typeof subjectSchema>;

export const enrollStudentsSchema = z.object({
  studentIds: z.array(id()).min(1, 'Kamida bitta o‘quvchi tanlang').max(500),
  startsOn: isoDate().optional(),
});

export const transferStudentSchema = z.object({
  toClassId: id(),
  /** Ko‘chirish sanasi (standart — bugun). */
  date: isoDate().optional(),
  reason: optionalText(300),
});

export const endEnrollmentSchema = z.object({
  date: isoDate().optional(),
  reason: z.enum(['LEFT', 'GRADUATED', 'OTHER']).default('LEFT'),
});

export const teachingAssignmentSchema = z.object({
  teacherId: id(),
  subjectId: id(),
  classId: id(),
});
export type TeachingAssignmentInput = z.input<typeof teachingAssignmentSchema>;

// ---------------------------------------------------------------- Savollar banki

export const MAX_OPTIONS = 8;

export const optionSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,32}$/, 'Noto‘g‘ri variant identifikatori'),
  text: z.string().trim().min(1, 'Variant matni bo‘sh').max(2000, 'Variant juda uzun'),
});

export const questionContentSchema = z
  .object({
    type: z.literal('SINGLE_CHOICE'),
    stem: z.string().trim().min(1, 'Savol matni bo‘sh').max(10_000, 'Savol matni juda uzun'),
    options: z
      .array(optionSchema)
      .min(2, 'Kamida 2 ta variant kerak')
      .max(MAX_OPTIONS, `Ko‘pi bilan ${MAX_OPTIONS} ta variant`),
    correctOptionId: z.string({ error: 'To‘g‘ri javobni belgilang' }).min(1, 'To‘g‘ri javobni belgilang'),
    explanation: optionalText(5_000),
    category: z.enum(CATEGORIES, { error: 'Kategoriyani tanlang' }),
    difficulty: z.enum(DIFFICULTIES, { error: 'Qiyinlik darajasini tanlang' }),
    points: points(),
  })
  .refine((data) => data.options.some((option) => option.id === data.correctOptionId), {
    path: ['correctOptionId'],
    message: 'To‘g‘ri javob variantlar orasida bo‘lishi kerak',
  })
  .refine((data) => new Set(data.options.map((option) => option.id)).size === data.options.length, {
    path: ['options'],
    message: 'Variant identifikatorlari takrorlanmasligi kerak',
  });

export const questionMetaShape = {
  subjectId: id(),
  gradeLevel: z.number().int().min(1).max(11).nullish(),
  topic: optionalText(200),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
};

export const createQuestionSchema = z.object({
  ...questionMetaShape,
  content: questionContentSchema,
});
export type CreateQuestionInput = z.input<typeof createQuestionSchema>;

export const updateQuestionSchema = z.object({
  subjectId: id().optional(),
  gradeLevel: z.number().int().min(1).max(11).nullish(),
  topic: optionalText(200),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  content: questionContentSchema.optional(),
});
export type UpdateQuestionInput = z.input<typeof updateQuestionSchema>;

export const questionListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  subjectId: id().optional(),
  gradeLevel: z.coerce.number().int().min(1).max(11).optional(),
  topic: z.string().trim().max(200).optional(),
  category: z.enum(CATEGORIES).optional(),
  difficulty: z.enum(DIFFICULTIES).optional(),
  tag: z.string().trim().max(40).optional(),
  scope: z.enum(['mine', 'school', 'available']).default('available'),
  visibility: z.enum(QUESTION_VISIBILITIES).optional(),
  sort: z.enum(['updatedAt', 'topic']).default('updatedAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
  ...paging,
});
export type QuestionListQuery = z.input<typeof questionListQuerySchema>;

// ---------------------------------------------------------------- Testlar

export const testPassportSchema = z.object({
  title: requiredText(200),
  subjectId: id(),
  gradeLevel: z.number({ error: 'Sinf darajasini tanlang' }).int().min(1).max(11),
  topic: optionalText(200),
  goal: optionalText(1000),
  language: z.enum(['uz', 'ru', 'en']).default('uz'),
  academicYearId: id().nullish(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  folder: optionalText(100),
  instructions: optionalText(3000),
});
export type TestPassportInput = z.input<typeof testPassportSchema>;

export const blueprintEntrySchema = z.object({
  count: z.number().int().min(0).max(200),
  pointsEach: z
    .number()
    .min(0)
    .max(MAX_QUESTION_POINTS)
    .refine(hasAtMostTwoDecimals, 'Ko‘pi bilan 2 xonali kasr'),
});

export const blueprintSchema = z.object({
  blueprint: z.partialRecord(z.enum(CATEGORIES), blueprintEntrySchema),
});
export type BlueprintInput = z.input<typeof blueprintSchema>;

export const addBankQuestionsSchema = z.object({
  questionIds: z.array(id()).min(1).max(200),
});

export const addNewTestQuestionSchema = z.object({
  topic: optionalText(200),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  content: questionContentSchema,
});
export type AddNewTestQuestionInput = z.input<typeof addNewTestQuestionSchema>;

export const updateTestQuestionSchema = z.object({
  points: points().optional(),
  /** Savol mazmunini o‘zgartirish (bank savolining yangi versiyasi yaratiladi). */
  content: questionContentSchema.optional(),
});

export const reorderTestQuestionsSchema = z.object({
  testQuestionIds: z.array(id()).min(1),
});

export const copyQuestionsFromTestSchema = z.object({
  sourceTestId: id(),
  /** Bo‘sh bo‘lsa, barcha savollar ko‘chiriladi. */
  testQuestionIds: z.array(id()).optional(),
});

export const testListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  subjectId: id().optional(),
  gradeLevel: z.coerce.number().int().min(1).max(11).optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).optional(),
  tag: z.string().trim().max(40).optional(),
  scope: z.enum(['mine', 'shared', 'all']).default('mine'),
  sort: z.enum(['updatedAt', 'title', 'questionCount', 'totalPoints']).default('updatedAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
  ...paging,
});
export type TestListQuery = z.input<typeof testListQuerySchema>;

export const shareTestSchema = z.object({
  userId: id(),
  permission: z.enum(SHARE_PERMISSIONS),
});

/** Ustaning 6-bosqichi: namunaviy javoblar bilan baholashni sinash. */
export const previewGradeSchema = z.object({
  answers: z.record(z.string(), z.object({ optionId: z.string().nullable() }).nullable()),
});

// ---------------------------------------------------------------- Sessiyalar

const sessionTimingShape = {
  startsAt: isoDateTime(),
  endsAt: isoDateTime(),
  entryClosesAt: isoDateTime().nullish(),
  durationMinutes: z
    .number({ error: 'Davomiylikni kiriting' })
    .int()
    .min(1, 'Kamida 1 daqiqa')
    .max(600, 'Ko‘pi bilan 600 daqiqa'),
};

export const sessionSettingsShape = {
  maxAttempts: z.number().int().min(1).max(10).default(1),
  attemptPolicy: z.enum(ATTEMPT_POLICIES).default('FIRST'),
  shuffleQuestions: z.boolean().default(false),
  shuffleOptions: z.boolean().default(false),
  allowBackNavigation: z.boolean().default(true),
  scoreVisibility: z.enum(SCORE_VISIBILITIES).default('AFTER_ALL_DONE'),
  reviewVisibility: z.enum(REVIEW_VISIBILITIES).default('AFTER_CLOSE'),
  passPercent: percentValue().nullish(),
  categoryThresholdPercent: percentValue().default(60),
  retakeRule: optionalText(500),
};

const timingRefinements = <T extends z.ZodType<{
  startsAt?: string;
  endsAt?: string;
  entryClosesAt?: string | null;
}>>(schema: T) =>
  schema
    .refine((data) => !data.startsAt || !data.endsAt || data.endsAt > data.startsAt, {
      path: ['endsAt'],
      message: 'Yopilish vaqti boshlanishidan keyin bo‘lishi kerak',
    })
    .refine(
      (data) =>
        !data.entryClosesAt ||
        ((!data.startsAt || new Date(data.entryClosesAt) > new Date(data.startsAt)) &&
          (!data.endsAt || new Date(data.entryClosesAt) <= new Date(data.endsAt))),
      { path: ['entryClosesAt'], message: 'Kirish muddati sessiya vaqti ichida bo‘lishi kerak' },
    );

export const createSessionSchema = timingRefinements(
  z.object({
    testId: id(),
    title: optionalText(200),
    conductorId: id().nullish(),
    audience: z
      .object({
        classIds: z.array(id()).default([]),
        studentIds: z.array(id()).default([]),
      })
      .refine((value) => value.classIds.length + value.studentIds.length > 0, {
        message: 'Kamida bitta sinf yoki o‘quvchini tanlang',
      }),
    /** O‘quvchi → maxsus qo‘shimcha vaqt (daqiqa). */
    extraTime: z
      .array(z.object({ studentId: id(), minutes: z.number().int().min(1).max(240) }))
      .default([]),
    ...sessionTimingShape,
    ...sessionSettingsShape,
  }),
);
export type CreateSessionInput = z.input<typeof createSessionSchema>;

export const updateSessionTimingSchema = timingRefinements(
  z.object({
    startsAt: isoDateTime().optional(),
    endsAt: isoDateTime().optional(),
    entryClosesAt: isoDateTime().nullish(),
    durationMinutes: sessionTimingShape.durationMinutes.optional(),
    reason: optionalText(300),
  }),
);
export type UpdateSessionTimingInput = z.input<typeof updateSessionTimingSchema>;

export const sessionListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  state: z.enum(['SCHEDULED', 'OPEN', 'CLOSED', 'CANCELLED']).optional(),
  subjectId: id().optional(),
  classId: id().optional(),
  from: isoDateTime().optional(),
  to: isoDateTime().optional(),
  scope: z.enum(['mine', 'all']).default('mine'),
  ...paging,
});
export type SessionListQuery = z.input<typeof sessionListQuerySchema>;

export const reasonSchema = z.object({
  reason: requiredText(500),
});

export const extendTimeSchema = z.object({
  minutes: z.number().int().min(1, 'Kamida 1 daqiqa').max(240, 'Ko‘pi bilan 240 daqiqa'),
  reason: requiredText(500),
});

export const cancelAttemptSchema = z.object({
  reason: requiredText(500),
  /** Bekor qilingan urinish urinishlar limitiga kirmasin (qayta topshirish mumkin). */
  allowRetake: z.boolean().default(false),
});

export const cancelSessionSchema = z.object({
  reason: requiredText(500),
});

export const assignmentChangeSchema = z.object({
  addStudentIds: z.array(id()).default([]),
  removeStudentIds: z.array(id()).default([]),
  reason: optionalText(300),
});

export const regradeSchema = z
  .object({
    testQuestionId: id(),
    mode: z.enum(GRADING_OVERRIDE_MODES),
    correctOptionId: z.string().optional(),
    reason: requiredText(1000),
  })
  .refine((data) => data.mode !== 'CHANGE_KEY' || Boolean(data.correctOptionId), {
    path: ['correctOptionId'],
    message: 'Yangi to‘g‘ri javobni tanlang',
  });
export type RegradeInput = z.input<typeof regradeSchema>;

export const resultFiltersSchema = z.object({
  statuses: z.array(z.enum(PARTICIPATION_STATUSES)).optional(),
  classIds: z.array(id()).optional(),
  minPercent: percentValue().optional(),
  maxPercent: percentValue().optional(),
  q: z.string().trim().max(100).optional(),
});
export type ResultFilters = z.input<typeof resultFiltersSchema>;

export const createExportSchema = z.object({
  kind: z.enum(EXPORT_KINDS),
  sessionId: id(),
  filters: resultFiltersSchema.default({}),
});
export type CreateExportInput = z.input<typeof createExportSchema>;

// ---------------------------------------------------------------- Urinishlar (o‘quvchi)

export const accessCodeValue = () =>
  z
    .string({ error: 'Kodni kiriting' })
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{4,12}$/, 'Kod 4–12 ta lotin harfi yoki raqamdan iborat');

export const enterCodeSchema = z.object({
  code: accessCodeValue(),
});

export const startAttemptSchema = z.object({
  code: accessCodeValue(),
  clientId: clientId(),
});

export const saveAnswerSchema = z.object({
  clientId: clientId(),
  optionId: z.string().max(32).nullable(),
  /** Mijoz tomonidagi o‘sib boruvchi raqam: kechikib kelgan eski so‘rov yangisini bosib ketmaydi. */
  revision: z.number().int().min(1),
});

export const submitAttemptSchema = z.object({
  clientId: clientId(),
  /** Hali serverga yetib bormagan javoblar (topshirishdan oldin birga yuboriladi). */
  answers: z
    .array(
      z.object({
        testQuestionId: id(),
        optionId: z.string().max(32).nullable(),
        revision: z.number().int().min(1),
      }),
    )
    .max(500)
    .default([]),
});

export const heartbeatSchema = z.object({
  clientId: clientId(),
  /** Oyna fokusni yo‘qotgan holatlar soni (faqat qayd uchun). */
  focusLossCount: z.number().int().min(0).max(100_000).optional(),
});

export const takeoverSchema = z.object({
  clientId: clientId(),
});

export const advanceSchema = z.object({
  clientId: clientId(),
  toIndex: z.number().int().min(0),
});

// ---------------------------------------------------------------- Portfolio

export const portfolioItemSchema = z.object({
  type: z.enum(PORTFOLIO_ITEM_TYPES, { error: 'Turini tanlang' }),
  title: requiredText(300),
  subjectId: id().nullish(),
  direction: optionalText(200),
  description: optionalText(5000),
  organization: optionalText(300),
  date: isoDate().nullish(),
  level: z.enum(ACHIEVEMENT_LEVELS).nullish(),
  result: optionalText(200),
  evidenceUrl: z
    .url({ protocol: /^https?$/, error: 'Havola http(s):// bilan boshlanishi kerak' })
    .max(1000)
    .nullish()
    .or(z.literal('').transform(() => null)),
  evidenceFileId: id().nullish(),
  visibility: z.enum(PORTFOLIO_VISIBILITIES).default('STAFF'),
});
export type PortfolioItemInput = z.input<typeof portfolioItemSchema>;

export const portfolioReviewSchema = z
  .object({
    decision: z.enum(['APPROVED', 'RETURNED']),
    reason: optionalText(1000),
  })
  .refine((data) => data.decision !== 'RETURNED' || Boolean(data.reason), {
    path: ['reason'],
    message: 'Qaytarish sababi majburiy',
  });
export type PortfolioReviewInput = z.input<typeof portfolioReviewSchema>;

export const portfolioListQuerySchema = z.object({
  ownerId: id().optional(),
  type: z.enum(PORTFOLIO_ITEM_TYPES).optional(),
  level: z.enum(ACHIEVEMENT_LEVELS).optional(),
  status: z.enum(PORTFOLIO_STATUSES).optional(),
  subjectId: id().optional(),
  from: isoDate().optional(),
  to: isoDate().optional(),
  q: z.string().trim().max(100).optional(),
  sort: z.enum(['date', 'level', 'owner', 'updatedAt']).default('date'),
  order: z.enum(['asc', 'desc']).default('desc'),
  ...paging,
});

export const portfolioExportSchema = z.object({
  itemIds: z.array(id()).min(1, 'Kamida bitta yozuvni tanlang'),
});

// ---------------------------------------------------------------- Audit

export const auditListQuerySchema = z.object({
  actorId: id().optional(),
  action: z.string().trim().max(100).optional(),
  entityType: z.string().trim().max(60).optional(),
  entityId: z.string().trim().max(100).optional(),
  from: isoDateTime().optional(),
  to: isoDateTime().optional(),
  ...paging,
});
