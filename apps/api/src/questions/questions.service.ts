import { Injectable } from '@nestjs/common';
import {
  fullName,
  normalizeForSearch,
  type createQuestionSchema,
  type questionListQuerySchema,
  type updateQuestionSchema,
} from '@ijod/shared';
import type { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../common/auth-user.js';
import { hasRole, isLeadership } from '../common/auth-user.js';
import { badRequest, conflict, forbidden, notFound } from '../common/errors.js';
import { pageArgs, toPage } from '../common/pagination.js';
import type { Prisma } from '../generated/prisma/client.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService, type Tx } from '../prisma/prisma.service.js';
import {
  contentChanged,
  questionSearchText,
  versionData,
  versionView,
  type QuestionContent,
} from './question-content.js';

type Out<T extends z.ZodType> = z.output<T>;

const questionInclude = {
  owner: { select: { id: true, lastName: true, firstName: true, middleName: true } },
  subject: { select: { id: true, name: true } },
  versions: { orderBy: { versionNo: 'desc' }, take: 1 },
} satisfies Prisma.QuestionInclude;

type QuestionWithLatest = Prisma.QuestionGetPayload<{ include: typeof questionInclude }>;

@Injectable()
export class QuestionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  /** O‘qituvchi faqat o‘zi dars beradigan fanlar bo‘yicha savol va test yaratadi (rahbariyat — istalgan). */
  async assertTeachesSubject(viewer: AuthUser, subjectId: string) {
    const subject = await this.prisma.subject.findUnique({ where: { id: subjectId } });
    if (!subject) throw notFound('Fan');
    if (isLeadership(viewer)) return subject;
    const count = await this.prisma.teachingAssignment.count({
      where: { teacherId: viewer.id, subjectId, academicYear: { isCurrent: true } },
    });
    if (!count)
      throw forbidden(
        `Siz “${subject.name}” fanidan dars bermaysiz, shuning uchun bu fan bo‘yicha savol yoki test yarata olmaysiz.`,
      );
    return subject;
  }

  private canView(viewer: AuthUser, question: { ownerId: string; visibility: string }) {
    return question.ownerId === viewer.id || question.visibility === 'SCHOOL' || isLeadership(viewer);
  }

  private toItem(question: QuestionWithLatest, viewer: AuthUser, usage?: number) {
    const latest = question.versions[0];
    return {
      id: question.id,
      subject: question.subject,
      gradeLevel: question.gradeLevel,
      topic: question.topic,
      tags: question.tags,
      visibility: question.visibility,
      schoolRequestedAt: question.schoolRequestedAt,
      owner: { id: question.owner.id, fullName: fullName(question.owner) },
      isMine: question.ownerId === viewer.id,
      usedInTests: usage ?? 0,
      updatedAt: question.updatedAt,
      archivedAt: question.archivedAt,
      latest: latest ? versionView(latest) : null,
    };
  }

  private async usage(questionIds: string[]) {
    if (questionIds.length === 0) return new Map<string, number>();
    const rows = await this.prisma.$queryRaw<{ questionId: string; tests: number }[]>`
      SELECT qv."questionId" AS "questionId", COUNT(DISTINCT tv."templateId")::int AS tests
      FROM "TestQuestion" tq
      JOIN "QuestionVersion" qv ON qv.id = tq."questionVersionId"
      JOIN "TestVersion" tv ON tv.id = tq."testVersionId"
      WHERE qv."questionId" = ANY(${questionIds}::uuid[])
      GROUP BY qv."questionId"`;
    return new Map(rows.map((row) => [row.questionId, row.tests]));
  }

  async list(viewer: AuthUser, query: Out<typeof questionListQuerySchema>) {
    const and: Prisma.QuestionWhereInput[] = [{ archivedAt: null }];
    // Xususiy savollar boshqa o‘qituvchilarga qidiruv orqali ham ko‘rinmaydi.
    if (query.scope === 'mine') and.push({ ownerId: viewer.id });
    else if (query.scope === 'school') and.push({ visibility: 'SCHOOL' });
    else and.push({ OR: [{ ownerId: viewer.id }, { visibility: 'SCHOOL' }] });

    if (query.subjectId) and.push({ subjectId: query.subjectId });
    if (query.gradeLevel) and.push({ gradeLevel: query.gradeLevel });
    if (query.topic) and.push({ topic: { contains: query.topic, mode: 'insensitive' } });
    if (query.category) and.push({ category: query.category });
    if (query.difficulty) and.push({ difficulty: query.difficulty });
    if (query.tag) and.push({ tags: { has: query.tag } });
    if (query.visibility) and.push({ visibility: query.visibility });
    if (query.q) and.push({ searchText: { contains: normalizeForSearch(query.q) } });

    const where: Prisma.QuestionWhereInput = { AND: and };
    const orderBy: Prisma.QuestionOrderByWithRelationInput[] =
      query.sort === 'topic'
        ? [{ topic: { sort: query.order, nulls: 'last' } }, { updatedAt: 'desc' }]
        : [{ updatedAt: query.order }];

    const [items, total] = await Promise.all([
      this.prisma.question.findMany({ where, orderBy, include: questionInclude, ...pageArgs(query) }),
      this.prisma.question.count({ where }),
    ]);
    const usage = await this.usage(items.map((item) => item.id));
    return toPage(
      items.map((item) => this.toItem(item, viewer, usage.get(item.id))),
      total,
      query,
    );
  }

  async detail(viewer: AuthUser, id: string) {
    const question = await this.prisma.question.findUnique({
      where: { id },
      include: { ...questionInclude, versions: { orderBy: { versionNo: 'desc' } } },
    });
    if (!question || !this.canView(viewer, question)) throw notFound('Savol');
    const usage = await this.usage([id]);
    return {
      ...this.toItem(question, viewer, usage.get(id)),
      versions: question.versions.map(versionView),
    };
  }

  /** Bankda yangi savol va uning 1-versiyasini yaratadi (test ustasi ham shundan foydalanadi). */
  async createInTx(
    tx: Tx,
    viewer: AuthUser,
    meta: { subjectId: string; gradeLevel?: number | null; topic?: string | null; tags?: string[] },
    content: QuestionContent,
  ) {
    const question = await tx.question.create({
      data: {
        ownerId: viewer.id,
        subjectId: meta.subjectId,
        gradeLevel: meta.gradeLevel ?? null,
        topic: meta.topic ?? null,
        tags: meta.tags ?? [],
        type: content.type,
        category: content.category,
        difficulty: content.difficulty,
        searchText: questionSearchText({ stem: content.stem, topic: meta.topic, tags: meta.tags }),
        versions: { create: { versionNo: 1, createdById: viewer.id, ...versionData(content) } },
      },
      include: { versions: true },
    });
    return { question, version: question.versions[0]! };
  }

  /**
   * Savol mazmunini o‘zgartiradi. Muzlatilgan testda ishlatilgan (qulflangan) versiya
   * hech qachon o‘zgarmaydi — yangi versiya yaratiladi. Qaytadi: amaldagi versiya.
   */
  async reviseInTx(tx: Tx, viewer: AuthUser, questionId: string, content: QuestionContent) {
    const question = await tx.question.findUniqueOrThrow({
      where: { id: questionId },
      include: { versions: { orderBy: { versionNo: 'desc' }, take: 1 } },
    });
    const latest = question.versions[0]!;
    if (!contentChanged(latest, content)) return latest;

    const version = latest.lockedAt
      ? await tx.questionVersion.create({
          data: {
            questionId,
            versionNo: latest.versionNo + 1,
            createdById: viewer.id,
            ...versionData(content),
          },
        })
      : await tx.questionVersion.update({ where: { id: latest.id }, data: versionData(content) });

    await tx.question.update({
      where: { id: questionId },
      data: {
        latestVersionNo: version.versionNo,
        type: content.type,
        category: content.category,
        difficulty: content.difficulty,
        searchText: questionSearchText({ stem: content.stem, topic: question.topic, tags: question.tags }),
      },
    });
    return version;
  }

  async create(viewer: AuthUser, input: Out<typeof createQuestionSchema>) {
    await this.assertTeachesSubject(viewer, input.subjectId);
    const { question } = await this.prisma.$transaction(async (tx) => {
      const created = await this.createInTx(tx, viewer, input, input.content);
      await this.audit.log(
        'question.create',
        { type: 'Question', id: created.question.id },
        { subjectId: input.subjectId },
        { tx },
      );
      return created;
    });
    return this.detail(viewer, question.id);
  }

  private async ownQuestion(viewer: AuthUser, id: string) {
    const question = await this.prisma.question.findUnique({ where: { id } });
    if (!question || !this.canView(viewer, question)) throw notFound('Savol');
    if (question.ownerId !== viewer.id) {
      throw forbidden('Faqat savol muallifi uni o‘zgartira oladi. Kerak bo‘lsa, testga qo‘shib nusxasini tahrirlang.');
    }
    return question;
  }

  async update(viewer: AuthUser, id: string, input: Out<typeof updateQuestionSchema>) {
    const question = await this.ownQuestion(viewer, id);
    if (input.subjectId && input.subjectId !== question.subjectId) {
      await this.assertTeachesSubject(viewer, input.subjectId);
    }
    await this.prisma.$transaction(async (tx) => {
      const topic = input.topic === undefined ? question.topic : input.topic;
      const tags = input.tags ?? question.tags;
      await tx.question.update({
        where: { id },
        data: {
          subjectId: input.subjectId ?? question.subjectId,
          gradeLevel: input.gradeLevel === undefined ? question.gradeLevel : input.gradeLevel,
          topic,
          tags,
        },
      });
      if (input.content) {
        await this.reviseInTx(tx, viewer, id, input.content);
      } else {
        const latest = await tx.questionVersion.findFirstOrThrow({
          where: { questionId: id },
          orderBy: { versionNo: 'desc' },
        });
        await tx.question.update({
          where: { id },
          data: { searchText: questionSearchText({ stem: latest.stem, topic, tags }) },
        });
      }
      await this.audit.log(
        'question.update',
        { type: 'Question', id },
        { contentChanged: Boolean(input.content) },
        { tx },
      );
    });
    return this.detail(viewer, id);
  }

  async archive(viewer: AuthUser, id: string) {
    await this.ownQuestion(viewer, id);
    await this.prisma.question.update({ where: { id }, data: { archivedAt: new Date() } });
    await this.audit.log('question.archive', { type: 'Question', id });
    return { ok: true };
  }

  // ------------------------------------------------------------ Maktab banki

  async requestSchool(viewer: AuthUser, id: string) {
    const question = await this.ownQuestion(viewer, id);
    if (question.visibility === 'SCHOOL') throw badRequest('ALREADY_SCHOOL', 'Savol allaqachon maktab bankida.');
    await this.prisma.question.update({ where: { id }, data: { schoolRequestedAt: new Date() } });
    await this.audit.log('question.school_requested', { type: 'Question', id });
    return { ok: true };
  }

  async schoolRequests(viewer: AuthUser) {
    if (!isLeadership(viewer)) throw forbidden();
    const items = await this.prisma.question.findMany({
      where: { visibility: 'PRIVATE', schoolRequestedAt: { not: null }, archivedAt: null },
      include: questionInclude,
      orderBy: { schoolRequestedAt: 'asc' },
      take: 200,
    });
    const usage = await this.usage(items.map((item) => item.id));
    return items.map((item) => this.toItem(item, viewer, usage.get(item.id)));
  }

  /**
   * Metodik tekshiruvchi (rahbariyat) savolni maktab bankiga chiqaradi yoki rad etadi.
   * O‘z savolini o‘zi tasdiqlamaydi; qaror muallifga bildirishnoma bilan yetkaziladi.
   */
  async decideSchool(viewer: AuthUser, id: string, approve: boolean, reason?: string | null) {
    if (!hasRole(viewer, 'DEPUTY', 'SUPER_ADMIN')) throw forbidden();
    const question = await this.prisma.question.findUnique({ where: { id }, include: questionInclude });
    if (!question || !question.schoolRequestedAt) throw notFound('So‘rov');
    if (question.visibility !== 'PRIVATE' || question.archivedAt) {
      throw conflict('NOT_PENDING', 'Bu so‘rov bo‘yicha qaror allaqachon qabul qilingan yoki savol arxivlangan.');
    }
    if (question.ownerId === viewer.id) {
      throw conflict('SELF_REVIEW', 'O‘z savolingiz bo‘yicha qarorni boshqa metodik tekshiruvchi qabul qilishi kerak.');
    }
    const stem = question.versions[0]?.stem ?? '';
    const preview = stem.length > 120 ? `${stem.slice(0, 117)}…` : stem;
    await this.prisma.$transaction(async (tx) => {
      await tx.question.update({
        where: { id },
        data: approve
          ? { visibility: 'SCHOOL', schoolApprovedAt: new Date(), schoolApprovedById: viewer.id }
          : { schoolRequestedAt: null },
      });
      await this.notifications.notify(
        [question.ownerId],
        approve
          ? {
              type: 'QUESTION_SCHOOL_APPROVED',
              title: 'Savolingiz maktab bankiga qo‘shildi',
              body: preview,
              link: '/teacher/questions',
            }
          : {
              type: 'QUESTION_SCHOOL_REJECTED',
              title: 'Savolingiz maktab bankiga qabul qilinmadi',
              body: reason ? `${reason} — “${preview}”` : preview,
              link: '/teacher/questions',
            },
        tx,
      );
      await this.audit.log(
        approve ? 'question.school_approved' : 'question.school_rejected',
        { type: 'Question', id },
        reason ? { reason } : undefined,
        { tx },
      );
    });
    return { ok: true };
  }
}
