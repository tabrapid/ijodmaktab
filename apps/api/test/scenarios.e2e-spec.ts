/**
 * Reja, 19-bo‘lim: majburiy tekshiruv ssenariylari (12-si — zaxiradan tiklash — docs/zaxira.md da
 * qo‘lda bajariladigan tartib sifatida berilgan).
 */
import type { INestApplication } from '@nestjs/common';
import { JobsService } from '../src/jobs/jobs.service.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import {
  binaryParser,
  clientId,
  createApp,
  createFixture,
  createSession,
  createTest,
  createUser,
  currentYear,
  login,
  startAttempt,
  type Fixture,
} from './helpers.js';

let app: INestApplication;
let prisma: PrismaService;
let fx: Fixture;

beforeAll(async () => {
  ({ app, prisma } = await createApp());
  fx = await createFixture(prisma);
});

afterAll(async () => {
  await app.close();
});

const THREE_CATEGORY_TEST = [
  { stem: 'Bilish savoli', category: 'KNOWLEDGE' as const, points: 2 },
  { stem: 'Qo‘llash savoli', category: 'APPLICATION' as const, points: 4 },
  { stem: 'Mulohaza savoli', category: 'REASONING' as const, points: 6 },
];

let teacherAgent: Awaited<ReturnType<typeof login>> | null = null;

async function openSession(overrides: Record<string, unknown> = {}) {
  // Kirishga tezlik cheklovi bor, shuning uchun o‘qituvchi bir marta kiradi.
  teacherAgent ??= await login(app, fx.teacher.login);
  const teacher = teacherAgent;
  const test = await createTest(teacher, fx.subjectId, THREE_CATEGORY_TEST);
  const session = await createSession(teacher, test.id, [fx.classA.id], overrides);
  return { teacher, test, session };
}

describe('1. Begona o‘quvchining natijasini ID almashtirib ochib bo‘lmaydi', () => {
  it('boshqa o‘quvchi urinishi, natijasi va profili “topilmadi”', async () => {
    const { session } = await openSession();
    const owner = await login(app, fx.studentsA[0]!.login);
    const intruder = await login(app, fx.studentsA[1]!.login);
    const { attemptId, client } = await startAttempt(owner, session.id, session.accessCode);
    await owner.post(`/api/attempts/${attemptId}/submit`).send({ clientId: client, answers: [] }).expect(200);

    await intruder.get(`/api/attempts/${attemptId}`).expect(404);
    await intruder.post(`/api/attempts/${attemptId}/submit`).send({ clientId: clientId(), answers: [] }).expect(404);
    await intruder.get(`/api/users/${fx.studentsA[0]!.id}`).expect(404);
    await intruder.get(`/api/sessions/${session.id}/results`).expect(403);
    // Noto‘g‘ri ko‘rinishdagi ID ham ma’lumot bermaydi.
    await intruder.get('/api/attempts/123').expect(404);
  });
});

describe('2. Boshqa sinf o‘quvchisi kodni bilsa ham kira olmaydi', () => {
  it('tayinlanmagan o‘quvchi sessiyani ko‘ra ham, boshlay ham olmaydi', async () => {
    const { session } = await openSession();
    const outsider = await login(app, fx.studentsB[0]!.login);
    await outsider.get(`/api/me/sessions/${session.id}`).expect(404);
    await outsider
      .post(`/api/me/sessions/${session.id}/start`)
      .send({ code: session.accessCode, clientId: clientId() })
      .expect(404);
    const byCode = await outsider.post('/api/me/sessions/find-by-code').send({ code: session.accessCode });
    expect(byCode.status).toBe(400);
    expect(byCode.body.code).toBe('INVALID_CODE');
  });

  it('o‘qituvchi o‘zi dars bermaydigan sinfga test o‘tkaza olmaydi', async () => {
    teacherAgent ??= await login(app, fx.teacher.login);
    const teacher = teacherAgent;
    const test = await createTest(teacher, fx.subjectId, THREE_CATEGORY_TEST);
    const response = await teacher.post('/api/sessions').send({
      testId: test.id,
      audience: { classIds: [fx.classB.id], studentIds: [] },
      startsAt: new Date().toISOString(),
      endsAt: new Date(Date.now() + 3600_000).toISOString(),
      durationMinutes: 20,
    });
    expect(response.status).toBe(403);
  });

  it('noto‘g‘ri kod urinishlari cheklanadi', async () => {
    // Alohida o‘quvchi: cheklov boshqa testlarga ta’sir qilmasin.
    const year = await currentYear(prisma);
    const guesser = await createUser(prisma, ['STUDENT']);
    await prisma.enrollment.create({
      data: { studentId: guesser.id, classId: fx.classA.id, academicYearId: year.id, startsOn: year.startsOn },
    });
    const { session } = await openSession();
    await prisma.enrollment.updateMany({
      where: { studentId: guesser.id },
      data: { endsOn: new Date(), endReason: 'LEFT' },
    });

    const student = await login(app, guesser.login);
    const statuses: number[] = [];
    for (let index = 0; index < 11; index += 1) {
      statuses.push(
        (await student.post(`/api/me/sessions/${session.id}/start`).send({ code: 'ZZZZZZ', clientId: clientId() }))
          .status,
      );
    }
    expect(statuses.slice(0, 10).every((status) => status === 400)).toBe(true);
    expect(statuses[10]).toBe(429);
    // To‘g‘ri kod ham cheklov davomida qabul qilinmaydi.
    const blocked = await student
      .post(`/api/me/sessions/${session.id}/start`)
      .send({ code: session.accessCode, clientId: clientId() });
    expect(blocked.status).toBe(429);
  });
});

describe('3. Test banki tahriri boshlangan sessiyani o‘zgartirmaydi', () => {
  it('muzlatilgan versiya o‘zgarmaydi, tahrir yangi versiya yaratadi', async () => {
    const { teacher, test, session } = await openSession();
    const student = await login(app, fx.studentsA[0]!.login);
    const { attemptId, client, view } = await startAttempt(student, session.id, session.accessCode);
    const firstQuestion = test.version.questions[0]!;

    // O‘qituvchi bankdagi savolni ham, testdagi savolni ham tahrirlaydi (kalitni b ga o‘zgartiradi).
    const changed = {
      type: 'SINGLE_CHOICE',
      stem: 'O‘ZGARTIRILGAN MATN',
      options: [
        { id: 'a', text: 'A' },
        { id: 'b', text: 'B' },
      ],
      correctOptionId: 'b',
      category: 'KNOWLEDGE',
      difficulty: 'EASY',
      points: 5,
    };
    await teacher.patch(`/api/questions/${firstQuestion.questionId}`).send({ content: changed }).expect(200);
    const edited = await teacher
      .patch(`/api/tests/${test.id}/questions/${firstQuestion.testQuestionId}`)
      .send({ content: changed })
      .expect(200);
    expect(edited.body.isDraft).toBe(true);
    expect(edited.body.version.versionNo).toBe(2);

    // O‘quvchi hali eski matnni ko‘radi va eski kalit bo‘yicha baholanadi.
    const again = await student.get(`/api/attempts/${attemptId}`).query({ clientId: client }).expect(200);
    const target = again.body.questions.find((question: { stem: string }) => question.stem === 'Bilish savoli');
    expect(target).toBeDefined();
    expect(JSON.stringify(again.body)).not.toContain('O‘ZGARTIRILGAN');
    await student
      .put(`/api/attempts/${attemptId}/answers/${target.id}`)
      .send({ clientId: client, optionId: 'a', revision: 1 })
      .expect(200);
    const submitted = await student
      .post(`/api/attempts/${attemptId}/submit`)
      .send({ clientId: client, answers: [] })
      .expect(200);
    expect(submitted.body.result.score.earned).toBe(2);
    expect(submitted.body.result.score.max).toBe(12);
    expect(view.questions).toHaveLength(3);
  });
});

describe('4. Server muddati brauzer soatiga bog‘liq emas', () => {
  it('muddat o‘tgach javob qabul qilinmaydi va urinish server tomonidan yakunlanadi', async () => {
    const { session } = await openSession();
    const student = await login(app, fx.studentsA[1]!.login);
    const { attemptId, client, view } = await startAttempt(student, session.id, session.accessCode);
    const question = view.questions[0];
    await student
      .put(`/api/attempts/${attemptId}/answers/${question.id}`)
      .send({ clientId: client, optionId: 'a', revision: 1 })
      .expect(200);

    // Vaqt o‘tganini server tomonda modellashtiramiz: brauzer yuborgan hech narsa muddatni o‘zgartirmaydi.
    await prisma.attempt.update({ where: { id: attemptId }, data: { deadlineAt: new Date(Date.now() - 1000) } });
    const late = await student
      .put(`/api/attempts/${attemptId}/answers/${question.id}`)
      .send({ clientId: client, optionId: 'b', revision: 2 });
    expect(late.status).toBe(409);
    expect(late.body.code).toBe('TIME_UP');

    const attempt = await prisma.attempt.findUniqueOrThrow({ where: { id: attemptId }, include: { answers: true } });
    expect(attempt.status).toBe('EXPIRED');
    expect(attempt.submitSource).toBe('TIMEOUT');
    // Oxirgi serverda saqlangan javob baholanadi.
    expect(attempt.answers.find((answer) => answer.testQuestionId === question.id)?.optionId).toBe('a');
    const audit = await prisma.auditEvent.count({
      where: { action: 'attempt.late_answer_rejected', entityId: attemptId },
    });
    expect(audit).toBe(1);
  });

  it('brauzer yopiq bo‘lsa ham fon vazifasi urinishni yakunlaydi', async () => {
    const { session } = await openSession();
    const student = await login(app, fx.studentsA[2]!.login);
    const { attemptId } = await startAttempt(student, session.id, session.accessCode);
    await prisma.attempt.update({ where: { id: attemptId }, data: { deadlineAt: new Date(Date.now() - 1000) } });
    await app.get(JobsService).finalizeOverdueAttempts();
    const attempt = await prisma.attempt.findUniqueOrThrow({ where: { id: attemptId } });
    expect(attempt.status).toBe('EXPIRED');
    expect(attempt.maxScore?.toNumber()).toBe(12);
  });
});

describe('5. Qayta yuborilgan so‘rov qo‘shimcha urinish yaratmaydi', () => {
  it('parallel “Boshlash” va “Topshirish” bitta urinish va bitta natija beradi', async () => {
    const { session } = await openSession();
    const student = await login(app, fx.studentsA[0]!.login);
    const client = clientId();
    const starts = await Promise.all(
      Array.from({ length: 3 }, () =>
        student.post(`/api/me/sessions/${session.id}/start`).send({ code: session.accessCode, clientId: client }),
      ),
    );
    const ids = new Set(starts.map((response) => response.body.attemptId));
    expect(ids.size).toBe(1);
    const attemptId = [...ids][0] as string;

    const submits = await Promise.all(
      Array.from({ length: 3 }, () =>
        student.post(`/api/attempts/${attemptId}/submit`).send({ clientId: client, answers: [] }),
      ),
    );
    for (const response of submits) {
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('SUBMITTED');
    }
    expect(await prisma.attempt.count({ where: { sessionId: session.id, studentId: fx.studentsA[0]!.id } })).toBe(1);
    // Urinishlar tugagach yangisini boshlab bo‘lmaydi.
    const again = await student
      .post(`/api/me/sessions/${session.id}/start`)
      .send({ code: session.accessCode, clientId: client });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('NO_ATTEMPTS_LEFT');
  });
});

describe('6. Internet uzilishi va qayta kirish javoblarni yo‘qotmaydi', () => {
  it('qayta kirgandan keyin saqlangan javoblar tiklanadi, eski so‘rov yangisini bosmaydi', async () => {
    const { session } = await openSession();
    const first = await login(app, fx.studentsA[1]!.login);
    const { attemptId, client, view } = await startAttempt(first, session.id, session.accessCode);
    const [q1, q2] = view.questions;
    await first
      .put(`/api/attempts/${attemptId}/answers/${q1.id}`)
      .send({ clientId: client, optionId: 'b', revision: 3 })
      .expect(200);
    await first
      .put(`/api/attempts/${attemptId}/answers/${q2.id}`)
      .send({ clientId: client, optionId: 'c', revision: 1 })
      .expect(200);
    // Tarmoq kechikishi: eski revision keyin yetib keladi.
    const stale = await first
      .put(`/api/attempts/${attemptId}/answers/${q1.id}`)
      .send({ clientId: client, optionId: 'a', revision: 2 })
      .expect(200);
    expect(stale.body.stale).toBe(true);

    // Sahifa yangilanadi / qayta kiriladi (yangi sessiya, o‘sha qurilma).
    const second = await login(app, fx.studentsA[1]!.login);
    const restored = await second.get(`/api/attempts/${attemptId}`).query({ clientId: client }).expect(200);
    const answers = Object.fromEntries(
      restored.body.questions.map((question: { id: string; answer: { optionId: string } | null }) => [
        question.id,
        question.answer?.optionId,
      ]),
    );
    expect(answers[q1.id]).toBe('b');
    expect(answers[q2.id]).toBe('c');

    // Boshqa qurilma javob yoza olmaydi, faqat ochiq “davom etish” bilan o‘tadi.
    const other = clientId();
    const conflict = await second
      .put(`/api/attempts/${attemptId}/answers/${q1.id}`)
      .send({ clientId: other, optionId: 'a', revision: 9 });
    expect(conflict.status).toBe(409);
    expect(conflict.body.code).toBe('DEVICE_CONFLICT');
    const takeover = await second.post(`/api/attempts/${attemptId}/takeover`).send({ clientId: other }).expect(200);
    expect(takeover.body.deviceConflict).toBe(false);
    await first
      .put(`/api/attempts/${attemptId}/answers/${q1.id}`)
      .send({ clientId: client, optionId: 'a', revision: 10 })
      .expect(409);
  });
});

describe('7 va 8. Holatlar farqlanadi, umumiy foiz to‘g‘ri hisoblanadi', () => {
  it('nol ball, qatnashmagan, tekshirilayotgan va bekor qilingan ishlar alohida', async () => {
    const { teacher, session } = await openSession();
    const [zero, cancelled, review] = fx.studentsA;

    // 0 ball: hamma javob noto‘g‘ri.
    const zeroAgent = await login(app, zero!.login);
    const zeroAttempt = await startAttempt(zeroAgent, session.id, session.accessCode);
    await zeroAgent
      .post(`/api/attempts/${zeroAttempt.attemptId}/submit`)
      .send({
        clientId: zeroAttempt.client,
        answers: zeroAttempt.view.questions.map((question: { id: string }) => ({
          testQuestionId: question.id,
          optionId: 'b',
          revision: 1,
        })),
      })
      .expect(200);

    // Bekor qilingan urinish.
    const cancelAgent = await login(app, cancelled!.login);
    const cancelAttempt = await startAttempt(cancelAgent, session.id, session.accessCode);
    await teacher
      .post(`/api/attempts/${cancelAttempt.attemptId}/cancel`)
      .send({ reason: 'Texnik nosozlik', allowRetake: false })
      .expect(200);

    // Tekshirilayotgan ish (yozma savollar keyingi bosqichda — holatni to‘g‘ridan-to‘g‘ri belgilaymiz).
    const reviewAgent = await login(app, review!.login);
    const reviewAttempt = await startAttempt(reviewAgent, session.id, session.accessCode);
    await prisma.attempt.update({ where: { id: reviewAttempt.attemptId }, data: { status: 'UNDER_REVIEW' } });

    const results = await teacher.get(`/api/sessions/${session.id}/results`).expect(200);
    const byStudent = Object.fromEntries(results.body.rows.map((row: { studentId: string }) => [row.studentId, row]));
    expect(byStudent[zero!.id].status).toBe('SUBMITTED');
    expect(byStudent[zero!.id].score).toBe(0);
    expect(byStudent[zero!.id].percent).toBe(0);
    expect(byStudent[cancelled!.id].status).toBe('CANCELLED');
    expect(byStudent[cancelled!.id].score).toBeNull();
    expect(byStudent[review!.id].status).toBe('UNDER_REVIEW');

    const metrics = results.body.metrics;
    expect(metrics.graded).toBe(1);
    expect(metrics.participation).toMatchObject({ numerator: 1, denominator: 3 });
    expect(metrics.statusCounts).toMatchObject({ SUBMITTED: 1, CANCELLED: 1, UNDER_REVIEW: 1, NOT_STARTED: 0 });
    // Nol ball haqiqiy 0 sifatida o‘rtachaga kiradi.
    expect(metrics.overall.meanPercent).toBe(0);
  });

  it('turlicha kategoriya maksimumlarida umumiy foiz = Σ olingan / Σ maksimal', async () => {
    const { teacher, session } = await openSession();
    const student = await login(app, fx.studentsA[0]!.login);
    const { attemptId, client, view } = await startAttempt(student, session.id, session.accessCode);
    // Bilish (2) to‘g‘ri, qo‘llash (4) to‘g‘ri, mulohaza (6) noto‘g‘ri → 6/12 = 50%.
    // Kategoriya foizlari 100, 100, 0 — ularning oddiy o‘rtachasi 66,7% bo‘lardi.
    const answers = view.questions.map((question: { id: string; stem: string }) => ({
      testQuestionId: question.id,
      optionId: question.stem.startsWith('Mulohaza') ? 'b' : 'a',
      revision: 1,
    }));
    const submitted = await student
      .post(`/api/attempts/${attemptId}/submit`)
      .send({ clientId: client, answers })
      .expect(200);
    expect(submitted.body.result.score).toEqual({ earned: 6, max: 12, percent: 50 });
    const categories = Object.fromEntries(
      submitted.body.result.categories.map((item: { category: string; percent: number }) => [
        item.category,
        item.percent,
      ]),
    );
    expect(categories).toEqual({ KNOWLEDGE: 100, APPLICATION: 100, REASONING: 0 });

    const results = await teacher.get(`/api/sessions/${session.id}/results`).expect(200);
    expect(results.body.metrics.categoryMastery.REASONING).toMatchObject({ numerator: 0, denominator: 6, percent: 0 });
  });
});

describe('9. Ruxsat bekor qilingach eski eksport havolasi ishlamaydi', () => {
  it('sinf rahbari almashtirilgach uning eksport faylini yuklab bo‘lmaydi', async () => {
    const { session } = await openSession();
    // Sinf rahbari (sessiyani boshqarmaydi) natijalarni ko‘radi va eksport yaratadi.
    const homeroom = await createUser(prisma, ['TEACHER']);
    await prisma.class.update({ where: { id: fx.classA.id }, data: { homeroomTeacherId: homeroom.id } });
    const agent = await login(app, homeroom.login);
    await agent.get(`/api/sessions/${session.id}/results`).expect(200);
    const job = await agent
      .post('/api/exports')
      .send({ kind: 'SESSION_RESULTS_XLSX', sessionId: session.id, filters: {} })
      .expect(201);

    let status = 'QUEUED';
    for (let tries = 0; tries < 50 && status !== 'READY'; tries += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      status = (await agent.get(`/api/exports/${job.body.id}`)).body.status;
    }
    expect(status).toBe('READY');
    const ok = await agent.get(`/api/exports/${job.body.id}/download`).buffer(true).parse(binaryParser);
    expect(ok.status).toBe(200);
    expect(ok.headers['content-type']).toContain('spreadsheetml');

    // Vakolat olib qo‘yiladi — eski havola endi ishlamaydi.
    await prisma.class.update({ where: { id: fx.classA.id }, data: { homeroomTeacherId: fx.teacher.id } });
    const denied = await agent.get(`/api/exports/${job.body.id}/download`);
    expect(denied.status).toBe(404);
    expect(await prisma.auditEvent.count({ where: { action: 'export.download_denied', entityId: job.body.id } })).toBe(
      1,
    );

    // Boshqa foydalanuvchi birovning eksportini ocha olmaydi.
    const stranger = await login(app, fx.otherTeacher.login);
    await stranger.get(`/api/exports/${job.body.id}/download`).expect(404);
  });
});

describe('10. Sinfga ko‘chirish tarixiy natijalarni o‘zgartirmaydi', () => {
  it('natija eski sinf bilan qoladi', async () => {
    const { teacher, session } = await openSession();
    const student = fx.studentsA[2]!;
    const agent = await login(app, student.login);
    const { attemptId, client } = await startAttempt(agent, session.id, session.accessCode);
    await agent.post(`/api/attempts/${attemptId}/submit`).send({ clientId: client, answers: [] }).expect(200);

    const admin = await createUser(prisma, ['ADMIN']);
    const adminAgent = await login(app, admin.login);
    await adminAgent.post(`/api/students/${student.id}/transfer`).send({ toClassId: fx.classB.id }).expect(200);

    const results = await teacher.get(`/api/sessions/${session.id}/results`).expect(200);
    const row = results.body.rows.find((item: { studentId: string }) => item.studentId === student.id);
    expect(row.className).toBe(fx.classA.name);
    const history = await prisma.enrollment.findMany({
      where: { studentId: student.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(history).toHaveLength(2);
    expect(history[0]!.endReason).toBe('TRANSFER');
    expect(history[1]!.endsOn).toBeNull();

    // Qaytarib qo‘yamiz (boshqa testlar uchun).
    await adminAgent.post(`/api/students/${student.id}/transfer`).send({ toClassId: fx.classA.id }).expect(200);
  });
});

describe('11. Qayta baholash sabab va eski/yangi qiymatni saqlaydi', () => {
  it('savol hisobdan chiqariladi, tarix saqlanadi', async () => {
    const { teacher, session } = await openSession({ scoreVisibility: 'AFTER_SUBMIT' });
    const student = fx.studentsA[1]!;
    const agent = await login(app, student.login);
    const { attemptId, client, view } = await startAttempt(agent, session.id, session.accessCode);
    const answers = view.questions.map((question: { id: string }) => ({
      testQuestionId: question.id,
      optionId: 'a',
      revision: 1,
    }));
    await agent.post(`/api/attempts/${attemptId}/submit`).send({ clientId: client, answers }).expect(200);

    const results = await teacher.get(`/api/sessions/${session.id}/results`).expect(200);
    const reasoning = results.body.questions.find(
      (question: { category: string }) => question.category === 'REASONING',
    );
    const regrade = await teacher
      .post(`/api/sessions/${session.id}/regrade`)
      .send({ testQuestionId: reasoning.testQuestionId, mode: 'EXCLUDE', reason: 'Savol shartida xato bor' })
      .expect(200);
    expect(regrade.body).toMatchObject({ version: 2, affectedCount: 1 });

    const detail = await teacher.get(`/api/sessions/${session.id}/revisions/${regrade.body.revisionId}`).expect(200);
    expect(detail.body.reason).toBe('Savol shartida xato bor');
    const item = detail.body.items.find((entry: { student: { id: string } }) => entry.student.id === student.id);
    expect(item.before).toMatchObject({ score: 12, maxScore: 12 });
    expect(item.after).toMatchObject({ score: 6, maxScore: 6 });

    const attempt = await prisma.attempt.findUniqueOrThrow({ where: { id: attemptId } });
    expect(attempt.gradingVersion).toBe(2);
    expect(await prisma.auditEvent.count({ where: { action: 'grades.revised', entityId: session.id } })).toBe(1);
    // O‘quvchi natijasini ko‘ra oladi (AFTER_SUBMIT), shuning uchun qayta hisoblash haqida xabar oladi.
    const notification = await prisma.notification.count({ where: { userId: student.id, type: 'GRADES_REVISED' } });
    expect(notification).toBe(1);
  });
});
