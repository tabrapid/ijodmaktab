/**
 * Maktab test banki, qayta ishlatiladigan testlar va rahbariyat o‘tkazadigan sessiyalar.
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
  singleChoice,
  suffix,
  type Fixture,
} from './helpers.js';

type Agent = Awaited<ReturnType<typeof login>>;

let app: INestApplication;
let prisma: PrismaService;
let fx: Fixture;
let teacherA: Agent;
let teacherB: Agent;
let deputy: Agent;
let deputyId: string;
let ownerName: string;

const QUESTIONS = [
  { stem: 'Bank savoli 1', category: 'KNOWLEDGE' as const, points: 2 },
  { stem: 'Bank savoli 2', category: 'APPLICATION' as const, points: 3 },
];

beforeAll(async () => {
  ({ app, prisma } = await createApp());
  fx = await createFixture(prisma);
  const deputyUser = await createUser(prisma, ['DEPUTY']);
  deputyId = deputyUser.id;
  const owner = await prisma.user.findUniqueOrThrow({ where: { id: fx.teacher.id } });
  ownerName = owner.lastName;
  teacherA = await login(app, fx.teacher.login);
  teacherB = await login(app, fx.otherTeacher.login);
  deputy = await login(app, deputyUser.login);
});

afterAll(async () => {
  await app.close();
});

const sessionBody = (testId: string, classIds: string[], extra: Record<string, unknown> = {}) => ({
  testId,
  audience: { classIds, studentIds: [] },
  startsAt: new Date(Date.now() - 60_000).toISOString(),
  endsAt: new Date(Date.now() + 3600_000).toISOString(),
  durationMinutes: 20,
  ...extra,
});

const versionsOf = (templateId: string) =>
  prisma.testVersion.findMany({ where: { templateId }, orderBy: { versionNo: 'asc' } });

const addQuestion = (agent: Agent, testId: string, stem: string) =>
  agent.post(`/api/tests/${testId}/questions`).send({ content: singleChoice(stem, 'REASONING', 5) });

describe('Maktab bankiga chiqarish', () => {
  it('bo‘sh test chiqarilmaydi (TEST_EMPTY)', async () => {
    const empty = await teacherA
      .post('/api/tests')
      .send({ title: `Bo‘sh ${suffix()}`, subjectId: fx.subjectId, gradeLevel: 9 })
      .expect(201);
    const response = await teacherA.put(`/api/tests/${empty.body.id}/school`).send({ shared: true });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('TEST_EMPTY');
  });

  it('qat’iy xatoli qoralama chiqarilmaydi (TEST_INVALID) va xatolar qaytariladi', async () => {
    const test = await createTest(teacherA, fx.subjectId, QUESTIONS);
    const draft = await prisma.testVersion.findFirstOrThrow({ where: { templateId: test.id, status: 'DRAFT' } });
    await prisma.testQuestion.updateMany({ where: { testVersionId: draft.id }, data: { points: 0 } });
    const response = await teacherA.put(`/api/tests/${test.id}/school`).send({ shared: true });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('TEST_INVALID');
    expect(response.body.details.some((issue: { code: string }) => issue.code === 'INVALID_POINTS')).toBe(true);
    const template = await prisma.testTemplate.findUniqueOrThrow({ where: { id: test.id } });
    expect(template.visibility).toBe('PRIVATE');
    expect((await versionsOf(test.id)).map((version) => version.status)).toEqual(['DRAFT']);
  });

  it('faqat egasi chiqaradi; rahbariyat boshqaning testini chiqara olmaydi', async () => {
    const test = await createTest(teacherA, fx.subjectId, QUESTIONS);
    const byDeputy = await deputy.put(`/api/tests/${test.id}/school`).send({ shared: true });
    expect(byDeputy.status).toBe(403);
    // Boshqa o‘qituvchi xususiy testni umuman ko‘rmaydi.
    expect((await teacherB.put(`/api/tests/${test.id}/school`).send({ shared: true })).status).toBe(404);
    expect((await teacherB.get(`/api/tests/${test.id}`)).status).toBe(404);
    const body = await teacherA.put(`/api/tests/${test.id}/school`).send({ shared: 'ha' });
    expect(body.status).toBe(400);
  });
});

describe('Bank testi boshqa o‘qituvchi va rahbariyat uchun', () => {
  let bankTestId: string;
  let bankTitle: string;

  beforeAll(async () => {
    const test = await createTest(teacherA, fx.subjectId, QUESTIONS);
    bankTestId = test.id;
    const published = await teacherA.put(`/api/tests/${test.id}/school`).send({ shared: true }).expect(200);
    bankTitle = published.body.title;
    expect(published.body.visibility).toBe('SCHOOL');
    expect(published.body.schoolSharedAt).toBeTruthy();
    expect(published.body.isDraft).toBe(false);
    expect(published.body.publishedVersionNo).toBe(1);
    expect(published.body.canChangeVisibility).toBe(true);
    const audit = await prisma.auditEvent.count({ where: { action: 'test.school_shared', entityId: test.id } });
    expect(audit).toBe(1);
    // Muallif chiqarilgandan keyin testni tahrirlaydi — yangi qoralama (v2) bankka tushmaydi.
    const edited = await addQuestion(teacherA, test.id, 'Muallifning yangi savoli').expect(201);
    expect(edited.body.isDraft).toBe(true);
    expect(edited.body.version.versionNo).toBe(2);
    expect(edited.body.version.questions).toHaveLength(3);
    expect(edited.body.conductVersionNo).toBe(2);
  });

  it('boshqa o‘qituvchi bankni “school” va “available” ro‘yxatlarida ko‘radi', async () => {
    const school = await teacherB.get('/api/tests').query({ scope: 'school', pageSize: 200 }).expect(200);
    const item = school.body.items.find((entry: { id: string }) => entry.id === bankTestId);
    expect(item).toMatchObject({
      permission: 'SCHOOL',
      visibility: 'SCHOOL',
      publishedVersionNo: 1,
      canConduct: true,
      // Nashr qilingan versiya ko‘rsatkichlari (muallifning qoralamasi emas).
      questionCount: 2,
      totalPoints: 5,
      hasDraftChanges: false,
    });
    expect(item.owner.fullName).toContain(ownerName);
    const available = await teacherB.get('/api/tests').query({ scope: 'available', pageSize: 200 }).expect(200);
    expect(available.body.items.some((entry: { id: string }) => entry.id === bankTestId)).toBe(true);
    // Bank testi “mening testlarim”da ko‘rinmaydi.
    const mine = await teacherB.get('/api/tests').query({ scope: 'mine', pageSize: 200 }).expect(200);
    expect(mine.body.items.some((entry: { id: string }) => entry.id === bankTestId)).toBe(false);

    // Muallif o‘z ro‘yxatida qoralama ko‘rsatkichlarini ko‘radi.
    const own = await teacherA.get('/api/tests').query({ scope: 'mine', pageSize: 200 }).expect(200);
    expect(own.body.items.find((entry: { id: string }) => entry.id === bankTestId)).toMatchObject({
      permission: 'OWNER',
      questionCount: 3,
      hasDraftChanges: true,
      publishedVersionNo: 1,
    });
  });

  it('qidiruv muallif ismi bo‘yicha ham ishlaydi, sahifalash to‘g‘ri jami qaytaradi', async () => {
    const byOwner = await teacherB.get('/api/tests').query({ scope: 'school', q: ownerName }).expect(200);
    expect(byOwner.body.items.some((entry: { id: string }) => entry.id === bankTestId)).toBe(true);
    const byTitle = await teacherB.get('/api/tests').query({ scope: 'school', q: bankTitle }).expect(200);
    expect(byTitle.body.items.map((entry: { id: string }) => entry.id)).toEqual([bankTestId]);
    const firstPage = await teacherB.get('/api/tests').query({ scope: 'school', pageSize: 1 }).expect(200);
    expect(firstPage.body.items).toHaveLength(1);
    expect(firstPage.body.total).toBeGreaterThanOrEqual(1);
    const sorted = await teacherB
      .get('/api/tests')
      .query({ scope: 'school', sort: 'questionCount', order: 'desc', pageSize: 1 })
      .expect(200);
    expect(sorted.body.items).toHaveLength(1);
    expect(sorted.body.total).toBe(firstPage.body.total);
  });

  it('boshqa o‘qituvchi muallif qoralamasini emas, muzlatilgan versiyani ko‘radi va tahrirlay olmaydi', async () => {
    const view = await teacherB.get(`/api/tests/${bankTestId}`).expect(200);
    expect(view.body).toMatchObject({
      permission: 'SCHOOL',
      canEdit: false,
      canCopy: true,
      canConduct: true,
      canChangeVisibility: false,
      isDraft: false,
      conductVersionNo: 1,
      publishedVersionNo: 1,
    });
    expect(view.body.version.versionNo).toBe(1);
    expect(view.body.version.questions).toHaveLength(2);
    expect(JSON.stringify(view.body)).not.toContain('Muallifning yangi savoli');

    expect((await addQuestion(teacherB, bankTestId, 'Begona savol')).status).toBe(403);
    const passport = await teacherB
      .put(`/api/tests/${bankTestId}/passport`)
      .send({ title: 'O‘zgartirilgan', subjectId: fx.subjectId, gradeLevel: 9 });
    expect(passport.status).toBe(403);
    expect((await teacherB.delete(`/api/tests/${bankTestId}`)).status).toBe(403);
    expect((await teacherB.put(`/api/tests/${bankTestId}/school`).send({ shared: false })).status).toBe(403);
  });

  it('o‘z sinfida muzlatilgan versiya bilan sessiya yaratadi, muallif qoralamasi o‘zgarmaydi', async () => {
    const response = await teacherB.post('/api/sessions').send(sessionBody(bankTestId, [fx.classB.id]));
    expect(response.status).toBe(201);
    expect(response.body.test.versionNo).toBe(1);
    expect(response.body.test.questionCount).toBe(2);
    expect((await versionsOf(bankTestId)).map((version) => version.status)).toEqual(['FROZEN', 'DRAFT']);

    // Dars bermaydigan sinfiga emas.
    const foreign = await teacherB.post('/api/sessions').send(sessionBody(bankTestId, [fx.classA.id]));
    expect(foreign.status).toBe(403);
  });

  it('nusxani o‘z nomi bilan oladi va savol qo‘shadi — asl test o‘zgarmaydi', async () => {
    const copy = await teacherB
      .post(`/api/tests/${bankTestId}/copy`)
      .send({ title: 'Mening variantim — qo‘shimcha savollar bilan' })
      .expect(201);
    expect(copy.body).toMatchObject({
      title: 'Mening variantim — qo‘shimcha savollar bilan',
      permission: 'OWNER',
      canEdit: true,
      isDraft: true,
      visibility: 'PRIVATE',
      copiedFrom: { id: bankTestId },
    });
    // Nusxa muzlatilgan v1 dan olinadi (muallifning qoralamasidagi 3-savolsiz).
    expect(copy.body.version.questions).toHaveLength(2);
    const extended = await addQuestion(teacherB, copy.body.id, 'Qo‘shimcha savol').expect(201);
    expect(extended.body.version.questions).toHaveLength(3);

    const original = await teacherA.get(`/api/tests/${bankTestId}`).expect(200);
    expect(original.body.version.questions.map((question: { stem: string }) => question.stem)).not.toContain(
      'Qo‘shimcha savol',
    );
    // Nom berilmasa “(nusxa)” qo‘shiladi.
    const plain = await teacherB.post(`/api/tests/${bankTestId}/copy`).expect(201);
    expect(plain.body.title).toBe(`${bankTitle} (nusxa)`);

    // Nusxa bilan sessiya: nusxa egasi qoralamasini muzlatadi.
    const session = await teacherB.post('/api/sessions').send(sessionBody(copy.body.id, [fx.classB.id]));
    expect(session.status).toBe(201);
    expect(session.body.test.questionCount).toBe(3);
  });

  it('rahbariyat bankni ko‘radi va o‘qituvchi qoralamasini muzlatmasdan sessiya o‘tkazadi', async () => {
    const school = await deputy.get('/api/tests').query({ scope: 'school', pageSize: 200 }).expect(200);
    expect(school.body.items.some((entry: { id: string }) => entry.id === bankTestId)).toBe(true);
    const view = await deputy.get(`/api/tests/${bankTestId}`).expect(200);
    expect(view.body).toMatchObject({
      canConduct: true,
      canEdit: false,
      conductVersionNo: 1,
      canChangeVisibility: true,
    });

    const response = await deputy
      .post('/api/sessions')
      .send(sessionBody(bankTestId, [fx.classA.id], { requireFullscreen: false }));
    expect(response.status).toBe(201);
    expect(response.body.test.versionNo).toBe(1);
    expect(response.body.requireFullscreen).toBe(false);
    expect(response.body.conductor.id).toBe(deputyId);
    const stored = await prisma.assessmentSession.findUniqueOrThrow({ where: { id: response.body.id } });
    expect(stored.requireFullscreen).toBe(false);
    expect((await versionsOf(bankTestId)).map((version) => version.status)).toEqual(['FROZEN', 'DRAFT']);
  });

  it('muallif qayta chiqarsa, yangi qoralama bankka tushadi', async () => {
    const republished = await teacherA.put(`/api/tests/${bankTestId}/school`).send({ shared: true }).expect(200);
    expect(republished.body.publishedVersionNo).toBe(2);
    expect(republished.body.isDraft).toBe(false);
    const view = await teacherB.get(`/api/tests/${bankTestId}`).expect(200);
    expect(view.body.version.questions).toHaveLength(3);
    expect(view.body.conductVersionNo).toBe(2);
  });
});

describe('Ulashish huquqlari va sessiya', () => {
  it('“faqat ko‘rish” huquqi bilan sessiya yaratib bo‘lmaydi', async () => {
    const test = await createTest(teacherA, fx.subjectId, QUESTIONS);
    await createSession(teacherA, test.id, [fx.classA.id]);
    await teacherA
      .post(`/api/tests/${test.id}/shares`)
      .send({ userId: fx.otherTeacher.id, permission: 'VIEW' })
      .expect(200);
    const view = await teacherB.get(`/api/tests/${test.id}`).expect(200);
    expect(view.body).toMatchObject({ permission: 'VIEW', canConduct: false, canCopy: false, conductVersionNo: null });
    const response = await teacherB.post('/api/sessions').send(sessionBody(test.id, [fx.classB.id]));
    expect(response.status).toBe(403);
    expect((await teacherB.post(`/api/tests/${test.id}/copy`)).status).toBe(403);
  });

  it('nusxa huquqi muzlatilgan versiya bilan o‘tkazadi; tayyor versiya bo‘lmasa TEST_NOT_PUBLISHED', async () => {
    const test = await createTest(teacherA, fx.subjectId, QUESTIONS);
    await teacherA
      .post(`/api/tests/${test.id}/shares`)
      .send({ userId: fx.otherTeacher.id, permission: 'COPY' })
      .expect(200);
    // Hali muzlatilmagan: boshqalar qoralamani ko‘rmaydi va o‘tkaza olmaydi.
    const hidden = await teacherB.get(`/api/tests/${test.id}`).expect(200);
    expect(hidden.body).toMatchObject({ version: null, canConduct: false, canCopy: false, publishedVersionNo: null });
    const early = await teacherB.post('/api/sessions').send(sessionBody(test.id, [fx.classB.id]));
    expect(early.status).toBe(400);
    expect(early.body.code).toBe('TEST_NOT_PUBLISHED');
    expect((await versionsOf(test.id)).map((version) => version.status)).toEqual(['DRAFT']);

    // Muallif o‘z sessiyasida v1 ni muzlatadi, keyin tahrirlaydi (v2 qoralama).
    await createSession(teacherA, test.id, [fx.classA.id]);
    await addQuestion(teacherA, test.id, 'Ulashilgan testga yangi savol').expect(201);

    const response = await teacherB.post('/api/sessions').send(sessionBody(test.id, [fx.classB.id]));
    expect(response.status).toBe(201);
    expect(response.body.test.versionNo).toBe(1);
    expect((await versionsOf(test.id)).map((version) => version.status)).toEqual(['FROZEN', 'DRAFT']);
  });

  it('tahrir huquqi qoralamani muzlatadi (avvalgidek)', async () => {
    const test = await createTest(teacherA, fx.subjectId, QUESTIONS);
    await teacherA
      .post(`/api/tests/${test.id}/shares`)
      .send({ userId: fx.otherTeacher.id, permission: 'EDIT' })
      .expect(200);
    const response = await teacherB.post('/api/sessions').send(sessionBody(test.id, [fx.classB.id]));
    expect(response.status).toBe(201);
    expect((await versionsOf(test.id)).map((version) => version.status)).toEqual(['FROZEN']);
  });

  it('qoralamasi bor ulashilgan testdan savol nusxalashda tayyor versiya olinadi', async () => {
    const source = await createTest(teacherA, fx.subjectId, QUESTIONS);
    await teacherA.put(`/api/tests/${source.id}/school`).send({ shared: true }).expect(200);
    await addQuestion(teacherA, source.id, 'Qoralamadagi maxfiy savol').expect(201);
    const target = await createTest(teacherB, fx.subjectId, [
      { stem: 'B ning savoli', category: 'KNOWLEDGE', points: 1 },
    ]);
    const copied = await teacherB
      .post(`/api/tests/${target.id}/questions/from-test`)
      .send({ sourceTestId: source.id })
      .expect(201);
    const stems = copied.body.version.questions.map((question: { stem: string }) => question.stem);
    expect(stems).toHaveLength(3);
    expect(stems).not.toContain('Qoralamadagi maxfiy savol');
  });
});

describe('Bankdan olish, arxivlash va fan cheklovi', () => {
  it('bankdan olingan test ro‘yxatdan yo‘qoladi va boshqalarga 404', async () => {
    const test = await createTest(teacherA, fx.subjectId, QUESTIONS);
    await teacherA.put(`/api/tests/${test.id}/school`).send({ shared: true }).expect(200);
    await teacherB.get(`/api/tests/${test.id}`).expect(200);
    const hidden = await teacherA.put(`/api/tests/${test.id}/school`).send({ shared: false }).expect(200);
    expect(hidden.body).toMatchObject({ visibility: 'PRIVATE', schoolSharedAt: null });
    const school = await teacherB.get('/api/tests').query({ scope: 'school', pageSize: 200 }).expect(200);
    expect(school.body.items.some((entry: { id: string }) => entry.id === test.id)).toBe(false);
    expect((await teacherB.get(`/api/tests/${test.id}`)).status).toBe(404);
    expect((await teacherB.post('/api/sessions').send(sessionBody(test.id, [fx.classB.id]))).status).toBe(404);
    expect(await prisma.auditEvent.count({ where: { action: 'test.school_unshared', entityId: test.id } })).toBe(1);
  });

  it('rahbariyat istalgan testni bankdan oladi (moderatsiya)', async () => {
    const test = await createTest(teacherA, fx.subjectId, QUESTIONS);
    await teacherA.put(`/api/tests/${test.id}/school`).send({ shared: true }).expect(200);
    const moderated = await deputy.put(`/api/tests/${test.id}/school`).send({ shared: false }).expect(200);
    expect(moderated.body.visibility).toBe('PRIVATE');
    expect(moderated.body.canChangeVisibility).toBe(false);
    const template = await prisma.testTemplate.findUniqueOrThrow({ where: { id: test.id } });
    expect(template.visibility).toBe('PRIVATE');
    // Rahbariyat qayta chiqara olmaydi — bu muallifning qarori.
    expect((await deputy.put(`/api/tests/${test.id}/school`).send({ shared: true })).status).toBe(403);
  });

  it('arxivlangan test bankdan chiqadi va qayta chiqarilmaydi', async () => {
    const test = await createTest(teacherA, fx.subjectId, QUESTIONS);
    await teacherA.put(`/api/tests/${test.id}/school`).send({ shared: true }).expect(200);
    await teacherA.delete(`/api/tests/${test.id}`).expect(200);
    const template = await prisma.testTemplate.findUniqueOrThrow({ where: { id: test.id } });
    expect(template).toMatchObject({ status: 'ARCHIVED', visibility: 'PRIVATE', schoolSharedAt: null });
    const school = await deputy.get('/api/tests').query({ scope: 'school', pageSize: 200 }).expect(200);
    expect(school.body.items.some((entry: { id: string }) => entry.id === test.id)).toBe(false);
    expect((await teacherB.get(`/api/tests/${test.id}`)).status).toBe(404);
    const again = await teacherA.put(`/api/tests/${test.id}/school`).send({ shared: true });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('TEST_ARCHIVED');
  });

  it('o‘qituvchi o‘zi dars bermaydigan fandagi bank testini sinfiga o‘tkaza olmaydi', async () => {
    const year = await currentYear(prisma);
    const otherSubject = await prisma.subject.create({ data: { name: `Boshqa fan ${suffix()}` } });
    await prisma.teachingAssignment.create({
      data: { teacherId: fx.teacher.id, subjectId: otherSubject.id, classId: fx.classA.id, academicYearId: year.id },
    });
    const test = await createTest(teacherA, otherSubject.id, QUESTIONS);
    await teacherA.put(`/api/tests/${test.id}/school`).send({ shared: true }).expect(200);
    const response = await teacherB.post('/api/sessions').send(sessionBody(test.id, [fx.classB.id]));
    expect(response.status).toBe(403);
    // Muallif qoralamasi yoki versiyalari o‘zgarmagan.
    expect((await versionsOf(test.id)).map((version) => version.status)).toEqual(['FROZEN']);
    expect(await prisma.assessmentSession.count({ where: { testVersion: { templateId: test.id } } })).toBe(0);
  });

  it('sessiya sukut bo‘yicha to‘liq ekran talab qiladi', async () => {
    const test = await createTest(teacherA, fx.subjectId, QUESTIONS);
    const session = await createSession(teacherA, test.id, [fx.classA.id]);
    const stored = await prisma.assessmentSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(stored.requireFullscreen).toBe(true);
  });
});

describe('Muallifning tugallanmagan qoralamasi boshqalarga o‘tmaydi', () => {
  const passport = (title: string, extra: Record<string, unknown> = {}) => ({
    title,
    subjectId: fx.subjectId,
    gradeLevel: 9,
    ...extra,
  });

  it('bank foydalanuvchisi, uning nusxasi va sessiyasi tayyor versiyadagi nom va ko‘rsatmani oladi', async () => {
    const test = await createTest(teacherA, fx.subjectId, QUESTIONS);
    const title = `Asl nom ${suffix()}`;
    await teacherA
      .put(`/api/tests/${test.id}/passport`)
      .send(passport(title, { instructions: 'ESKI' }))
      .expect(200);
    await teacherA.put(`/api/tests/${test.id}/school`).send({ shared: true }).expect(200);
    const edited = await teacherA
      .put(`/api/tests/${test.id}/passport`)
      .send(passport('Maxfiy yangi nom', { instructions: 'MAXFIY QORALAMA' }))
      .expect(200);
    expect(edited.body).toMatchObject({ title: 'Maxfiy yangi nom', instructions: 'MAXFIY QORALAMA', isDraft: true });

    const view = await teacherB.get(`/api/tests/${test.id}`).expect(200);
    expect(view.body).toMatchObject({ title, instructions: 'ESKI', isDraft: false });
    const school = await teacherB.get('/api/tests').query({ scope: 'school', pageSize: 200 }).expect(200);
    expect(school.body.items.find((entry: { id: string }) => entry.id === test.id).title).toBe(title);

    const copy = await teacherB.post(`/api/tests/${test.id}/copy`).expect(201);
    expect(copy.body).toMatchObject({ title: `${title} (nusxa)`, instructions: 'ESKI' });
    const copyDraft = await prisma.testVersion.findFirstOrThrow({ where: { templateId: copy.body.id } });
    expect(copyDraft).toMatchObject({ title: `${title} (nusxa)`, instructions: 'ESKI' });

    const session = await teacherB
      .post('/api/sessions')
      .send(sessionBody(test.id, [fx.classB.id]))
      .expect(201);
    expect(session.body.title).toBe(title);
    const deputySession = await deputy
      .post('/api/sessions')
      .send(sessionBody(test.id, [fx.classA.id]))
      .expect(201);
    expect(deputySession.body.title).toBe(title);
    expect(JSON.stringify([view.body, school.body, copy.body, session.body, deputySession.body])).not.toContain(
      'MAXFIY',
    );
    // Muallifning o‘z sessiyasi qoralamani muzlatadi — yangi nom bilan.
    const own = await teacherA
      .post('/api/sessions')
      .send(sessionBody(test.id, [fx.classA.id]))
      .expect(201);
    expect(own.body.title).toBe('Maxfiy yangi nom');
  });

  it('hech muzlatilmagan testda rahbariyat qoralama ko‘rsatmasini ko‘rmaydi; xato matni nusxaga yo‘naltirmaydi', async () => {
    const test = await createTest(teacherA, fx.subjectId, QUESTIONS);
    await teacherA
      .put(`/api/tests/${test.id}/passport`)
      .send(passport(`Qoralama ${suffix()}`, { instructions: 'QORALAMA KO‘RSATMA' }))
      .expect(200);
    const view = await deputy.get(`/api/tests/${test.id}`).expect(200);
    expect(view.body).toMatchObject({ version: null, instructions: null, canConduct: false, canCopy: false });
    const response = await deputy.post('/api/sessions').send(sessionBody(test.id, [fx.classA.id]));
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('TEST_NOT_PUBLISHED');
    expect(response.body.message).not.toContain('nusxa');
    expect((await versionsOf(test.id)).map((version) => version.status)).toEqual(['DRAFT']);
  });

  it('tayyor versiyasi bor testning fani va sinfi o‘zgarmaydi — nusxada o‘zgartiriladi', async () => {
    const year = await currentYear(prisma);
    const physics = await prisma.subject.create({ data: { name: `Fizika ${suffix()}` } });
    await prisma.teachingAssignment.create({
      data: { teacherId: fx.teacher.id, subjectId: physics.id, classId: fx.classA.id, academicYearId: year.id },
    });
    const test = await createTest(teacherA, fx.subjectId, QUESTIONS);
    // Hali muzlatilmagan qoralamada sinf darajasi o‘zgaradi.
    await teacherA
      .put(`/api/tests/${test.id}/passport`)
      .send(passport('Algebra', { gradeLevel: 10 }))
      .expect(200);
    await teacherA.put(`/api/tests/${test.id}/school`).send({ shared: true }).expect(200);

    const subjectChange = await teacherA
      .put(`/api/tests/${test.id}/passport`)
      .send(passport('Algebra', { subjectId: physics.id, gradeLevel: 10 }));
    expect(subjectChange.status).toBe(409);
    expect(subjectChange.body.code).toBe('TEST_SUBJECT_LOCKED');
    const gradeChange = await teacherA
      .put(`/api/tests/${test.id}/passport`)
      .send(passport('Algebra', { gradeLevel: 11 }));
    expect(gradeChange.status).toBe(409);
    // Nom va boshqa maydonlar o‘zgaradi, fan va sinf joyida qoladi.
    await teacherA
      .put(`/api/tests/${test.id}/passport`)
      .send(passport('Algebra — yangilangan', { gradeLevel: 10, topic: 'Tenglamalar' }))
      .expect(200);
    const template = await prisma.testTemplate.findUniqueOrThrow({ where: { id: test.id } });
    expect(template).toMatchObject({ subjectId: fx.subjectId, gradeLevel: 10, title: 'Algebra — yangilangan' });
    // Bankdagilar hamon shu fan bo‘yicha o‘tkazadi.
    const session = await teacherB
      .post('/api/sessions')
      .send(sessionBody(test.id, [fx.classB.id]))
      .expect(201);
    expect(session.body.subject.id).toBe(fx.subjectId);

    const copy = await teacherA.post(`/api/tests/${test.id}/copy`).expect(201);
    const moved = await teacherA
      .put(`/api/tests/${copy.body.id}/passport`)
      .send(passport('Fizika varianti', { subjectId: physics.id, gradeLevel: 11 }))
      .expect(200);
    expect(moved.body).toMatchObject({ subject: { id: physics.id }, gradeLevel: 11 });
  });

  it('muallif bank testi bilan sessiya yaratsa, qoralama bankka tushadi va bu jurnalga yoziladi', async () => {
    const test = await createTest(teacherA, fx.subjectId, QUESTIONS);
    const published = await teacherA.put(`/api/tests/${test.id}/school`).send({ shared: true }).expect(200);
    await addQuestion(teacherA, test.id, 'Sessiya uchun qo‘shilgan savol').expect(201);
    await createSession(teacherA, test.id, [fx.classA.id]);

    const view = await teacherB.get(`/api/tests/${test.id}`).expect(200);
    expect(view.body.publishedVersionNo).toBe(2);
    expect(view.body.version.questions).toHaveLength(3);
    expect(new Date(view.body.schoolSharedAt).getTime()).toBeGreaterThan(
      new Date(published.body.schoolSharedAt).getTime(),
    );
    const events = await prisma.auditEvent.findMany({
      where: { action: 'test.school_shared', entityId: test.id },
      orderBy: { id: 'asc' },
    });
    expect(events.map((event) => event.data)).toEqual([
      { versionNo: 1, republished: false },
      { versionNo: 2, republished: true, viaSession: true },
    ]);
    // Qoralamasiz qayta sessiya bank yozuvini o‘zgartirmaydi.
    await createSession(teacherA, test.id, [fx.classA.id]);
    expect(await prisma.auditEvent.count({ where: { action: 'test.school_shared', entityId: test.id } })).toBe(2);
  });

  it('parallel chiqarish so‘rovlari qoralamani bir marta muzlatadi; takroriy chiqarish hech narsani o‘zgartirmaydi', async () => {
    const test = await createTest(teacherA, fx.subjectId, QUESTIONS);
    const responses = await Promise.all(
      [1, 2, 3].map(() => teacherA.put(`/api/tests/${test.id}/school`).send({ shared: true })),
    );
    expect(responses.map((response) => response.status)).toEqual([200, 200, 200]);
    const versions = await versionsOf(test.id);
    expect(versions.map((version) => version.status)).toEqual(['FROZEN']);
    expect(await prisma.auditEvent.count({ where: { action: 'test.version_frozen', entityId: versions[0]!.id } })).toBe(
      1,
    );
    expect(await prisma.auditEvent.count({ where: { action: 'test.school_shared', entityId: test.id } })).toBe(1);

    await teacherA.put(`/api/tests/${test.id}/school`).send({ shared: true }).expect(200);
    expect(await prisma.auditEvent.count({ where: { action: 'test.school_shared', entityId: test.id } })).toBe(1);
    await Promise.all([1, 2].map(() => teacherA.put(`/api/tests/${test.id}/school`).send({ shared: false })));
    expect(await prisma.auditEvent.count({ where: { action: 'test.school_unshared', entityId: test.id } })).toBe(1);
  });
});
