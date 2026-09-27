/**
 * API javoblarining turlari (apps/api xizmatlari qaytaradigan ko‘rinishlar).
 * Sana va vaqtlar JSON orqali ISO satr sifatida keladi.
 */
import type {
  AchievementLevel,
  AttemptLockReason,
  AttemptPolicy,
  AttemptStatus,
  Blueprint,
  Category,
  CategoryScores,
  ClassMetrics,
  Difficulty,
  ExportKind,
  ExportStatus,
  GradingOverride,
  ParticipationStatus,
  PortfolioDetails,
  PortfolioFieldChange,
  PortfolioItemType,
  PortfolioStatus,
  PortfolioVisibility,
  QuestionOutcome,
  QuestionStats,
  QuestionType,
  QuestionVisibility,
  Ratio,
  ReviewVisibility,
  Role,
  ScoreVisibility,
  SessionState,
  SharePermission,
  SubmitSource,
  TestStatus,
  TestVisibility,
  UserStatus,
  ValidationIssue,
} from '@ijod/shared';

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Ref {
  id: string;
  name: string;
}

export interface PersonRef {
  id: string;
  fullName: string;
}

// ------------------------------------------------------------ Kirish

export interface Me {
  id: string;
  internalId: number;
  login: string;
  lastName: string;
  firstName: string;
  middleName: string | null;
  fullName: string;
  roles: Role[];
  realm: 'SCHOOL' | 'SYSTEM';
  mustChangePassword: boolean;
  mfa: { enabled: boolean; verified: boolean; required: boolean };
  homeroomClassIds: string[];
  /** Profil rasmi manzili (`/api/files/<id>`) yoki null. */
  avatarUrl: string | null;
}

export interface AuthSessionItem {
  id: string;
  realm: 'SCHOOL' | 'SYSTEM';
  createdAt: string;
  lastSeenAt: string;
  ip: string | null;
  userAgent: string | null;
  current: boolean;
}

// ------------------------------------------------------------ Foydalanuvchilar va tuzilma

export interface UserListItem {
  id: string;
  internalId: number;
  lastName: string;
  firstName: string;
  middleName: string | null;
  fullName: string;
  roles: Role[];
  status: UserStatus;
  currentClass: Ref | null;
  lastActiveAt: string | null;
  /** Profil rasmi manzili yoki null. */
  avatarUrl: string | null;
  /** Joriy foydalanuvchi bu hisobni boshqara oladimi (parol, holat, rollar). */
  manageable: boolean;
  login?: string;
  locked?: boolean;
  mustChangePassword?: boolean;
}

export interface EnrollmentItem {
  id: string;
  class: Ref;
  academicYear: string;
  academicYearId: string;
  startsOn: string;
  endsOn: string | null;
  endReason: string | null;
}

export interface UserDetail {
  id: string;
  internalId: number;
  lastName: string;
  firstName: string;
  middleName: string | null;
  fullName: string;
  roles: Role[];
  status: UserStatus;
  /** Profil rasmi manzili yoki null. */
  avatarUrl: string | null;
  /** Joriy foydalanuvchi bu hisobni boshqara oladimi (o‘z hisobi — yo‘q). */
  manageable: boolean;
  enrollments: EnrollmentItem[];
  teachingAssignments?: { id: string; class: Ref; subject: Ref }[];
  homeroomClasses?: Ref[];
  createdAt?: string;
  lastLoginAt?: string | null;
  lastActiveAt?: string | null;
  statusReason?: string | null;
  login?: string;
  mustChangePassword?: boolean;
  lockedUntil?: string | null;
  mfaEnabled?: boolean;
}

export interface StaffItem {
  id: string;
  fullName: string;
  roles: Role[];
}

export interface AcademicYear {
  id: string;
  name: string;
  startsOn: string;
  endsOn: string;
  isCurrent: boolean;
  _count?: { classes: number };
}

export interface Subject {
  id: string;
  name: string;
  shortName: string | null;
  isActive: boolean;
}

export interface ClassListItem {
  id: string;
  name: string;
  gradeLevel: number;
  section: string;
  academicYearId: string;
  archivedAt: string | null;
  studentCount: number;
  homeroomTeacher: PersonRef | null;
  isHomeroom: boolean;
  subjects: { assignmentId: string; subject: Ref; teacher: PersonRef; isMine: boolean }[];
}

export interface ClassStudent {
  enrollmentId: string;
  startsOn: string;
  id: string;
  internalId: number;
  lastName: string;
  firstName: string;
  middleName: string | null;
  fullName: string;
  status: UserStatus;
  lastActiveAt: string | null;
  avatarUrl: string | null;
}

export interface ClassDetail {
  id: string;
  name: string;
  gradeLevel: number;
  section: string;
  academicYear: { id: string; name: string; isCurrent: boolean };
  archivedAt: string | null;
  homeroomTeacher: PersonRef | null;
  students: ClassStudent[];
  subjects: { assignmentId: string; subject: Ref; teacher: PersonRef }[];
  canManage: boolean;
}

export interface TeachingAssignmentItem {
  id: string;
  teacher: PersonRef;
  subject: Ref;
  class: { id: string; name: string; gradeLevel: number };
}

export interface School {
  id: number;
  name: string;
  shortName: string | null;
}

// ------------------------------------------------------------ Import

export type ImportField = 'fullName' | 'lastName' | 'firstName' | 'middleName' | 'role' | 'className' | 'login';

export interface ImportPreviewRow {
  rowNumber: number;
  cells: string[];
  status: 'ok' | 'warning' | 'error' | 'skipped';
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

export interface ImportPreview {
  batchId: string;
  fileName: string;
  committedAt: string | null;
  headers: string[];
  mapping: Partial<Record<ImportField, number | null>>;
  defaultRole: 'STUDENT' | 'TEACHER';
  fieldLabels: Record<ImportField, string>;
  rows: ImportPreviewRow[];
  counts: { total: number; ok: number; warning: number; error: number; skipped: number };
}

export interface ImportCommitResult {
  created: {
    rowNumber: number;
    id: string;
    internalId: number;
    fullName: string;
    login: string;
    role: Role;
    className: string | null;
  }[];
  createdCount: number;
  errorCount: number;
  skippedCount: number;
  credentialsFileName: string;
  credentialsXlsxBase64: string;
}

// ------------------------------------------------------------ Savollar va testlar

export interface QuestionOption {
  id: string;
  text: string;
}

export interface QuestionVersionView {
  id: string;
  versionNo: number;
  type: QuestionType;
  stem: string;
  options: QuestionOption[];
  correctOptionId: string;
  explanation: string | null;
  category: Category;
  difficulty: Difficulty;
  points: number;
  locked: boolean;
  createdAt: string;
}

export interface QuestionItem {
  id: string;
  subject: Ref;
  gradeLevel: number | null;
  topic: string | null;
  tags: string[];
  visibility: QuestionVisibility;
  schoolRequestedAt: string | null;
  owner: PersonRef;
  isMine: boolean;
  usedInTests: number;
  updatedAt: string;
  archivedAt: string | null;
  latest: QuestionVersionView | null;
  versions?: QuestionVersionView[];
}

export interface TestListItem {
  id: string;
  title: string;
  subject: Ref;
  gradeLevel: number;
  topic: string | null;
  tags: string[];
  folder: string | null;
  status: TestStatus;
  /** SCHOOL — maktab test bankida (barcha o‘qituvchi va rahbariyatga ko‘rinadi). */
  visibility: TestVisibility;
  /** Maktab bankiga chiqarilgan vaqt (bankda bo‘lmasa null). */
  schoolSharedAt: string | null;
  owner: PersonRef & { avatarUrl: string | null };
  permission: 'OWNER' | SharePermission | 'SCHOOL';
  /** Tahrirlovchi uchun joriy versiya, boshqalar uchun tayyor (muzlatilgan) versiya ko‘rsatkichlari. */
  questionCount: number;
  totalPoints: number;
  hasDraftChanges: boolean;
  /** Oxirgi muzlatilgan (tayyor) versiya raqami. */
  publishedVersionNo: number | null;
  /** Shu test bilan sessiya yaratish mumkinmi (huquq va tayyor versiya bo‘yicha). */
  canConduct: boolean;
  sessionCount: number;
  updatedAt: string;
}

export interface TestQuestionView {
  testQuestionId: string;
  number: number;
  position: number;
  points: number;
  questionId: string;
  isMyQuestion: boolean;
  topic: string | null;
  versionId: string;
  versionNo: number;
  type: QuestionType;
  stem: string;
  options: QuestionOption[];
  correctOptionId: string;
  explanation: string | null;
  category: Category;
  difficulty: Difficulty;
  defaultPoints: number;
  locked: boolean;
}

export interface TestDetail {
  id: string;
  title: string;
  visibility: TestVisibility;
  subject: Ref;
  gradeLevel: number;
  topic: string | null;
  goal: string | null;
  language: 'uz' | 'ru' | 'en';
  academicYearId: string | null;
  tags: string[];
  folder: string | null;
  instructions: string | null;
  status: TestStatus;
  createdAt: string;
  updatedAt: string;
  owner: PersonRef;
  originalAuthor: PersonRef;
  copiedFrom: { id: string; title: string } | null;
  permission: 'OWNER' | SharePermission | 'SCHOOL';
  canEdit: boolean;
  canCopy: boolean;
  canConduct: boolean;
  schoolSharedAt: string | null;
  /** Bankka chiqarish/olish mumkinmi (egasi; rahbariyat — faqat bankdan olish). */
  canChangeVisibility: boolean;
  /** Yangi sessiya ishlatadigan versiya (tahrirlovchi uchun qoralama muzlatiladi) yoki null. */
  conductVersionNo: number | null;
  /** Oxirgi muzlatilgan (tayyor) versiya raqami. */
  publishedVersionNo: number | null;
  version: {
    id: string;
    versionNo: number;
    status: 'DRAFT' | 'FROZEN';
    blueprint: Blueprint;
    totalPoints: number;
    questions: TestQuestionView[];
  } | null;
  isDraft: boolean;
  issues: ValidationIssue[];
  frozenVersions: {
    id: string;
    versionNo: number;
    frozenAt: string;
    totalPoints: number;
    questionCount: number;
    sessionCount: number;
  }[];
  shares: { userId: string; fullName: string; permission: SharePermission }[];
}

// ------------------------------------------------------------ Sessiyalar (xodim)

export interface SessionListItem {
  id: string;
  title: string;
  subject: Ref;
  state: SessionState;
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  classes: Ref[];
  conductor: PersonRef;
  templateId: string;
  versionNo: number;
  totalPoints: number;
  assignedCount: number;
  finishedCount: number;
  inProgressCount: number;
  resultsPublishedAt: string | null;
  canManage: boolean;
}

export interface GradeRevisionItem {
  id: string;
  version: number;
  reason: string;
  change: { testQuestionId: string } & GradingOverride;
  affectedCount: number;
  createdAt: string;
  createdBy: PersonRef;
}

export interface SessionDetail {
  id: string;
  title: string;
  subject: Ref;
  state: SessionState;
  startsAt: string;
  endsAt: string;
  entryClosesAt: string | null;
  durationMinutes: number;
  maxAttempts: number;
  attemptPolicy: AttemptPolicy;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  allowBackNavigation: boolean;
  requireFullscreen: boolean;
  scoreVisibility: ScoreVisibility;
  reviewVisibility: ReviewVisibility;
  passPercent: number | null;
  categoryThresholdPercent: number;
  retakeRule: string | null;
  resultsPublishedAt: string | null;
  reviewOpenedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  gradingVersion: number;
  gradingOverrides: Record<string, GradingOverride>;
  conductor: PersonRef;
  createdBy: PersonRef;
  test: {
    templateId: string;
    title: string;
    versionId: string;
    versionNo: number;
    gradeLevel: number;
    totalPoints: number;
    questionCount: number;
    blueprint: Blueprint;
  };
  classes: Ref[];
  assignedCount: number;
  finishedCount: number;
  inProgressCount: number;
  accessCode: string | null;
  accessCodeRotatedAt: string | null;
  canManage: boolean;
  revisions: GradeRevisionItem[];
}

export interface LiveRow {
  studentId: string;
  internalId: number;
  fullName: string;
  /** Profil rasmi manzili (bo‘lmasa null). */
  avatarUrl: string | null;
  className: string | null;
  status: AttemptStatus | 'NOT_STARTED';
  attemptId: string | null;
  attemptsCount: number;
  startedAt: string | null;
  deadlineAt: string | null;
  submittedAt: string | null;
  submitSource: SubmitSource | null;
  answered: number;
  questionCount: number;
  lastSeenAt: string | null;
  connectionIssue: boolean;
  focusLossCount: number;
  deviceChangeCount: number;
  extraMinutes: number;
  /** To‘xtatilgan urinish: qachon va nima sababdan (o‘qituvchi ruxsat berishi kerak). */
  lockedAt: string | null;
  lockReason: AttemptLockReason | null;
  lockCount: number;
}

export interface LiveView {
  sessionId: string;
  state: SessionState;
  serverNow: string;
  startsAt: string;
  endsAt: string;
  accessCode: string;
  counts: {
    assigned: number;
    notStarted: number;
    inProgress: number;
    finished: number;
    connectionIssue: number;
    cancelled: number;
    /** To‘xtatilgan (ruxsat kutayotgan) urinishlar. */
    locked: number;
  };
  rows: LiveRow[];
}

export interface ResultQuestion {
  testQuestionId: string;
  number: number;
  category: Category;
  points: number;
  originalPoints: number;
  stem: string;
  options: (QuestionOption & { letter: string })[];
  correctOptionId: string;
  override: GradingOverride | null;
}

export interface ResultRow {
  studentId: string;
  internalId: number;
  fullName: string;
  classId: string | null;
  className: string | null;
  status: ParticipationStatus;
  attemptId: string | null;
  attemptNo: number | null;
  attemptsCount: number;
  score: number | null;
  maxScore: number | null;
  percent: number | null;
  categories: Partial<Record<Category, { earned: number; max: number; percent: number | null; reached: boolean }>>;
  passed: boolean | null;
  startedAt: string | null;
  submittedAt: string | null;
  durationSeconds: number | null;
  submitSource: SubmitSource | null;
}

export interface SessionResults {
  session: {
    id: string;
    title: string;
    subject: Ref;
    state: SessionState;
    startsAt: string;
    endsAt: string;
    durationMinutes: number;
    conductor: PersonRef;
    attemptPolicy: AttemptPolicy;
    categoryThresholdPercent: number;
    passPercent: number | null;
    gradingVersion: number;
    resultsPublishedAt: string | null;
    testTitle: string;
    testVersionNo: number;
    totalPoints: number;
  };
  categories: { category: Category; count: number; max: number }[];
  questions: ResultQuestion[];
  rows: ResultRow[];
  metrics: ClassMetrics;
  byClass: { classId: string; className: string; metrics: ClassMetrics }[];
  questionStats: (QuestionStats & { number: number })[];
  matrix: Record<string, Record<string, { outcome: QuestionOutcome; earned: number; selectedOptionId: string | null }>>;
  limitedToClasses: string[] | null;
  generatedAt: string;
}

export interface RevisionDetail {
  id: string;
  version: number;
  reason: string;
  change: { testQuestionId: string } & GradingOverride;
  createdAt: string;
  items: {
    attemptId: string;
    student: { id: string; internalId: number; fullName: string };
    before: { score: number | null; maxScore: number | null };
    after: { score: number; maxScore: number };
  }[];
}

export interface ExportJobView {
  id: string;
  kind: ExportKind;
  kindLabel: string;
  sessionId: string | null;
  status: ExportStatus;
  rowCount: number | null;
  fileName: string | null;
  error: string | null;
  params: unknown;
  createdAt: string;
  finishedAt: string | null;
  expiresAt: string | null;
}

// ------------------------------------------------------------ O‘quvchi

export interface StudentSessionItem {
  sessionId: string;
  title: string;
  subject: Ref;
  state: SessionState;
  startsAt: string;
  endsAt: string;
  entryClosesAt: string;
  durationMinutes: number;
  questionCount: number;
  totalPoints: number;
  maxAttempts: number;
  attemptsUsed: number;
  inProgressAttemptId: string | null;
  canStart: boolean;
  lastAttempt: {
    id: string;
    status: AttemptStatus;
    submittedAt: string | null;
    score?: number | null;
    maxScore?: number | null;
    percent?: number | null;
  } | null;
}

export interface SessionPreview {
  sessionId: string;
  title: string;
  subject: Ref;
  instructions: string | null;
  state: SessionState;
  startsAt: string;
  endsAt: string;
  entryClosesAt: string;
  durationMinutes: number;
  questionCount: number;
  totalPoints: number;
  allowBackNavigation: boolean;
  /** Test to‘liq ekranda ishlanadi; chiqilsa urinish o‘qituvchi ruxsatigacha to‘xtatiladi. */
  requireFullscreen: boolean;
  maxAttempts: number;
  attemptsUsed: number;
  attemptPolicy: AttemptPolicy;
  scoreVisibility: ScoreVisibility;
  inProgressAttemptId: string | null;
  canStart: boolean;
  blockedReason: string | null;
  attempts: { id: string; attemptNo: number; status: AttemptStatus; startedAt: string; submittedAt: string | null }[];
  serverNow: string;
}

export interface AttemptQuestion {
  id: string;
  number: number;
  type: QuestionType;
  stem: string;
  options: QuestionOption[];
  points: number;
  answer: { optionId: string | null; revision: number; savedAt: string } | null;
}

export interface AttemptResultView {
  status: AttemptStatus;
  submittedAt: string | null;
  submitSource: SubmitSource | null;
  cancelReason: string | null;
  scoreVisible: boolean;
  reviewVisible: boolean;
  message: string | null;
  score?: { earned: number; max: number; percent: number | null };
  categories?: { category: Category; earned: number; max: number; percent: number | null; reachedThreshold: boolean }[];
  thresholdPercent?: number;
  passPercent?: number | null;
  passed?: boolean | null;
  gradingVersion?: number | null;
  review?: {
    number: number;
    stem: string;
    options: QuestionOption[];
    selectedOptionId: string | null;
    correctOptionId: string;
    earned: number;
    max: number;
    excluded: boolean;
    explanation: string | null;
  }[];
}

export interface AttemptView {
  id: string;
  attemptNo: number;
  status: AttemptStatus;
  startedAt: string;
  deadlineAt: string;
  submittedAt: string | null;
  submitSource: SubmitSource | null;
  serverNow: string;
  session: {
    id: string;
    title: string;
    subject: Ref;
    instructions: string | null;
    allowBackNavigation: boolean;
    /** Test to‘liq ekranda ishlanadi; chiqilsa urinish to‘xtatiladi. */
    requireFullscreen: boolean;
    totalPoints: number;
  };
  /** To‘xtatilgan urinish (o‘qituvchi ruxsatini kutmoqda) yoki null. */
  lock: { lockedAt: string; reason: AttemptLockReason } | null;
  lockCount: number;
  progressIndex?: number;
  deviceConflict?: boolean;
  questions: AttemptQuestion[];
  result: AttemptResultView | null;
}

export interface MyResultItem {
  attemptId: string;
  sessionId: string;
  title: string;
  subject: Ref;
  attemptNo: number;
  status: AttemptStatus;
  submittedAt: string | null;
  scoreVisible: boolean;
  score?: number;
  maxScore?: number;
  percent?: number | null;
  categories?: CategoryScores;
}

// ------------------------------------------------------------ Bildirishnomalar, audit

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface AuditItem {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  data: unknown;
  actor: { id: string; internalId: number; lastName: string; firstName: string } | null;
  actorRoles: Role[];
  ip: string | null;
  createdAt: string;
}

// ------------------------------------------------------------ Portfolio

export interface FileRef {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
}

export interface PortfolioItemView {
  id: string;
  type: PortfolioItemType;
  typeLabel: string;
  title: string;
  subject: Ref | null;
  direction: string | null;
  description: string | null;
  organization: string | null;
  date: string | null;
  level: AchievementLevel | null;
  result: string | null;
  evidenceUrl: string | null;
  evidenceFile: FileRef | null;
  /** Turga xos maydonlar (milliy sertifikat, CEFR, IELTS, SAT, olimpiada). */
  details: PortfolioDetails | null;
  visibility: PortfolioVisibility;
  status: PortfolioStatus;
  returnReason: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewer: PersonRef | null;
  owner: {
    id: string;
    internalId: number;
    fullName: string;
    className: string | null;
    roles: Role[];
    /** Profil rasmi manzili yoki null. */
    avatarUrl?: string | null;
  };
  isMine: boolean;
  canReview: boolean;
  createdAt: string;
  updatedAt: string;
  reviews?: { id: string; decision: PortfolioStatus; reason: string | null; createdAt: string; reviewer: PersonRef }[];
  /** Tekshiruvchiga (faqat tekshiruvdagi yozuvda): yangi yozuvmi yoki tasdiqlangandan keyin o‘zgartirilganmi. */
  changeKind?: 'NEW' | 'CHANGED';
  /** Oxirgi tasdiqlangan holatdan farqlar. Fan va dalil fayli uchun qiymatlar — nomlar. */
  changes?: PortfolioFieldChange[];
  lastApprovedAt?: string | null;
  /** Oxirgi qaror “tuzatishga qaytarish” bo‘lgan. */
  wasReturned?: boolean;
  lastReturnReason?: string | null;
}

/** Portfolio egasi (tekshiruv navbati, jamlangan portfolio). */
export interface PortfolioOwnerRef {
  id: string;
  internalId: number;
  fullName: string;
  className: string | null;
  roles: Role[];
  avatarUrl: string | null;
}

/** Tekshiruv navbati: bitta o‘quvchi (ega) bo‘yicha. */
export interface PortfolioReviewGroup {
  owner: PortfolioOwnerRef;
  pending: number;
  newCount: number;
  changedCount: number;
  oldestSubmittedAt: string | null;
  lastSubmittedAt: string | null;
}

/** CHANGED — tekshiruvchi ko‘rgandan keyin egasi tahrirlab, qayta yuborgan. */
export type PortfolioSkipReason = 'NOT_FOUND' | 'NOT_ALLOWED' | 'NOT_PENDING' | 'CHANGED';

export interface PortfolioBatchResult {
  approved: number;
  returned: number;
  skipped: { id: string; reason: PortfolioSkipReason }[];
}

export interface PortfolioStatusCounts {
  approved: number;
  pending: number;
  draft: number;
  returned: number;
}

/** Rahbariyat katalogi: bitta o‘quvchi. */
export interface PortfolioDirectoryItem {
  id: string;
  internalId: number;
  fullName: string;
  avatarUrl: string | null;
  classId: string;
  className: string;
  gradeLevel: number;
  counts: PortfolioStatusCounts;
  certificates: number;
  olympiads: number;
  /** Qisqa nishonlar: “IELTS 7.5”, “SAT 1450”, … */
  highlights: string[];
  lastActivityAt: string | null;
}

/** Bitta o‘quvchining jamlangan portfoliosi. */
export interface StudentPortfolioView {
  owner: PortfolioOwnerRef & { classId: string | null };
  counts: PortfolioStatusCounts;
  byType: { type: PortfolioItemType; label: string; approved: number; pending: number }[];
  items: PortfolioItemView[];
  pendingItems: PortfolioItemView[];
  canReview: boolean;
  canExport: boolean;
}

export interface PrintablePortfolio {
  school: string;
  owner: {
    id: string;
    internalId: number;
    fullName: string;
    className: string | null;
    roles: Role[];
    avatarUrl?: string | null;
  };
  approved: PortfolioItemView[];
  unapproved: PortfolioItemView[];
  generatedAt: string;
}

// ------------------------------------------------------------ Bosh sahifalar

export interface TeacherDashboard {
  today: {
    id: string;
    title: string;
    subject: Ref;
    state: SessionState;
    startsAt: string;
    endsAt: string;
    classes: Ref[];
    assignedCount: number;
    inProgressCount: number;
    finishedCount: number;
  }[];
  upcomingCount: number;
  draftTests: number;
  pendingReview: number;
  recent: { id: string; title: string; subject: Ref; endsAt: string; participation: Ratio; mastery: Ratio }[];
  difficultTopics: { topic: string; subject: string; correctRate: Ratio }[];
}

export interface LeadershipDashboard {
  academicYear: Ref | null;
  totals: { students: number; teachers: number; classes: number; sessions: number; openSessions: number };
  participation: Ratio;
  unfinished: { inProgress: number; underReview: number };
  pending: { portfolio: number; schoolQuestions: number };
  classes: {
    classId: string;
    name: string;
    gradeLevel: number;
    sessions: number;
    participation: Ratio;
    mastery: Ratio;
  }[];
  subjects: { subjectId: string; name: string; sessions: number; mastery: Ratio }[];
  categoryMastery: Partial<Record<Category, Ratio>>;
  trend: { month: string; percent: number | null }[];
  recentSessions: {
    id: string;
    title: string;
    subject: Ref;
    state: SessionState;
    startsAt: string;
    conductor: PersonRef;
    participation: Ratio;
    mastery: Ratio;
  }[];
  difficultTopics: { topic: string; subject: string; correctRate: Ratio }[];
}

export interface AdminDashboard {
  academicYear: Ref | null;
  users: {
    byRole: Record<Role, number>;
    byStatus: Partial<Record<UserStatus, number>>;
    locked: number;
    mustChangePassword: number;
  };
  studentsWithoutClass: number;
  classesWithoutHomeroom: number;
  classes: number;
  subjects: number;
  recentImports: {
    id: string;
    fileName: string;
    createdAt: string;
    committedAt: string | null;
    createdBy: string;
    created: number | null;
  }[];
}

export interface SystemDashboard extends AdminDashboard {
  security: { activeSessions: number; failedLogins24h: number; mfaEnabled: number; quarantinedFiles: number };
  exports: { ready: number; failed24h: number };
  backup: { configured: boolean; lastSuccessAt: string | null };
  errors: { at: string; method: string; path: string; message: string }[];
  recentAudit: {
    id: string;
    action: string;
    entityType: string | null;
    entityId: string | null;
    createdAt: string;
    actor: string;
  }[];
}

// ------------------------------------------------------------ O‘quvchi natijalari (xodim uchun)

export interface StudentResultItem {
  sessionId: string;
  title: string;
  testTitle: string;
  subject: Ref;
  state: SessionState;
  startsAt: string;
  endsAt: string;
  className: string | null;
  status: ParticipationStatus;
  attemptsCount: number;
  score: number | null;
  maxScore: number | null;
  percent: number | null;
  categories: Partial<Record<Category, { earned: number; max: number; percent: number | null; reached: boolean }>>;
  submittedAt: string | null;
  canManage: boolean;
}

export interface StudentResultsView {
  student: {
    id: string;
    internalId: number;
    fullName: string;
    className: string | null;
    classId: string | null;
    status: UserStatus;
    lastActiveAt: string | null;
  };
  summary: {
    participation: Ratio;
    mastery: Ratio;
    categories: ({ category: Category } & Ratio)[];
  };
  results: StudentResultItem[];
}
