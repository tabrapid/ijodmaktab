/**
 * To‘liq ekran nazorati: to‘liq ekrandan chiqqan o‘quvchining urinishi avtomatik to‘xtatiladi,
 * o‘qituvchi ruxsat bergach davom etadi. Vaqt to‘xtamaydi, muddat tugasa odatdagidek yakunlanadi.
 */
import type { INestApplication } from '@nestjs/common';
import { JobsService } from '../src/jobs/jobs.service.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import {
  clientId,
  createApp,
  createFixture,
  createSession,
  createTest,
  createUser,
  login,
  startAttempt,
  type Fixture,
} from './helpers.js';

type Agent = Awaited<ReturnType<typeof login>>;

let app: INestApplication;
let prisma: PrismaService;
let fx: Fixture;
let deputy: { id: string; login: string };
const agents = new Map<string, Agent>();

beforeAll(async () => {
  ({ app, prisma } = await createApp());
  fx = await createFixture(prisma, 4);
  deputy = await createUser(prisma, ['DEPUTY']);
});

afterAll(async () => {
  await app.close();
});

/** Kirishga tezlik cheklovi bor, shuning uchun har bir foydalanuvchi bir marta kiradi. */
async function as(loginName: string) {
  let agent = agents.get(loginName);
  if (!agent) {
    agent = await login(app, loginName);
    agents.set(loginName, agent);
  }
  return agent;
}

const QUESTIONS = [
  { stem: 'Birinchi savol', category: 'KNOWLEDGE' as const, points: 2 },
  { stem: 'Ikkinchi savol', category: 'APPLICATION' as const, points: 3 },
  { stem: 'Uchinchi savol', category: 'REASONING' as const, points: 5 },
];

async function openSession(overrides: Record<string, unknown> = {}) {
  const teacher = await as(fx.teacher.login);
  const test = await createTest(teacher, fx.subjectId, QUESTIONS);
  const session = await createSession(teacher, test.id, [fx.classA.id], overrides);
  return { teacher, session };
}

async function begin(studentIndex: number, overrides: Record<string, unknown> = {}) {
  const { teacher, session } = await openSession(overrides);
  const student = await as(fx.studentsA[studentIndex]!.login);
  const started = await startAttempt(student, session.id, session.accessCode);
  const questions = started.view.questions as { id: string }[];
  return { teacher, session, student, ...started, questions };
}

describe('To‘xtatish: javob yozish, o‘tish va topshirish taqiqlanadi', () => {
  it('to‘liq ekrandan chiqqan urinish to‘xtaydi, holat va signal saqlanadi', async () => {
    const { session, student, attemptId, client, view, questions } = await begin(0, { conductorId: deputy.id });
    expect(view.session.requireFullscreen).toBe(true);
    expect(view.lock).toBeNull();
    expect(view.lockCount).toBe(0);

    await student
      .put(`/api/attempts/${attemptId}/answers/${questions[0]!.id}`)
      .send({ clientId: client, optionId: 'a', revision: 1 })
      .expect(200);

    const locked = await student
      .post(`/api/attempts/${attemptId}/lock`)
      .send({ clientId: client, reason: 'FULLSCREEN_EXIT', epoch: 0 })
      .expect(200);
    expect(locked.body.status).toBe('IN_PROGRESS');
    expect(locked.body.lock.reason).toBe('FULLSCREEN_EXIT');
    expect(locked.body.lockCount).toBe(1);
    expect(locked.body.deadlineAt).toBeTruthy();
    expect(locked.body.serverNow).toBeTruthy();

    const save = await student
      .put(`/api/attempts/${attemptId}/answers/${questions[1]!.id}`)
      .send({ clientId: client, optionId: 'b', revision: 1 });
    expect(save.status).toBe(409);
    expect(save.body.code).toBe('ATTEMPT_LOCKED');

    const advance = await student.post(`/api/attempts/${attemptId}/advance`).send({ clientId: client, toIndex: 1 });
    expect(advance.status).toBe(409);
    expect(advance.body.code).toBe('ATTEMPT_LOCKED');

    const submit = await student
      .post(`/api/attempts/${attemptId}/submit`)
      .send({ clientId: client, answers: [{ testQuestionId: questions[1]!.id, optionId: 'b', revision: 1 }] });
    expect(submit.status).toBe(409);
    expect(submit.body.code).toBe('ATTEMPT_LOCKED');

    // Takroriy xabar (yangi davr raqami bilan ham) hech narsani o‘zgartirmaydi.
    const again = await student
      .post(`/api/attempts/${attemptId}/lock`)
      .send({ clientId: client, reason: 'PAGE_HIDDEN', epoch: 1 })
      .expect(200);
    expect(again.body.lockCount).toBe(1);
    expect(again.body.lock.reason).toBe('FULLSCREEN_EXIT');
    expect(again.body.lock.lockedAt).toBe(locked.body.lock.lockedAt);

    const attempt = await prisma.attempt.findUniqueOrThrow({ where: { id: attemptId }, include: { answers: true } });
    expect(attempt.status).toBe('IN_PROGRESS');
    expect(attempt.lockCount).toBe(1);
    expect(attempt.focusLossCount).toBe(1);
    expect(attempt.answers).toHaveLength(1);

    // Yangi oyna (qayta yuklash) ham to‘xtatilganini ko‘radi; yurak urishi signalni yangilaydi.
    const reopened = await student.get(`/api/attempts/${attemptId}`).query({ clientId: client }).expect(200);
    expect(reopened.body.lock.reason).toBe('FULLSCREEN_EXIT');
    expect(reopened.body.lockCount).toBe(1);
    expect(reopened.body.questions).toHaveLength(3);
    await prisma.attempt.update({ where: { id: attemptId }, data: { lastSeenAt: new Date(Date.now() - 60_000) } });
    const beat = await student.post(`/api/attempts/${attemptId}/heartbeat`).send({ clientId: client }).expect(200);
    expect(beat.body.status).toBe('IN_PROGRESS');
    expect(beat.body.lock.reason).toBe('FULLSCREEN_EXIT');
    expect(beat.body.lockCount).toBe(1);
    const seen = await prisma.attempt.findUniqueOrThrow({ where: { id: attemptId } });
    expect(Date.now() - seen.lastSeenAt!.getTime()).toBeLessThan(10_000);

    // Boshqa qurilmaga o‘tish to‘xtatishni bekor qilmaydi.
    const other = clientId();
    const takeover = await student.post(`/api/attempts/${attemptId}/takeover`).send({ clientId: other }).expect(200);
    expect(takeover.body.lock.reason).toBe('FULLSCREEN_EXIT');
    const fromOther = await student
      .put(`/api/attempts/${attemptId}/answers/${questions[1]!.id}`)
      .send({ clientId: other, optionId: 'b', revision: 1 });
    expect(fromOther.body.code).toBe('ATTEMPT_LOCKED');

    // Audit va bildirishnomalar: yaratuvchi o‘qituvchi va o‘tkazuvchi (direktor o‘rinbosari).
    const audit = await prisma.auditEvent.findMany({ where: { action: 'attempt.locked', entityId: attemptId } });
    expect(audit).toHaveLength(1);
    expect(audit[0]!.data).toMatchObject({ reason: 'FULLSCREEN_EXIT', sessionId: session.id });
    const notes = await prisma.notification.findMany({
      where: { type: 'ATTEMPT_LOCKED', link: { contains: session.id } },
    });
    expect(notes).toHaveLength(2);
    const byUser = new Map(notes.map((note) => [note.userId, note]));
    expect(byUser.get(fx.teacher.id)?.link).toBe(`/teacher/sessions/${session.id}?tab=live`);
    expect(byUser.get(deputy.id)?.link).toBe(`/management/sessions/${session.id}?tab=live`);
    expect(byUser.get(fx.teacher.id)?.title).toMatch(/testdan chetlatildi$/);
    expect(byUser.get(fx.teacher.id)?.body).toContain('To‘liq ekrandan chiqdi');
    // O‘quvchining o‘ziga bildirishnoma yuborilmaydi.
    expect(await prisma.notification.count({ where: { type: 'ATTEMPT_LOCKED', userId: fx.studentsA[0]!.id } })).toBe(0);
  });
});

describe('E’tiborsiz qoldiriladigan xabarlar', () => {
  it('fondagi oyna, eskirgan davr va to‘liq ekran talab qilinmagan sessiya urinishni to‘xtatmaydi', async () => {
    const { session, student, attemptId, client, questions } = await begin(1);

    const preview = await student.get(`/api/me/sessions/${session.id}`).expect(200);
    expect(preview.body.requireFullscreen).toBe(true);

    const background = await student
      .post(`/api/attempts/${attemptId}/lock`)
      .send({ clientId: clientId(), reason: 'PAGE_HIDDEN', epoch: 0 })
      .expect(200);
    expect(background.body.lock).toBeNull();
    expect(background.body.lockCount).toBe(0);
    expect(background.body.deviceConflict).toBe(true);

    const stale = await student
      .post(`/api/attempts/${attemptId}/lock`)
      .send({ clientId: client, reason: 'PAGE_HIDDEN', epoch: 3 })
      .expect(200);
    expect(stale.body.lock).toBeNull();
    expect(stale.body.lockCount).toBe(0);

    const invalid = await student
      .post(`/api/attempts/${attemptId}/lock`)
      .send({ clientId: client, reason: 'SOMETHING_ELSE' });
    expect(invalid.status).toBe(400);

    await student
      .put(`/api/attempts/${attemptId}/answers/${questions[0]!.id}`)
      .send({ clientId: client, optionId: 'a', revision: 1 })
      .expect(200);

    // Boshqa o‘quvchi begona urinishni to‘xtata olmaydi.
    const intruder = await as(fx.studentsA[2]!.login);
    await intruder
      .post(`/api/attempts/${attemptId}/lock`)
      .send({ clientId: client, reason: 'PAGE_HIDDEN', epoch: 0 })
      .expect(404);
    // O‘qituvchi o‘quvchi nomidan to‘xtata olmaydi.
    const teacher = await as(fx.teacher.login);
    await teacher.post(`/api/attempts/${attemptId}/lock`).send({ clientId: client, reason: 'PAGE_HIDDEN' }).expect(403);

    const attempt = await prisma.attempt.findUniqueOrThrow({ where: { id: attemptId } });
    expect(attempt.lockedAt).toBeNull();
    expect(attempt.lockCount).toBe(0);
    expect(await prisma.auditEvent.count({ where: { action: 'attempt.locked', entityId: attemptId } })).toBe(0);
  });

  it('to‘liq ekran nazorati o‘chirilgan sessiya odatdagidek ishlaydi', async () => {
    const { session, student, attemptId, client, view, questions } = await begin(2, { requireFullscreen: false });
    expect(view.session.requireFullscreen).toBe(false);
    const preview = await student.get(`/api/me/sessions/${session.id}`).expect(200);
    expect(preview.body.requireFullscreen).toBe(false);

    const ignored = await student
      .post(`/api/attempts/${attemptId}/lock`)
      .send({ clientId: client, reason: 'FULLSCREEN_EXIT', epoch: 0 })
      .expect(200);
    expect(ignored.body.lock).toBeNull();
    expect(ignored.body.lockCount).toBe(0);
    await student
      .put(`/api/attempts/${attemptId}/answers/${questions[0]!.id}`)
      .send({ clientId: client, optionId: 'a', revision: 1 })
      .expect(200);
    const submitted = await student
      .post(`/api/attempts/${attemptId}/submit`)
      .send({ clientId: client, answers: [] })
      .expect(200);
    expect(submitted.body.status).toBe('SUBMITTED');
    expect(submitted.body.lock).toBeNull();
  });
});

describe('O‘qituvchi ruxsati', () => {
  it('jonli kuzatuvda to‘xtatilganlar birinchi; ruxsat, qo‘shimcha vaqt va yangi davr', async () => {
    const { teacher, session, student, attemptId, client, questions } = await begin(3);
    const lockedAt = Date.now();
    await student
      .post(`/api/attempts/${attemptId}/lock`)
      .send({ clientId: client, reason: 'PAGE_HIDDEN', epoch: 0 })
      .expect(200);

    const live = await teacher.get(`/api/sessions/${session.id}/live`).expect(200);
    expect(live.body.counts.locked).toBe(1);
    expect(live.body.counts.inProgress).toBe(1);
    const [first, ...rest] = live.body.rows;
    expect(first.studentId).toBe(fx.studentsA[3]!.id);
    expect(first.lockReason).toBe('PAGE_HIDDEN');
    expect(first.lockCount).toBe(1);
    expect(new Date(first.lockedAt).getTime()).toBeGreaterThanOrEqual(lockedAt - 1000);
    expect(first).toHaveProperty('avatarUrl', null);
    for (const row of rest) {
      expect(row.lockedAt).toBeNull();
      expect(row.lockReason).toBeNull();
    }
    const names = rest.map((row: { fullName: string }) => row.fullName);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'uz')));

    // Sessiyani boshqarmaydigan o‘qituvchi va o‘quvchi ruxsat bera olmaydi.
    const outsider = await as(fx.otherTeacher.login);
    await outsider.post(`/api/attempts/${attemptId}/unlock`).send({}).expect(404);
    await student.post(`/api/attempts/${attemptId}/unlock`).send({}).expect(403);
    const tooMuch = await teacher.post(`/api/attempts/${attemptId}/unlock`).send({ extraMinutes: 61 });
    expect(tooMuch.status).toBe(400);

    const before = await prisma.attempt.findUniqueOrThrow({ where: { id: attemptId }, include: { assignment: true } });
    const unlocked = await teacher
      .post(`/api/attempts/${attemptId}/unlock`)
      .send({ extraMinutes: 5, note: 'Tasodifan Esc bosildi' })
      .expect(200);
    expect(unlocked.body.counts.locked).toBe(0);
    const row = unlocked.body.rows.find((item: { attemptId: string }) => item.attemptId === attemptId);
    expect(row.lockedAt).toBeNull();
    expect(row.lockCount).toBe(1);
    expect(row.extraMinutes).toBe(before.assignment.extraMinutes + 5);

    const after = await prisma.attempt.findUniqueOrThrow({ where: { id: attemptId } });
    expect(after.lockedAt).toBeNull();
    expect(after.lockReason).toBeNull();
    expect(after.unlockedById).toBe(fx.teacher.id);
    expect(after.unlockedAt).not.toBeNull();
    expect(after.deadlineAt.getTime() - before.deadlineAt.getTime()).toBe(5 * 60_000);
    const audit = await prisma.auditEvent.findFirstOrThrow({
      where: { action: 'attempt.unlocked', entityId: attemptId },
    });
    expect(audit.actorId).toBe(fx.teacher.id);
    expect(audit.data).toMatchObject({ lockReason: 'PAGE_HIDDEN', extraMinutes: 5, note: 'Tasodifan Esc bosildi' });
    expect((audit.data as { lockedForMs: number }).lockedForMs).toBeGreaterThanOrEqual(0);

    const notLocked = await teacher.post(`/api/attempts/${attemptId}/unlock`).send({});
    expect(notLocked.status).toBe(409);
    expect(notLocked.body.code).toBe('NOT_LOCKED');

    // Ruxsatdan keyin javoblar yana saqlanadi; o‘quvchi yangi muddatni ko‘radi.
    await student
      .put(`/api/attempts/${attemptId}/answers/${questions[0]!.id}`)
      .send({ clientId: client, optionId: 'a', revision: 1 })
      .expect(200);
    const beat = await student.post(`/api/attempts/${attemptId}/heartbeat`).send({ clientId: client }).expect(200);
    expect(beat.body.lock).toBeNull();
    expect(beat.body.lockCount).toBe(1);
    expect(new Date(beat.body.deadlineAt).getTime()).toBe(after.deadlineAt.getTime());

    // Ruxsatdan oldingi davrga tegishli kechikkan xabar qayta to‘xtatmaydi; yangi davr bilan to‘xtatadi.
    const late = await student
      .post(`/api/attempts/${attemptId}/lock`)
      .send({ clientId: client, reason: 'PAGE_HIDDEN', epoch: 0 })
      .expect(200);
    expect(late.body.lock).toBeNull();
    const second = await student
      .post(`/api/attempts/${attemptId}/lock`)
      .send({ clientId: client, reason: 'FULLSCREEN_EXIT', epoch: 1 })
      .expect(200);
    expect(second.body.lock.reason).toBe('FULLSCREEN_EXIT');
    expect(second.body.lockCount).toBe(2);

    // Direktor o‘rinbosari ham ruxsat bera oladi (qo‘shimcha vaqtsiz).
    const leader = await as(deputy.login);
    const byDeputy = await leader.post(`/api/attempts/${attemptId}/unlock`).send({}).expect(200);
    expect(byDeputy.body.counts.locked).toBe(0);
    const unchanged = await prisma.attempt.findUniqueOrThrow({ where: { id: attemptId } });
    expect(unchanged.deadlineAt.getTime()).toBe(after.deadlineAt.getTime());
    expect(unchanged.unlockedById).toBe(deputy.id);

    const submitted = await student
      .post(`/api/attempts/${attemptId}/submit`)
      .send({ clientId: client, answers: [{ testQuestionId: questions[1]!.id, optionId: 'a', revision: 1 }] })
      .expect(200);
    expect(submitted.body.status).toBe('SUBMITTED');
    expect(submitted.body.lockCount).toBe(2);

    const finished = await teacher.post(`/api/attempts/${attemptId}/unlock`).send({});
    expect(finished.status).toBe(409);
    expect(finished.body.code).toBe('ATTEMPT_FINISHED');
    // Yakunlangan urinishni to‘xtatish xabari hech narsani o‘zgartirmaydi.
    const afterFinish = await student
      .post(`/api/attempts/${attemptId}/lock`)
      .send({ clientId: client, reason: 'FULLSCREEN_EXIT', epoch: 2 })
      .expect(200);
    expect(afterFinish.body.status).toBe('SUBMITTED');
    expect(afterFinish.body.lock).toBeNull();
  });
});

describe('O‘tkazuvchi o‘qituvchi', () => {
  it('sessiyani yaratmagan, lekin o‘tkazayotgan o‘qituvchi xabar oladi va ruxsat bera oladi', async () => {
    const { session, student, attemptId, client } = await begin(2, { conductorId: fx.otherTeacher.id });
    await student
      .post(`/api/attempts/${attemptId}/lock`)
      .send({ clientId: client, reason: 'FULLSCREEN_EXIT', epoch: 0 })
      .expect(200);
    const note = await prisma.notification.findFirstOrThrow({
      where: { type: 'ATTEMPT_LOCKED', userId: fx.otherTeacher.id, link: { contains: session.id } },
    });
    expect(note.link).toBe(`/teacher/sessions/${session.id}?tab=live`);

    const conductor = await as(fx.otherTeacher.login);
    const live = await conductor.get(`/api/sessions/${session.id}/live`).expect(200);
    expect(live.body.counts.locked).toBe(1);
    const unlocked = await conductor.post(`/api/attempts/${attemptId}/unlock`).send({ extraMinutes: 0 }).expect(200);
    expect(unlocked.body.counts.locked).toBe(0);
    expect((await prisma.attempt.findUniqueOrThrow({ where: { id: attemptId } })).unlockedById).toBe(
      fx.otherTeacher.id,
    );
  });
});

describe('Vaqt to‘xtamaydi', () => {
  it('muddati o‘tgan to‘xtatilgan urinish fon vazifasida saqlangan javoblar bilan yakunlanadi', async () => {
    const { student, attemptId, client, questions } = await begin(0);
    await student
      .put(`/api/attempts/${attemptId}/answers/${questions[0]!.id}`)
      .send({ clientId: client, optionId: 'a', revision: 1 })
      .expect(200);
    await student
      .post(`/api/attempts/${attemptId}/lock`)
      .send({ clientId: client, reason: 'FULLSCREEN_EXIT', epoch: 0 })
      .expect(200);
    await prisma.attempt.update({ where: { id: attemptId }, data: { deadlineAt: new Date(Date.now() - 1000) } });

    // Muddatdan keyin “vaqt tugadi” ustun turadi.
    const late = await student
      .put(`/api/attempts/${attemptId}/answers/${questions[1]!.id}`)
      .send({ clientId: client, optionId: 'a', revision: 1 });
    expect(late.status).toBe(409);
    expect(late.body.code).toBe('TIME_UP');

    await app.get(JobsService).finalizeOverdueAttempts();
    const attempt = await prisma.attempt.findUniqueOrThrow({ where: { id: attemptId } });
    expect(attempt.status).toBe('EXPIRED');
    expect(attempt.submitSource).toBe('TIMEOUT');
    expect(attempt.score?.toNumber()).toBe(2);
    expect(attempt.maxScore?.toNumber()).toBe(10);
  });

  it('fon vazifasi to‘xtatilgan urinishni ham yakunlaydi; kech topshirish va kech xabar TIMEOUT bilan', async () => {
    const { student, attemptId, client } = await begin(1);
    await student
      .post(`/api/attempts/${attemptId}/lock`)
      .send({ clientId: client, reason: 'PAGE_HIDDEN', epoch: 0 })
      .expect(200);
    await prisma.attempt.update({ where: { id: attemptId }, data: { deadlineAt: new Date(Date.now() - 1000) } });
    const expired = await app.get(JobsService).finalizeOverdueAttempts();
    expect(expired).toBeGreaterThanOrEqual(1);
    const view = await student.get(`/api/attempts/${attemptId}`).query({ clientId: client }).expect(200);
    expect(view.body.status).toBe('EXPIRED');
    expect(view.body.lock).toBeNull();

    // Boshqa urinish: muddat o‘tgach kelgan “topshirish” qabul qilinadi (TIMEOUT).
    const second = await begin(2);
    await second.student
      .post(`/api/attempts/${second.attemptId}/lock`)
      .send({ clientId: second.client, reason: 'FULLSCREEN_EXIT', epoch: 0 })
      .expect(200);
    await prisma.attempt.update({
      where: { id: second.attemptId },
      data: { deadlineAt: new Date(Date.now() - 1000) },
    });
    const submitted = await second.student
      .post(`/api/attempts/${second.attemptId}/submit`)
      .send({ clientId: second.client, answers: [] })
      .expect(200);
    expect(submitted.body.status).toBe('EXPIRED');
    expect(submitted.body.submitSource).toBe('TIMEOUT');

    // Muddati o‘tgan urinishga kelgan to‘xtatish xabari uni yakunlaydi.
    const third = await begin(3);
    await prisma.attempt.update({ where: { id: third.attemptId }, data: { deadlineAt: new Date(Date.now() - 1000) } });
    const lockLate = await third.student
      .post(`/api/attempts/${third.attemptId}/lock`)
      .send({ clientId: third.client, reason: 'FULLSCREEN_EXIT', epoch: 0 })
      .expect(200);
    expect(lockLate.body.status).toBe('EXPIRED');
    expect(lockLate.body.lock).toBeNull();
    expect((await prisma.attempt.findUniqueOrThrow({ where: { id: third.attemptId } })).lockCount).toBe(0);
  });
});

describe('Nazoratni sessiya yaratilgandan keyin o‘zgartirish', () => {
  it('boshlanmagan sessiyada yoqiladi va o‘chiriladi; audit yoziladi, vaqt xabari yuborilmaydi', async () => {
    const teacher = await as(fx.teacher.login);
    const test = await createTest(teacher, fx.subjectId, QUESTIONS);
    const now = Date.now();
    const session = await createSession(teacher, test.id, [fx.classA.id], {
      startsAt: new Date(now + 60 * 60_000).toISOString(),
      endsAt: new Date(now + 2 * 60 * 60_000).toISOString(),
    });
    expect(session.state).toBe('SCHEDULED');
    const timeNotes = () =>
      prisma.notification.count({ where: { type: 'TEST_TIME_CHANGED', link: `/student/sessions/${session.id}` } });
    const audits = (action: string) => prisma.auditEvent.count({ where: { action, entityId: session.id } });

    const invalid = await teacher.put(`/api/sessions/${session.id}/timing`).send({ requireFullscreen: 'no' });
    expect(invalid.status).toBe(400);
    // Sessiyani boshqarmaydigan o‘qituvchi o‘zgartira olmaydi.
    const outsider = await as(fx.otherTeacher.login);
    await outsider.put(`/api/sessions/${session.id}/timing`).send({ requireFullscreen: false }).expect(404);

    const off = await teacher
      .put(`/api/sessions/${session.id}/timing`)
      .send({ requireFullscreen: false, reason: 'Planshetlarda to‘liq ekran ishlamaydi' })
      .expect(200);
    expect(off.body.requireFullscreen).toBe(false);
    expect((await prisma.assessmentSession.findUniqueOrThrow({ where: { id: session.id } })).requireFullscreen).toBe(
      false,
    );
    const audit = await prisma.auditEvent.findFirstOrThrow({
      where: { action: 'session.fullscreen_changed', entityId: session.id },
    });
    expect(audit.actorId).toBe(fx.teacher.id);
    expect(audit.data).toMatchObject({
      before: true,
      after: false,
      state: 'SCHEDULED',
      reason: 'Planshetlarda to‘liq ekran ishlamaydi',
    });
    expect(await audits('session.timing_changed')).toBe(0);
    expect(await timeNotes()).toBe(0);

    const student = await as(fx.studentsA[0]!.login);
    const preview = await student.get(`/api/me/sessions/${session.id}`).expect(200);
    expect(preview.body.requireFullscreen).toBe(false);

    const on = await teacher.put(`/api/sessions/${session.id}/timing`).send({ requireFullscreen: true }).expect(200);
    expect(on.body.requireFullscreen).toBe(true);
    expect(await audits('session.fullscreen_changed')).toBe(2);
    expect(await timeNotes()).toBe(0);

    // Vaqt bilan birga o‘zgarsa — vaqt xabari ham, ikkala audit yozuvi ham bo‘ladi.
    const both = await teacher
      .put(`/api/sessions/${session.id}/timing`)
      .send({ requireFullscreen: false, durationMinutes: 40 })
      .expect(200);
    expect(both.body.requireFullscreen).toBe(false);
    expect(both.body.durationMinutes).toBe(40);
    expect(await audits('session.fullscreen_changed')).toBe(3);
    expect(await audits('session.timing_changed')).toBe(1);
    expect(await timeNotes()).toBe(fx.studentsA.length);
  });

  it('ochiq sessiyada faqat o‘chiriladi: to‘xtatilgan urinish ruxsatni kutadi, keyingi chiqishlar to‘xtatmaydi', async () => {
    const { teacher, session, student, attemptId, client, questions } = await begin(1);
    const locked = await student
      .post(`/api/attempts/${attemptId}/lock`)
      .send({ clientId: client, reason: 'FULLSCREEN_EXIT', epoch: 0 })
      .expect(200);
    expect(locked.body.requireFullscreen).toBe(true);

    const off = await teacher.put(`/api/sessions/${session.id}/timing`).send({ requireFullscreen: false }).expect(200);
    // Ochiq test sahifasi o‘zgarishni yurak urishi orqali biladi.
    const beat = await student.post(`/api/attempts/${attemptId}/heartbeat`).send({ clientId: client }).expect(200);
    expect(beat.body.requireFullscreen).toBe(false);
    expect(off.body.state).toBe('OPEN');
    expect(off.body.requireFullscreen).toBe(false);
    const audit = await prisma.auditEvent.findFirstOrThrow({
      where: { action: 'session.fullscreen_changed', entityId: session.id },
    });
    expect(audit.data).toMatchObject({ before: true, after: false, state: 'OPEN' });

    // Eskirgan sahifadan takroriy o‘chirish yoki o‘zgarishsiz saqlash o‘quvchilarga
    // “vaqt o‘zgardi” xabarini yubormaydi va audit yozmaydi.
    const repeated = await teacher
      .put(`/api/sessions/${session.id}/timing`)
      .send({ requireFullscreen: false })
      .expect(200);
    expect(repeated.body.requireFullscreen).toBe(false);
    await teacher
      .put(`/api/sessions/${session.id}/timing`)
      .send({ endsAt: off.body.endsAt, reason: 'Tekshiruv' })
      .expect(200);
    expect(
      await prisma.notification.count({
        where: { type: 'TEST_TIME_CHANGED', link: `/student/sessions/${session.id}` },
      }),
    ).toBe(0);
    expect(await prisma.auditEvent.count({ where: { action: 'session.timing_changed', entityId: session.id } })).toBe(
      0,
    );

    // Allaqachon to‘xtatilgan o‘quvchi o‘qituvchi ruxsatini kutadi.
    const view = await student.get(`/api/attempts/${attemptId}`).query({ clientId: client }).expect(200);
    expect(view.body.session.requireFullscreen).toBe(false);
    expect(view.body.lock.reason).toBe('FULLSCREEN_EXIT');
    await teacher.post(`/api/attempts/${attemptId}/unlock`).send({}).expect(200);

    // Endi oynadan chiqish testni to‘xtatmaydi, javoblar saqlanadi.
    const ignored = await student
      .post(`/api/attempts/${attemptId}/lock`)
      .send({ clientId: client, reason: 'PAGE_HIDDEN', epoch: 1 })
      .expect(200);
    expect(ignored.body.lock).toBeNull();
    expect(ignored.body.lockCount).toBe(1);
    expect(ignored.body.requireFullscreen).toBe(false);
    await student
      .put(`/api/attempts/${attemptId}/answers/${questions[0]!.id}`)
      .send({ clientId: client, optionId: 'a', revision: 1 })
      .expect(200);

    // Ishlayotgan o‘quvchilarga nazoratni qayta yoqib bo‘lmaydi.
    const again = await teacher.put(`/api/sessions/${session.id}/timing`).send({ requireFullscreen: true });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('ALREADY_STARTED');
    expect((await prisma.assessmentSession.findUniqueOrThrow({ where: { id: session.id } })).requireFullscreen).toBe(
      false,
    );
    expect(
      await prisma.auditEvent.count({ where: { action: 'session.fullscreen_changed', entityId: session.id } }),
    ).toBe(1);

    // Yopilgan sessiyada nazorat o‘zgarmaydi.
    const closed = await openSession();
    await closed.teacher.post(`/api/sessions/${closed.session.id}/close`).expect(200);
    const late = await closed.teacher
      .put(`/api/sessions/${closed.session.id}/timing`)
      .send({ requireFullscreen: false });
    expect(late.status).toBe(409);
    expect(late.body.code).toBe('SESSION_FINISHED');
    expect(
      (await prisma.assessmentSession.findUniqueOrThrow({ where: { id: closed.session.id } })).requireFullscreen,
    ).toBe(true);
  });
});
