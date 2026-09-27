import { Injectable } from '@nestjs/common';
import {
  fullName,
  hasBlockingIssues,
  normalizeForSearch,
  sumPoints,
  validateTestDraft,
  type Blueprint,
  type Category,
  type SharePermission,
  type addBankQuestionsSchema,
  type addNewTestQuestionSchema,
  type blueprintSchema,
  type copyQuestionsFromTestSchema,
  type copyTestSchema,
  type shareTestSchema,
  type testListQuerySchema,
  type testPassportSchema,
  type testSchoolShareSchema,
  type updateTestQuestionSchema,
} from '@ijod/shared';
import type { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../common/auth-user.js';
import { hasRole, isLeadership } from '../common/auth-user.js';
import { badRequest, conflict, forbidden, notFound } from '../common/errors.js';
import { num } from '../common/numbers.js';
import { pageArgs, toPage } from '../common/pagination.js';
import type { Prisma, TestTemplate, TestVersion } from '../generated/prisma/client.js';
import { PrismaService, type Tx } from '../prisma/prisma.service.js';
import { correctOptionOf, optionsOf, versionView } from '../questions/question-content.js';
import { QuestionsService } from '../questions/questions.service.js';

type Out<T extends z.ZodType> = z.output<T>;
/** SCHOOL — maktab test bankidagi test: nusxa olish va tayyor versiya bilan sessiya o‘tkazish (COPY kabi). */
export type TestPermission = 'OWNER' | SharePermission | 'SCHOOL';

const canEdit = (permission: TestPermission | null) => permission === 'OWNER' || permission === 'EDIT';
const canCopy = (permission: TestPermission | null) =>
  canEdit(permission) || permission === 'COPY' || permission === 'SCHOOL';

/**
 * Testga huquq: egasi; tahrirlash/nusxa ulashishi; maktab banki (barcha o‘qituvchi va rahbariyat);
 * rahbariyat — har qanday testdan nusxa. “Faqat ko‘rish” ulashishi bank yoki rahbariyat huquqini kamaytirmaydi.
 */
export function resolveTestPermission(
  viewer: Pick<AuthUser, 'id' | 'roles'>,
  template: Pick<TestTemplate, 'ownerId' | 'visibility' | 'status'>,
  share: SharePermission | null,
): TestPermission | null {
  if (template.ownerId === viewer.id) return 'OWNER';
  if (share === 'EDIT' || share === 'COPY') return share;
  if (
    template.visibility === 'SCHOOL' &&
    template.status !== 'ARCHIVED' &&
    hasRole(viewer, 'TEACHER', 'DEPUTY', 'SUPER_ADMIN')
  ) {
    return 'SCHOOL';
  }
  if (isLeadership(viewer)) return 'COPY';
  return share;
}

/**
 * Yangi sessiya ishlatadigan versiya raqami (yoki null — sessiya yaratib bo‘lmaydi). Tahrirlovchi
 * qoralamani muzlatadi; nusxa, bank va rahbariyat huquqi faqat tayyor (muzlatilgan) versiyani ishlatadi.
 */
function conductVersionNo(
  template: Pick<TestTemplate, 'status'>,
  permission: TestPermission | null,
  draftVersionNo: number | null,
  publishedVersionNo: number | null,
) {
  if (template.status === 'ARCHIVED' || !canCopy(permission)) return null;
  if (canEdit(permission)) return draftVersionNo ?? publishedVersionNo;
  return publishedVersionNo;
}

// Tayyor versiya bo‘lmasa nusxa ham olinmaydi — shuning uchun faqat muallifga murojaat taklif qilinadi.
const notPublished = () =>
  badRequest(
    'TEST_NOT_PUBLISHED',
    'Bu testning tayyor (muzlatilgan) versiyasi yo‘q. Muallifdan testni maktab bankiga chiqarishni yoki sessiyada bir marta ishlatishni so‘rang.',
  );

interface VersionStat {
  versionNo: number;
  status: 'DRAFT' | 'FROZEN';
  title: string;
  questionCount: number;
  totalPoints: number;
}

const listInclude = (viewerId: string) =>
  ({
    subject: { select: { id: true, name: true } },
    owner: { select: { id: true, lastName: true, firstName: true, middleName: true, avatarFileId: true } },
    shares: { where: { userId: viewerId }, select: { permission: true } },
  }) satisfies Prisma.TestTemplateInclude;

type ListTemplate = Prisma.TestTemplateGetPayload<{ include: ReturnType<typeof listInclude> }>;

const versionQuestionsInclude = {
  questions: {
    orderBy: { position: 'asc' },
    include: { questionVersion: { include: { question: { select: { id: true, ownerId: true, topic: true } } } } },
  },
} satisfies Prisma.TestVersionInclude;

type VersionWithQuestions = Prisma.TestVersionGetPayload<{ include: typeof versionQuestionsInclude }>;

export function testSearchText(template: { title: string; topic?: string | null; tags?: readonly string[] }) {
  return normalizeForSearch([template.title, template.topic, ...(template.tags ?? [])].filter(Boolean).join(' '));
}

/** Test versiyasining savollarini ko‘rinishga keltiradi (javob kaliti bilan — faqat xodimlar uchun). */
export function versionQuestions(version: VersionWithQuestions, viewerId: string) {
  return version.questions.map((item, index) => {
    const content = versionView(item.questionVersion);
    return {
      testQuestionId: item.id,
      number: index + 1,
      position: item.position,
      /** Shu testdagi ball. */
      points: num(item.points) ?? 0,
      questionId: item.questionVersion.question.id,
      isMyQuestion: item.questionVersion.question.ownerId === viewerId,
      topic: item.questionVersion.question.topic,
      versionId: content.id,
      versionNo: content.versionNo,
      type: content.type,
      stem: content.stem,
      options: content.options,
      correctOptionId: content.correctOptionId,
      explanation: content.explanation,
      category: content.category,
      difficulty: content.difficulty,
      /** Bankdagi standart ball. */
      defaultPoints: content.points,
      locked: content.locked,
    };
  });
}

@Injectable()
export class TestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly questions: QuestionsService,
    private readonly audit: AuditService,
  ) {}

  // ------------------------------------------------------------ Ruxsatlar

  async permission(
    viewer: AuthUser,
    template: Pick<TestTemplate, 'id' | 'ownerId' | 'visibility' | 'status'>,
  ): Promise<TestPermission | null> {
    if (template.ownerId === viewer.id) return 'OWNER';
    const share = await this.prisma.testShare.findUnique({
      where: { templateId_userId: { templateId: template.id, userId: viewer.id } },
    });
    return resolveTestPermission(viewer, template, (share?.permission as SharePermission | undefined) ?? null);
  }

  private async load(viewer: AuthUser, id: string, need: 'view' | 'edit' | 'copy') {
    const template = await this.prisma.testTemplate.findUnique({ where: { id } });
    if (!template) throw notFound('Test');
    const permission = await this.permission(viewer, template);
    if (!permission) throw notFound('Test');
    if (need === 'edit' && !canEdit(permission)) throw forbidden('Bu testni tahrirlash huquqingiz yo‘q.');
    if (need === 'copy' && !canCopy(permission)) throw forbidden('Bu testdan nusxa olish huquqingiz yo‘q.');
    if (need === 'edit' && template.status === 'ARCHIVED') {
      throw badRequest('TEST_ARCHIVED', 'Arxivlangan testni tahrirlab bo‘lmaydi.');
    }
    return { template, permission };
  }

  // ------------------------------------------------------------ Versiyalar

  private draftOf(templateId: string, client: Tx | PrismaService = this.prisma) {
    return client.testVersion.findFirst({ where: { templateId, status: 'DRAFT' } });
  }

  private latestFrozen(templateId: string, client: Tx | PrismaService = this.prisma) {
    return client.testVersion.findFirst({
      where: { templateId, status: 'FROZEN' },
      orderBy: { versionNo: 'desc' },
    });
  }

  /** Joriy (tahrirlanadigan yoki oxirgi muzlatilgan) versiya. */
  private async currentVersion(templateId: string, client: Tx | PrismaService = this.prisma) {
    return (await this.draftOf(templateId, client)) ?? (await this.latestFrozen(templateId, client));
  }

  /**
   * Foydalanuvchiga ko‘rinadigan versiya: tahrirlovchiga — qoralama (bo‘lsa), boshqalarga (ko‘rish,
   * nusxa, maktab banki, rahbariyat) — faqat oxirgi muzlatilgan versiya, muallifning ish nusxasi emas.
   */
  private visibleVersion(
    templateId: string,
    permission: TestPermission | null,
    client: Tx | PrismaService = this.prisma,
  ) {
    return canEdit(permission) ? this.currentVersion(templateId, client) : this.latestFrozen(templateId, client);
  }

  /** Har bir test uchun oxirgi versiya va oxirgi muzlatilgan versiya ko‘rsatkichlari (bitta so‘rov). */
  private async versionStats(templateIds: string[]) {
    const stats = new Map<string, { latest: VersionStat | null; published: VersionStat | null }>();
    if (templateIds.length === 0) return stats;
    const versions = await this.prisma.testVersion.findMany({
      where: { templateId: { in: templateIds } },
      orderBy: [{ templateId: 'asc' }, { versionNo: 'desc' }],
      select: {
        templateId: true,
        versionNo: true,
        status: true,
        title: true,
        totalPoints: true,
        _count: { select: { questions: true } },
      },
    });
    for (const version of versions) {
      const entry = stats.get(version.templateId) ?? { latest: null, published: null };
      const stat: VersionStat = {
        versionNo: version.versionNo,
        status: version.status,
        title: version.title,
        questionCount: version._count.questions,
        totalPoints: num(version.totalPoints) ?? 0,
      };
      entry.latest ??= stat;
      if (version.status === 'FROZEN') entry.published ??= stat;
      stats.set(version.templateId, entry);
    }
    return stats;
  }

  private async sessionCounts(templateIds: string[]) {
    if (templateIds.length === 0) return new Map<string, number>();
    const rows = await this.prisma.$queryRaw<{ templateId: string; sessions: number }[]>`
      SELECT tv."templateId" AS "templateId", COUNT(s.id)::int AS sessions
      FROM "AssessmentSession" s JOIN "TestVersion" tv ON tv.id = s."testVersionId"
      WHERE tv."templateId" = ANY(${templateIds}::uuid[])
      GROUP BY tv."templateId"`;
    return new Map(rows.map((row) => [row.templateId, row.sessions]));
  }

  /**
   * Tahrirlash uchun qoralama versiyani ta’minlaydi. Qoralama bo‘lmasa, oxirgi muzlatilgan
   * versiyadan nusxa olinadi — muzlatilgan versiya va uni ishlatayotgan sessiyalar o‘zgarmaydi.
   */
  private async ensureDraft(tx: Tx, template: TestTemplate): Promise<TestVersion> {
    const existing = await this.draftOf(template.id, tx);
    if (existing) return existing;
    const frozen = await this.latestFrozen(template.id, tx);
    const last = await tx.testVersion.aggregate({ where: { templateId: template.id }, _max: { versionNo: true } });
    const draft = await tx.testVersion.create({
      data: {
        templateId: template.id,
        versionNo: (last._max.versionNo ?? 0) + 1,
        status: 'DRAFT',
        title: template.title,
        instructions: template.instructions,
        blueprint: (frozen?.blueprint ?? {}) as Prisma.InputJsonValue,
        totalPoints: frozen?.totalPoints ?? 0,
      },
    });
    if (frozen) {
      const questions = await tx.testQuestion.findMany({ where: { testVersionId: frozen.id } });
      await tx.testQuestion.createMany({
        data: questions.map((question) => ({
          testVersionId: draft.id,
          questionVersionId: question.questionVersionId,
          position: question.position,
          points: question.points,
        })),
      });
    }
    return draft;
  }

  private async recalcDraft(tx: Tx, draftId: string) {
    const questions = await tx.testQuestion.findMany({
      where: { testVersionId: draftId },
      orderBy: { position: 'asc' },
    });
    // Tartib raqamlarini 0..n-1 ko‘rinishida saqlaymiz.
    for (const [index, question] of questions.entries()) {
      if (question.position !== index) {
        await tx.testQuestion.update({ where: { id: question.id }, data: { position: index } });
      }
    }
    await tx.testVersion.update({
      where: { id: draftId },
      data: { totalPoints: sumPoints(questions.map((question) => num(question.points) ?? 0)) },
    });
  }

  private async touch(tx: Tx, templateId: string) {
    await tx.testTemplate.update({ where: { id: templateId }, data: { updatedAt: new Date() } });
  }

  /**
   * Mijozdagi savol identifikatori (u muzlatilgan versiyadan bo‘lishi mumkin) qoralamadagi
   * mos savolga aylantiriladi.
   */
  private async resolveDraftQuestion(tx: Tx, draft: TestVersion, testQuestionId: string) {
    const direct = await tx.testQuestion.findFirst({ where: { id: testQuestionId, testVersionId: draft.id } });
    if (direct) return direct;
    const original = await tx.testQuestion.findUnique({
      where: { id: testQuestionId },
      include: { testVersion: { select: { templateId: true } } },
    });
    if (!original || original.testVersion.templateId !== draft.templateId) throw notFound('Savol');
    const mapped = await tx.testQuestion.findFirst({
      where: { testVersionId: draft.id, questionVersionId: original.questionVersionId },
    });
    if (!mapped) throw notFound('Savol');
    return mapped;
  }

  // ------------------------------------------------------------ Ko‘rish

  private issuesFor(template: TestTemplate, version: VersionWithQuestions | null) {
    return validateTestDraft({
      title: template.title,
      subjectId: template.subjectId,
      gradeLevel: template.gradeLevel,
      blueprint: (version?.blueprint ?? null) as Blueprint | null,
      questions: (version?.questions ?? []).map((item) => ({
        questionId: item.questionVersion.questionId,
        type: item.questionVersion.type,
        stem: item.questionVersion.stem,
        options: optionsOf(item.questionVersion),
        answerKey: { correctOptionId: correctOptionOf(item.questionVersion) },
        category: item.questionVersion.category as Category,
        points: num(item.points) ?? 0,
      })),
    });
  }

  async get(viewer: AuthUser, id: string) {
    const { template, permission } = await this.load(viewer, id, 'view');
    const editor = canEdit(permission);
    const current = await this.visibleVersion(id, permission);
    const version = current
      ? await this.prisma.testVersion.findUniqueOrThrow({ where: { id: current.id }, include: versionQuestionsInclude })
      : null;
    const [subject, owner, author, copiedFrom, frozenVersions, shares] = await Promise.all([
      this.prisma.subject.findUniqueOrThrow({ where: { id: template.subjectId }, select: { id: true, name: true } }),
      this.prisma.user.findUniqueOrThrow({ where: { id: template.ownerId } }),
      this.prisma.user.findUniqueOrThrow({ where: { id: template.originalAuthorId } }),
      template.copiedFromId
        ? this.prisma.testTemplate.findUnique({
            where: { id: template.copiedFromId },
            select: { id: true, title: true },
          })
        : null,
      this.prisma.testVersion.findMany({
        where: { templateId: id, status: 'FROZEN' },
        orderBy: { versionNo: 'desc' },
        include: { _count: { select: { questions: true, sessions: true } } },
      }),
      permission === 'OWNER'
        ? this.prisma.testShare.findMany({
            where: { templateId: id },
            include: { user: { select: { id: true, lastName: true, firstName: true, middleName: true } } },
          })
        : [],
    ]);
    const questions = version ? versionQuestions(version, viewer.id) : [];
    const publishedVersionNo = frozenVersions[0]?.versionNo ?? null;
    const draftVersionNo = editor && version?.status === 'DRAFT' ? version.versionNo : null;
    const conductNo = conductVersionNo(template, permission, draftVersionNo, publishedVersionNo);
    return {
      id: template.id,
      // Boshqalar muzlatilgan versiyadagi nom va ko‘rsatmalarni ko‘radi (muallifning ish nusxasini emas).
      title: editor ? template.title : (version?.title ?? template.title),
      subject,
      gradeLevel: template.gradeLevel,
      topic: template.topic,
      goal: template.goal,
      language: template.language,
      academicYearId: template.academicYearId,
      tags: template.tags,
      folder: template.folder,
      instructions: editor ? template.instructions : (version?.instructions ?? null),
      status: template.status,
      visibility: template.visibility,
      schoolSharedAt: template.schoolSharedAt,
      createdAt: template.createdAt,
      updatedAt: template.updatedAt,
      owner: { id: owner.id, fullName: fullName(owner) },
      originalAuthor: { id: author.id, fullName: fullName(author) },
      copiedFrom,
      permission,
      canEdit: editor && template.status !== 'ARCHIVED',
      canCopy: canCopy(permission) && (editor || publishedVersionNo !== null),
      canConduct: conductNo !== null,
      /** Bankka chiqarish/olish: egasi; rahbariyat — faqat bankdan olish (moderatsiya). */
      canChangeVisibility:
        (permission === 'OWNER' && (template.status !== 'ARCHIVED' || template.visibility === 'SCHOOL')) ||
        (isLeadership(viewer) && template.visibility === 'SCHOOL'),
      /** Yangi sessiya ishlatadigan versiya (tahrirlovchi uchun qoralama muzlatiladi). */
      conductVersionNo: conductNo,
      /** Oxirgi muzlatilgan (tayyor) versiya — bank va nusxa huquqi shu versiyani ko‘radi. */
      publishedVersionNo,
      version: version
        ? {
            id: version.id,
            versionNo: version.versionNo,
            status: version.status,
            blueprint: version.blueprint as Blueprint,
            totalPoints: sumPoints(questions.map((question) => question.points)),
            questions,
          }
        : null,
      isDraft: version?.status === 'DRAFT',
      issues: this.issuesFor(template, version),
      frozenVersions: frozenVersions.map((item) => ({
        id: item.id,
        versionNo: item.versionNo,
        frozenAt: item.frozenAt,
        totalPoints: num(item.totalPoints) ?? 0,
        questionCount: item._count.questions,
        sessionCount: item._count.sessions,
      })),
      shares: shares.map((share) => ({
        userId: share.userId,
        fullName: fullName(share.user),
        permission: share.permission,
      })),
    };
  }

  private listWhere(viewer: AuthUser, query: Out<typeof testListQuerySchema>): Prisma.TestTemplateWhereInput {
    const mine: Prisma.TestTemplateWhereInput = { ownerId: viewer.id };
    const shared: Prisma.TestTemplateWhereInput = { shares: { some: { userId: viewer.id } } };
    const school: Prisma.TestTemplateWhereInput = { visibility: 'SCHOOL', status: { not: 'ARCHIVED' } };
    const and: Prisma.TestTemplateWhereInput[] = [];
    switch (query.scope) {
      case 'mine':
        and.push(mine);
        break;
      case 'shared':
        and.push(shared);
        break;
      case 'school':
        and.push(school);
        break;
      case 'available':
        // Sessiya uchun tanlash mumkin bo‘lganlar; rahbariyat — butun maktab.
        if (!isLeadership(viewer)) and.push({ OR: [mine, shared, school] });
        break;
      case 'all':
        if (!isLeadership(viewer)) and.push({ OR: [mine, shared] });
        break;
    }
    if (query.status) and.push({ status: query.status });
    else and.push({ status: { not: 'ARCHIVED' } });
    if (query.subjectId) and.push({ subjectId: query.subjectId });
    if (query.gradeLevel) and.push({ gradeLevel: query.gradeLevel });
    if (query.tag) and.push({ tags: { has: query.tag } });
    if (query.q) {
      // Nom, mavzu, teglar yoki muallif ismi bo‘yicha.
      const text = normalizeForSearch(query.q);
      and.push({ OR: [{ searchText: { contains: text } }, { owner: { searchText: { contains: text } } }] });
    }
    return { AND: and };
  }

  private listItem(
    viewer: AuthUser,
    template: ListTemplate,
    stats: { latest: VersionStat | null; published: VersionStat | null } | undefined,
  ) {
    const permission =
      resolveTestPermission(viewer, template, template.shares[0]?.permission ?? null) ?? ('VIEW' as TestPermission);
    const editor = canEdit(permission);
    // Tahrirlovchi joriy qoralamani, qolganlar tayyor versiyani ko‘radi.
    const shown = editor ? stats?.latest : stats?.published;
    const publishedVersionNo = stats?.published?.versionNo ?? null;
    const draftVersionNo = stats?.latest?.status === 'DRAFT' ? stats.latest.versionNo : null;
    return {
      id: template.id,
      title: editor ? template.title : (stats?.published?.title ?? template.title),
      subject: template.subject,
      gradeLevel: template.gradeLevel,
      topic: template.topic,
      tags: template.tags,
      folder: template.folder,
      status: template.status,
      visibility: template.visibility,
      schoolSharedAt: template.schoolSharedAt,
      owner: {
        id: template.owner.id,
        fullName: fullName(template.owner),
        avatarUrl: template.owner.avatarFileId ? `/api/files/${template.owner.avatarFileId}` : null,
      },
      permission,
      questionCount: shown?.questionCount ?? 0,
      totalPoints: shown?.totalPoints ?? 0,
      hasDraftChanges: editor && draftVersionNo !== null && publishedVersionNo !== null,
      publishedVersionNo,
      canConduct: conductVersionNo(template, permission, editor ? draftVersionNo : null, publishedVersionNo) !== null,
      sessionCount: 0,
      updatedAt: template.updatedAt,
    };
  }

  async list(viewer: AuthUser, query: Out<typeof testListQuerySchema>) {
    const where = this.listWhere(viewer, query);
    const include = listInclude(viewer.id);
    const metricSort = query.sort === 'questionCount' || query.sort === 'totalPoints';
    const orderBy: Prisma.TestTemplateOrderByWithRelationInput[] =
      query.sort === 'title'
        ? [{ title: query.order }, { id: 'asc' }]
        : [{ updatedAt: metricSort ? 'desc' : query.order }, { id: 'asc' }];

    let templates: ListTemplate[];
    let total: number;
    if (metricSort) {
      // Savollar soni va ball versiyaga bog‘liq: butun ro‘yxat tartiblanadi, keyin sahifa kesiladi.
      templates = await this.prisma.testTemplate.findMany({ where, orderBy, include });
      total = templates.length;
    } else {
      [templates, total] = await Promise.all([
        this.prisma.testTemplate.findMany({ where, orderBy, include, ...pageArgs(query) }),
        this.prisma.testTemplate.count({ where }),
      ]);
    }
    const stats = await this.versionStats(templates.map((template) => template.id));
    let items = templates.map((template) => this.listItem(viewer, template, stats.get(template.id)));
    if (metricSort) {
      const key = query.sort as 'questionCount' | 'totalPoints';
      const direction = query.order === 'asc' ? 1 : -1;
      items = items
        .sort((a, b) => (a[key] - b[key]) * direction)
        .slice(pageArgs(query).skip, pageArgs(query).skip + query.pageSize);
    }
    const sessions = await this.sessionCounts(items.map((item) => item.id));
    return toPage(
      items.map((item) => ({ ...item, sessionCount: sessions.get(item.id) ?? 0 })),
      total,
      query,
    );
  }

  // ------------------------------------------------------------ Yaratish va tahrirlash (1–4-bosqichlar)

  async create(viewer: AuthUser, input: Out<typeof testPassportSchema>) {
    await this.questions.assertTeachesSubject(viewer, input.subjectId);
    const template = await this.prisma.$transaction(async (tx) => {
      const created = await tx.testTemplate.create({
        data: {
          ownerId: viewer.id,
          originalAuthorId: viewer.id,
          title: input.title,
          subjectId: input.subjectId,
          gradeLevel: input.gradeLevel,
          topic: input.topic,
          goal: input.goal,
          language: input.language,
          academicYearId:
            input.academicYearId ?? (await tx.academicYear.findFirst({ where: { isCurrent: true } }))?.id ?? null,
          tags: input.tags,
          folder: input.folder,
          instructions: input.instructions,
          searchText: testSearchText(input),
          versions: {
            create: { versionNo: 1, status: 'DRAFT', title: input.title, instructions: input.instructions },
          },
        },
      });
      await this.audit.log('test.create', { type: 'TestTemplate', id: created.id }, { title: input.title }, { tx });
      return created;
    });
    return this.get(viewer, template.id);
  }

  async updatePassport(viewer: AuthUser, id: string, input: Out<typeof testPassportSchema>) {
    const { template } = await this.load(viewer, id, 'edit');
    if (input.subjectId !== template.subjectId || input.gradeLevel !== template.gradeLevel) {
      // Tayyor versiyani bank, nusxa huquqi va rahbariyat shu fan va sinf bilan ishlatadi — ular o‘zgarmaydi.
      if (await this.latestFrozen(id)) {
        throw conflict(
          'TEST_SUBJECT_LOCKED',
          'Testning tayyor (muzlatilgan) versiyasi bor — fan va sinf darajasini o‘zgartirib bo‘lmaydi. Boshqa fan yoki sinf uchun testdan nusxa oling va nusxada o‘zgartiring.',
        );
      }
    }
    if (input.subjectId !== template.subjectId) await this.questions.assertTeachesSubject(viewer, input.subjectId);
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.testTemplate.update({
        where: { id },
        data: {
          title: input.title,
          subjectId: input.subjectId,
          gradeLevel: input.gradeLevel,
          topic: input.topic,
          goal: input.goal,
          language: input.language,
          academicYearId: input.academicYearId ?? template.academicYearId,
          tags: input.tags,
          folder: input.folder,
          instructions: input.instructions,
          searchText: testSearchText(input),
        },
      });
      const draft = await this.ensureDraft(tx, updated);
      await tx.testVersion.update({
        where: { id: draft.id },
        data: { title: input.title, instructions: input.instructions },
      });
    });
    return this.get(viewer, id);
  }

  async setBlueprint(viewer: AuthUser, id: string, input: Out<typeof blueprintSchema>) {
    const { template } = await this.load(viewer, id, 'edit');
    await this.prisma.$transaction(async (tx) => {
      const draft = await this.ensureDraft(tx, template);
      await tx.testVersion.update({
        where: { id: draft.id },
        data: { blueprint: input.blueprint as Prisma.InputJsonValue },
      });
      await this.touch(tx, id);
    });
    return this.get(viewer, id);
  }

  async addNewQuestion(viewer: AuthUser, id: string, input: Out<typeof addNewTestQuestionSchema>) {
    const { template } = await this.load(viewer, id, 'edit');
    await this.prisma.$transaction(async (tx) => {
      const draft = await this.ensureDraft(tx, template);
      const { version } = await this.questions.createInTx(
        tx,
        viewer,
        {
          subjectId: template.subjectId,
          gradeLevel: template.gradeLevel,
          topic: input.topic ?? template.topic,
          tags: input.tags,
        },
        input.content,
      );
      const count = await tx.testQuestion.count({ where: { testVersionId: draft.id } });
      await tx.testQuestion.create({
        data: { testVersionId: draft.id, questionVersionId: version.id, position: count, points: input.content.points },
      });
      await this.recalcDraft(tx, draft.id);
      await this.touch(tx, id);
    });
    return this.get(viewer, id);
  }

  async addFromBank(viewer: AuthUser, id: string, input: Out<typeof addBankQuestionsSchema>) {
    const { template } = await this.load(viewer, id, 'edit');
    const skipped: string[] = [];
    await this.prisma.$transaction(async (tx) => {
      const draft = await this.ensureDraft(tx, template);
      const existing = await tx.testQuestion.findMany({
        where: { testVersionId: draft.id },
        include: { questionVersion: { select: { questionId: true } } },
      });
      const present = new Set(existing.map((item) => item.questionVersion.questionId));
      let position = existing.length;
      for (const questionId of input.questionIds) {
        const question = await tx.question.findUnique({
          where: { id: questionId },
          include: { versions: { orderBy: { versionNo: 'desc' }, take: 1 } },
        });
        const visible =
          question &&
          !question.archivedAt &&
          (question.ownerId === viewer.id || question.visibility === 'SCHOOL' || isLeadership(viewer));
        if (!visible) throw notFound('Savol');
        if (present.has(questionId)) {
          skipped.push(questionId);
          continue;
        }
        const version = question.versions[0]!;
        await tx.testQuestion.create({
          data: {
            testVersionId: draft.id,
            questionVersionId: version.id,
            position: position++,
            points: version.points,
          },
        });
        present.add(questionId);
      }
      await this.recalcDraft(tx, draft.id);
      await this.touch(tx, id);
    });
    return { ...(await this.get(viewer, id)), skippedQuestionIds: skipped };
  }

  async copyFromTest(viewer: AuthUser, id: string, input: Out<typeof copyQuestionsFromTestSchema>) {
    const { template } = await this.load(viewer, id, 'edit');
    const { permission: sourcePermission } = await this.load(viewer, input.sourceTestId, 'copy');
    // Boshqa muallifning testidan faqat tayyor (muzlatilgan) versiya savollari olinadi.
    const source = await this.visibleVersion(input.sourceTestId, sourcePermission);
    if (!source) throw badRequest('EMPTY_SOURCE', 'Manba testda savollar yo‘q.');
    await this.prisma.$transaction(async (tx) => {
      const draft = await this.ensureDraft(tx, template);
      const sourceQuestions = await tx.testQuestion.findMany({
        where: {
          testVersionId: source.id,
          id: input.testQuestionIds?.length ? { in: input.testQuestionIds } : undefined,
        },
        orderBy: { position: 'asc' },
        include: { questionVersion: { select: { questionId: true } } },
      });
      const existing = await tx.testQuestion.findMany({
        where: { testVersionId: draft.id },
        include: { questionVersion: { select: { questionId: true } } },
      });
      const present = new Set(existing.map((item) => item.questionVersion.questionId));
      let position = existing.length;
      for (const item of sourceQuestions) {
        if (present.has(item.questionVersion.questionId)) continue;
        await tx.testQuestion.create({
          data: {
            testVersionId: draft.id,
            questionVersionId: item.questionVersionId,
            position: position++,
            points: item.points,
          },
        });
        present.add(item.questionVersion.questionId);
      }
      await this.recalcDraft(tx, draft.id);
      await this.touch(tx, id);
    });
    return this.get(viewer, id);
  }

  async updateQuestion(
    viewer: AuthUser,
    id: string,
    testQuestionId: string,
    input: Out<typeof updateTestQuestionSchema>,
  ) {
    const { template } = await this.load(viewer, id, 'edit');
    await this.prisma.$transaction(async (tx) => {
      const draft = await this.ensureDraft(tx, template);
      const item = await this.resolveDraftQuestion(tx, draft, testQuestionId);
      const data: Prisma.TestQuestionUpdateInput = {};
      if (input.points !== undefined) data.points = input.points;

      if (input.content) {
        const current = await tx.questionVersion.findUniqueOrThrow({
          where: { id: item.questionVersionId },
          include: { question: true },
        });
        let versionId: string;
        if (current.question.ownerId === viewer.id) {
          versionId = (await this.questions.reviseInTx(tx, viewer, current.questionId, input.content)).id;
        } else {
          // Boshqa muallifning savoli: asl nusxa o‘zgarmaydi, o‘qituvchi uchun shaxsiy nusxa yaratiladi.
          versionId = (
            await this.questions.createInTx(
              tx,
              viewer,
              {
                subjectId: current.question.subjectId,
                gradeLevel: current.question.gradeLevel,
                topic: current.question.topic,
                tags: current.question.tags,
              },
              input.content,
            )
          ).version.id;
        }
        if (versionId !== item.questionVersionId) data.questionVersion = { connect: { id: versionId } };
        if (input.points === undefined) data.points = input.content.points;
      }
      await tx.testQuestion.update({ where: { id: item.id }, data });
      await this.recalcDraft(tx, draft.id);
      await this.touch(tx, id);
    });
    return this.get(viewer, id);
  }

  async removeQuestion(viewer: AuthUser, id: string, testQuestionId: string) {
    const { template } = await this.load(viewer, id, 'edit');
    await this.prisma.$transaction(async (tx) => {
      const draft = await this.ensureDraft(tx, template);
      const item = await this.resolveDraftQuestion(tx, draft, testQuestionId);
      await tx.testQuestion.delete({ where: { id: item.id } });
      await this.recalcDraft(tx, draft.id);
      await this.touch(tx, id);
    });
    return this.get(viewer, id);
  }

  async reorder(viewer: AuthUser, id: string, testQuestionIds: string[]) {
    const { template } = await this.load(viewer, id, 'edit');
    await this.prisma.$transaction(async (tx) => {
      const draft = await this.ensureDraft(tx, template);
      const resolved = [];
      for (const questionId of testQuestionIds) resolved.push(await this.resolveDraftQuestion(tx, draft, questionId));
      const total = await tx.testQuestion.count({ where: { testVersionId: draft.id } });
      if (new Set(resolved.map((item) => item.id)).size !== total) {
        throw badRequest(
          'INVALID_ORDER',
          'Tartib ro‘yxati testdagi barcha savollarni bir martadan o‘z ichiga olishi kerak.',
        );
      }
      for (const [index, item] of resolved.entries()) {
        await tx.testQuestion.update({ where: { id: item.id }, data: { position: index } });
      }
      await this.touch(tx, id);
    });
    return this.get(viewer, id);
  }

  async validate(viewer: AuthUser, id: string) {
    return (await this.get(viewer, id)).issues;
  }

  // ------------------------------------------------------------ Muzlatish (10-bosqich)

  /**
   * Qoralamani tekshiradi va muzlatadi; qat’iy xatolar bo‘lsa nashr to‘xtatiladi. Muzlatilgan savol
   * versiyalari qulflanadi — keyingi tahrirlar yangi versiya yaratadi. Bir vaqtdagi so‘rovlar (ikki marta
   * bosish, bankka chiqarish va sessiya) qoralamani bir marta muzlatadi: holati bo‘yicha shartli
   * yangilash kutib turgan so‘rovda 0 qaytaradi — u holda null (qayta muzlatilmaydi, jurnalga yozilmaydi).
   * Qulflash tartibi (savol versiyalari → test versiyasi → test) tahrirlash amallari bilan bir xil.
   */
  private async freezeDraft(tx: Tx, viewer: AuthUser, template: TestTemplate, draft: VersionWithQuestions) {
    if (draft.questions.length === 0) throw badRequest('TEST_EMPTY', 'Testda savollar yo‘q.');
    const issues = this.issuesFor(template, draft);
    if (hasBlockingIssues(issues)) {
      throw badRequest('TEST_INVALID', 'Testda nashrni to‘xtatadigan xatolar bor. Avval ularni tuzating.', issues);
    }
    const now = new Date();
    await tx.questionVersion.updateMany({
      where: { id: { in: draft.questions.map((item) => item.questionVersionId) }, lockedAt: null },
      data: { lockedAt: now },
    });
    const claimed = await tx.testVersion.updateMany({
      where: { id: draft.id, status: 'DRAFT' },
      data: {
        status: 'FROZEN',
        frozenAt: now,
        frozenById: viewer.id,
        title: template.title,
        instructions: template.instructions,
        totalPoints: sumPoints(draft.questions.map((item) => num(item.points) ?? 0)),
      },
    });
    if (claimed.count === 0) return null;
    const frozen = await tx.testVersion.findUniqueOrThrow({ where: { id: draft.id } });
    await tx.testTemplate.update({ where: { id: template.id }, data: { status: 'ACTIVE' } });
    await this.audit.log(
      'test.version_frozen',
      { type: 'TestVersion', id: frozen.id },
      { templateId: template.id, versionNo: frozen.versionNo },
      { tx },
    );
    return frozen;
  }

  /**
   * Tayyor versiya: qoralama bo‘lsa — tekshirib muzlatiladi, aks holda oxirgi muzlatilgan versiya.
   * `froze` — shu so‘rov qoralamani muzlatdimi.
   */
  private async readyVersion(tx: Tx, viewer: AuthUser, template: TestTemplate) {
    const draft = await tx.testVersion.findFirst({
      where: { templateId: template.id, status: 'DRAFT' },
      include: versionQuestionsInclude,
    });
    const frozen = draft ? await this.freezeDraft(tx, viewer, template, draft) : null;
    if (frozen) return { version: frozen, froze: true };
    const latest = await this.latestFrozen(template.id, tx);
    if (!latest) throw badRequest('TEST_EMPTY', 'Testda savollar yo‘q.');
    return { version: latest, froze: false };
  }

  /**
   * Sessiya uchun muzlatilgan versiyani qaytaradi. Tahrirlovchi (egasi yoki tahrir huquqi) uchun
   * qoralama muzlatiladi; nusxa, maktab banki va rahbariyat huquqi bilan muallifning qoralamasiga
   * tegilmaydi — oxirgi tayyor versiya ishlatiladi. Sessiya nomi sukut bo‘yicha versiya nomidan olinadi.
   */
  async freezeForSession(tx: Tx, viewer: AuthUser, templateId: string, permission: TestPermission) {
    if (!canEdit(permission)) {
      const frozen = await this.latestFrozen(templateId, tx);
      if (!frozen) throw notPublished();
      return frozen;
    }
    const template = await tx.testTemplate.findUniqueOrThrow({ where: { id: templateId } });
    const { version, froze } = await this.readyVersion(tx, viewer, template);
    if (froze && template.visibility === 'SCHOOL') {
      // Bankdagi test: sessiyada muzlatilgan yangi versiya bankka ham tushadi — bu jurnalda ko‘rinsin.
      await tx.testTemplate.update({ where: { id: templateId }, data: { schoolSharedAt: new Date() } });
      await this.audit.log(
        'test.school_shared',
        { type: 'TestTemplate', id: templateId },
        { versionNo: version.versionNo, republished: true, viaSession: true },
        { tx },
      );
    }
    return version;
  }

  // ------------------------------------------------------------ Maktab test banki

  /**
   * Testni maktab bankiga chiqarish yoki olish. Chiqarishda joriy qoralama tekshirilib muzlatiladi —
   * bankda doim tayyor versiya turadi, keyingi tahrirlar qayta chiqarilguncha (yoki sessiyada
   * muzlatilguncha) boshqalarga ko‘rinmaydi. Rahbariyat istalgan testni bankdan olishi mumkin.
   * Takroriy yoki parallel so‘rov (masalan, ikki marta bosish) hech narsani qayta yozmaydi.
   */
  async setSchoolVisibility(viewer: AuthUser, id: string, input: Out<typeof testSchoolShareSchema>) {
    const { template, permission } = await this.load(viewer, id, 'view');
    if (input.shared) {
      if (permission !== 'OWNER') throw forbidden('Testni maktab bankiga faqat uning egasi chiqara oladi.');
      if (template.status === 'ARCHIVED') {
        throw conflict('TEST_ARCHIVED', 'Arxivlangan testni maktab bankiga chiqarib bo‘lmaydi.');
      }
      await this.prisma.$transaction(
        async (tx) => {
          const { version, froze } = await this.readyVersion(tx, viewer, template);
          // Yangi versiya muzlatilmagan va test allaqachon bankda bo‘lsa — o‘zgarish yo‘q.
          const changed = await tx.testTemplate.updateMany({
            where: froze ? { id } : { id, visibility: 'PRIVATE' },
            data: { visibility: 'SCHOOL', schoolSharedAt: new Date() },
          });
          if (changed.count === 0) return;
          await this.audit.log(
            'test.school_shared',
            { type: 'TestTemplate', id },
            { versionNo: version.versionNo, republished: template.visibility === 'SCHOOL' },
            { tx },
          );
        },
        { timeout: 30_000 },
      );
    } else {
      if (permission !== 'OWNER' && !isLeadership(viewer)) {
        throw forbidden('Testni maktab bankidan faqat uning egasi yoki rahbariyat olib tashlay oladi.');
      }
      await this.prisma.$transaction(async (tx) => {
        const changed = await tx.testTemplate.updateMany({
          where: { id, visibility: 'SCHOOL' },
          data: { visibility: 'PRIVATE', schoolSharedAt: null },
        });
        if (changed.count === 0) return;
        await this.audit.log(
          'test.school_unshared',
          { type: 'TestTemplate', id },
          { byOwner: permission === 'OWNER' },
          { tx },
        );
      });
    }
    return this.get(viewer, id);
  }

  // ------------------------------------------------------------ Hamkorlik

  async share(viewer: AuthUser, id: string, input: Out<typeof shareTestSchema>) {
    const { template, permission } = await this.load(viewer, id, 'view');
    if (permission !== 'OWNER') throw forbidden('Testni faqat egasi ulasha oladi.');
    if (input.userId === viewer.id) throw badRequest('SELF_SHARE', 'Testni o‘zingizga ulashib bo‘lmaydi.');
    const staff = await this.prisma.roleAssignment.count({
      where: { userId: input.userId, role: { in: ['TEACHER', 'DEPUTY'] } },
    });
    if (!staff) throw badRequest('NOT_STAFF', 'Testni faqat o‘qituvchi yoki rahbariyat bilan ulashish mumkin.');
    await this.prisma.testShare.upsert({
      where: { templateId_userId: { templateId: template.id, userId: input.userId } },
      update: { permission: input.permission },
      create: { templateId: template.id, userId: input.userId, permission: input.permission, createdById: viewer.id },
    });
    await this.audit.log('test.shared', { type: 'TestTemplate', id }, input);
    return this.get(viewer, id);
  }

  async unshare(viewer: AuthUser, id: string, userId: string) {
    const { permission } = await this.load(viewer, id, 'view');
    if (permission !== 'OWNER') throw forbidden('Testni faqat egasi boshqaradi.');
    await this.prisma.testShare.deleteMany({ where: { templateId: id, userId } });
    await this.audit.log('test.unshared', { type: 'TestTemplate', id }, { userId });
    return this.get(viewer, id);
  }

  /**
   * Nusxa olish: yangi qoralama test o‘qituvchiga tegishli, asl test o‘zgarmaydi, dastlabki muallif
   * saqlanadi. Tahrirlovchi joriy qoralamadan, boshqalar faqat tayyor (muzlatilgan) versiyadan — uning
   * nomi va ko‘rsatmalari bilan — nusxa oladi.
   */
  async copy(viewer: AuthUser, id: string, input: Out<typeof copyTestSchema> = { title: null }) {
    const { template, permission } = await this.load(viewer, id, 'copy');
    const source = await this.visibleVersion(id, permission);
    if (!source) {
      throw badRequest(
        'TEST_NOT_PUBLISHED',
        'Bu testning tayyor (muzlatilgan) versiyasi yo‘q — nusxa olish uchun muallif avval testni maktab bankiga chiqarishi yoki sessiyada ishlatishi kerak.',
      );
    }
    const editor = canEdit(permission);
    const sourceTitle = editor ? template.title : source.title;
    const instructions = editor ? template.instructions : source.instructions;
    const title = (input.title ?? `${sourceTitle} (nusxa)`).slice(0, 200);
    const copy = await this.prisma.$transaction(async (tx) => {
      const created = await tx.testTemplate.create({
        data: {
          ownerId: viewer.id,
          originalAuthorId: template.originalAuthorId,
          copiedFromId: template.id,
          title,
          subjectId: template.subjectId,
          gradeLevel: template.gradeLevel,
          topic: template.topic,
          goal: template.goal,
          language: template.language,
          academicYearId: template.academicYearId,
          tags: template.tags,
          folder: null,
          instructions,
          searchText: testSearchText({ ...template, title }),
        },
      });
      const draft = await tx.testVersion.create({
        data: {
          templateId: created.id,
          versionNo: 1,
          status: 'DRAFT',
          title: created.title,
          instructions: created.instructions,
          blueprint: source.blueprint as Prisma.InputJsonValue,
          totalPoints: source.totalPoints,
        },
      });
      const questions = await tx.testQuestion.findMany({ where: { testVersionId: source.id } });
      await tx.testQuestion.createMany({
        data: questions.map((question) => ({
          testVersionId: draft.id,
          questionVersionId: question.questionVersionId,
          position: question.position,
          points: question.points,
        })),
      });
      await this.audit.log(
        'test.copied',
        { type: 'TestTemplate', id: created.id },
        { sourceId: id, sourceVersionNo: source.versionNo },
        { tx },
      );
      return created;
    });
    return this.get(viewer, copy.id);
  }

  async archive(viewer: AuthUser, id: string) {
    const { template, permission } = await this.load(viewer, id, 'view');
    if (permission !== 'OWNER') throw forbidden('Testni faqat egasi arxivlay oladi.');
    await this.prisma.$transaction(async (tx) => {
      // Arxivlangan test maktab bankidan ham olinadi.
      await tx.testTemplate.update({
        where: { id },
        data: { status: 'ARCHIVED', visibility: 'PRIVATE', schoolSharedAt: null },
      });
      await this.audit.log(
        'test.archived',
        { type: 'TestTemplate', id },
        template.visibility === 'SCHOOL' ? { removedFromSchoolBank: true } : undefined,
        { tx },
      );
    });
    return { ok: true };
  }

  /**
   * Sessiya yaratish huquqi: tahrirlovchi (qoralama muzlatiladi), nusxa yoki maktab banki huquqi va
   * rahbariyat (tayyor versiya bilan). “Faqat ko‘rish” huquqi yetmaydi.
   */
  async ensureConductPermission(viewer: AuthUser, templateId: string) {
    const { template, permission } = await this.load(viewer, templateId, 'view');
    if (!canCopy(permission)) {
      throw forbidden(
        'Sizda bu testni faqat ko‘rish huquqi bor. Sessiya yaratish uchun muallifdan nusxa olish yoki tahrirlash huquqini so‘rang.',
      );
    }
    if (template.status === 'ARCHIVED')
      throw conflict('TEST_ARCHIVED', 'Arxivlangan test asosida sessiya yaratib bo‘lmaydi.');
    if (!canEdit(permission) && !(await this.latestFrozen(templateId))) throw notPublished();
    return { template, permission };
  }
}
