/**
 * Portfolio: tuzilgan sertifikat maydonlari, tasdiqdan keyingi o‘zgarishlar, o‘quvchilar bo‘yicha
 * guruhlangan tekshiruv navbati, ommaviy qaror, rahbariyat katalogi, jamlangan portfolio va ZIP eksport.
 */
import { readdirSync, readlinkSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import type { INestApplication } from '@nestjs/common';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import request from 'supertest';
import { AppConfig } from '../src/config/app-config.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import {
  PASSWORD,
  binaryParser,
  createApp,
  createFixture,
  createUser,
  currentYear,
  login,
  type Fixture,
} from './helpers.js';

let app: INestApplication;
let prisma: PrismaService;
let fx: Fixture;

type Agent = Awaited<ReturnType<typeof login>>;

/** Eng kichik haqiqiy PDF (turi mazmun bo‘yicha aniqlanadi). */
const PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
);

const IELTS = {
  type: 'IELTS',
  title: 'IELTS Academic — 7.5',
  organization: 'British Council',
  date: '2026-06-13',
  level: 'INTERNATIONAL',
  details: { overall: 7.5, listening: 8, reading: 7.5, writing: 6.5, speaking: 7 },
};

const NATIONAL = (grade: string, score: number) => ({
  type: 'NATIONAL_CERTIFICATE',
  title: `Milliy sertifikat — Ona tili va adabiyot (${grade})`,
  organization: 'Bilim va malakalarni baholash agentligi',
  date: '2026-05-20',
  level: 'NATIONAL',
  details: { subject: 'Ona tili va adabiyot', grade, score },
});

async function upload(agent: Agent, name = 'sertifikat.pdf') {
  const response = await agent
    .post('/api/files')
    .attach('file', PDF, { filename: name, contentType: 'application/pdf' });
  expect(response.status).toBe(201);
  return response.body.id as string;
}

async function createItem(agent: Agent, body: Record<string, unknown>) {
  const response = await agent.post('/api/portfolio').send(body);
  expect(response.status, JSON.stringify(response.body)).toBe(201);
  return response.body as { id: string; status: string; result: string | null; details: unknown };
}

async function submitted(agent: Agent, body: Record<string, unknown>) {
  const item = await createItem(agent, body);
  await agent.post(`/api/portfolio/${item.id}/submit`).expect(200);
  return item;
}

let deputy: Agent;
let deputyId: string;
let homeroom: Agent;
let otherHomeroom: Agent;
let subjectTeacher: Agent;
let loneTeacher: Agent;

beforeAll(async () => {
  ({ app, prisma } = await createApp());
  fx = await createFixture(prisma, 3);
  const deputyUser = await createUser(prisma, ['DEPUTY']);
  deputyId = deputyUser.id;
  deputy = await login(app, deputyUser.login);
  homeroom = await login(app, fx.teacher.login);
  otherHomeroom = await login(app, fx.otherTeacher.login);

  // A sinfda dars beradigan, lekin sinf rahbari bo‘lmagan o‘qituvchi.
  const year = await currentYear(prisma);
  const subjectTeacherUser = await createUser(prisma, ['TEACHER']);
  const otherSubject = await prisma.subject.create({ data: { name: `Portfolio fan ${subjectTeacherUser.login}` } });
  await prisma.teachingAssignment.create({
    data: {
      teacherId: subjectTeacherUser.id,
      subjectId: otherSubject.id,
      classId: fx.classA.id,
      academicYearId: year.id,
    },
  });
  subjectTeacher = await login(app, subjectTeacherUser.login);
  loneTeacher = await login(app, (await createUser(prisma, ['TEACHER'])).login);
});

afterAll(async () => {
  await app.close();
});

describe('Tuzilgan sertifikat maydonlari', () => {
  it('details turga qarab tekshiriladi va xato maydon yo‘li bilan qaytadi', async () => {
    const student = await login(app, fx.studentsA[0]!.login);
    const wrongBand = await student.post('/api/portfolio').send({ ...IELTS, details: { overall: 7.3 } });
    expect(wrongBand.status).toBe(400);
    expect(wrongBand.body.details.map((issue: { path: string }) => issue.path)).toContain('details.overall');

    const wrongSum = await student
      .post('/api/portfolio')
      .send({ type: 'SAT', title: 'SAT', details: { total: 1400, readingWriting: 720, math: 730 } });
    expect(wrongSum.status).toBe(400);
    expect(wrongSum.body.details.map((issue: { path: string }) => issue.path)).toContain('details.total');

    const missing = await student.post('/api/portfolio').send({ type: 'CEFR', title: 'CEFR', details: {} });
    expect(missing.status).toBe(400);
    const paths = missing.body.details.map((issue: { path: string }) => issue.path);
    expect(paths).toEqual(expect.arrayContaining(['details.language', 'details.level']));
  });

  it('natija details dan avtomatik yasaladi, mijoz yuborgani e’tiborga olinmaydi', async () => {
    const student = await login(app, fx.studentsA[0]!.login);
    const item = await createItem(student, { ...IELTS, result: 'Soxta natija' });
    expect(item.result).toBe('IELTS 7.5 (L 8 · R 7.5 · W 6.5 · S 7)');
    expect(item.details).toEqual({
      testType: 'ACADEMIC',
      overall: 7.5,
      listening: 8,
      reading: 7.5,
      writing: 6.5,
      speaking: 7,
    });

    // Qidiruv matnida ham natija bor.
    const search = await student.get('/api/portfolio').query({ q: 'L 8' }).expect(200);
    expect(search.body.items.some((entry: { id: string }) => entry.id === item.id)).toBe(true);
  });

  it('tuzilgan maydoni yo‘q turda details saqlanmaydi', async () => {
    const student = await login(app, fx.studentsA[0]!.login);
    const item = await createItem(student, {
      type: 'POEM',
      title: 'She’r',
      result: '1-o‘rin',
      details: { overall: 9, anything: 'x' },
    });
    expect(item.details).toBeNull();
    expect(item.result).toBe('1-o‘rin');
  });

  it('profil rasmi bo‘lgan fayl dalil sifatida qabul qilinmaydi', async () => {
    const owner = fx.studentsA[2]!;
    const student = await login(app, owner.login);
    const fileId = await upload(student, 'rasm.pdf');
    await prisma.user.update({ where: { id: owner.id }, data: { avatarFileId: fileId } });
    const response = await student.post('/api/portfolio').send({ ...IELTS, evidenceFileId: fileId });
    expect(response.status).toBe(404);
    expect(response.body.code).toBe('NOT_FOUND');
    await prisma.user.update({ where: { id: owner.id }, data: { avatarFileId: null } });
    await createItem(student, { ...IELTS, evidenceFileId: fileId });
  });
});

describe('Tasdiqlangan yozuvni tahrirlash', () => {
  it('details o‘zgarsa tasdiq bekor bo‘ladi, tavsif o‘zgarsa qoladi', async () => {
    const student = await login(app, fx.studentsA[1]!.login);
    const first = await submitted(student, NATIONAL('B+', 78));
    const second = await submitted(student, { ...IELTS, title: 'IELTS (tavsif sinovi)' });
    await homeroom.post(`/api/portfolio/${first.id}/review`).send({ decision: 'APPROVED' }).expect(200);
    await homeroom.post(`/api/portfolio/${second.id}/review`).send({ decision: 'APPROVED' }).expect(200);

    const changed = await student.put(`/api/portfolio/${first.id}`).send(NATIONAL('A', 88)).expect(200);
    expect(changed.body.status).toBe('DRAFT');
    expect(changed.body.reviewer).toBeNull();

    const kept = await student
      .put(`/api/portfolio/${second.id}`)
      .send({ ...IELTS, title: 'IELTS (tavsif sinovi)', description: 'Yangi tavsif', visibility: 'PRIVATE' })
      .expect(200);
    expect(kept.body.status).toBe('APPROVED');
  });
});

describe('Tekshiruvchiga “yangi” va “o‘zgartirilgan” yozuvlar', () => {
  it('o‘zgartirilgan yozuvda oldingi tasdiqlangan holatdan farq ko‘rinadi, yangi yozuvda farq yo‘q', async () => {
    const owner = fx.studentsA[1]!;
    const student = await login(app, owner.login);
    const item = await submitted(student, NATIONAL('B+', 78));
    await homeroom.post(`/api/portfolio/${item.id}/review`).send({ decision: 'APPROVED' }).expect(200);
    await student.put(`/api/portfolio/${item.id}`).send(NATIONAL('A', 88)).expect(200);
    await student.post(`/api/portfolio/${item.id}/submit`).expect(200);
    const fresh = await submitted(student, {
      type: 'CEFR',
      title: 'CEFR B2',
      details: { language: 'Ingliz tili', level: 'B2' },
    });

    const queue = await homeroom.get('/api/portfolio/review-queue').query({ ownerId: owner.id }).expect(200);
    const changed = queue.body.find((entry: { id: string }) => entry.id === item.id);
    expect(changed.changeKind).toBe('CHANGED');
    expect(changed.lastApprovedAt).toBeTruthy();
    const fields = changed.changes.map((change: { field: string }) => change.field);
    expect(fields).toEqual(expect.arrayContaining(['title', 'result', 'details']));
    expect(fields).not.toContain('organization');
    const details = changed.changes.find((change: { field: string }) => change.field === 'details');
    expect(details.before).toMatchObject({ grade: 'B+', score: 78 });
    expect(details.after).toMatchObject({ grade: 'A', score: 88 });

    const created = queue.body.find((entry: { id: string }) => entry.id === fresh.id);
    expect(created.changeKind).toBe('NEW');
    expect(created.changes).toEqual([]);

    // Bitta yozuv sahifasida ham tekshiruvchiga farq ko‘rsatiladi.
    const detail = await homeroom.get(`/api/portfolio/${item.id}`).expect(200);
    expect(detail.body.changeKind).toBe('CHANGED');
    expect(detail.body.canReview).toBe(true);
  });

  it('to‘liq bo‘lmagan eski snapshot yolg‘on o‘zgarish bermaydi', async () => {
    const owner = fx.studentsA[1]!;
    const student = await login(app, owner.login);
    const item = await prisma.portfolioItem.create({
      data: {
        ownerId: owner.id,
        type: 'POEM',
        title: 'Eski she’r',
        organization: 'Ijod maktabi',
        level: 'SCHOOL',
        status: 'APPROVED',
        reviewerId: fx.teacher.id,
        reviewedAt: new Date(),
        submittedAt: new Date(),
        reviews: {
          create: {
            reviewerId: fx.teacher.id,
            decision: 'APPROVED',
            snapshot: { title: 'Eski she’r', level: 'SCHOOL' },
          },
        },
      },
    });
    // Tashkilot (snapshotda yo‘q) o‘zgaradi — muhim maydon, shuning uchun yozuv qayta tekshiruvga tushadi.
    const body = { type: 'POEM', title: 'Eski she’r', organization: 'Tuman', level: 'SCHOOL' };
    await student.put(`/api/portfolio/${item.id}`).send(body).expect(200);
    await student.post(`/api/portfolio/${item.id}/submit`).expect(200);
    let queue = await homeroom.get('/api/portfolio/review-queue').query({ ownerId: owner.id }).expect(200);
    let entry = queue.body.find((row: { id: string }) => row.id === item.id);
    expect(entry.changeKind).toBe('CHANGED');
    expect(entry.changes).toEqual([]);

    await student
      .put(`/api/portfolio/${item.id}`)
      .send({ ...body, level: 'DISTRICT' })
      .expect(200);
    await student.post(`/api/portfolio/${item.id}/submit`).expect(200);
    queue = await homeroom.get('/api/portfolio/review-queue').query({ ownerId: owner.id }).expect(200);
    entry = queue.body.find((row: { id: string }) => row.id === item.id);
    expect(entry.changes.map((change: { field: string }) => change.field)).toEqual(['level']);
  });

  it('qaytarilgan yozuv qayta yuborilganda sabab ko‘rsatiladi', async () => {
    const owner = fx.studentsA[1]!;
    const student = await login(app, owner.login);
    const item = await submitted(student, { type: 'SAT', title: 'SAT 1450', details: { total: 1450 } });
    await homeroom
      .post(`/api/portfolio/${item.id}/review`)
      .send({ decision: 'RETURNED', reason: 'Hisobot faylini biriktiring' })
      .expect(200);
    await student.post(`/api/portfolio/${item.id}/submit`).expect(200);
    const queue = await homeroom.get('/api/portfolio/review-queue').query({ ownerId: owner.id }).expect(200);
    const entry = queue.body.find((row: { id: string }) => row.id === item.id);
    expect(entry).toMatchObject({
      changeKind: 'NEW',
      wasReturned: true,
      lastReturnReason: 'Hisobot faylini biriktiring',
    });
  });
});

describe('O‘quvchilar bo‘yicha guruhlangan navbat', () => {
  it('sinf rahbari faqat o‘z sinfini, rahbariyat hammani (o‘qituvchilar yozuvlari bilan) ko‘radi', async () => {
    const ownerB = fx.studentsB[0]!;
    const studentB = await login(app, ownerB.login);
    await submitted(studentB, NATIONAL('A', 90));
    const teacherAuthor = await login(app, fx.otherTeacher.login);
    const teacherItem = await submitted(teacherAuthor, { type: 'METHODICAL_WORK', title: 'Metodik qo‘llanma' });

    const own = await homeroom.get('/api/portfolio/review-queue/students').expect(200);
    const ownIds = own.body.map((row: { owner: { id: string } }) => row.owner.id);
    expect(ownIds).toContain(fx.studentsA[1]!.id);
    expect(ownIds).not.toContain(ownerB.id);
    expect(ownIds).not.toContain(fx.otherTeacher.id);
    const rowA = own.body.find((row: { owner: { id: string } }) => row.owner.id === fx.studentsA[1]!.id);
    expect(rowA.pending).toBe(rowA.newCount + rowA.changedCount);
    expect(rowA.changedCount).toBeGreaterThanOrEqual(1);
    expect(rowA.owner).toMatchObject({ className: fx.classA.name, avatarUrl: null });
    expect(rowA.oldestSubmittedAt).toBeTruthy();

    const other = await otherHomeroom.get('/api/portfolio/review-queue/students').expect(200);
    const otherIds = other.body.map((row: { owner: { id: string } }) => row.owner.id);
    expect(otherIds).toContain(ownerB.id);
    expect(otherIds).not.toContain(fx.studentsA[1]!.id);
    // O‘z yozuvi o‘ziga navbatda ko‘rinmaydi.
    expect(otherIds).not.toContain(fx.otherTeacher.id);

    expect((await loneTeacher.get('/api/portfolio/review-queue/students').expect(200)).body).toEqual([]);
    await otherHomeroom.get('/api/portfolio/review-queue').query({ ownerId: fx.studentsA[1]!.id }).expect(404);

    const all = await deputy.get('/api/portfolio/review-queue/students').expect(200);
    const allIds = all.body.map((row: { owner: { id: string } }) => row.owner.id);
    expect(allIds).toEqual(expect.arrayContaining([fx.studentsA[1]!.id, ownerB.id, fx.otherTeacher.id]));
    const oldest = all.body.map((row: { oldestSubmittedAt: string }) => new Date(row.oldestSubmittedAt).getTime());
    expect([...oldest].sort((a, b) => a - b)).toEqual(oldest);

    const teacherQueue = await deputy
      .get('/api/portfolio/review-queue')
      .query({ ownerId: fx.otherTeacher.id })
      .expect(200);
    expect(teacherQueue.body.map((row: { id: string }) => row.id)).toContain(teacherItem.id);

    const student = await login(app, fx.studentsA[0]!.login);
    await student.get('/api/portfolio/review-queue/students').expect(403);
  });

  it('yuborilganda sinf rahbariga o‘quvchi sahifasiga havola bilan xabar boradi', async () => {
    const owner = fx.studentsA[0]!;
    const student = await login(app, owner.login);
    const person = await prisma.user.findUniqueOrThrow({ where: { id: owner.id } });
    const item = await submitted(student, { ...IELTS, title: 'Xabar sinovi' });
    const inbox = await homeroom.get('/api/notifications').expect(200);
    const notice = inbox.body.items.find(
      (entry: { type: string; body: string | null }) =>
        entry.type === 'PORTFOLIO_SUBMITTED' && entry.body?.startsWith('Xabar sinovi'),
    );
    expect(notice.title).toBe(`${person.lastName} ${person.firstName}: yangi yutuq tasdiqlash uchun`);
    expect(notice.link).toBe(`/portfolio/review?owner=${owner.id}`);
    expect(notice.body).toContain('IELTS 7.5');

    // Tasdiqlangandan keyin o‘zgartirilsa — “yutuq o‘zgartirildi”.
    await homeroom.post(`/api/portfolio/${item.id}/review`).send({ decision: 'APPROVED' }).expect(200);
    await student
      .put(`/api/portfolio/${item.id}`)
      .send({ ...IELTS, title: 'Xabar sinovi 2' })
      .expect(200);
    await student.post(`/api/portfolio/${item.id}/submit`).expect(200);
    const again = await homeroom.get('/api/notifications').expect(200);
    const changed = again.body.items.find((entry: { body: string | null }) => entry.body?.startsWith('Xabar sinovi 2'));
    expect(changed.title).toBe(`${person.lastName} ${person.firstName}: yutuq o‘zgartirildi`);

    // O‘qituvchi yozuvi — rahbariyatga, “Portfoliolar” bo‘limidagi tekshiruvga havola bilan.
    const teacherAuthor = await login(app, fx.teacher.login);
    await submitted(teacherAuthor, { type: 'OPEN_LESSON', title: 'Ochiq dars (xabar sinovi)' });
    const deputyInbox = await deputy.get('/api/notifications').expect(200);
    const teacherNotice = deputyInbox.body.items.find(
      (entry: { body: string | null }) => entry.body === 'Ochiq dars (xabar sinovi)',
    );
    expect(teacherNotice.link).toBe(`/management/portfolio?tab=review&owner=${fx.teacher.id}`);
  });
});

describe('Ommaviy qaror va poyga', () => {
  it('bitta tranzaksiyada tasdiqlaydi, qayta yuborilgani o‘tkazib yuboriladi, har egaga bitta xabar', async () => {
    const ownerA = fx.studentsA[2]!;
    const ownerB = fx.studentsB[1]!;
    const studentA = await login(app, ownerA.login);
    const studentB = await login(app, ownerB.login);
    const a1 = await submitted(studentA, { ...IELTS, title: 'Ommaviy 1' });
    const a2 = await submitted(studentA, NATIONAL('A+', 97));
    const b1 = await submitted(studentB, { type: 'SAT', title: 'Ommaviy SAT', details: { total: 1300 } });
    const draft = await createItem(studentA, { type: 'POEM', title: 'Qoralama she’r' });
    const before = await prisma.notification.count({ where: { userId: { in: [ownerA.id, ownerB.id] } } });

    // Sinf rahbari boshqa sinf yozuvini tasdiqlay olmaydi.
    const limited = await homeroom
      .post('/api/portfolio/review-batch')
      .send({ itemIds: [b1.id], decision: 'APPROVED' })
      .expect(200);
    expect(limited.body).toMatchObject({ approved: 0, returned: 0 });
    expect(limited.body.skipped).toEqual([{ id: b1.id, reason: expect.stringMatching(/NOT_FOUND|NOT_ALLOWED/) }]);

    const result = await deputy
      .post('/api/portfolio/review-batch')
      .send({ itemIds: [a1.id, a2.id, b1.id, draft.id], decision: 'APPROVED' })
      .expect(200);
    expect(result.body.approved).toBe(3);
    expect(result.body.skipped).toEqual([{ id: draft.id, reason: 'NOT_PENDING' }]);

    const again = await deputy
      .post('/api/portfolio/review-batch')
      .send({ itemIds: [a1.id, a2.id], decision: 'APPROVED' })
      .expect(200);
    expect(again.body.approved).toBe(0);
    expect(again.body.skipped.map((entry: { reason: string }) => entry.reason)).toEqual(['NOT_PENDING', 'NOT_PENDING']);

    const notices = await prisma.notification.findMany({
      where: { userId: { in: [ownerA.id, ownerB.id] } },
      orderBy: { createdAt: 'desc' },
    });
    expect(notices.length - before).toBe(2);
    expect(notices.find((entry) => entry.userId === ownerA.id)?.title).toBe('2 ta yutuq tasdiqlandi');
    expect(notices.find((entry) => entry.userId === ownerB.id)?.title).toBe('Yozuv tasdiqlandi: Ommaviy SAT');

    const reviews = await prisma.portfolioReview.findMany({ where: { itemId: { in: [a1.id, a2.id, b1.id] } } });
    expect(reviews).toHaveLength(3);
    const snapshot = reviews.find((review) => review.itemId === a2.id)!.snapshot as Record<string, unknown>;
    expect(snapshot).toMatchObject({
      type: 'NATIONAL_CERTIFICATE',
      date: '2026-05-20',
      details: { subject: 'Ona tili va adabiyot', grade: 'A+', score: 97 },
      visibility: 'STAFF',
      subjectName: null,
      evidenceFileName: null,
    });
    const audit = await prisma.auditEvent.count({
      where: { action: 'portfolio.approved', entityId: { in: [a1.id, a2.id, b1.id] } },
    });
    expect(audit).toBe(3);
  });

  it('qaytarishda sabab majburiy va bitta umumlashtirilgan xabar yuboriladi', async () => {
    const owner = fx.studentsA[2]!;
    const student = await login(app, owner.login);
    const items = [
      await submitted(student, { ...IELTS, title: 'Qaytarish 1' }),
      await submitted(student, { ...IELTS, title: 'Qaytarish 2' }),
    ];
    await homeroom
      .post('/api/portfolio/review-batch')
      .send({ itemIds: items.map((item) => item.id), decision: 'RETURNED' })
      .expect(400);
    const result = await homeroom
      .post('/api/portfolio/review-batch')
      .send({ itemIds: items.map((item) => item.id), decision: 'RETURNED', reason: 'TRF raqamini yozing' })
      .expect(200);
    expect(result.body).toMatchObject({ approved: 0, returned: 2, skipped: [] });
    const notice = await prisma.notification.findFirst({ where: { userId: owner.id }, orderBy: { createdAt: 'desc' } });
    expect(notice?.title).toBe('2 ta yozuv tuzatishga qaytarildi: TRF raqamini yozing');
    expect(notice?.type).toBe('PORTFOLIO_RETURNED');
  });

  it('ikki tekshiruvchi bir vaqtda bossa, faqat bittasi qo‘llanadi (409 NOT_PENDING)', async () => {
    const student = await login(app, fx.studentsA[0]!.login);
    const item = await submitted(student, { ...IELTS, title: 'Poyga' });
    const responses = await Promise.all([
      homeroom.post(`/api/portfolio/${item.id}/review`).send({ decision: 'APPROVED' }),
      deputy.post(`/api/portfolio/${item.id}/review`).send({ decision: 'RETURNED', reason: 'Boshqa qaror' }),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(responses.find((response) => response.status === 409)!.body.code).toBe('NOT_PENDING');
    expect(await prisma.portfolioReview.count({ where: { itemId: item.id } })).toBe(1);

    const late = await homeroom.post(`/api/portfolio/${item.id}/review`).send({ decision: 'APPROVED' });
    expect(late.status).toBe(409);
    expect(late.body.code).toBe('NOT_PENDING');

    // Ikki ommaviy qaror bir vaqtda: har yozuv faqat bir marta ko‘rib chiqiladi.
    const pair = [
      await submitted(student, { ...IELTS, title: 'Poyga 2' }),
      await submitted(student, { ...IELTS, title: 'Poyga 3' }),
    ].map((entry) => entry.id);
    const batches = await Promise.all([
      homeroom.post('/api/portfolio/review-batch').send({ itemIds: pair, decision: 'APPROVED' }),
      deputy.post('/api/portfolio/review-batch').send({ itemIds: pair, decision: 'APPROVED' }),
    ]);
    expect(batches.map((response) => response.status)).toEqual([200, 200]);
    expect(batches.reduce((sum, response) => sum + response.body.approved, 0)).toBe(2);
    expect(await prisma.portfolioReview.count({ where: { itemId: { in: pair } } })).toBe(2);
  });
});

describe('Rahbariyat uchun o‘quvchilar katalogi', () => {
  it('sinfdagi barcha o‘quvchilar (yozuvsizlari ham), hisoblar, nishonlar, filtr va saralash', async () => {
    const response = await deputy.get('/api/portfolio/students').query({ classId: fx.classA.id }).expect(200);
    expect(response.body.total).toBe(3);
    expect(response.body.items.map((row: { id: string }) => row.id).sort()).toEqual(
      fx.studentsA.map((student) => student.id).sort(),
    );
    const row = response.body.items.find((entry: { id: string }) => entry.id === fx.studentsA[2]!.id);
    expect(row).toMatchObject({ className: fx.classA.name, gradeLevel: 9, avatarUrl: null });
    expect(row.counts.approved).toBeGreaterThanOrEqual(2);
    expect(row.certificates).toBe(row.counts.approved);
    expect(row.highlights).toEqual(expect.arrayContaining(['IELTS 7.5', 'Milliy: Ona tili va adabiyot A+']));

    const drafts = await deputy.get('/api/portfolio/students').query({ classId: fx.classA.id }).expect(200);
    const withDraft = drafts.body.items.find((entry: { id: string }) => entry.id === fx.studentsA[2]!.id);
    expect(withDraft.counts.draft).toBeGreaterThanOrEqual(1);

    const sat = await deputy.get('/api/portfolio/students').query({ type: 'SAT', classId: fx.classB.id }).expect(200);
    expect(sat.body.items.map((entry: { id: string }) => entry.id)).toEqual([fx.studentsB[1]!.id]);

    const pending = await deputy
      .get('/api/portfolio/students')
      .query({ pending: 'true', classId: fx.classA.id })
      .expect(200);
    for (const entry of pending.body.items) expect(entry.counts.pending).toBeGreaterThan(0);

    const person = await prisma.user.findUniqueOrThrow({ where: { id: fx.studentsA[0]!.id } });
    const byName = await deputy.get('/api/portfolio/students').query({ q: person.firstName }).expect(200);
    expect(byName.body.items.map((entry: { id: string }) => entry.id)).toEqual([person.id]);
    const byId = await deputy.get('/api/portfolio/students').query({ q: String(person.internalId).padStart(6, '0') });
    expect(byId.body.items.map((entry: { id: string }) => entry.id)).toContain(person.id);

    const sorted = await deputy
      .get('/api/portfolio/students')
      .query({ classId: fx.classA.id, sort: 'approved', order: 'desc' })
      .expect(200);
    const approved = sorted.body.items.map((entry: { counts: { approved: number } }) => entry.counts.approved);
    expect([...approved].sort((a, b) => b - a)).toEqual(approved);

    const paged = await deputy
      .get('/api/portfolio/students')
      .query({ classId: fx.classA.id, sort: 'name', page: 2, pageSize: 2 })
      .expect(200);
    expect(paged.body).toMatchObject({ total: 3, page: 2, pageSize: 2 });
    expect(paged.body.items).toHaveLength(1);
    const beyond = await deputy
      .get('/api/portfolio/students')
      .query({ classId: fx.classA.id, page: 5, pageSize: 2 })
      .expect(200);
    expect(beyond.body).toMatchObject({ total: 3, items: [] });

    const grade = await deputy.get('/api/portfolio/students').query({ gradeLevel: 11 }).expect(200);
    expect(grade.body.items.every((entry: { gradeLevel: number }) => entry.gradeLevel === 11)).toBe(true);
  });

  it('sinf rahbari faqat o‘z sinfini ko‘radi, boshqalar ko‘rmaydi', async () => {
    const own = await homeroom.get('/api/portfolio/students').query({ pageSize: 200 }).expect(200);
    expect(own.body.items.every((entry: { classId: string }) => entry.classId === fx.classA.id)).toBe(true);
    expect(own.body.total).toBe(3);
    const foreign = await homeroom.get('/api/portfolio/students').query({ classId: fx.classB.id }).expect(200);
    expect(foreign.body).toMatchObject({ total: 0, items: [] });
    expect((await loneTeacher.get('/api/portfolio/students').expect(200)).body.total).toBe(0);
    expect((await subjectTeacher.get('/api/portfolio/students').expect(200)).body.total).toBe(0);
    const student = await login(app, fx.studentsA[0]!.login);
    await student.get('/api/portfolio/students').expect(403);

    const workbook = await deputy
      .get('/api/portfolio/students.xlsx')
      .query({ classId: fx.classA.id })
      .buffer(true)
      .parse(binaryParser)
      .expect(200);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(workbook.body as unknown as ArrayBuffer);
    expect(book.worksheets[0]!.rowCount).toBe(4);
  });
});

describe('Jamlangan portfolio', () => {
  it('rahbariyat va sinf rahbari qoralamalarsiz, fan o‘qituvchisi faqat ochiq tasdiqlanganlarni ko‘radi', async () => {
    const owner = fx.studentsA[2]!;
    const view = await deputy.get(`/api/portfolio/students/${owner.id}`).expect(200);
    expect(view.body.owner).toMatchObject({ id: owner.id, className: fx.classA.name, classId: fx.classA.id });
    expect(view.body.items.some((item: { status: string }) => item.status === 'DRAFT')).toBe(false);
    expect(view.body.counts.draft).toBeGreaterThanOrEqual(1);
    expect(view.body.canReview).toBe(true);
    expect(view.body.canExport).toBe(true);
    expect(view.body.byType.find((row: { type: string }) => row.type === 'IELTS').approved).toBeGreaterThanOrEqual(1);

    const student = await login(app, owner.login);
    const pending = await submitted(student, { ...IELTS, title: 'Jamlangan tekshiruv' });
    const withPending = await homeroom.get(`/api/portfolio/students/${owner.id}`).expect(200);
    const entry = withPending.body.pendingItems.find((item: { id: string }) => item.id === pending.id);
    expect(entry).toMatchObject({ changeKind: 'NEW', canReview: true });

    // Fan o‘qituvchisi: faqat “xodimlar” ko‘rinishidagi tasdiqlangan yozuvlar.
    await prisma.portfolioItem.updateMany({
      where: { ownerId: owner.id, status: 'APPROVED', title: 'Ommaviy 1' },
      data: { visibility: 'PRIVATE' },
    });
    const limited = await subjectTeacher.get(`/api/portfolio/students/${owner.id}`).expect(200);
    expect(limited.body.items.length).toBeGreaterThan(0);
    for (const item of limited.body.items) {
      expect(item.status).toBe('APPROVED');
      expect(item.visibility).toBe('STAFF');
    }
    expect(limited.body.pendingItems).toEqual([]);
    expect(limited.body.canReview).toBe(false);
    expect(limited.body.canExport).toBe(false);

    await otherHomeroom.get(`/api/portfolio/students/${owner.id}`).expect(404);
    await loneTeacher.get(`/api/portfolio/students/${owner.id}`).expect(404);
    const classmate = await login(app, fx.studentsA[0]!.login);
    await classmate.get(`/api/portfolio/students/${owner.id}`).expect(404);

    const own = await student.get(`/api/portfolio/students/${owner.id}`).expect(200);
    expect(own.body.items.some((item: { status: string }) => item.status === 'DRAFT')).toBe(true);
  });
});

describe('Sertifikatlar ZIP arxivi', () => {
  it('fayllar bo‘limlar bo‘yicha, ro‘yxat Excel fayli bilan; audit yoziladi; begonaga 404', async () => {
    const owner = fx.studentsB[2]!;
    const student = await login(app, owner.login);
    const ieltsFile = await upload(student, 'IELTS TRF.pdf');
    const olympiadFile = await upload(student, 'diplom.pdf');
    const poemFile = await upload(student, 'sher.pdf');
    const items = [
      await submitted(student, { ...IELTS, title: 'IELTS: Academic / 7.5', evidenceFileId: ieltsFile }),
      await submitted(student, {
        type: 'OLYMPIAD',
        title: 'Fizika olimpiadasi',
        level: 'REGION',
        details: { subject: 'Fizika', place: 'FIRST' },
        evidenceFileId: olympiadFile,
      }),
      await submitted(student, { type: 'POEM', title: 'Ko‘klam', evidenceFileId: poemFile }),
      await submitted(student, {
        type: 'SAT',
        title: 'SAT havola',
        details: { total: 1500 },
        evidenceUrl: 'https://example.org/sat',
      }),
    ];
    await deputy
      .post('/api/portfolio/review-batch')
      .send({ itemIds: items.slice(0, 3).map((item) => item.id), decision: 'APPROVED' })
      .expect(200);
    await createItem(student, { type: 'POEM', title: 'Qoralama (arxivga kirmaydi)', evidenceFileId: poemFile });

    const response = await deputy
      .get(`/api/portfolio/students/${owner.id}/evidence.zip`)
      .buffer(true)
      .parse(binaryParser)
      .expect(200);
    expect(response.headers['content-type']).toBe('application/zip');
    expect(response.headers['cache-control']).toBe('private, no-store');
    const person = await prisma.user.findUniqueOrThrow({ where: { id: owner.id } });
    const expectedName = `portfolio_${person.lastName}_${person.firstName}_${String(person.internalId).padStart(6, '0')}.zip`;
    expect(response.headers['content-disposition']).toContain(`filename*=UTF-8''${encodeURIComponent(expectedName)}`);

    const zip = await JSZip.loadAsync(response.body as Buffer);
    const names = Object.keys(zip.files).filter((name) => !zip.files[name]!.dir);
    expect(names).toHaveLength(4);
    expect(names).toContain('royxat.xlsx');
    expect(names).toContain('Sertifikatlar/01_IELTS_IELTS_Academic_7.5.pdf');
    expect(names).toContain('Olimpiadalar/02_Olimpiada_Fizika_olimpiadasi.pdf');
    expect(names).toContain("Ijodiy ishlar/03_She'r_Ko'klam.pdf");
    expect((await zip.file('Sertifikatlar/01_IELTS_IELTS_Academic_7.5.pdf')!.async('nodebuffer')).equals(PDF)).toBe(
      true,
    );

    const book = new ExcelJS.Workbook();
    await book.xlsx.load(await zip.file('royxat.xlsx')!.async('arraybuffer'));
    const sheet = book.worksheets[0]!;
    expect(sheet.rowCount).toBe(4);
    expect(String(sheet.getRow(2).getCell(4).value)).toContain('Umumiy ball (Overall): 7.5');

    const audit = await prisma.auditEvent.findFirst({
      where: { action: 'portfolio.evidence_exported', entityId: owner.id },
      orderBy: { id: 'desc' },
    });
    expect(audit?.data).toMatchObject({ ownerId: owner.id, count: 3, scope: 'approved' });

    // “Barchasi”: tekshiruvdagi SAT (faqat havola) ro‘yxatga kiradi, qoralama kirmaydi.
    const all = await otherHomeroom
      .get(`/api/portfolio/students/${owner.id}/evidence.zip`)
      .query({ scope: 'all' })
      .buffer(true)
      .parse(binaryParser)
      .expect(200);
    const allZip = await JSZip.loadAsync(all.body as Buffer);
    const allBook = new ExcelJS.Workbook();
    await allBook.xlsx.load(await allZip.file('royxat.xlsx')!.async('arraybuffer'));
    expect(allBook.worksheets[0]!.rowCount).toBe(5);

    await student.get(`/api/portfolio/students/${owner.id}/evidence.zip`).expect(200);
    await homeroom.get(`/api/portfolio/students/${owner.id}/evidence.zip`).expect(404);
    await subjectTeacher.get(`/api/portfolio/students/${owner.id}/evidence.zip`).expect(404);
    // Tasdiqlangan yozuvi yo‘q o‘quvchi — tushunarli xato.
    const empty = await deputy.get(`/api/portfolio/students/${fx.studentsB[0]!.id}/evidence.zip`).expect(400);
    expect(empty.body.code).toBe('NOTHING_TO_EXPORT');
  });
});

/** Kirish cheklovi (bir login uchun daqiqasiga bir necha marta) — pastdagi testlar sessiyani qayta ishlatadi. */
const sessions = new Map<string, Agent>();
async function sessionOf(loginName: string) {
  const existing = sessions.get(loginName);
  if (existing) return existing;
  const agent = await login(app, loginName);
  sessions.set(loginName, agent);
  return agent;
}

describe('Avvalgi shakldagi olimpiada yozuvlari', () => {
  it('details’siz saqlangan olimpiada tasdiq va natija matnini yo‘qotmasdan tahrirlanadi', async () => {
    const owner = fx.studentsA[0]!;
    const student = await sessionOf(owner.login);
    const legacy = await prisma.portfolioItem.create({
      data: {
        ownerId: owner.id,
        type: 'OLYMPIAD',
        title: 'Fizika olimpiadasi (viloyat)',
        subjectId: fx.subjectId,
        level: 'REGION',
        result: '2-o‘rin, diplom va 45 ball',
        status: 'APPROVED',
        reviewerId: fx.teacher.id,
        reviewedAt: new Date(),
        submittedAt: new Date(),
      },
    });
    const body = {
      type: 'OLYMPIAD',
      title: legacy.title,
      subjectId: fx.subjectId,
      level: 'REGION',
      result: legacy.result,
    };

    // Tavsif va ko‘rinish o‘zgarsa — tasdiq ham, natija matni ham saqlanadi.
    const kept = await student
      .put(`/api/portfolio/${legacy.id}`)
      .send({ ...body, description: 'Tavsif qo‘shildi', visibility: 'PRIVATE' })
      .expect(200);
    expect(kept.body).toMatchObject({
      status: 'APPROVED',
      result: '2-o‘rin, diplom va 45 ball',
      details: null,
      description: 'Tavsif qo‘shildi',
    });

    // Natija matnidagi xato tuzatilsa — qayta tekshiruv kerak, lekin details baribir majburiy emas.
    const fixed = await student
      .put(`/api/portfolio/${legacy.id}`)
      .send({ ...body, result: '2-o‘rin, diplom (45 ball)' })
      .expect(200);
    expect(fixed.body).toMatchObject({ status: 'DRAFT', result: '2-o‘rin, diplom (45 ball)', details: null });

    // Fan va o‘rin to‘ldirilsa — yangi shaklga o‘tadi, natija ulardan yoziladi.
    const upgraded = await student
      .put(`/api/portfolio/${legacy.id}`)
      .send({ ...body, details: { subject: 'Fizika', place: 'SECOND' } })
      .expect(200);
    expect(upgraded.body).toMatchObject({
      result: 'Fizika — 2-o‘rin',
      details: { subject: 'Fizika', place: 'SECOND' },
    });

    // Endi (va har qanday yangi olimpiadada) details majburiy.
    const again = await student.put(`/api/portfolio/${legacy.id}`).send(body);
    expect(again.status).toBe(400);
    expect(again.body).toMatchObject({
      code: 'VALIDATION_ERROR',
      details: [{ path: 'details.subject', message: 'Fanni kiriting' }],
    });
    const created = await student.post('/api/portfolio').send(body);
    expect(created.status).toBe(400);
    expect(created.body.details.map((issue: { path: string }) => issue.path)).toContain('details.subject');
    const poem = await createItem(student, { type: 'POEM', title: 'She’r (tur sinovi)' });
    const converted = await student
      .put(`/api/portfolio/${poem.id}`)
      .send({ type: 'OLYMPIAD', title: 'Olimpiada', level: 'SCHOOL' });
    expect(converted.status).toBe(400);
    expect(converted.body.details.map((issue: { path: string }) => issue.path)).toContain('details.subject');
  });
});

describe('Tekshiruvchi ko‘rgan versiya va bir vaqtdagi qarorlar', () => {
  it('ko‘rilgandan keyin tahrirlanib qayta yuborilgan yozuv eski ko‘rinish bo‘yicha tasdiqlanmaydi', async () => {
    const owner = fx.studentsA[0]!;
    const student = await sessionOf(owner.login);
    const item = await submitted(student, { ...IELTS, title: 'Versiya sinovi' });
    const queue = await homeroom.get('/api/portfolio/review-queue').query({ ownerId: owner.id }).expect(200);
    const seen = queue.body.find((row: { id: string }) => row.id === item.id).updatedAt as string;

    // Egasi shu orada natijani o‘zgartirib, qayta yuboradi.
    await student
      .put(`/api/portfolio/${item.id}`)
      .send({ ...IELTS, title: 'Versiya sinovi', details: { overall: 8 } })
      .expect(200);
    await student.post(`/api/portfolio/${item.id}/submit`).expect(200);

    const single = await homeroom
      .post(`/api/portfolio/${item.id}/review`)
      .send({ decision: 'APPROVED', updatedAt: seen });
    expect(single.status).toBe(409);
    expect(single.body.code).toBe('CHANGED_SINCE_VIEW');
    const batch = await homeroom
      .post('/api/portfolio/review-batch')
      .send({ itemIds: [item.id], decision: 'APPROVED', versions: { [item.id]: seen } })
      .expect(200);
    expect(batch.body).toEqual({ approved: 0, returned: 0, skipped: [{ id: item.id, reason: 'CHANGED' }] });
    expect((await prisma.portfolioItem.findUniqueOrThrow({ where: { id: item.id } })).status).toBe('SUBMITTED');
    expect(await prisma.portfolioReview.count({ where: { itemId: item.id } })).toBe(0);

    // Yangi holat ko‘rilgach — tasdiqlanadi.
    const fresh = await homeroom.get(`/api/portfolio/${item.id}`).expect(200);
    expect(fresh.body.result).toContain('IELTS 8');
    const approved = await homeroom
      .post(`/api/portfolio/${item.id}/review`)
      .send({ decision: 'APPROVED', updatedAt: fresh.body.updatedAt })
      .expect(200);
    expect(approved.body.status).toBe('APPROVED');
  });

  it('teskari tartibdagi bir vaqtdagi ommaviy qarorlar o‘zaro kutib qolmaydi: xato emas, “o‘tkazib yuborildi”', async () => {
    const student = await sessionOf(fx.studentsA[1]!.login);
    for (let round = 0; round < 4; round += 1) {
      const ids: string[] = [];
      for (let index = 0; index < 6; index += 1) {
        ids.push((await submitted(student, { ...IELTS, title: `Tartib ${round}-${index}` })).id);
      }
      const [first, second] = await Promise.all([
        deputy.post('/api/portfolio/review-batch').send({ itemIds: ids, decision: 'APPROVED' }),
        homeroom.post('/api/portfolio/review-batch').send({ itemIds: [...ids].reverse(), decision: 'APPROVED' }),
      ]);
      expect([first.status, second.status], JSON.stringify([first.body, second.body])).toEqual([200, 200]);
      expect(first.body.approved + second.body.approved).toBe(6);
      expect(first.body.skipped.length + second.body.skipped.length).toBe(6);
      expect(await prisma.portfolioReview.count({ where: { itemId: { in: ids } } })).toBe(6);
    }
  });
});

describe('Rahbariyat ro‘yxatlari', () => {
  it('“Barcha yozuvlar”da qoralamalar ko‘rinmaydi', async () => {
    const owner = fx.studentsA[0]!;
    const student = await sessionOf(owner.login);
    const draft = await createItem(student, { type: 'POEM', title: 'Maktab ro‘yxati qoralamasi' });
    const drafts = await deputy.get('/api/portfolio/school').query({ status: 'DRAFT' }).expect(200);
    expect(drafts.body).toMatchObject({ total: 0, items: [] });
    const all = await deputy.get('/api/portfolio/school').query({ ownerId: owner.id, pageSize: 200 }).expect(200);
    expect(all.body.items.length).toBeGreaterThan(0);
    expect(all.body.items.some((item: { status: string }) => item.status === 'DRAFT')).toBe(false);
    expect(all.body.items.some((item: { id: string }) => item.id === draft.id)).toBe(false);
  });

  it('bosh sahifadagi “tasdiqlash kutilmoqda” soni rahbarning o‘z yozuvlarini hisoblamaydi', async () => {
    const before = (await deputy.get('/api/dashboard/leadership').expect(200)).body.pending.portfolio as number;
    await submitted(deputy, { type: 'OPEN_LESSON', title: 'Rahbarning ochiq darsi' });
    const after = (await deputy.get('/api/dashboard/leadership').expect(200)).body.pending.portfolio as number;
    expect(after).toBe(before);
    expect(after).toBe(
      await prisma.portfolioItem.count({ where: { status: 'SUBMITTED', ownerId: { not: deputyId } } }),
    );
    const queue = await deputy.get('/api/portfolio/review-queue/students').expect(200);
    expect(queue.body.reduce((sum: number, row: { pending: number }) => sum + row.pending, 0)).toBe(after);
  });
});

describe('ZIP yuklab olish to‘xtatilganda', () => {
  it('fayllar navbat bilan ochiladi va mijoz uzilganda hammasi yopiladi', async () => {
    const owner = await createUser(prisma, ['STUDENT']);
    const student = await login(app, owner.login);
    // Bitta katta fayl ko‘p yozuvda: arxiv socket buferlariga sig‘maydi, yozish to‘xtab turadi.
    const big = Buffer.concat([PDF, Buffer.alloc(3 * 1024 * 1024, 0x20)]);
    const uploaded = await student
      .post('/api/files')
      .attach('file', big, { filename: 'katta.pdf', contentType: 'application/pdf' })
      .expect(201);
    for (let index = 0; index < 12; index += 1) {
      await createItem(student, {
        type: 'CERTIFICATE',
        title: `Katta fayl ${index}`,
        evidenceFileId: uploaded.body.id,
      });
    }

    const root = join(resolve(app.get(AppConfig).storageDir), 'files');
    const openFiles = () =>
      readdirSync('/proc/self/fd').filter((fd) => {
        try {
          return readlinkSync(`/proc/self/fd/${fd}`).startsWith(root);
        } catch {
          return false;
        }
      }).length;
    const settle = async (expected: number) => {
      for (let attempt = 0; attempt < 60 && openFiles() !== expected; attempt += 1) await delay(50);
      return openFiles();
    };
    const base = openFiles();

    const session = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ login: owner.login, password: PASSWORD })
      .expect(200);
    const cookie = (session.headers['set-cookie'] as unknown as string[])
      .map((entry) => entry.split(';')[0])
      .join('; ');
    const server = http.createServer(app.getHttpAdapter().getInstance());
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    try {
      const { port } = server.address() as AddressInfo;
      const during = await new Promise<number>((done, fail) => {
        const req = http.get(
          {
            host: '127.0.0.1',
            port,
            path: `/api/portfolio/students/${owner.id}/evidence.zip?scope=all`,
            headers: { cookie },
          },
          (res) => {
            if (res.statusCode !== 200) {
              fail(new Error(`HTTP ${res.statusCode}`));
              return;
            }
            res.once('data', () => {
              const count = openFiles();
              req.destroy();
              done(count);
            });
          },
        );
        req.on('error', () => undefined);
      });
      // Bir vaqtda ko‘pi bilan bitta fayl (almashish paytida — ikkita) ochiq.
      expect(during).toBeLessThanOrEqual(2);
      expect(await settle(base)).toBe(base);
    } finally {
      server.closeAllConnections();
      await new Promise((done) => server.close(done));
    }

    // To‘liq yuklab olish ham ochiq fayl qoldirmaydi.
    const full = await student
      .get(`/api/portfolio/students/${owner.id}/evidence.zip`)
      .query({ scope: 'all' })
      .buffer(true)
      .parse(binaryParser)
      .expect(200);
    const zip = await JSZip.loadAsync(full.body as Buffer);
    const certificates = Object.keys(zip.files).filter((name) => name.includes('_Katta_fayl_'));
    expect(certificates).toHaveLength(12);
    expect(await settle(base)).toBe(base);
  });
});
