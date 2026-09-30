/**
 * Rahbariyatning “O‘quvchilar” bo‘limi: o‘quvchilar tartibi (11 → 7), filtrlar, sinflar va sinf
 * rahbari, o‘quvchi profili, JSHSHIRni ko‘rish (audit) va hujjat bo‘yicha ma’lumotlarni tuzatish.
 */
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { checkPinfl, maskPinfl, userSearchText, type Role } from '@ijod/shared';
import request from 'supertest';
import { PinflVault } from '../src/common/pinfl-vault.js';
import type { Prisma } from '../src/generated/prisma/client.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import { createApp, createUser, currentYear, login, suffix } from './helpers.js';

let app: INestApplication;
let prisma: PrismaService;
let vault: PinflVault;

type Agent = Awaited<ReturnType<typeof login>>;
type User = Awaited<ReturnType<typeof createUser>>;

const tag = suffix();
const TAG = tag.toUpperCase();
/** Faqat harflardan iborat belgi (ism maydonlari raqamni qabul qilmaydi). */
const word = tag.replace(/\d/g, (digit) => 'ghijklmnop'.charAt(Number(digit)));
/** Shu fayldagi o‘quvchilarni boshqa test ma’lumotlaridan ajratadigan qidiruv so‘zi. */
const marker = `Belgi${word}`;
const DAY = 24 * 60 * 60 * 1000;

/** Sinov uchun to‘g‘ri JSHSHIR: jins/asr, sana (KKOOYY), hudud, tartib raqami va nazorat raqami. */
function pinflFor(birthDate: string, female: boolean, serial: number) {
  const [year, month, day] = birthDate.split('-') as [string, string, string];
  const century = Number(year) >= 2000 ? (female ? 6 : 5) : female ? 4 : 3;
  const body = `${century}${day}${month}${year.slice(2)}262${String(serial).padStart(3, '0')}`;
  const weights = [7, 3, 1];
  const sum = [...body].reduce((total, digit, index) => total + Number(digit) * weights[index % 3]!, 0);
  const pinfl = `${body}${sum % 10}`;
  if (!checkPinfl(pinfl, birthDate).ok) throw new Error(`JSHSHIR noto‘g‘ri yasaldi: ${pinfl}`);
  return pinfl;
}

async function makeStudent(
  person: { lastName: string; firstName: string; middleName?: string | null },
  extra: Prisma.UserUpdateInput = {},
) {
  const user = await createUser(prisma, ['STUDENT'], { lastName: person.lastName, firstName: person.firstName });
  const middleName = person.middleName === undefined ? marker : person.middleName;
  return prisma.user.update({
    where: { id: user.id },
    data: { middleName, searchText: userSearchText({ ...person, middleName, login: user.login }), ...extra },
  });
}

async function agentFor(roles: Role[]) {
  const user = await createUser(prisma, roles);
  return { user, agent: await login(app, user.login) };
}

let deputy: Agent;
let year: Awaited<ReturnType<typeof currentYear>>;
const classes = {} as Record<'c11A' | 'c11B' | 'c10D' | 'c9A' | 'c7D' | 'archived' | 'previous', { id: string; name: string }>;
const teachers = {} as Record<'t1' | 't2' | 'off' | 'pending' | 'deputyOnly', User>;
const students = {} as Record<
  'anvar' | 'bobur' | 'sardor' | 'jasur' | 'nilufar' | 'madina' | 'temur' | 'eldor',
  User
>;
const sardorPinfl = pinflFor('2009-05-14', false, 101);

beforeAll(async () => {
  ({ app, prisma } = await createApp());
  vault = app.get(PinflVault);
  year = await currentYear(prisma);
  deputy = await login(app, (await createUser(prisma, ['DEPUTY'])).login);

  teachers.t1 = await createUser(prisma, ['TEACHER'], { lastName: `Rahbar${word}`, firstName: 'Birinchi' });
  teachers.t2 = await createUser(prisma, ['TEACHER'], { lastName: `Rahbar${word}`, firstName: 'Ikkinchi' });
  teachers.off = await createUser(prisma, ['TEACHER']);
  await prisma.user.update({ where: { id: teachers.off.id }, data: { status: 'DEACTIVATED' } });
  teachers.pending = await createUser(prisma, ['TEACHER']);
  await prisma.user.update({
    where: { id: teachers.pending.id },
    data: { status: 'PENDING', registrationSource: 'SELF' },
  });
  teachers.deputyOnly = await createUser(prisma, ['DEPUTY']);

  const makeClass = async (gradeLevel: number, section: string, data: Partial<Prisma.ClassUncheckedCreateInput> = {}) => {
    const created = await prisma.class.create({
      data: {
        academicYearId: year.id,
        gradeLevel,
        section: `${section}${TAG}`,
        name: `${gradeLevel}-${section}${TAG}`,
        ...data,
      },
    });
    return { id: created.id, name: created.name };
  };
  classes.c11A = await makeClass(11, 'A', { homeroomTeacherId: teachers.t1.id });
  classes.c11B = await makeClass(11, 'B');
  classes.c10D = await makeClass(10, 'D');
  classes.c9A = await makeClass(9, 'A');
  classes.c7D = await makeClass(7, 'D');
  classes.archived = await makeClass(8, 'A', { archivedAt: new Date() });
  const previousYear = await prisma.academicYear.create({
    data: {
      name: `2025–2026 ${tag}`,
      startsOn: new Date('2025-09-02'),
      endsOn: new Date('2026-05-25'),
      isCurrent: false,
    },
  });
  classes.previous = await makeClass(10, 'B', { academicYearId: previousYear.id });

  const enroll = (studentId: string, classId: string, endsOn?: Date) =>
    prisma.enrollment.create({
      data: {
        studentId,
        classId,
        academicYearId: year.id,
        startsOn: year.startsOn,
        endsOn: endsOn ?? null,
        endReason: endsOn ? 'LEFT' : null,
      },
    });

  students.bobur = await makeStudent({ lastName: 'Aliyev', firstName: 'Bobur' });
  students.anvar = await makeStudent({ lastName: 'Aliyev', firstName: 'Anvar' });
  students.sardor = await makeStudent(
    { lastName: 'Botirov', firstName: 'Sardor' },
    {
      registrationSource: 'SELF',
      createdAt: new Date(Date.now() - 3 * DAY),
      birthDate: new Date('2009-05-14'),
      birthYear: 2009,
      ...vault.fields(sardorPinfl),
    },
  );
  students.jasur = await makeStudent({ lastName: 'Valiyev', firstName: 'Jasur' }, { status: 'DEACTIVATED' });
  students.nilufar = await makeStudent({ lastName: 'G‘ulomova', firstName: 'Nilufar' });
  students.madina = await makeStudent(
    { lastName: 'Zokirova', firstName: 'Madina' },
    { registrationSource: 'SELF', createdAt: new Date(Date.now() - 40 * DAY) },
  );
  students.temur = await makeStudent({ lastName: 'Qodirov', firstName: 'Temur' });
  students.eldor = await makeStudent({ lastName: 'Hamidov', firstName: 'Eldor' });

  await enroll(students.anvar.id, classes.c11A.id);
  await enroll(students.bobur.id, classes.c11A.id);
  await enroll(students.sardor.id, classes.c11B.id);
  await enroll(students.jasur.id, classes.c10D.id);
  await enroll(students.nilufar.id, classes.c9A.id);
  await enroll(students.madina.id, classes.c7D.id);
  // Eldor 9-A dan ketgan: joriy sinfi yo‘q.
  await enroll(students.eldor.id, classes.c9A.id, new Date('2026-09-20'));

  const item = (status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'RETURNED', type: 'POEM' | 'NATIONAL_CERTIFICATE') =>
    prisma.portfolioItem.create({ data: { ownerId: students.anvar.id, type, title: `${type} ${status}`, status } });
  await item('APPROVED', 'NATIONAL_CERTIFICATE');
  await item('APPROVED', 'POEM');
  await item('SUBMITTED', 'POEM');
  await item('DRAFT', 'POEM');
  await item('RETURNED', 'POEM');
});

afterAll(async () => {
  await app.close();
});

const listMine = (agent: Agent, params: Record<string, string | number> = {}) =>
  agent.get('/api/management/students').query({ q: marker, ...params });

const namesOf = (body: { items: { fullName: string }[] }) => body.items.map((item) => item.fullName);

// ---------------------------------------------------------------- Ruxsatlar

describe('Ruxsatlar', () => {
  it('o‘qituvchi, o‘quvchi va administrator bo‘limga kira olmaydi; kirmagan — 401', async () => {
    const someId = students.anvar.id;
    for (const roles of [['TEACHER'], ['STUDENT'], ['ADMIN']] as Role[][]) {
      const { agent } = await agentFor(roles);
      await agent.get('/api/management/students').expect(403);
      await agent.get(`/api/management/students/${someId}`).expect(403);
      await agent.get(`/api/management/students/${students.sardor.id}/pinfl`).expect(403);
      await agent.patch(`/api/management/students/${someId}/identity`).send({ firstName: 'Buzilgan' }).expect(403);
      await agent.get('/api/management/classes').expect(403);
      await agent.get(`/api/management/classes/${classes.c11A.id}`).expect(403);
      await agent
        .put(`/api/management/classes/${classes.c11B.id}/homeroom`)
        .send({ teacherId: teachers.t1.id })
        .expect(403);
    }
    await request(app.getHttpServer()).get('/api/management/students').expect(401);
    // Hech narsa o‘zgarmagan.
    expect((await prisma.class.findUniqueOrThrow({ where: { id: classes.c11B.id } })).homeroomTeacherId).toBeNull();
    expect((await prisma.user.findUniqueOrThrow({ where: { id: someId } })).firstName).toBe('Anvar');
  });

  it('o‘qituvchi ham bo‘lgan direktor o‘rinbosari kira oladi', async () => {
    const { agent } = await agentFor(['TEACHER', 'DEPUTY']);
    await agent.get('/api/management/students').expect(200);
    await agent.get('/api/management/classes').expect(200);
  });

  it('noma’lum yoki o‘quvchi bo‘lmagan ID — 404', async () => {
    for (const id of [randomUUID(), teachers.t1.id]) {
      await deputy.get(`/api/management/students/${id}`).expect(404);
      await deputy.get(`/api/management/students/${id}/pinfl`).expect(404);
      await deputy.patch(`/api/management/students/${id}/identity`).send({ firstName: 'Ali' }).expect(404);
    }
    await deputy.get(`/api/management/classes/${randomUUID()}`).expect(404);
    await deputy.put(`/api/management/classes/${randomUUID()}/homeroom`).send({ teacherId: null }).expect(404);
    await deputy.get('/api/management/students/not-a-uuid').expect(404);
  });
});

// ---------------------------------------------------------------- Ro‘yxat

describe('Barcha o‘quvchilar', () => {
  it('11-sinfdan 7-sinfgacha, parallel A → B → D, ism bo‘yicha; sinfsizlar oxirida', async () => {
    const response = await listMine(deputy).expect(200);
    expect(namesOf(response.body)).toEqual([
      `Aliyev Anvar ${marker}`,
      `Aliyev Bobur ${marker}`,
      `Botirov Sardor ${marker}`,
      `Valiyev Jasur ${marker}`,
      `G‘ulomova Nilufar ${marker}`,
      `Zokirova Madina ${marker}`,
      `Hamidov Eldor ${marker}`,
      `Qodirov Temur ${marker}`,
    ]);
    expect(response.body.total).toBe(8);
    expect(response.body.groups).toEqual([
      { classId: classes.c11A.id, count: 2 },
      { classId: classes.c11B.id, count: 1 },
      { classId: classes.c10D.id, count: 1 },
      { classId: classes.c9A.id, count: 1 },
      { classId: classes.c7D.id, count: 1 },
      { classId: null, count: 2 },
    ]);

    const anvar = response.body.items[0];
    expect(anvar).toMatchObject({
      id: students.anvar.id,
      internalId: students.anvar.internalId,
      lastName: 'Aliyev',
      firstName: 'Anvar',
      middleName: marker,
      avatarUrl: null,
      classId: classes.c11A.id,
      className: classes.c11A.name,
      gradeLevel: 11,
      section: `A${TAG}`,
      homeroomTeacher: { id: teachers.t1.id, fullName: `Rahbar${word} Birinchi` },
      status: 'ACTIVE',
      registrationSource: 'ADMIN',
      lastLoginAt: null,
      birthDate: null,
      login: students.anvar.login,
      portfolio: { approved: 2, pending: 1 },
    });
    expect(Date.parse(anvar.createdAt)).not.toBeNaN();

    const sardor = response.body.items[2];
    expect(sardor).toMatchObject({ birthDate: '2009-05-14', registrationSource: 'SELF', homeroomTeacher: null });
    const eldor = response.body.items[6];
    expect(eldor).toMatchObject({ classId: null, className: null, gradeLevel: null, section: null });
  });

  it('butun maktab ro‘yxatida ham 11-sinflar yuqorida, sinfsizlar pastda', async () => {
    const response = await deputy.get('/api/management/students').query({ pageSize: 1000 }).expect(200);
    const grades = response.body.items.map((item: { gradeLevel: number | null }) => item.gradeLevel ?? 0);
    expect(grades).toEqual([...grades].sort((a: number, b: number) => b - a));
    expect(response.body.items.map((item: { id: string }) => item.id)).toEqual(
      expect.arrayContaining(Object.values(students).map((student) => student.id)),
    );
  });

  it('filtrlar: sinf, parallel, holat, manba, sinfsiz, login va ichki ID', async () => {
    const byClass = await deputy.get('/api/management/students').query({ classId: classes.c11A.id }).expect(200);
    expect(namesOf(byClass.body)).toEqual([`Aliyev Anvar ${marker}`, `Aliyev Bobur ${marker}`]);

    const byGrade = await listMine(deputy, { gradeLevel: 11 }).expect(200);
    expect(byGrade.body.total).toBe(3);

    const deactivated = await listMine(deputy, { status: 'DEACTIVATED' }).expect(200);
    expect(namesOf(deactivated.body)).toEqual([`Valiyev Jasur ${marker}`]);

    const self = await listMine(deputy, { source: 'SELF' }).expect(200);
    expect(namesOf(self.body)).toEqual([`Botirov Sardor ${marker}`, `Zokirova Madina ${marker}`]);

    const noClass = await listMine(deputy, { noClass: 'true' }).expect(200);
    expect(namesOf(noClass.body)).toEqual([`Hamidov Eldor ${marker}`, `Qodirov Temur ${marker}`]);
    const withClass = await listMine(deputy, { noClass: 'false' }).expect(200);
    expect(withClass.body.total).toBe(6);

    const byLogin = await deputy.get('/api/management/students').query({ q: students.sardor.login }).expect(200);
    expect(byLogin.body.items.map((item: { id: string }) => item.id)).toEqual([students.sardor.id]);

    const byInternalId = await deputy
      .get('/api/management/students')
      .query({ q: String(students.sardor.internalId) })
      .expect(200);
    expect(byInternalId.body.items.map((item: { id: string }) => item.id)).toContain(students.sardor.id);

    await deputy.get('/api/management/students').query({ status: 'NOPE' }).expect(400);
    await deputy.get('/api/management/students').query({ classId: 'abc' }).expect(400);
  });

  it('sahifalash: guruh sonlari butun natija bo‘yicha, sahifa tashqarisida jami son saqlanadi', async () => {
    const second = await listMine(deputy, { pageSize: 2, page: 2 }).expect(200);
    expect(namesOf(second.body)).toEqual([`Botirov Sardor ${marker}`, `Valiyev Jasur ${marker}`]);
    expect(second.body).toMatchObject({ total: 8, page: 2, pageSize: 2 });
    expect(second.body.groups).toEqual([
      { classId: classes.c11B.id, count: 1 },
      { classId: classes.c10D.id, count: 1 },
    ]);
    const first = await listMine(deputy, { pageSize: 1 }).expect(200);
    expect(first.body.groups).toEqual([{ classId: classes.c11A.id, count: 2 }]);

    const beyond = await listMine(deputy, { pageSize: 2, page: 50 }).expect(200);
    expect(beyond.body).toMatchObject({ items: [], total: 8 });
  });
});

// ---------------------------------------------------------------- Sinflar

describe('Sinflar', () => {
  it('joriy o‘quv yili sinflari: 11 → 7, o‘quvchilar va yangi ro‘yxatdan o‘tganlar soni, sinf rahbari', async () => {
    const response = await deputy.get('/api/management/classes').expect(200);
    const list = response.body as { id: string; gradeLevel: number }[];
    const index = (id: string) => list.findIndex((item) => item.id === id);
    const order = [classes.c11A, classes.c11B, classes.c10D, classes.c9A, classes.c7D].map((item) => index(item.id));
    expect(order.every((position) => position >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    // Arxivlangan va o‘tgan o‘quv yili sinflari ko‘rinmaydi.
    expect(index(classes.archived.id)).toBe(-1);
    expect(index(classes.previous.id)).toBe(-1);
    const grades = list.map((item) => item.gradeLevel);
    expect(grades).toEqual([...grades].sort((a, b) => b - a));

    const card = (id: string) => list.find((item) => item.id === id);
    expect(card(classes.c11A.id)).toEqual({
      id: classes.c11A.id,
      name: classes.c11A.name,
      gradeLevel: 11,
      section: `A${TAG}`,
      studentCount: 2,
      newStudentCount: 0,
      homeroomTeacher: { id: teachers.t1.id, fullName: `Rahbar${word} Birinchi`, avatarUrl: null },
    });
    expect(card(classes.c11B.id)).toMatchObject({ studentCount: 1, newStudentCount: 1, homeroomTeacher: null });
    // 40 kun oldin ro‘yxatdan o‘tgan — “yangi” emas; ketgan o‘quvchi sanalmaydi.
    expect(card(classes.c7D.id)).toMatchObject({ studentCount: 1, newStudentCount: 0 });
    expect(card(classes.c9A.id)).toMatchObject({ studentCount: 1 });
  });

  it('sinf sahifasi: sarlavha, o‘quv yili va faol o‘quvchilar (ism tartibida)', async () => {
    const response = await deputy.get(`/api/management/classes/${classes.c11A.id}`).expect(200);
    expect(response.body).toMatchObject({
      id: classes.c11A.id,
      name: classes.c11A.name,
      gradeLevel: 11,
      studentCount: 2,
      newStudentCount: 0,
      archivedAt: null,
      academicYear: { id: year.id, name: year.name, isCurrent: true },
      homeroomTeacher: { id: teachers.t1.id },
    });
    expect(response.body.students.map((item: { id: string }) => item.id)).toEqual([
      students.anvar.id,
      students.bobur.id,
    ]);
    expect(response.body.students[0]).toEqual({
      id: students.anvar.id,
      fullName: `Aliyev Anvar ${marker}`,
      avatarUrl: null,
      login: students.anvar.login,
      status: 'ACTIVE',
      registrationSource: 'ADMIN',
      createdAt: students.anvar.createdAt.toISOString(),
      birthDate: null,
      portfolio: { approved: 2, pending: 1 },
    });

    const nineA = await deputy.get(`/api/management/classes/${classes.c9A.id}`).expect(200);
    expect(nineA.body.students.map((item: { id: string }) => item.id)).toEqual([students.nilufar.id]);

    const elevenB = await deputy.get(`/api/management/classes/${classes.c11B.id}`).expect(200);
    expect(elevenB.body.newStudentCount).toBe(1);
    expect(elevenB.body.students[0]).toMatchObject({ birthDate: '2009-05-14', registrationSource: 'SELF' });

    const previous = await deputy.get(`/api/management/classes/${classes.previous.id}`).expect(200);
    expect(previous.body.academicYear.isCurrent).toBe(false);
  });
});

// ---------------------------------------------------------------- Sinf rahbari

describe('Sinf rahbarini tayinlash', () => {
  const put = (classId: string, teacherId: string | null) =>
    deputy.put(`/api/management/classes/${classId}/homeroom`).send({ teacherId });
  const notificationsOf = (userId: string) =>
    prisma.notification.findMany({ where: { userId, type: 'HOMEROOM_ASSIGNED' }, orderBy: { createdAt: 'asc' } });
  const auditsOf = (classId: string) =>
    prisma.auditEvent.findMany({
      where: { action: 'class.homeroom_changed', entityType: 'Class', entityId: classId },
      orderBy: { id: 'asc' },
    });

  it('tayinlaydi: sinf yangilanadi, o‘qituvchiga bildirishnoma, auditda oldin/keyin', async () => {
    const response = await put(classes.c11B.id, teachers.t2.id).expect(200);
    expect(response.body).toMatchObject({
      id: classes.c11B.id,
      name: classes.c11B.name,
      studentCount: 1,
      newStudentCount: 1,
      homeroomTeacher: { id: teachers.t2.id, fullName: `Rahbar${word} Ikkinchi`, avatarUrl: null },
      alsoHomeroomOf: [],
    });
    const stored = await prisma.class.findUniqueOrThrow({ where: { id: classes.c11B.id } });
    expect(stored.homeroomTeacherId).toBe(teachers.t2.id);

    const notes = await notificationsOf(teachers.t2.id);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({
      title: `Siz ${classes.c11B.name} sinf rahbari etib tayinlandingiz`,
      link: `/teacher/classes/${classes.c11B.id}`,
    });

    const audits = await auditsOf(classes.c11B.id);
    expect(audits).toHaveLength(1);
    expect(audits[0]!.data).toMatchObject({
      className: classes.c11B.name,
      before: null,
      after: { id: teachers.t2.id, name: `Rahbar${word} Ikkinchi` },
    });

    // Xuddi shu o‘qituvchini qayta tayinlash — o‘zgarish yo‘q, takroriy bildirishnoma ham yo‘q.
    await put(classes.c11B.id, teachers.t2.id).expect(200);
    expect(await notificationsOf(teachers.t2.id)).toHaveLength(1);
    expect(await auditsOf(classes.c11B.id)).toHaveLength(1);
  });

  it('boshqa sinfga ham rahbar bo‘lsa — ruxsat, javobda ogohlantirish', async () => {
    const response = await put(classes.c10D.id, teachers.t1.id).expect(200);
    expect(response.body.homeroomTeacher.id).toBe(teachers.t1.id);
    expect(response.body.alsoHomeroomOf).toEqual([{ id: classes.c11A.id, name: classes.c11A.name }]);
  });

  it('almashtiradi va olib tashlaydi', async () => {
    const replaced = await put(classes.c11A.id, teachers.t2.id).expect(200);
    expect(replaced.body.homeroomTeacher.id).toBe(teachers.t2.id);
    expect(replaced.body.alsoHomeroomOf).toEqual([{ id: classes.c11B.id, name: classes.c11B.name }]);
    expect(await notificationsOf(teachers.t2.id)).toHaveLength(2);
    const [change] = await auditsOf(classes.c11A.id);
    expect(change!.data).toMatchObject({
      before: { id: teachers.t1.id, name: `Rahbar${word} Birinchi` },
      after: { id: teachers.t2.id },
    });

    const cleared = await put(classes.c11A.id, null).expect(200);
    expect(cleared.body).toMatchObject({ homeroomTeacher: null, alsoHomeroomOf: [] });
    expect((await prisma.class.findUniqueOrThrow({ where: { id: classes.c11A.id } })).homeroomTeacherId).toBeNull();
    const audits = await auditsOf(classes.c11A.id);
    expect(audits).toHaveLength(2);
    expect(audits[1]!.data).toMatchObject({ before: { id: teachers.t2.id }, after: null });
    expect(await notificationsOf(teachers.t2.id)).toHaveLength(2);

    const list = await listMine(deputy, { classId: classes.c11A.id }).expect(200);
    expect(list.body.items[0].homeroomTeacher).toBeNull();
  });

  it('faqat faol o‘qituvchi; arxivlangan va o‘tgan yil sinfi — 409', async () => {
    for (const person of [students.anvar, teachers.off, teachers.pending, teachers.deputyOnly]) {
      const response = await put(classes.c9A.id, person.id).expect(400);
      expect(response.body.code).toBe('NOT_A_TEACHER');
    }
    expect((await put(classes.c9A.id, randomUUID()).expect(400)).body.code).toBe('NOT_A_TEACHER');
    await deputy.put(`/api/management/classes/${classes.c9A.id}/homeroom`).send({}).expect(400);
    await deputy.put(`/api/management/classes/${classes.c9A.id}/homeroom`).send({ teacherId: 'abc' }).expect(400);
    expect((await put(classes.archived.id, teachers.t1.id).expect(409)).body.code).toBe('CLASS_ARCHIVED');
    expect((await put(classes.previous.id, teachers.t1.id).expect(409)).body.code).toBe('NOT_CURRENT_YEAR');
    expect((await prisma.class.findUniqueOrThrow({ where: { id: classes.c9A.id } })).homeroomTeacherId).toBeNull();
  });
});

// ---------------------------------------------------------------- Profil va JSHSHIR

describe('O‘quvchi profili', () => {
  it('hujjat ma’lumotlari, hisob, joriy sinf, sinflar tarixi va portfolio', async () => {
    const response = await deputy.get(`/api/management/students/${students.sardor.id}`).expect(200);
    expect(response.headers['cache-control']).toContain('no-store');
    expect(response.body).toMatchObject({
      id: students.sardor.id,
      internalId: students.sardor.internalId,
      lastName: 'Botirov',
      firstName: 'Sardor',
      middleName: marker,
      fullName: `Botirov Sardor ${marker}`,
      avatarUrl: null,
      birthDate: '2009-05-14',
      birthYear: 2009,
      pinflMasked: maskPinfl(sardorPinfl),
      hasPinfl: true,
      login: students.sardor.login,
      status: 'ACTIVE',
      statusReason: null,
      registrationSource: 'SELF',
      lastLoginAt: null,
      mustChangePassword: false,
      locked: false,
      currentClass: {
        id: classes.c11B.id,
        name: classes.c11B.name,
        gradeLevel: 11,
        homeroomTeacher: { id: teachers.t2.id, fullName: `Rahbar${word} Ikkinchi`, avatarUrl: null },
      },
      enrollments: [
        {
          classId: classes.c11B.id,
          className: classes.c11B.name,
          academicYear: year.name,
          startsOn: year.startsOn.toISOString().slice(0, 10),
          endsOn: null,
          endReason: null,
        },
      ],
      portfolio: { approved: 0, pending: 0, certificates: 0 },
      manageable: true,
    });
    expect(JSON.stringify(response.body)).not.toContain(sardorPinfl);

    const anvar = await deputy.get(`/api/management/students/${students.anvar.id}`).expect(200);
    expect(anvar.body).toMatchObject({
      pinflMasked: null,
      hasPinfl: false,
      portfolio: { approved: 2, pending: 1, certificates: 1 },
    });

    const eldor = await deputy.get(`/api/management/students/${students.eldor.id}`).expect(200);
    expect(eldor.body.currentClass).toBeNull();
    expect(eldor.body.enrollments).toEqual([
      expect.objectContaining({ classId: classes.c9A.id, endsOn: '2026-09-20', endReason: 'LEFT' }),
    ]);

    await prisma.user.update({
      where: { id: students.temur.id },
      data: { lockedUntil: new Date(Date.now() + 60_000), mustChangePassword: true },
    });
    const temur = await deputy.get(`/api/management/students/${students.temur.id}`).expect(200);
    expect(temur.body).toMatchObject({ locked: true, mustChangePassword: true, currentClass: null });
  });

  it('JSHSHIR faqat alohida so‘rovda to‘liq ko‘rinadi va har ko‘rish auditga yoziladi', async () => {
    const before = await prisma.auditEvent.count({
      where: { action: 'user.pinfl_viewed', entityId: students.sardor.id },
    });
    const response = await deputy.get(`/api/management/students/${students.sardor.id}/pinfl`).expect(200);
    expect(response.body).toEqual({ pinfl: sardorPinfl });
    expect(response.headers['cache-control']).toContain('no-store');
    const events = await prisma.auditEvent.findMany({
      where: { action: 'user.pinfl_viewed', entityId: students.sardor.id },
    });
    expect(events).toHaveLength(before + 1);
    expect(JSON.stringify(events.map((event) => event.data))).not.toContain(sardorPinfl);

    // JSHSHIRi yo‘q o‘quvchi — 404.
    await deputy.get(`/api/management/students/${students.anvar.id}/pinfl`).expect(404);

    // Ro‘yxat, sinf sahifasi va profilda raqam ochiq ko‘rinmaydi.
    const everywhere = [
      await listMine(deputy),
      await deputy.get('/api/management/students').query({ pageSize: 1000 }),
      await deputy.get(`/api/management/classes/${classes.c11B.id}`),
      await deputy.get(`/api/management/students/${students.sardor.id}`),
    ];
    for (const result of everywhere) {
      expect(result.status).toBe(200);
      expect(JSON.stringify(result.body)).not.toContain(sardorPinfl);
    }
  });
});

// ---------------------------------------------------------------- Shaxsiy ma’lumotlarni tuzatish

describe('Hujjat bo‘yicha ma’lumotlarni tuzatish', () => {
  let student: User;
  let other: User;
  const otherPinfl = pinflFor('2012-01-09', true, 302);
  const patch = (body: Record<string, unknown>, id = student.id) =>
    deputy.patch(`/api/management/students/${id}/identity`).send(body);
  const identityAudits = (id: string) =>
    prisma.auditEvent.findMany({ where: { action: 'user.identity_updated', entityId: id }, orderBy: { id: 'asc' } });

  beforeAll(async () => {
    student = await makeStudent({ lastName: 'Tuzatish', firstName: 'Kamila', middleName: null });
    other = await makeStudent(
      { lastName: 'Boshqa', firstName: 'Laylo' },
      { birthDate: new Date('2012-01-09'), birthYear: 2012, ...vault.fields(otherPinfl) },
    );
  });

  it('ismlarni hujjatdagidek yagona ko‘rinishga keltiradi va qidiruv matnini yangilaydi', async () => {
    const response = await patch({
      lastName: `  o'rinboyeva-${word} `,
      firstName: 'KAMOLA',
      middleName: "baxtiyor QIZI",
    }).expect(200);
    const lastName = `O‘rinboyeva-${word.charAt(0).toUpperCase()}${word.slice(1)}`;
    expect(response.body).toMatchObject({ lastName, firstName: 'Kamola', middleName: 'Baxtiyor qizi' });

    const found = await deputy.get('/api/management/students').query({ q: `o‘rinboyeva-${word}` }).expect(200);
    expect(found.body.items.map((item: { id: string }) => item.id)).toEqual([student.id]);

    const audits = await identityAudits(student.id);
    expect(audits).toHaveLength(1);
    expect(audits[0]!.data).toEqual({ fields: ['lastName', 'firstName', 'middleName'] });

    // O‘zgarishsiz so‘rov auditga yozilmaydi.
    await patch({ firstName: 'Kamola' }).expect(200);
    expect(await identityAudits(student.id)).toHaveLength(1);
  });

  it('JSHSHIR tug‘ilgan sanaga mos bo‘lsa saqlanadi (shifrlangan), yashirin ko‘rinishda qaytadi', async () => {
    const pinfl = pinflFor('2011-03-14', true, 207);
    const response = await patch({ birthDate: '2011-03-14', pinfl: `${pinfl.slice(0, 7)} ${pinfl.slice(7)}` }).expect(
      200,
    );
    expect(response.body).toMatchObject({
      birthDate: '2011-03-14',
      birthYear: 2011,
      hasPinfl: true,
      pinflMasked: maskPinfl(pinfl),
    });
    expect(JSON.stringify(response.body)).not.toContain(pinfl);
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: student.id } });
    expect(stored.pinflEncrypted).not.toContain(pinfl);
    expect(vault.open(stored.pinflEncrypted!)).toBe(pinfl);
    expect(stored.pinflHash).toBe(vault.hash(pinfl));

    const audits = await identityAudits(student.id);
    expect(audits.at(-1)!.data).toEqual({ fields: ['birthDate', 'pinfl'] });
    expect(JSON.stringify(audits.map((event) => event.data))).not.toContain(pinfl);

    // Faqat familiya yuborilsa: otasining ismi ham, JSHSHIR ham o‘zgarmaydi.
    const renamed = await patch({ lastName: 'Aliyeva' }).expect(200);
    expect(renamed.body).toMatchObject({ lastName: 'Aliyeva', middleName: 'Baxtiyor qizi', hasPinfl: true });
    expect((await deputy.get(`/api/management/students/${student.id}/pinfl`).expect(200)).body.pinfl).toBe(pinfl);
  });

  it('JSHSHIR va tug‘ilgan sana mos kelmasa — 400; boshqa hisobdagi JSHSHIR — 409', async () => {
    // Saqlangan sana bilan solishtiriladi.
    const stale = await patch({ pinfl: pinflFor('2010-01-01', true, 208) }).expect(400);
    expect(stale.body.code).toBe('PINFL_MISMATCH');
    expect(stale.body.details).toEqual([{ path: 'pinfl', message: expect.any(String) }]);

    // So‘rovning o‘zida sana va JSHSHIR mos emas.
    const invalid = await patch({ birthDate: '2011-03-15', pinfl: pinflFor('2011-03-14', true, 209) }).expect(400);
    expect(invalid.body.code).toBe('VALIDATION_ERROR');
    expect(invalid.body.details[0].path).toBe('pinfl');

    // Sana o‘zgartirilsa, saqlangan JSHSHIR bilan solishtiriladi.
    const date = await patch({ birthDate: '2011-03-15' }).expect(400);
    expect(date.body).toMatchObject({ code: 'PINFL_MISMATCH', details: [{ path: 'birthDate' }] });
    expect((await patch({ birthDate: null }).expect(400)).body.code).toBe('BIRTH_DATE_REQUIRED');

    // Nazorat raqami noto‘g‘ri.
    const checksum = pinflFor('2011-03-14', true, 210);
    const broken = `${checksum.slice(0, 13)}${(Number(checksum.charAt(13)) + 1) % 10}`;
    expect((await patch({ pinfl: broken }).expect(400)).body.details[0].path).toBe('pinfl');

    const taken = await patch({ birthDate: '2012-01-09', pinfl: otherPinfl }).expect(409);
    expect(taken.body.code).toBe('PINFL_TAKEN');
    expect(JSON.stringify(taken.body)).not.toContain(otherPinfl);

    await patch({ lastName: 'Иванова' }).expect(400);
    await patch({ lastName: 'A1' }).expect(400);

    // Hech biri saqlanmagan.
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: student.id } });
    expect(stored.birthDate?.toISOString().slice(0, 10)).toBe('2011-03-14');
    expect(stored.lastName).toBe('Aliyeva');
    const audits = await identityAudits(student.id);
    expect(audits.at(-1)!.data).toEqual({ fields: ['lastName'] });
  });

  it('JSHSHIR o‘chiriladi (tug‘ilganlik haqidagi guvohnoma bilan o‘qiydigan o‘quvchi)', async () => {
    const response = await patch({ pinfl: null }).expect(200);
    expect(response.body).toMatchObject({ hasPinfl: false, pinflMasked: null, birthDate: '2011-03-14' });
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: student.id } });
    expect(stored).toMatchObject({ pinflEncrypted: null, pinflHash: null });
    await deputy.get(`/api/management/students/${student.id}/pinfl`).expect(404);
    expect((await identityAudits(student.id)).at(-1)!.data).toEqual({ fields: ['pinfl'] });

    // Endi tug‘ilgan sanani o‘chirish mumkin.
    const cleared = await patch({ birthDate: null }).expect(200);
    expect(cleared.body).toMatchObject({ birthDate: null, birthYear: null });
  });

  it('boshqa o‘quvchining JSHSHIRi — tegilmagan', async () => {
    const response = await deputy.get(`/api/management/students/${other.id}/pinfl`).expect(200);
    expect(response.body.pinfl).toBe(otherPinfl);
  });
});
