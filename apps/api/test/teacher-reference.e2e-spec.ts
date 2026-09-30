/**
 * O‘qituvchi ma’lumotnomasi: asosiy qism (1–3-bandlar), hujjatlar (4–9-bandlar), fayllarga kirish va yetim
 * fayllarni tozalash, rahbariyat uchun ko‘rinish hamda o‘quvchilar sertifikatlariga ustozlik (10–11-bandlar).
 */
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { addMonthsToIsoDate, schoolToday } from '@ijod/shared';
import { FilesService } from '../src/files/files.service.js';
import type { Prisma } from '../src/generated/prisma/client.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import { createApp, createFixture, createUser, currentYear, login, suffix, type Fixture } from './helpers.js';

let app: INestApplication;
let prisma: PrismaService;
let fx: Fixture;

type Agent = Awaited<ReturnType<typeof login>>;

/** Eng kichik haqiqiy PDF (turi mazmun bo‘yicha aniqlanadi). */
const PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
);

async function upload(agent: Agent, name = 'hujjat.pdf') {
  const response = await agent.post('/api/files').attach('file', PDF, { filename: name, contentType: 'application/pdf' });
  expect(response.status).toBe(201);
  return response.body.id as string;
}

const today = schoolToday();
const yearsAgo = (years: number) => addMonthsToIsoDate(today, -12 * years);

/** Xato javobidagi maydon yo‘llari. */
const paths = (body: { details?: { path: string }[] }) => (body.details ?? []).map((detail) => detail.path);

let math: { id: string; name: string };
let english: { id: string; name: string };
let physics: { id: string; name: string };
let inactiveSubject: { id: string };

let teacher: Agent;
let otherTeacher: Agent;
let deputy: Agent;
let admin: Agent;
let student: Agent;
let teacherName: string;

beforeAll(async () => {
  ({ app, prisma } = await createApp());
  fx = await createFixture(prisma, 2);
  // Ustozlik fan nomi bo‘yicha moslanadi (SAT — matematika va ingliz tili), shuning uchun nomlar aniq.
  const subject = (name: string) => prisma.subject.upsert({ where: { name }, create: { name }, update: { isActive: true } });
  math = await subject('Matematika');
  english = await subject('Ingliz tili');
  physics = await prisma.subject.create({ data: { name: `Fizika ${suffix()}` } });
  inactiveSubject = await prisma.subject.create({ data: { name: `Nofaol fan ${suffix()}`, isActive: false } });

  teacher = await login(app, fx.teacher.login);
  otherTeacher = await login(app, fx.otherTeacher.login);
  deputy = await login(app, (await createUser(prisma, ['DEPUTY'])).login);
  admin = await login(app, (await createUser(prisma, ['ADMIN'])).login);
  student = await login(app, fx.studentsA[0]!.login);
  const me = await teacher.get('/api/auth/me').expect(200);
  teacherName = me.body.fullName as string;
});

afterAll(async () => {
  await app.close();
});

// ---------------------------------------------------------------- Asosiy qism

/** Ma’lumotnomaning joriy holati (keyingi testlar shu fayllardan foydalanadi). */
const state = {
  degreeFile: '',
  categoryFile: '',
  replacedCategoryFile: '',
  credentialFile: '',
  removedCredentialFile: '',
  awardedOn: yearsAgo(2),
};

const profileBody = (overrides: Record<string, unknown> = {}) => ({
  university: 'Nizomiy nomidagi Toshkent davlat pedagogika universiteti',
  graduationYear: 2012,
  academicDegree: 'PHD',
  degreeFileId: state.degreeFile,
  category: 'FIRST',
  categoryAwardedOn: state.awardedOn,
  categoryFileId: state.categoryFile,
  specialtySubjectId: math.id,
  ...overrides,
});

describe('Ma’lumotnomaning asosiy qismi', () => {
  it('faqat o‘qituvchi roli bor hisob o‘z ma’lumotnomasini ko‘radi; yozuv bo‘lmasa — bo‘sh qiymatlar', async () => {
    const fresh = await teacher.get('/api/me/teacher-profile').expect(200);
    expect(fresh.body.teacher).toMatchObject({ id: fx.teacher.id, fullName: teacherName });
    expect(fresh.body.specialtySubject).toBeNull();
    expect(fresh.body.profile).toEqual({
      university: null,
      graduationYear: null,
      academicDegree: 'NONE',
      degreeFile: null,
      category: 'NONE',
      categoryAwardedOn: null,
      categoryValidUntil: null,
      categoryExpired: false,
      categoryFile: null,
    });
    expect(fresh.body.credentials).toEqual([]);
    expect(fresh.body.mentorships).toEqual({ national: [], international: [] });

    await student.get('/api/me/teacher-profile').expect(403);
    await deputy.get('/api/me/teacher-profile').expect(403);
    await admin.get('/api/me/teacher-profile').expect(403);
    const teachingDeputy = await login(app, (await createUser(prisma, ['TEACHER', 'DEPUTY'])).login);
    await teachingDeputy.get('/api/me/teacher-profile').expect(200);
  });

  it('toifa tanlanganda hujjat majburiy; begona, profil rasmi va dalil fayllari qabul qilinmaydi', async () => {
    state.degreeFile = await upload(teacher, 'phd-diplom.pdf');
    state.categoryFile = await upload(teacher, 'toifa.pdf');

    const noFile = await teacher.put('/api/me/teacher-profile').send(profileBody({ categoryFileId: null }));
    expect(noFile.status).toBe(400);
    expect(noFile.body.code).toBe('VALIDATION_ERROR');
    expect(paths(noFile.body)).toContain('categoryFileId');

    const foreign = await upload(otherTeacher, 'begona.pdf');
    const withForeign = await teacher.put('/api/me/teacher-profile').send(profileBody({ categoryFileId: foreign }));
    expect(withForeign.status).toBe(400);
    expect(withForeign.body.code).toBe('FILE_NOT_ALLOWED');
    expect(paths(withForeign.body)).toEqual(['categoryFileId']);

    const avatar = await upload(teacher, 'rasm.pdf');
    await prisma.user.update({ where: { id: fx.teacher.id }, data: { avatarFileId: avatar } });
    const withAvatar = await teacher.put('/api/me/teacher-profile').send(profileBody({ categoryFileId: avatar }));
    expect(withAvatar.status).toBe(400);
    expect(withAvatar.body.code).toBe('FILE_NOT_ALLOWED');
    await prisma.user.update({ where: { id: fx.teacher.id }, data: { avatarFileId: null } });

    const evidence = await upload(teacher, 'dalil.pdf');
    await teacher
      .post('/api/portfolio')
      .send({ type: 'METHODICAL_WORK', title: 'Metodik qo‘llanma', evidenceFileId: evidence })
      .expect(201);
    const withEvidence = await teacher.put('/api/me/teacher-profile').send(profileBody({ degreeFileId: evidence }));
    expect(withEvidence.status).toBe(400);
    expect(withEvidence.body.code).toBe('FILE_NOT_ALLOWED');
    expect(paths(withEvidence.body)).toEqual(['degreeFileId']);

    const twice = await teacher
      .put('/api/me/teacher-profile')
      .send(profileBody({ degreeFileId: state.categoryFile, categoryFileId: state.categoryFile }));
    expect(twice.status).toBe(400);
    expect(twice.body.code).toBe('FILE_NOT_ALLOWED');

    const inactive = await teacher
      .put('/api/me/teacher-profile')
      .send(profileBody({ specialtySubjectId: inactiveSubject.id }));
    expect(inactive.status).toBe(400);
    expect(inactive.body.code).toBe('SUBJECT_NOT_FOUND');
    expect(paths(inactive.body)).toEqual(['specialtySubjectId']);

    const future = await teacher
      .put('/api/me/teacher-profile')
      .send(profileBody({ categoryAwardedOn: addMonthsToIsoDate(today, 1) }));
    expect(future.status).toBe(400);
    expect(paths(future.body)).toContain('categoryAwardedOn');

    // Hech narsa saqlanmagan.
    expect(await prisma.teacherProfile.findUnique({ where: { userId: fx.teacher.id } })).toBeNull();
  });

  it('saqlaydi: mutaxassislik, OTM, ilmiy daraja, toifa va 5 yillik muddat; jurnalga faqat maydon nomlari', async () => {
    const saved = await teacher.put('/api/me/teacher-profile').send(profileBody()).expect(200);
    expect(saved.body.specialtySubject).toEqual({ id: math.id, name: 'Matematika' });
    expect(saved.body.profile).toMatchObject({
      university: 'Nizomiy nomidagi Toshkent davlat pedagogika universiteti',
      graduationYear: 2012,
      academicDegree: 'PHD',
      degreeFile: { id: state.degreeFile, originalName: 'phd-diplom.pdf', mimeType: 'application/pdf' },
      category: 'FIRST',
      categoryAwardedOn: state.awardedOn,
      categoryValidUntil: addMonthsToIsoDate(state.awardedOn, 60),
      categoryExpired: false,
      categoryFile: { id: state.categoryFile, originalName: 'toifa.pdf' },
    });
    const user = await prisma.user.findUniqueOrThrow({ where: { id: fx.teacher.id } });
    expect(user.specialtySubjectId).toBe(math.id);

    const event = await prisma.auditEvent.findFirstOrThrow({
      where: { action: 'teacher.profile_updated', entityId: fx.teacher.id },
      orderBy: { id: 'desc' },
    });
    const data = event.data as { fields: string[] };
    expect(data.fields).toEqual(
      expect.arrayContaining(['university', 'academicDegree', 'category', 'categoryFileId', 'specialtySubjectId']),
    );
    expect(JSON.stringify(event.data)).not.toContain('Nizomiy');
    expect(JSON.stringify(event.data)).not.toContain(state.categoryFile);

    // Xuddi shu fayllar bilan qayta saqlash mumkin; o‘zgarish bo‘lmasa jurnalga yozilmaydi.
    const before = await prisma.auditEvent.count({ where: { action: 'teacher.profile_updated' } });
    await teacher.put('/api/me/teacher-profile').send(profileBody()).expect(200);
    expect(await prisma.auditEvent.count({ where: { action: 'teacher.profile_updated' } })).toBe(before);
  });

  it('muddati o‘tgan toifa belgilanadi; toifa hujjati almashtirilsa, eskisi biriktiruvdan chiqadi', async () => {
    const expired = await teacher
      .put('/api/me/teacher-profile')
      .send(profileBody({ categoryAwardedOn: yearsAgo(6) }))
      .expect(200);
    expect(expired.body.profile.categoryExpired).toBe(true);
    expect(expired.body.profile.categoryValidUntil).toBe(addMonthsToIsoDate(yearsAgo(6), 60));

    state.replacedCategoryFile = state.categoryFile;
    state.categoryFile = await upload(teacher, 'toifa-yangi.pdf');
    const replaced = await teacher.put('/api/me/teacher-profile').send(profileBody()).expect(200);
    expect(replaced.body.profile.categoryFile.id).toBe(state.categoryFile);
    expect(replaced.body.profile.categoryExpired).toBe(false);
    const old = await prisma.fileAsset.findUniqueOrThrow({
      where: { id: state.replacedCategoryFile },
      include: { categoryOf: true },
    });
    expect(old.categoryOf).toBeNull();
  });

  it('toifasiz yoki ilmiy darajasiz saqlanganda sana va hujjat olib tashlanadi', async () => {
    const other = await login(app, (await createUser(prisma, ['TEACHER'])).login);
    const file = await upload(other);
    const saved = await other
      .put('/api/me/teacher-profile')
      .send({
        university: '',
        academicDegree: 'NONE',
        degreeFileId: file,
        category: 'NONE',
        categoryAwardedOn: yearsAgo(1),
        categoryFileId: file,
      })
      .expect(200);
    expect(saved.body.profile).toMatchObject({
      university: null,
      degreeFile: null,
      category: 'NONE',
      categoryAwardedOn: null,
      categoryValidUntil: null,
      categoryFile: null,
    });
    // Mutaxassislik berilmasa o‘zgarmaydi.
    expect(saved.body.specialtySubject).toBeNull();
  });
});

// ---------------------------------------------------------------- Hujjatlar (4–9-bandlar)

const nationalBody = (subjectId: string, fileId: string | null, overrides: Record<string, unknown> = {}) => ({
  kind: 'SPECIALTY_NATIONAL',
  title: 'Milliy sertifikat',
  subjectId,
  level: 'A+',
  score: 88.5,
  certificateNumber: 'MS-123456',
  issuedOn: yearsAgo(1),
  validUntil: addMonthsToIsoDate(today, 24),
  fileId,
  ...overrides,
});

describe('Ma’lumotnomadagi hujjatlar', () => {
  let specialtyNational = '';
  let otherNational = '';

  it('mutaxassislik bo‘yicha milliy sertifikat: fayl, mutaxassislik va fan qoidalari', async () => {
    const noFile = await teacher.post('/api/me/teacher-credentials').send(nationalBody(math.id, null));
    expect(noFile.status).toBe(400);
    expect(paths(noFile.body)).toEqual(['fileId']);

    // Fayl so‘rovdan oldin yuklanadi (supertest bir vaqtdagi so‘rovlarda serverni yopib qo‘ymasin).
    const spare = await upload(teacher);
    const noLevel = await teacher
      .post('/api/me/teacher-credentials')
      .send(nationalBody(math.id, spare, { level: 'A++' }));
    expect(noLevel.status).toBe(400);
    expect(paths(noLevel.body)).toEqual(['level']);

    const dates = await teacher.post('/api/me/teacher-credentials').send(
      nationalBody(math.id, spare, {
        issuedOn: addMonthsToIsoDate(today, 2),
        validUntil: addMonthsToIsoDate(today, 1),
      }),
    );
    expect(dates.status).toBe(400);
    expect(paths(dates.body)).toEqual(expect.arrayContaining(['issuedOn', 'validUntil']));

    // Mutaxassislik belgilanmagan o‘qituvchi.
    const otherFile = await upload(otherTeacher);
    const noSpecialty = await otherTeacher
      .post('/api/me/teacher-credentials')
      .send(nationalBody(math.id, otherFile));
    expect(noSpecialty.status).toBe(400);
    expect(noSpecialty.body.code).toBe('SPECIALTY_REQUIRED');

    const wrongSubject = await teacher.post('/api/me/teacher-credentials').send(nationalBody(physics.id, spare));
    expect(wrongSubject.status).toBe(400);
    expect(wrongSubject.body.code).toBe('SUBJECT_NOT_SPECIALTY');
    expect(paths(wrongSubject.body)).toEqual(['subjectId']);
    expect(wrongSubject.body.message).toContain('Matematika');

    state.credentialFile = await upload(teacher, 'milliy-sertifikat.pdf');
    const created = await teacher
      .post('/api/me/teacher-credentials')
      .send(nationalBody(math.id, state.credentialFile, { certificateType: 'IELTS' }))
      .expect(201);
    specialtyNational = created.body.id;
    expect(created.body).toMatchObject({
      kind: 'SPECIALTY_NATIONAL',
      subject: { id: math.id, name: 'Matematika' },
      level: 'A+',
      score: 88.5,
      certificateNumber: 'MS-123456',
      issuedOn: yearsAgo(1),
      // Milliy sertifikatda xalqaro tur saqlanmaydi.
      certificateType: null,
      file: { id: state.credentialFile, originalName: 'milliy-sertifikat.pdf' },
    });
    const audit = await prisma.auditEvent.findFirstOrThrow({
      where: { action: 'teacher.credential_added', entityId: specialtyNational },
    });
    expect(JSON.stringify(audit.data)).not.toContain('MS-123456');
  });

  it('nomutaxassislik milliy sertifikati mutaxassislik fanidan bo‘lmaydi; bitta fayl ikki hujjatga biriktirilmaydi', async () => {
    const spare = await upload(teacher);
    const sameAsSpecialty = await teacher
      .post('/api/me/teacher-credentials')
      .send(nationalBody(math.id, spare, { kind: 'OTHER_NATIONAL' }));
    expect(sameAsSpecialty.status).toBe(400);
    expect(sameAsSpecialty.body.code).toBe('SUBJECT_IS_SPECIALTY');

    const inactive = await teacher
      .post('/api/me/teacher-credentials')
      .send(nationalBody(inactiveSubject.id, spare, { kind: 'OTHER_NATIONAL' }));
    expect(inactive.status).toBe(400);
    expect(inactive.body.code).toBe('SUBJECT_NOT_FOUND');

    const reused = await teacher
      .post('/api/me/teacher-credentials')
      .send(nationalBody(physics.id, state.credentialFile, { kind: 'OTHER_NATIONAL' }));
    expect(reused.status).toBe(400);
    expect(reused.body.code).toBe('FILE_NOT_ALLOWED');
    expect(paths(reused.body)).toEqual(['fileId']);

    const categoryReuse = await teacher
      .post('/api/me/teacher-credentials')
      .send(nationalBody(physics.id, state.categoryFile, { kind: 'OTHER_NATIONAL' }));
    expect(categoryReuse.body.code).toBe('FILE_NOT_ALLOWED');

    const created = await teacher
      .post('/api/me/teacher-credentials')
      .send(nationalBody(physics.id, spare, { kind: 'OTHER_NATIONAL', level: 'B' }))
      .expect(201);
    otherNational = created.body.id;
    expect(created.body).toMatchObject({ kind: 'OTHER_NATIONAL', subject: { id: physics.id }, level: 'B' });
  });

  it('xalqaro sertifikat turi majburiy va details da saqlanadi; kurs va tanlovda fayl ixtiyoriy', async () => {
    const [ieltsFile, goetheFile] = [await upload(teacher, 'ielts.pdf'), await upload(teacher)];
    const noType = await teacher.post('/api/me/teacher-credentials').send({
      kind: 'SPECIALTY_INTERNATIONAL',
      title: 'IELTS',
      fileId: ieltsFile,
    });
    expect(noType.status).toBe(400);
    expect(paths(noType.body)).toEqual(['certificateType']);

    const ielts = await teacher
      .post('/api/me/teacher-credentials')
      .send({
        kind: 'SPECIALTY_INTERNATIONAL',
        title: 'IELTS Academic',
        certificateType: 'IELTS',
        subjectId: math.id,
        level: 'C1',
        score: 7.5,
        provider: 'British Council',
        issuedOn: yearsAgo(1),
        fileId: ieltsFile,
      })
      .expect(201);
    // Xalqaro sertifikatda fan saqlanmaydi.
    expect(ielts.body).toMatchObject({ certificateType: 'IELTS', subject: null, score: 7.5, provider: 'British Council' });
    const stored = await prisma.teacherCredential.findUniqueOrThrow({ where: { id: ielts.body.id } });
    expect(stored.details).toEqual({ certificateType: 'IELTS' });

    await teacher
      .post('/api/me/teacher-credentials')
      .send({
        kind: 'OTHER_INTERNATIONAL',
        title: 'Goethe-Zertifikat B2',
        certificateType: 'GOETHE',
        level: 'B2',
        fileId: goetheFile,
      })
      .expect(201);
    const course = await teacher
      .post('/api/me/teacher-credentials')
      .send({ kind: 'PROFESSIONAL_DEVELOPMENT', title: 'Raqamli pedagogika kursi', provider: 'Coursera' })
      .expect(201);
    expect(course.body.file).toBeNull();
    const contest = await teacher
      .post('/api/me/teacher-credentials')
      .send({ kind: 'CONTEST', title: 'Yilning eng yaxshi o‘qituvchisi', level: '1-o‘rin', issuedOn: yearsAgo(1) })
      .expect(201);
    expect(contest.body).toMatchObject({ kind: 'CONTEST', level: '1-o‘rin', certificateType: null });

    // Ro‘yxat ma’lumotnoma tartibida (4–9-bandlar).
    const reference = await teacher.get('/api/me/teacher-profile').expect(200);
    const kinds = (reference.body.credentials as { kind: string }[]).map((entry) => entry.kind);
    expect(kinds).toEqual([
      'SPECIALTY_NATIONAL',
      'SPECIALTY_INTERNATIONAL',
      'OTHER_NATIONAL',
      'OTHER_INTERNATIONAL',
      'PROFESSIONAL_DEVELOPMENT',
      'CONTEST',
    ]);
  });

  it('faqat o‘z hujjatini tahrirlaydi va o‘chiradi', async () => {
    const updated = await teacher
      .put(`/api/me/teacher-credentials/${specialtyNational}`)
      .send(nationalBody(math.id, state.credentialFile, { level: 'A', score: 91 }))
      .expect(200);
    expect(updated.body).toMatchObject({ id: specialtyNational, level: 'A', score: 91 });
    const audit = await prisma.auditEvent.findFirstOrThrow({
      where: { action: 'teacher.credential_updated', entityId: specialtyNational },
    });
    expect((audit.data as { fields: string[] }).fields).toEqual(expect.arrayContaining(['level', 'score']));

    await otherTeacher
      .put(`/api/me/teacher-credentials/${specialtyNational}`)
      .send(nationalBody(math.id, null, { kind: 'PROFESSIONAL_DEVELOPMENT' }))
      .expect(404);
    await otherTeacher.delete(`/api/me/teacher-credentials/${specialtyNational}`).expect(404);
    await student.delete(`/api/me/teacher-credentials/${specialtyNational}`).expect(403);

    state.removedCredentialFile = await upload(teacher);
    const removable = await teacher
      .post('/api/me/teacher-credentials')
      .send({ kind: 'CONTEST', title: 'Ko‘rik-tanlov', fileId: state.removedCredentialFile })
      .expect(201);
    await teacher.delete(`/api/me/teacher-credentials/${removable.body.id}`).expect(200);
    expect(await prisma.teacherCredential.findUnique({ where: { id: removable.body.id } })).toBeNull();
    expect(
      await prisma.auditEvent.count({ where: { action: 'teacher.credential_removed', entityId: removable.body.id } }),
    ).toBe(1);
    await teacher.delete(`/api/me/teacher-credentials/${removable.body.id}`).expect(404);
  });

  it('mutaxassislik fani o‘zgarsa milliy sertifikatlar 4- va 6-bandlar orasida qayta taqsimlanadi', async () => {
    const moved = await teacher
      .put('/api/me/teacher-profile')
      .send(profileBody({ specialtySubjectId: physics.id }))
      .expect(200);
    const kindOf = (body: { credentials: { id: string; kind: string }[] }, id: string) =>
      body.credentials.find((entry) => entry.id === id)?.kind;
    expect(kindOf(moved.body, specialtyNational)).toBe('OTHER_NATIONAL');
    expect(kindOf(moved.body, otherNational)).toBe('SPECIALTY_NATIONAL');
    const audit = await prisma.auditEvent.findFirstOrThrow({
      where: { action: 'teacher.profile_updated', entityId: fx.teacher.id },
      orderBy: { id: 'desc' },
    });
    expect(audit.data).toMatchObject({ fields: ['specialtySubjectId'], reclassifiedCredentials: 2 });

    const back = await teacher.put('/api/me/teacher-profile').send(profileBody()).expect(200);
    expect(kindOf(back.body, specialtyNational)).toBe('SPECIALTY_NATIONAL');
    expect(kindOf(back.body, otherNational)).toBe('OTHER_NATIONAL');
  });
});

// ---------------------------------------------------------------- Rahbariyat va fayllar

describe('Rahbariyat uchun ko‘rinish va hujjat fayllari', () => {
  it('o‘rinbosar o‘qituvchi ma’lumotnomasini ko‘radi; boshqalar — yo‘q', async () => {
    const view = await deputy.get(`/api/teachers/${fx.teacher.id}/reference`).expect(200);
    const own = await teacher.get('/api/me/teacher-profile').expect(200);
    expect(view.body).toEqual(own.body);
    expect(view.body.teacher).toMatchObject({ id: fx.teacher.id, fullName: teacherName });

    await otherTeacher.get(`/api/teachers/${fx.teacher.id}/reference`).expect(403);
    await teacher.get(`/api/teachers/${fx.teacher.id}/reference`).expect(403);
    await student.get(`/api/teachers/${fx.teacher.id}/reference`).expect(403);
    await admin.get(`/api/teachers/${fx.teacher.id}/reference`).expect(403);
    await deputy.get(`/api/teachers/${fx.studentsA[0]!.id}/reference`).expect(404);
    const deputyUser = await createUser(prisma, ['DEPUTY']);
    await deputy.get(`/api/teachers/${deputyUser.id}/reference`).expect(404);
    await deputy.get(`/api/teachers/${randomUUID()}/reference`).expect(404);
    await deputy.get('/api/teachers/nomalum/reference').expect(404);
  });

  it('ma’lumotnoma fayllari faqat egasi va rahbariyatga ochiq; portfolio dalili bo‘la olmaydi', async () => {
    for (const file of [state.categoryFile, state.degreeFile, state.credentialFile]) {
      await teacher.get(`/api/files/${file}`).expect(200);
      await deputy.get(`/api/files/${file}`).expect(200);
      await otherTeacher.get(`/api/files/${file}`).expect(404);
      await student.get(`/api/files/${file}`).expect(404);
      await admin.get(`/api/files/${file}`).expect(404);
    }
    const asEvidence = await teacher
      .post('/api/portfolio')
      .send({ type: 'METHODICAL_WORK', title: 'Toifa hujjati', evidenceFileId: state.categoryFile });
    expect(asEvidence.status).toBe(404);
    expect(asEvidence.body.code).toBe('NOT_FOUND');
  });
});

// ---------------------------------------------------------------- Ustozlik (10–11-bandlar)

describe('O‘quvchilar sertifikatlariga ustozlik', () => {
  const tag = suffix();
  let zebo: { id: string; login: string };
  let zeboAgent: Agent;
  let englishTeacher: Agent;
  const items: Record<string, string> = {};

  const item = async (ownerId: string, data: Omit<Prisma.PortfolioItemUncheckedCreateInput, 'ownerId'>) =>
    (await prisma.portfolioItem.create({ data: { ownerId, visibility: 'STAFF', ...data } })).id;

  beforeAll(async () => {
    const year = await currentYear(prisma);
    const created = await createUser(prisma, ['STUDENT'], { lastName: 'Karimova', firstName: `Zebo${tag}` });
    zebo = { id: created.id, login: created.login };
    await prisma.enrollment.create({
      data: { studentId: zebo.id, classId: fx.classA.id, academicYearId: year.id, startsOn: year.startsOn },
    });
    zeboAgent = await login(app, zebo.login);

    const national = (subject: string, grade = 'A+') => ({ subject, grade, score: 95 });
    items.natMath = await item(zebo.id, {
      type: 'NATIONAL_CERTIFICATE',
      title: 'Milliy sertifikat — Matematika (A+)',
      details: national('Matematika'),
      status: 'APPROVED',
      date: new Date('2026-05-20'),
    });
    items.natMathSubmitted = await item(zebo.id, {
      type: 'NATIONAL_CERTIFICATE',
      title: 'Milliy sertifikat — Matematika (B)',
      details: national('Matematika', 'B'),
      status: 'SUBMITTED',
    });
    items.natMathDraft = await item(zebo.id, {
      type: 'NATIONAL_CERTIFICATE',
      title: 'Milliy sertifikat (qoralama)',
      details: national('Matematika'),
      status: 'DRAFT',
    });
    items.natMathPrivate = await item(zebo.id, {
      type: 'NATIONAL_CERTIFICATE',
      title: 'Yopiq milliy sertifikat',
      details: national('Matematika'),
      status: 'APPROVED',
      visibility: 'PRIVATE',
    });
    items.natPhysics = await item(zebo.id, {
      type: 'NATIONAL_CERTIFICATE',
      title: 'Milliy sertifikat — Fizika',
      details: national('Fizika'),
      status: 'APPROVED',
    });
    items.sat = await item(zebo.id, {
      type: 'SAT',
      title: 'SAT — 1450',
      details: { total: 1450, readingWriting: 700, math: 750 },
      status: 'APPROVED',
      date: new Date('2026-03-10'),
    });
    items.ielts = await item(zebo.id, {
      type: 'IELTS',
      title: 'IELTS Academic — 7.5',
      details: { testType: 'ACADEMIC', overall: 7.5 },
      status: 'APPROVED',
    });
    items.cefrEnglish = await item(zebo.id, {
      type: 'CEFR',
      title: 'CEFR — Ingliz tili B2',
      details: { language: 'Ingliz tili', level: 'B2' },
      status: 'APPROVED',
    });
    items.cefrGerman = await item(zebo.id, {
      type: 'CEFR',
      title: 'CEFR — Nemis tili B1',
      details: { language: 'Nemis tili', level: 'B1' },
      status: 'APPROVED',
    });
    items.olympiad = await item(zebo.id, {
      type: 'OLYMPIAD',
      title: 'Matematika olimpiadasi',
      details: { subject: 'Matematika', place: 'FIRST' },
      level: 'DISTRICT',
      status: 'APPROVED',
    });

    englishTeacher = await login(app, (await createUser(prisma, ['TEACHER'])).login);
    await englishTeacher
      .put('/api/me/teacher-profile')
      .send({ academicDegree: 'NONE', category: 'NONE', specialtySubjectId: english.id })
      .expect(200);
  });

  it('mutaxassislik belgilanmagan o‘qituvchiga 400 SPECIALTY_REQUIRED', async () => {
    const candidates = await otherTeacher.get(`/api/me/mentorships/candidates?studentId=${zebo.id}`);
    expect(candidates.status).toBe(400);
    expect(candidates.body.code).toBe('SPECIALTY_REQUIRED');
    const create = await otherTeacher.post('/api/me/mentorships').send({ portfolioItemId: items.natMath });
    expect(create.status).toBe(400);
    expect(create.body.code).toBe('SPECIALTY_REQUIRED');
    await student.get(`/api/me/mentorships/candidates?studentId=${zebo.id}`).expect(403);
  });

  it('faol o‘quvchilarni faqat F.I.Sh. bo‘yicha qidiradi (istalgan sinf, logini bo‘yicha emas)', async () => {
    const found = await teacher.get(`/api/me/mentorships/students?q=${encodeURIComponent(`zebo${tag}`)}`).expect(200);
    expect(found.body).toEqual([
      { id: zebo.id, fullName: `Karimova Zebo${tag}`, className: fx.classA.name, avatarUrl: null },
    ]);
    // Ism va familiya istalgan tartibda.
    const reversed = await englishTeacher
      .get(`/api/me/mentorships/students?q=${encodeURIComponent(`Zebo${tag} karimova`)}`)
      .expect(200);
    expect(reversed.body.map((entry: { id: string }) => entry.id)).toEqual([zebo.id]);

    const byLogin = await teacher.get(`/api/me/mentorships/students?q=${zebo.login}`).expect(200);
    expect(byLogin.body).toEqual([]);

    const inactive = await createUser(prisma, ['STUDENT'], { lastName: 'Karimova', firstName: `Nigora${tag}` });
    await prisma.user.update({ where: { id: inactive.id }, data: { status: 'DEACTIVATED' } });
    const none = await teacher.get(`/api/me/mentorships/students?q=nigora${tag}`).expect(200);
    expect(none.body).toEqual([]);

    const short = await teacher.get('/api/me/mentorships/students?q=a');
    expect(short.status).toBe(400);
    expect(short.body.code).toBe('VALIDATION_ERROR');
    await student.get(`/api/me/mentorships/students?q=zebo${tag}`).expect(403);
  });

  it('nomzodlar: faqat tasdiqlangan, xodimlarga ochiq va mutaxassislikka mos sertifikatlar', async () => {
    const forMath = await teacher.get(`/api/me/mentorships/candidates?studentId=${zebo.id}`).expect(200);
    expect(forMath.body.student).toMatchObject({ id: zebo.id, className: fx.classA.name });
    expect(forMath.body.specialty).toEqual({ id: math.id, name: 'Matematika' });
    expect(forMath.body.national).toEqual([
      {
        portfolioItemId: items.natMath,
        type: 'NATIONAL_CERTIFICATE',
        typeLabel: 'Milliy sertifikat',
        title: 'Milliy sertifikat — Matematika (A+)',
        summary: 'Matematika — A+ (95 ball)',
        date: '2026-05-20',
        claimed: false,
      },
    ]);
    // SAT matematika o‘qituvchisiga ham mos.
    expect(forMath.body.international.map((entry: { portfolioItemId: string }) => entry.portfolioItemId)).toEqual([
      items.sat,
    ]);
    // Faqat qisqa ma’lumot: dalil yoki boshqa maydonlar yo‘q.
    expect(Object.keys(forMath.body.international[0]).sort()).toEqual(
      ['claimed', 'date', 'portfolioItemId', 'summary', 'title', 'type', 'typeLabel'].sort(),
    );

    const forEnglish = await englishTeacher.get(`/api/me/mentorships/candidates?studentId=${zebo.id}`).expect(200);
    expect(forEnglish.body.national).toEqual([]);
    expect(
      forEnglish.body.international.map((entry: { portfolioItemId: string }) => entry.portfolioItemId).sort(),
    ).toEqual([items.sat, items.ielts, items.cefrEnglish].sort());

    await teacher.get(`/api/me/mentorships/candidates?studentId=${fx.otherTeacher.id}`).expect(404);
    await teacher.get(`/api/me/mentorships/candidates?studentId=${randomUUID()}`).expect(404);
    const invalid = await teacher.get('/api/me/mentorships/candidates?studentId=abc');
    expect(invalid.status).toBe(400);
  });

  let mentorshipId = '';

  it('bir tugma bilan qayd etiladi: o‘quvchiga xabar, jurnal; takroriy so‘rov o‘sha yozuvni qaytaradi', async () => {
    const created = await teacher.post('/api/me/mentorships').send({ portfolioItemId: items.natMath }).expect(201);
    mentorshipId = created.body.id;
    expect(created.body).toMatchObject({
      kind: 'NATIONAL',
      student: { id: zebo.id, fullName: `Karimova Zebo${tag}`, className: fx.classA.name },
      certificate: { id: items.natMath, type: 'NATIONAL_CERTIFICATE', summary: 'Matematika — A+ (95 ball)', approved: true },
    });

    const again = await teacher.post('/api/me/mentorships').send({ portfolioItemId: items.natMath }).expect(200);
    expect(again.body.id).toBe(mentorshipId);
    expect(await prisma.teacherMentorship.count({ where: { portfolioItemId: items.natMath } })).toBe(1);

    const inbox = await zeboAgent.get('/api/notifications').expect(200);
    const notices = (inbox.body.items as { type: string; title: string; link: string }[]).filter(
      (entry) => entry.type === 'MENTORSHIP_ADDED',
    );
    expect(notices).toHaveLength(1);
    expect(notices[0]!.title).toBe(
      `${teacherName} sizning “Milliy sertifikat — Matematika (A+)” sertifikatingiz bo‘yicha ustozingiz sifatida qayd etildi`,
    );
    expect(notices[0]!.link).toBe(`/portfolio/${items.natMath}`);

    const audit = await prisma.auditEvent.findFirstOrThrow({
      where: { action: 'teacher.mentorship_added', entityId: mentorshipId },
    });
    expect(audit.actorId).toBe(fx.teacher.id);
    expect(audit.data).toEqual({ portfolioItemId: items.natMath, studentId: zebo.id, kind: 'NATIONAL' });

    const sat = await teacher.post('/api/me/mentorships').send({ portfolioItemId: items.sat }).expect(201);
    expect(sat.body.kind).toBe('INTERNATIONAL');

    const candidates = await teacher.get(`/api/me/mentorships/candidates?studentId=${zebo.id}`).expect(200);
    expect(candidates.body.national[0].claimed).toBe(true);
    expect(candidates.body.international[0].claimed).toBe(true);
  });

  it('shartlar serverda qayta tekshiriladi', async () => {
    const mismatch = await teacher.post('/api/me/mentorships').send({ portfolioItemId: items.natPhysics });
    expect(mismatch.status).toBe(400);
    expect(mismatch.body.code).toBe('SUBJECT_MISMATCH');
    // IELTS — faqat ingliz tili o‘qituvchisiga.
    expect((await teacher.post('/api/me/mentorships').send({ portfolioItemId: items.ielts })).body.code).toBe(
      'SUBJECT_MISMATCH',
    );
    for (const key of ['natMathSubmitted', 'natMathDraft', 'natMathPrivate', 'olympiad']) {
      const response = await teacher.post('/api/me/mentorships').send({ portfolioItemId: items[key] });
      expect(response.status, key).toBe(404);
    }
    await teacher.post('/api/me/mentorships').send({ portfolioItemId: randomUUID() }).expect(404);
    const invalid = await teacher.post('/api/me/mentorships').send({ portfolioItemId: 'abc' });
    expect(invalid.status).toBe(400);
    expect(invalid.body.code).toBe('VALIDATION_ERROR');

    // Egasi faol o‘quvchi emas.
    const left = await createUser(prisma, ['STUDENT']);
    const leftItem = await item(left.id, {
      type: 'NATIONAL_CERTIFICATE',
      title: 'Milliy sertifikat',
      details: { subject: 'Matematika', grade: 'A' },
      status: 'APPROVED',
    });
    await prisma.user.update({ where: { id: left.id }, data: { status: 'ARCHIVED' } });
    await teacher.post('/api/me/mentorships').send({ portfolioItemId: leftItem }).expect(404);
    await student.post('/api/me/mentorships').send({ portfolioItemId: items.natMath }).expect(403);
    expect(await prisma.teacherMentorship.count({ where: { teacherId: fx.teacher.id } })).toBe(2);
  });

  it('ustoz portfolio yozuvida, jamlangan portfolioda va ma’lumotnomada ko‘rinadi', async () => {
    const own = await zeboAgent.get(`/api/portfolio/${items.natMath}`).expect(200);
    expect(own.body.mentors).toEqual([{ id: fx.teacher.id, fullName: teacherName }]);
    const list = await zeboAgent.get('/api/portfolio?pageSize=50').expect(200);
    const listed = (list.body.items as { id: string; mentors: unknown[] }[]).find((entry) => entry.id === items.sat);
    expect(listed?.mentors).toEqual([{ id: fx.teacher.id, fullName: teacherName }]);
    const consolidated = await deputy.get(`/api/portfolio/students/${zebo.id}`).expect(200);
    const physicsItem = (consolidated.body.items as { id: string; mentors: unknown[] }[]).find(
      (entry) => entry.id === items.natPhysics,
    );
    expect(physicsItem?.mentors).toEqual([]);
    expect(
      (consolidated.body.items as { id: string; mentors: unknown[] }[]).find((entry) => entry.id === items.natMath)
        ?.mentors,
    ).toHaveLength(1);

    const reference = await teacher.get('/api/me/teacher-profile').expect(200);
    expect(reference.body.mentorships.national).toEqual([
      expect.objectContaining({
        id: mentorshipId,
        student: { id: zebo.id, fullName: `Karimova Zebo${tag}`, className: fx.classA.name, avatarUrl: null },
        certificate: expect.objectContaining({ id: items.natMath, typeLabel: 'Milliy sertifikat', date: '2026-05-20' }),
      }),
    ]);
    expect(reference.body.mentorships.international).toHaveLength(1);
    const leadership = await deputy.get(`/api/teachers/${fx.teacher.id}/reference`).expect(200);
    expect(leadership.body.mentorships).toEqual(reference.body.mentorships);
  });

  it('faqat o‘z ustozlik yozuvini olib tashlaydi', async () => {
    await englishTeacher.delete(`/api/me/mentorships/${mentorshipId}`).expect(404);
    await student.delete(`/api/me/mentorships/${mentorshipId}`).expect(403);
    await teacher.delete(`/api/me/mentorships/${mentorshipId}`).expect(200);
    await teacher.delete(`/api/me/mentorships/${mentorshipId}`).expect(404);
    expect(
      await prisma.auditEvent.count({ where: { action: 'teacher.mentorship_removed', entityId: mentorshipId } }),
    ).toBe(1);
    const own = await zeboAgent.get(`/api/portfolio/${items.natMath}`).expect(200);
    expect(own.body.mentors).toEqual([]);
  });
});

// ---------------------------------------------------------------- Yetim fayllar

describe('Yetim fayllarni tozalash', () => {
  it('ma’lumotnomaga biriktirilgan hujjatlar qoladi, almashtirilgan va o‘chirilgan hujjat fayli tozalanadi', async () => {
    const files = app.get(FilesService);
    await files.cleanupOrphans(new Date(Date.now() + 25 * 60 * 60_000));
    const deletedAt = async (id: string) => (await prisma.fileAsset.findUniqueOrThrow({ where: { id } })).deletedAt;
    for (const kept of [state.categoryFile, state.degreeFile, state.credentialFile]) {
      expect(await deletedAt(kept)).toBeNull();
    }
    expect(await deletedAt(state.replacedCategoryFile)).not.toBeNull();
    expect(await deletedAt(state.removedCredentialFile)).not.toBeNull();
    await teacher.get(`/api/files/${state.categoryFile}`).expect(200);
    await teacher.get(`/api/files/${state.replacedCategoryFile}`).expect(404);
  });
});
