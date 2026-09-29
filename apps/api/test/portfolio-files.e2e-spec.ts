/**
 * Portfolio dalil fayllariga kirish, maktab banki qarorlari va yetim fayllarni tozalash.
 */
import type { INestApplication } from '@nestjs/common';
import { FilesService } from '../src/files/files.service.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import { createApp, createFixture, createUser, login, singleChoice, type Fixture } from './helpers.js';

let app: INestApplication;
let prisma: PrismaService;
let fx: Fixture;

/** Eng kichik haqiqiy PDF (turi mazmun bo‘yicha aniqlanadi). */
const PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
);

type Agent = Awaited<ReturnType<typeof login>>;

async function upload(agent: Agent) {
  const response = await agent
    .post('/api/files')
    .attach('file', PDF, { filename: 'sertifikat.pdf', contentType: 'application/pdf' });
  expect(response.status).toBe(201);
  return response.body.id as string;
}

beforeAll(async () => {
  ({ app, prisma } = await createApp());
  fx = await createFixture(prisma, 1);
});

afterAll(async () => {
  await app.close();
});

describe('O‘qituvchi portfoliosidagi dalil fayli', () => {
  it('“maktab xodimlari” ko‘rinishida tasdiqlangach hamkasbga ochiq, yopiq yozuvda va o‘quvchiga yopiq', async () => {
    const owner = await login(app, fx.teacher.login);
    const colleague = await login(app, fx.otherTeacher.login);
    const student = await login(app, fx.studentsB[0]!.login);
    const deputy = await login(app, (await createUser(prisma, ['DEPUTY'])).login);

    const sharedFile = await upload(owner);
    const shared = await owner
      .post('/api/portfolio')
      .send({ type: 'METHODICAL_WORK', title: 'Metodik qo‘llanma', evidenceFileId: sharedFile, visibility: 'STAFF' })
      .expect(201);
    const privateFile = await upload(owner);
    const hidden = await owner
      .post('/api/portfolio')
      .send({ type: 'OPEN_LESSON', title: 'Ochiq dars', evidenceFileId: privateFile, visibility: 'PRIVATE' })
      .expect(201);

    // Qoralama fayli faqat egasiga ochiq — tekshiruvchi rahbariyatga ham.
    await colleague.get(`/api/files/${sharedFile}`).expect(404);
    await deputy.get(`/api/files/${sharedFile}`).expect(404);
    await owner.get(`/api/files/${sharedFile}`).expect(200);

    // Tekshiruvga yuborilgach tekshiruvchi ko‘radi, hamkasb esa tasdiqlanguncha ko‘rmaydi.
    for (const item of [shared.body.id, hidden.body.id]) {
      await owner.post(`/api/portfolio/${item}/submit`).expect(200);
    }
    await deputy.get(`/api/files/${sharedFile}`).expect(200);
    await colleague.get(`/api/files/${sharedFile}`).expect(404);

    for (const item of [shared.body.id, hidden.body.id]) {
      await deputy.post(`/api/portfolio/${item}/review`).send({ decision: 'APPROVED' }).expect(200);
    }
    await colleague.get(`/api/files/${sharedFile}`).expect(200);
    await colleague.get(`/api/files/${privateFile}`).expect(404);
    await deputy.get(`/api/files/${privateFile}`).expect(200);
    await student.get(`/api/files/${sharedFile}`).expect(404);
    await owner.get(`/api/files/${privateFile}`).expect(200);
  });
});

describe('O‘quvchi qoralamasidagi dalil fayli', () => {
  it('qoralama fayli sinf rahbariga ham yopiq, tekshiruvga yuborilgach ochiladi', async () => {
    const studentLogin = fx.studentsA[0]!.login;
    const student = await login(app, studentLogin);
    const homeroom = await login(app, fx.teacher.login);
    const deputy = await login(app, (await createUser(prisma, ['DEPUTY'])).login);

    const file = await upload(student);
    const item = await student
      .post('/api/portfolio')
      .send({ type: 'CERTIFICATE', title: 'Sertifikat', evidenceFileId: file, visibility: 'STAFF' })
      .expect(201);

    await homeroom.get(`/api/files/${file}`).expect(404);
    await deputy.get(`/api/files/${file}`).expect(404);
    await student.get(`/api/files/${file}`).expect(200);

    await student.post(`/api/portfolio/${item.body.id}/submit`).expect(200);
    await homeroom.get(`/api/files/${file}`).expect(200);
    await deputy.get(`/api/files/${file}`).expect(200);
  });
});

describe('Maktab banki qarorlari', () => {
  it('muallif o‘zi qaror qila olmaydi; rad etish sababi bilan muallifga bildirishnoma boradi', async () => {
    const deputyUser = await createUser(prisma, ['DEPUTY', 'TEACHER']);
    const reviewerUser = await createUser(prisma, ['DEPUTY']);
    const deputy = await login(app, deputyUser.login);
    const reviewer = await login(app, reviewerUser.login);
    const author = await login(app, fx.teacher.login);

    // Rahbariyat a’zosining o‘z savoli — o‘zi tasdiqlay olmaydi.
    const own = await deputy
      .post('/api/questions')
      .send({ subjectId: fx.subjectId, gradeLevel: 9, content: singleChoice('O‘rinbosar savoli', 'KNOWLEDGE', 1) })
      .expect(201);
    await deputy.post(`/api/questions/${own.body.id}/request-school`).expect(200);
    const self = await deputy.post(`/api/questions/${own.body.id}/approve-school`);
    expect(self.status).toBe(409);
    expect(self.body.code).toBe('SELF_REVIEW');

    const question = await author
      .post('/api/questions')
      .send({ subjectId: fx.subjectId, gradeLevel: 9, content: singleChoice('Muallif savoli', 'APPLICATION', 2) })
      .expect(201);
    await author.post(`/api/questions/${question.body.id}/request-school`).expect(200);
    await reviewer
      .post(`/api/questions/${question.body.id}/reject-school`)
      .send({ reason: 'Variantlar bir xil uzunlikda emas' })
      .expect(200);

    const notifications = await author.get('/api/notifications').expect(200);
    const rejected = notifications.body.items.find(
      (item: { type: string }) => item.type === 'QUESTION_SCHOOL_REJECTED',
    );
    expect(rejected?.body).toContain('Variantlar bir xil uzunlikda emas');

    // Qayta so‘ralgach tasdiqlanadi; ikkinchi marta qaror qabul qilib bo‘lmaydi.
    await author.post(`/api/questions/${question.body.id}/request-school`).expect(200);
    await reviewer.post(`/api/questions/${question.body.id}/approve-school`).expect(200);
    const again = await reviewer.post(`/api/questions/${question.body.id}/approve-school`);
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('NOT_PENDING');
    const after = await author.get('/api/notifications').expect(200);
    expect(after.body.items.some((item: { type: string }) => item.type === 'QUESTION_SCHOOL_APPROVED')).toBe(true);
  });
});

describe('Yetim fayllarni tozalash', () => {
  it('portfolio yozuviga biriktirilmagan eski yuklama o‘chiriladi, ishlatilayotgani qoladi', async () => {
    const owner = await login(app, fx.studentsA[0]!.login);
    const orphan = await upload(owner);
    const used = await upload(owner);
    await owner
      .post('/api/portfolio')
      .send({ type: 'CERTIFICATE', title: 'Sertifikat', evidenceFileId: used })
      .expect(201);

    const files = app.get(FilesService);
    const removed = await files.cleanupOrphans(new Date(Date.now() + 25 * 60 * 60_000));
    expect(removed).toBeGreaterThanOrEqual(1);

    expect((await prisma.fileAsset.findUniqueOrThrow({ where: { id: orphan } })).deletedAt).not.toBeNull();
    expect((await prisma.fileAsset.findUniqueOrThrow({ where: { id: used } })).deletedAt).toBeNull();
    await owner.get(`/api/files/${orphan}`).expect(404);
    await owner.get(`/api/files/${used}`).expect(200);
  });
});
