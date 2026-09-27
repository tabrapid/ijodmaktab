/**
 * Tahlil ko‘rsatkichlari: urinish siyosati bosh sahifa ko‘rsatkichlarida, natijalar filtrlari
 * (kategoriya foizi, tanlangan qatorlar), o‘quvchi natijalari tarixi va portfolio ko‘rinishi.
 */
import type { INestApplication } from '@nestjs/common';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import {
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
let teacher: Awaited<ReturnType<typeof login>>;

const QUESTIONS = [
  { stem: 'Bilish', category: 'KNOWLEDGE' as const, points: 2 },
  { stem: 'Qo‘llash', category: 'APPLICATION' as const, points: 4 },
  { stem: 'Mulohaza', category: 'REASONING' as const, points: 6 },
];

type Agent = Awaited<ReturnType<typeof login>>;
type View = { questions: { id: string; stem: string }[] };

/** Urinishni topshiradi: `correct` — to‘g‘ri javob beriladigan savol matnlari. */
async function submit(agent: Agent, attempt: { attemptId: string; client: string; view: View }, correct: string[]) {
  const answers = attempt.view.questions.map((question) => ({
    testQuestionId: question.id,
    optionId: correct.includes(question.stem) ? 'a' : 'b',
    revision: 1,
  }));
  await agent.post(`/api/attempts/${attempt.attemptId}/submit`).send({ clientId: attempt.client, answers }).expect(200);
}

beforeAll(async () => {
  ({ app, prisma } = await createApp());
  fx = await createFixture(prisma);
  teacher = await login(app, fx.teacher.login);
});

afterAll(async () => {
  await app.close();
});

describe('Urinish siyosati bosh sahifa ko‘rsatkichlarida', () => {
  it('“eng yaxshi” va “oxirgi” siyosatda sessiya natijasi bilan bir xil urinish hisoblanadi', async () => {
    const student = await login(app, fx.studentsA[0]!.login);
    const deputyUser = await createUser(prisma, ['DEPUTY']);
    const deputy = await login(app, deputyUser.login);

    // BEST: 1-urinish 0%, 2-urinish 100% → 100% hisoblanadi.
    const best = await createSession(teacher, (await createTest(teacher, fx.subjectId, QUESTIONS)).id, [fx.classA.id], {
      maxAttempts: 2,
      attemptPolicy: 'BEST',
    });
    await submit(student, await startAttempt(student, best.id, best.accessCode), []);
    await submit(student, await startAttempt(student, best.id, best.accessCode), ['Bilish', 'Qo‘llash', 'Mulohaza']);

    // LAST: 1-urinish 100%, 2-urinish 0% → 0% hisoblanadi.
    const last = await createSession(teacher, (await createTest(teacher, fx.subjectId, QUESTIONS)).id, [fx.classA.id], {
      maxAttempts: 2,
      attemptPolicy: 'LAST',
    });
    await submit(student, await startAttempt(student, last.id, last.accessCode), ['Bilish', 'Qo‘llash', 'Mulohaza']);
    await submit(student, await startAttempt(student, last.id, last.accessCode), []);

    for (const id of [best.id, last.id]) await teacher.post(`/api/sessions/${id}/close`).expect(200);

    const bestRow = (await teacher.get(`/api/sessions/${best.id}/results`).expect(200)).body.rows.find(
      (row: { studentId: string }) => row.studentId === fx.studentsA[0]!.id,
    );
    expect(bestRow).toMatchObject({ attemptNo: 2, percent: 100 });
    const lastRow = (await teacher.get(`/api/sessions/${last.id}/results`).expect(200)).body.rows.find(
      (row: { studentId: string }) => row.studentId === fx.studentsA[0]!.id,
    );
    expect(lastRow).toMatchObject({ attemptNo: 2, percent: 0 });

    const dashboard = (await teacher.get('/api/dashboard/teacher').expect(200)).body;
    const recent = (id: string) => dashboard.recent.find((item: { id: string }) => item.id === id);
    expect(recent(best.id).mastery).toMatchObject({ numerator: 12, denominator: 12 });
    expect(recent(last.id).mastery).toMatchObject({ numerator: 0, denominator: 12 });

    // Rahbariyat: ikki sessiya yig‘indisi — 12 / 24 (birinchi urinishlar olinganda ham 12 / 24 bo‘lardi,
    // shuning uchun alohida sessiya ko‘rsatkichlari ham tekshiriladi).
    const leadership = (await deputy.get('/api/dashboard/leadership').expect(200)).body;
    const leaderRecent = (id: string) => leadership.recentSessions.find((item: { id: string }) => item.id === id);
    expect(leaderRecent(best.id).mastery.percent).toBe(100);
    expect(leaderRecent(last.id).mastery.percent).toBe(0);
  });
});

describe('Natijalar filtrlari', () => {
  it('kategoriya foizi va tanlangan qatorlar bo‘yicha jadval, ko‘rsatkichlar va eksport bir xil filtrlanadi', async () => {
    const test = await createTest(teacher, fx.subjectId, QUESTIONS);
    const session = await createSession(teacher, test.id, [fx.classA.id]);
    const [s0, s1] = fx.studentsA;
    const strong = await login(app, s0!.login);
    const weak = await login(app, s1!.login);
    await submit(strong, await startAttempt(strong, session.id, session.accessCode), [
      'Bilish',
      'Qo‘llash',
      'Mulohaza',
    ]);
    await submit(weak, await startAttempt(weak, session.id, session.accessCode), ['Bilish']);

    const lowReasoning = await teacher
      .get(`/api/sessions/${session.id}/results`)
      .query({ category: 'REASONING', categoryMaxPercent: 50 })
      .expect(200);
    expect(lowReasoning.body.rows.map((row: { studentId: string }) => row.studentId)).toEqual([s1!.id]);
    // Ko‘rsatkichlar ham filtrlangan qatorlar bo‘yicha: 2 / 12 ball.
    expect(lowReasoning.body.metrics.overall.mastery).toMatchObject({ numerator: 2, denominator: 12 });

    const selected = await teacher.get(`/api/sessions/${session.id}/results`).query({ studentIds: s0!.id }).expect(200);
    expect(selected.body.rows).toHaveLength(1);
    expect(selected.body.rows[0].studentId).toBe(s0!.id);

    const preview = await teacher
      .post('/api/exports/preview')
      .send({
        kind: 'SESSION_RESULTS_XLSX',
        sessionId: session.id,
        filters: { category: 'REASONING', categoryMinPercent: 50 },
      })
      .expect(200);
    expect(preview.body.rowCount).toBe(1);
    const previewSelected = await teacher
      .post('/api/exports/preview')
      .send({ kind: 'SESSION_RESULTS_XLSX', sessionId: session.id, filters: { studentIds: [s0!.id, s1!.id] } })
      .expect(200);
    expect(previewSelected.body.rowCount).toBe(2);
  });
});

describe('O‘quvchi natijalari tarixi (xodim uchun)', () => {
  it('sinf o‘qituvchisi ko‘radi, boshqa sinf o‘qituvchisi va o‘quvchi ko‘ra olmaydi', async () => {
    const test = await createTest(teacher, fx.subjectId, QUESTIONS);
    const session = await createSession(teacher, test.id, [fx.classA.id]);
    const target = fx.studentsA[2]!;
    const student = await login(app, target.login);
    await submit(student, await startAttempt(student, session.id, session.accessCode), ['Bilish', 'Mulohaza']);

    const own = await teacher.get(`/api/students/${target.id}/results`).expect(200);
    const row = own.body.results.find((item: { sessionId: string }) => item.sessionId === session.id);
    expect(row).toMatchObject({ status: 'SUBMITTED', score: 8, maxScore: 12 });
    expect(own.body.student).toMatchObject({ id: target.id, className: fx.classA.name });

    const other = await login(app, fx.otherTeacher.login);
    await other.get(`/api/students/${target.id}/results`).expect(404);
    await student.get(`/api/students/${target.id}/results`).expect(403);
  });
});

describe('Portfolio ro‘yxati xodim uchun', () => {
  it('tekshiruvchi bo‘lmagan fan o‘qituvchisi faqat “xodimlar” ko‘rinishidagi yozuvlarni ko‘radi va jami son mos', async () => {
    const owner = fx.studentsA[1]!;
    const student = await login(app, owner.login);
    await student
      .post('/api/portfolio')
      .send({ type: 'POEM', title: 'Yopiq she’r', visibility: 'PRIVATE' })
      .expect(201);
    await student.post('/api/portfolio').send({ type: 'ESSAY', title: 'Ochiq esse', visibility: 'STAFF' }).expect(201);

    // A sinfda dars beradigan, lekin sinf rahbari bo‘lmagan o‘qituvchi.
    const year = await currentYear(prisma);
    const subjectTeacherUser = await createUser(prisma, ['TEACHER']);
    const otherSubject = await prisma.subject.create({ data: { name: `Qo‘shimcha fan ${subjectTeacherUser.login}` } });
    await prisma.teachingAssignment.create({
      data: {
        teacherId: subjectTeacherUser.id,
        subjectId: otherSubject.id,
        classId: fx.classA.id,
        academicYearId: year.id,
      },
    });
    const subjectTeacher = await login(app, subjectTeacherUser.login);

    const limited = await subjectTeacher.get('/api/portfolio').query({ ownerId: owner.id }).expect(200);
    expect(limited.body.total).toBe(1);
    expect(limited.body.items.map((item: { title: string }) => item.title)).toEqual(['Ochiq esse']);

    // Sinf rahbari (tekshiruvchi) ikkala yozuvni ko‘radi.
    const homeroom = await teacher.get('/api/portfolio').query({ ownerId: owner.id }).expect(200);
    expect(homeroom.body.total).toBe(2);
  });
});
