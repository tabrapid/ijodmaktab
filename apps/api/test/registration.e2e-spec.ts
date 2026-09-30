import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PinflVault } from '../src/common/pinfl-vault.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import { createApp, createUser, currentYear, login, suffix } from './helpers.js';

let app: INestApplication;
let prisma: PrismaService;
let vault: PinflVault;

type Agent = ReturnType<typeof request.agent>;
type Named = { id: string; name: string };

const tag = suffix().toUpperCase();
let year: { id: string; startsOn: Date };
let classes: { a11: Named; b11: Named; d9: Named; a7: Named; archived: Named; previous: Named };
let subjects: { algebra: Named; biology: Named; inactive: Named };
let deputies: { id: string; login: string }[];
let offDeputy: { id: string };
let deputy: Agent;

const PASSWORD = 'Parol2026';
/** Testlarda ishlatilgan barcha JSHSHIRlar — oxirida hech qayerda ochiq ko‘rinmasligi tekshiriladi. */
const usedPinfls: string[] = [];
/** Ochiq manzillardan kelgan barcha javoblar matni. */
const responses: string[] = [];

// Har bir so‘rov alohida IP dan: tezlik cheklovi boshqa testlarga xalaqit bermasin.
let ipCounter = 0;
const nextIp = () => {
  ipCounter += 1;
  return `10.77.${Math.floor(ipCounter / 250)}.${(ipCounter % 250) + 1}`;
};

const http = () => request(app.getHttpServer());

async function send(path: string, body: object, agent: Agent = request.agent(app.getHttpServer())) {
  const response = await agent.post(path).set('X-Forwarded-For', nextIp()).send(body);
  responses.push(response.text);
  return response;
}

async function get(path: string) {
  const response = await http().get(path).set('X-Forwarded-For', nextIp());
  responses.push(response.text);
  return response;
}

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';
const word = (length = 7) => Array.from({ length }, () => LETTERS[Math.floor(Math.random() * 26)]).join('');
const personName = () => {
  const value = word();
  return value.charAt(0).toUpperCase() + value.slice(1);
};

/** To‘g‘ri JSHSHIR: asr va jins belgisi, KKOOYY, 6 ta raqam va 7-3-1 nazorat raqami. */
function makePinfl(birthDate: string) {
  const [yearPart, month, day] = birthDate.split('-') as [string, string, string];
  const century = Number(yearPart) >= 2000 ? '5' : '3';
  const serial = String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0');
  const body = `${century}${day}${month}${yearPart.slice(2)}${serial}`;
  const weights = [7, 3, 1];
  const sum = [...body].reduce((total, digit, index) => total + Number(digit) * weights[index % 3]!, 0);
  const pinfl = `${body}${sum % 10}`;
  usedPinfls.push(pinfl);
  return pinfl;
}

function studentBody(overrides: Record<string, unknown> = {}) {
  return {
    lastName: `${personName()}ov`,
    firstName: personName(),
    middleName: null,
    birthDate: '2011-05-12',
    pinfl: null,
    classId: classes.a11.id,
    login: `${word()}.${word(5)}`,
    password: PASSWORD,
    confirmPassword: PASSWORD,
    ...overrides,
  };
}

function teacherBody(overrides: Record<string, unknown> = {}) {
  return {
    lastName: `${personName()}ova`,
    firstName: personName(),
    middleName: `${personName()} qizi`,
    birthYear: 1985,
    specialtySubjectId: subjects.algebra.id,
    login: `${word()}.${word(5)}`,
    password: PASSWORD,
    confirmPassword: PASSWORD,
    ...overrides,
  };
}

const fieldPaths = (body: { details?: { path: string }[] }) => (body.details ?? []).map((item) => item.path);

beforeAll(async () => {
  ({ app, prisma } = await createApp());
  vault = app.get(PinflVault);
  const current = await currentYear(prisma);
  year = { id: current.id, startsOn: current.startsOn };
  const previousYear = await prisma.academicYear.create({
    data: {
      name: `2025–2026 ${tag}`,
      startsOn: new Date('2025-09-02'),
      endsOn: new Date('2026-05-25'),
      isCurrent: false,
    },
  });
  const makeClass = async (
    gradeLevel: number,
    section: string,
    options: { archived?: boolean; yearId?: string } = {},
  ) => {
    const created = await prisma.class.create({
      data: {
        academicYearId: options.yearId ?? year.id,
        gradeLevel,
        section: `${section}${tag}`,
        name: `${gradeLevel}-${section}${tag}`,
        archivedAt: options.archived ? new Date() : null,
      },
    });
    return { id: created.id, name: created.name };
  };
  // Ataylab aralash tartibda yaratiladi: javobda 11 → 7 va A → D tartibi tekshiriladi.
  const a7 = await makeClass(7, 'A');
  const d9 = await makeClass(9, 'D');
  const b11 = await makeClass(11, 'B');
  const a11 = await makeClass(11, 'A');
  const archived = await makeClass(10, 'A', { archived: true });
  const previous = await makeClass(8, 'A', { yearId: previousYear.id });
  classes = { a11, b11, d9, a7, archived, previous };

  const makeSubject = async (name: string, isActive = true) => {
    const created = await prisma.subject.create({ data: { name: `${name} ${tag}`, isActive } });
    return { id: created.id, name: created.name };
  };
  subjects = {
    biology: await makeSubject('Reg Biologiya'),
    algebra: await makeSubject('Reg Algebra'),
    inactive: await makeSubject('Reg Chizmachilik', false),
  };

  deputies = [await createUser(prisma, ['DEPUTY']), await createUser(prisma, ['DEPUTY'])];
  offDeputy = await createUser(prisma, ['DEPUTY']);
  await prisma.user.update({ where: { id: offDeputy.id }, data: { status: 'DEACTIVATED' } });
  deputy = await login(app, deputies[0]!.login);
});

afterAll(async () => {
  await app.close();
});

describe('Ro‘yxatdan o‘tish sahifasi ma’lumotlari', () => {
  it('faqat joriy o‘quv yilining arxivlanmagan sinflari (11 → 7, A → D) va faol fanlar', async () => {
    const response = await get('/api/registration/options');
    expect(response.status).toBe(200);
    const { school, student, teacher } = response.body as {
      school: { name: string };
      student: { open: boolean; classes: { id: string; name: string; gradeLevel: number; section: string }[] };
      teacher: { open: boolean; subjects: Named[] };
    };
    expect(typeof school.name).toBe('string');
    expect(student.open).toBe(true);
    expect(teacher.open).toBe(true);

    const mine = student.classes.filter((item) => item.name.endsWith(tag));
    expect(mine.map((item) => item.name)).toEqual([
      classes.a11.name,
      classes.b11.name,
      classes.d9.name,
      classes.a7.name,
    ]);
    expect(Object.keys(mine[0]!).sort()).toEqual(['gradeLevel', 'id', 'name', 'section']);
    const grades = student.classes.map((item) => item.gradeLevel);
    expect(grades).toEqual([...grades].sort((a, b) => b - a));
    const ids = student.classes.map((item) => item.id);
    expect(ids).not.toContain(classes.archived.id);
    expect(ids).not.toContain(classes.previous.id);

    const names = teacher.subjects.map((item) => item.name);
    expect(names).toContain(subjects.algebra.name);
    expect(names).not.toContain(subjects.inactive.name);
    expect(names.indexOf(subjects.algebra.name)).toBeLessThan(names.indexOf(subjects.biology.name));
    expect(Object.keys(teacher.subjects[0]!).sort()).toEqual(['id', 'name']);
  });

  it('login bandligini tekshiradi va bo‘sh variant taklif qiladi', async () => {
    const base = `${word()}.band`;
    const first = await createUser(prisma, ['STUDENT']);
    const second = await createUser(prisma, ['STUDENT']);
    await prisma.user.update({ where: { id: first.id }, data: { login: base } });
    await prisma.user.update({ where: { id: second.id }, data: { login: `${base}2` } });

    const taken = await get(`/api/registration/login-available?login=${encodeURIComponent(base.toUpperCase())}`);
    expect(taken.status).toBe(200);
    expect(taken.body).toEqual({ available: false, suggestion: `${base}3` });
    const numbered = await get(`/api/registration/login-available?login=${base}2`);
    expect(numbered.body).toEqual({ available: false, suggestion: `${base}3` });
    const free = await get(`/api/registration/login-available?login=${base}.yangi`);
    expect(free.body).toEqual({ available: true });
    const invalid = await get('/api/registration/login-available?login=a');
    expect(invalid.status).toBe(400);
    expect(invalid.body.code).toBe('VALIDATION_ERROR');
  });
});

describe('O‘quvchining o‘zi ro‘yxatdan o‘tishi', () => {
  it('ism normallashtiriladi, sinfga biriktiriladi va darhol tizimga kiradi', async () => {
    const agent = request.agent(app.getHttpServer());
    const pinfl = makePinfl('2011-05-12');
    const loginName = `alisher.${word()}`;
    const response = await send(
      '/api/registration/student',
      {
        lastName: "  ABDUG'ANIYEV ",
        firstName: 'aLISHER',
        middleName: "baxtiyor  o'g'li",
        birthDate: '2011-05-12',
        pinfl: `${pinfl.slice(0, 4)} ${pinfl.slice(4, 8)} ${pinfl.slice(8, 12)} ${pinfl.slice(12)}`,
        classId: classes.b11.id,
        login: ` ${loginName.toUpperCase()} `,
        password: PASSWORD,
        confirmPassword: PASSWORD,
      },
      agent,
    );
    expect(response.status).toBe(201);
    const cookie = (response.headers['set-cookie'] as unknown as string[] | undefined)?.[0] ?? '';
    expect(cookie).toMatch(/^ijod_sid=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(response.body).toMatchObject({
      login: loginName,
      lastName: 'Abdug‘aniyev',
      firstName: 'Alisher',
      middleName: 'Baxtiyor o‘g‘li',
      fullName: 'Abdug‘aniyev Alisher Baxtiyor o‘g‘li',
      roles: ['STUDENT'],
      realm: 'SCHOOL',
      mustChangePassword: false,
    });
    const id = response.body.id as string;

    const me = await agent.get('/api/auth/me').expect(200);
    expect(me.body).toMatchObject({ id, login: loginName, mustChangePassword: false });
    // Vaqtinchalik parol yo‘q: o‘quvchi sahifalari darhol ochiq.
    await agent.get('/api/me/sessions').expect(200);

    const user = await prisma.user.findUniqueOrThrow({
      where: { id },
      include: { roles: true, enrollments: true },
    });
    expect(user).toMatchObject({
      status: 'ACTIVE',
      registrationSource: 'SELF',
      mustChangePassword: false,
      birthYear: 2011,
      lastName: 'Abdug‘aniyev',
    });
    expect(user.roles.map((item) => item.role)).toEqual(['STUDENT']);
    expect(user.birthDate?.toISOString().slice(0, 10)).toBe('2011-05-12');
    expect(user.pinflHash).toBe(vault.hash(pinfl));
    expect(user.pinflEncrypted).not.toContain(pinfl);
    expect(vault.open(user.pinflEncrypted!)).toBe(pinfl);
    expect(user.searchText).toContain('alisher');
    expect(user.enrollments).toHaveLength(1);
    expect(user.enrollments[0]).toMatchObject({ classId: classes.b11.id, academicYearId: year.id, endsOn: null });
    expect(user.enrollments[0]!.startsOn.getTime()).toBeGreaterThanOrEqual(year.startsOn.getTime());

    const audit = await prisma.auditEvent.findFirstOrThrow({ where: { action: 'user.registered', entityId: id } });
    expect(audit.actorId).toBe(id);
    expect(audit.data).toEqual({ role: 'STUDENT', login: loginName, classId: classes.b11.id });
    expect(JSON.stringify(response.body)).not.toContain(pinfl);
  });

  it('noto‘g‘ri ma’lumotlarda maydon bo‘yicha xato qaytaradi', async () => {
    const valid = makePinfl('2011-05-12');
    const badChecksum = `${valid.slice(0, 13)}${(Number(valid.charAt(13)) + 1) % 10}`;
    const cases: [Record<string, unknown>, string][] = [
      [{ lastName: 'Валиев' }, 'lastName'],
      [{ firstName: 'Ali2' }, 'firstName'],
      [{ pinfl: badChecksum }, 'pinfl'],
      [{ pinfl: makePinfl('2010-01-03') }, 'pinfl'],
      [{ confirmPassword: 'Boshqa2026' }, 'confirmPassword'],
      [{ password: 'faqatharf', confirmPassword: 'faqatharf' }, 'password'],
      [{ birthDate: '2024-01-01' }, 'birthDate'],
      [{ login: 'a b' }, 'login'],
      [{ classId: 'sinf' }, 'classId'],
    ];
    for (const [override, path] of cases) {
      const body = studentBody(override);
      const response = await send('/api/registration/student', body);
      expect(response.status, JSON.stringify(override)).toBe(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
      expect(fieldPaths(response.body), JSON.stringify(override)).toContain(path);
      expect(await prisma.user.count({ where: { login: body.login } })).toBe(0);
    }
  });

  it('band login, band JSHSHIR va takroriy shaxs rad etiladi', async () => {
    const first = studentBody({ pinfl: makePinfl('2012-03-04'), birthDate: '2012-03-04' });
    const created = await send('/api/registration/student', first);
    expect(created.status).toBe(201);

    const sameLogin = await send('/api/registration/student', studentBody({ login: first.login.toUpperCase() }));
    expect(sameLogin.status).toBe(409);
    expect(sameLogin.body.code).toBe('LOGIN_TAKEN');
    expect(sameLogin.body.details).toEqual({ suggestion: `${first.login}2` });

    const samePinfl = await send(
      '/api/registration/student',
      studentBody({ pinfl: first.pinfl, birthDate: first.birthDate }),
    );
    expect(samePinfl.status).toBe(409);
    expect(samePinfl.body).toMatchObject({
      code: 'PINFL_TAKEN',
      message:
        'Bu JSHSHIR bilan hisob allaqachon mavjud. Login yoki parolni unutgan bo‘lsangiz, direktor o‘rinbosariga murojaat qiling.',
    });

    // Xuddi shu odam: ism boshqa yozilishda, JSHSHIRsiz, boshqa login bilan.
    const samePerson = await send(
      '/api/registration/student',
      studentBody({
        lastName: first.lastName.toUpperCase(),
        firstName: ` ${first.firstName.toLowerCase()} `,
        middleName: 'Rustam o‘g‘li',
        birthDate: first.birthDate,
      }),
    );
    expect(samePerson.status).toBe(409);
    expect(samePerson.body.code).toBe('DUPLICATE_PERSON');
    expect(samePerson.body.message).toContain('direktor o‘rinbosariga murojaat qiling');

    // Faolsizlantirilgan (bloklangan) hisob keyingi ro‘yxatdan o‘tishga to‘sqinlik qilmaydi.
    await deputy
      .post(`/api/users/${created.body.id}/status`)
      .send({ status: 'DEACTIVATED', reason: 'Soxta ro‘yxatdan o‘tish' })
      .expect(200);
    const retry = await send(
      '/api/registration/student',
      studentBody({ lastName: first.lastName, firstName: first.firstName, birthDate: first.birthDate }),
    );
    expect(retry.status).toBe(201);
  });

  it('arxivlangan, o‘tgan yilgi yoki mavjud bo‘lmagan sinfga yozilib bo‘lmaydi', async () => {
    for (const classId of [classes.archived.id, classes.previous.id, '0199a0a0-0000-7000-8000-00000000abcd']) {
      const body = studentBody({ classId });
      const response = await send('/api/registration/student', body);
      expect(response.status).toBe(400);
      expect(response.body.code).toBe('INVALID_CLASS');
      expect(fieldPaths(response.body)).toEqual(['classId']);
      expect(await prisma.user.count({ where: { login: body.login } })).toBe(0);
    }
  });

  it('tizimga kirgan foydalanuvchi yangi hisob ocha olmaydi', async () => {
    const student = await createUser(prisma, ['STUDENT']);
    const agent = await login(app, student.login);
    const response = await send('/api/registration/student', studentBody(), agent);
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('ALREADY_AUTHENTICATED');
    const teacher = await send('/api/registration/teacher', teacherBody(), agent);
    expect(teacher.body.code).toBe('ALREADY_AUTHENTICATED');
  });
});

describe('O‘qituvchining ro‘yxatdan o‘tishi va tasdiqlash', () => {
  it('ariza “tasdiq kutilmoqda”, o‘rinbosarlarga xabar, tasdiqlangach kira oladi', async () => {
    const body = teacherBody();
    const response = await send('/api/registration/teacher', body);
    expect(response.status).toBe(201);
    expect(response.body).toEqual({ status: 'PENDING' });
    expect(response.headers['set-cookie']).toBeUndefined();

    const user = await prisma.user.findUniqueOrThrow({ where: { login: body.login }, include: { roles: true } });
    const fullName = `${body.lastName} ${body.firstName} ${body.middleName}`;
    expect(user).toMatchObject({
      status: 'PENDING',
      registrationSource: 'SELF',
      mustChangePassword: false,
      birthYear: 1985,
      birthDate: null,
      specialtySubjectId: subjects.algebra.id,
      pinflHash: null,
    });
    expect(user.roles.map((item) => item.role)).toEqual(['TEACHER']);

    for (const item of deputies) {
      const notes = await prisma.notification.findMany({ where: { userId: item.id, type: 'REGISTRATION_PENDING' } });
      expect(notes).toContainEqual(
        expect.objectContaining({
          title: `Yangi o‘qituvchi ro‘yxatdan o‘tdi: ${fullName}`,
          body: subjects.algebra.name,
          link: '/management/registrations',
        }),
      );
    }
    expect(await prisma.notification.count({ where: { userId: offDeputy.id } })).toBe(0);
    const registered = await prisma.auditEvent.findFirstOrThrow({
      where: { action: 'user.registered', entityId: user.id },
    });
    expect(registered.data).toMatchObject({ role: 'TEACHER', login: body.login });

    // Noto‘g‘ri parolda hisob holati oshkor bo‘lmaydi.
    const wrong = await http().post('/api/auth/login').send({ login: body.login, password: 'Notogri2026' });
    expect(wrong.status).toBe(401);
    expect(wrong.body.code).toBe('INVALID_CREDENTIALS');
    const pending = await http().post('/api/auth/login').send({ login: body.login, password: PASSWORD });
    expect(pending.status).toBe(403);
    expect(pending.body).toMatchObject({
      code: 'ACCOUNT_PENDING',
      message: 'Hisobingiz direktor o‘rinbosari tasdig‘ini kutmoqda. Tasdiqlangach kira olasiz.',
    });

    const list = await deputy.get('/api/registrations').query({ view: 'pending' }).expect(200);
    expect(list.body.counts.pending).toBeGreaterThanOrEqual(1);
    expect(list.body.items).toContainEqual({
      id: user.id,
      fullName,
      birthYear: 1985,
      specialtySubject: subjects.algebra,
      status: 'PENDING',
      createdAt: expect.any(String),
      approvedAt: null,
      approvedBy: null,
      manageable: true,
      login: body.login,
    });

    const approved = await deputy.post(`/api/registrations/${user.id}/approve`).expect(200);
    expect(approved.body).toMatchObject({ id: user.id, status: 'ACTIVE' });
    const again = await deputy.post(`/api/registrations/${user.id}/approve`);
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('NOT_PENDING');

    const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(stored).toMatchObject({ status: 'ACTIVE', approvedById: deputies[0]!.id });
    expect(stored.approvedAt).toBeInstanceOf(Date);
    const agent = await login(app, body.login, PASSWORD);
    await agent.get('/api/auth/me').expect(200);
    const note = await prisma.notification.findFirstOrThrow({ where: { userId: user.id, type: 'ACCOUNT_APPROVED' } });
    expect(note.title).toBe('Hisobingiz tasdiqlandi');
    const audit = await prisma.auditEvent.findFirstOrThrow({
      where: { action: 'user.registration_approved', entityId: user.id },
    });
    expect(audit.actorId).toBe(deputies[0]!.id);

    const teachers = await deputy.get('/api/registrations').query({ view: 'teachers' }).expect(200);
    expect(teachers.body.items).toContainEqual(
      expect.objectContaining({
        id: user.id,
        status: 'ACTIVE',
        approvedBy: { id: deputies[0]!.id, fullName: expect.any(String) },
        approvedAt: expect.any(String),
      }),
    );
  });

  it('rad etilgan ariza: hisob o‘chiriladi, audit yozuvlari saqlanadi', async () => {
    const body = teacherBody({ middleName: null, specialtySubjectId: subjects.biology.id });
    await send('/api/registration/teacher', body).then((response) => expect(response.status).toBe(201));
    const user = await prisma.user.findUniqueOrThrow({ where: { login: body.login } });
    // Tasdiqlanmagan hisobga kirish urinishlari o‘chirishga to‘sqinlik qilmaydi.
    await http().post('/api/auth/login').send({ login: body.login, password: 'Notogri2026' }).expect(401);
    await http().post('/api/auth/login').send({ login: body.login, password: PASSWORD }).expect(403);

    const rejected = await deputy
      .post(`/api/registrations/${user.id}/reject`)
      .send({ reason: 'Maktabimizda ishlamaydi' })
      .expect(200);
    expect(rejected.body).toEqual({ ok: true });
    expect(await prisma.user.findUnique({ where: { id: user.id } })).toBeNull();

    const audit = await prisma.auditEvent.findFirstOrThrow({
      where: { action: 'user.registration_rejected', entityId: user.id },
    });
    expect(audit.actorId).toBe(deputies[0]!.id);
    expect(audit.data).toEqual({
      login: body.login,
      fullName: `${body.lastName} ${body.firstName}`,
      role: 'TEACHER',
      reason: 'Maktabimizda ishlamaydi',
    });
    expect(await prisma.auditEvent.count({ where: { action: 'user.registered', entityId: user.id } })).toBe(1);
    expect(
      await prisma.auditEvent.count({ where: { action: 'auth.login_failed', entityId: user.id, actorId: null } }),
    ).toBe(2);

    expect((await deputy.post(`/api/registrations/${user.id}/reject`).send({})).status).toBe(404);
    expect((await deputy.post(`/api/registrations/${user.id}/approve`)).status).toBe(404);
    // Login yana bo‘sh.
    expect((await get(`/api/registration/login-available?login=${body.login}`)).body).toEqual({ available: true });
  });

  it('faol hisobni tasdiqlash yoki rad etib bo‘lmaydi', async () => {
    const student = await createUser(prisma, ['STUDENT']);
    for (const action of ['approve', 'reject']) {
      const response = await deputy.post(`/api/registrations/${student.id}/${action}`).send({});
      expect(response.status).toBe(409);
      expect(response.body.code).toBe('NOT_PENDING');
    }
    expect(await prisma.user.count({ where: { id: student.id } })).toBe(1);
  });

  it('nofaol fan, band login va takroriy ariza rad etiladi', async () => {
    const inactive = await send('/api/registration/teacher', teacherBody({ specialtySubjectId: subjects.inactive.id }));
    expect(inactive.status).toBe(400);
    expect(inactive.body.code).toBe('INVALID_SUBJECT');
    expect(fieldPaths(inactive.body)).toEqual(['specialtySubjectId']);

    const first = teacherBody();
    expect((await send('/api/registration/teacher', first)).status).toBe(201);
    const sameLogin = await send('/api/registration/teacher', teacherBody({ login: first.login }));
    expect(sameLogin.body.code).toBe('LOGIN_TAKEN');
    const duplicate = await send(
      '/api/registration/teacher',
      teacherBody({ lastName: first.lastName, firstName: first.firstName.toUpperCase(), middleName: null }),
    );
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.code).toBe('DUPLICATE_PERSON');

    const invalid = await send('/api/registration/teacher', teacherBody({ birthYear: 2020, lastName: 'Иванов' }));
    expect(invalid.status).toBe(400);
    expect(fieldPaths(invalid.body)).toEqual(expect.arrayContaining(['birthYear', 'lastName']));
  });
});

describe('Rahbariyat: ruxsatlar va sozlamalar', () => {
  it('o‘qituvchi, o‘quvchi va administrator ro‘yxatdan o‘tganlar bo‘limiga kira olmaydi', async () => {
    const body = teacherBody();
    expect((await send('/api/registration/teacher', body)).status).toBe(201);
    const pendingUser = await prisma.user.findUniqueOrThrow({ where: { login: body.login } });
    const endpoints: ['get' | 'put' | 'post', string, object?][] = [
      ['get', '/api/registrations'],
      ['get', '/api/registrations?view=students'],
      ['get', '/api/registrations/settings'],
      ['put', '/api/registrations/settings', { studentRegistrationOpen: false }],
      ['post', `/api/registrations/${pendingUser.id}/approve`],
      ['post', `/api/registrations/${pendingUser.id}/reject`, { reason: 'x' }],
    ];
    for (const roles of [['TEACHER'], ['STUDENT'], ['ADMIN']] as const) {
      const user = await createUser(prisma, [...roles]);
      const agent = await login(app, user.login);
      for (const [method, path, payload] of endpoints) {
        const response = await agent[method](path).send(payload ?? {});
        expect(response.status, `${roles[0]} ${method} ${path}`).toBe(403);
      }
    }
    for (const [method, path, payload] of endpoints) {
      expect(
        (
          await http()
            [method](path)
            .send(payload ?? {})
        ).status,
      ).toBe(401);
    }
    const unchanged = await prisma.user.findUniqueOrThrow({ where: { id: pendingUser.id } });
    expect(unchanged.status).toBe('PENDING');
    expect((await deputy.get('/api/registrations/settings').expect(200)).body).toEqual({
      studentRegistrationOpen: true,
      teacherRegistrationOpen: true,
    });
  });

  it('o‘rinbosar ro‘yxatdan o‘tishni alohida yopadi va ochadi', async () => {
    try {
      const closed = await deputy
        .put('/api/registrations/settings')
        .send({ studentRegistrationOpen: false })
        .expect(200);
      expect(closed.body).toEqual({ studentRegistrationOpen: false, teacherRegistrationOpen: true });
      let options = await get('/api/registration/options');
      expect(options.body.student).toEqual({ open: false, classes: [] });
      expect(options.body.teacher.open).toBe(true);
      expect(options.body.teacher.subjects.length).toBeGreaterThan(0);
      const student = await send('/api/registration/student', studentBody());
      expect(student.status).toBe(403);
      expect(student.body.code).toBe('REGISTRATION_CLOSED');

      await deputy.put('/api/registrations/settings').send({ teacherRegistrationOpen: false }).expect(200);
      options = await get('/api/registration/options');
      expect(options.body.teacher).toEqual({ open: false, subjects: [] });
      const teacher = await send('/api/registration/teacher', teacherBody());
      expect(teacher.status).toBe(403);
      expect(teacher.body.code).toBe('REGISTRATION_CLOSED');

      const empty = await deputy.put('/api/registrations/settings').send({});
      expect(empty.status).toBe(400);
    } finally {
      await deputy
        .put('/api/registrations/settings')
        .send({ studentRegistrationOpen: true, teacherRegistrationOpen: true })
        .expect(200);
    }
    const reopened = await get('/api/registration/options');
    expect(reopened.body.student.open).toBe(true);
    const events = await prisma.auditEvent.findMany({
      where: { action: 'school.registration_settings' },
      orderBy: { id: 'asc' },
    });
    expect(events.length).toBeGreaterThanOrEqual(3);
    expect(events[0]!.data).toEqual({
      before: { studentRegistrationOpen: true, teacherRegistrationOpen: true },
      after: { studentRegistrationOpen: false, teacherRegistrationOpen: true },
    });
    expect(events[0]!.actorId).toBe(deputies[0]!.id);
  });

  it('yangi o‘quvchilar ro‘yxati: sinf, tug‘ilgan sana va JSHSHIR bor-yo‘qligi, JSHSHIRning o‘zi emas', async () => {
    const pinfl = makePinfl('2010-11-30');
    const body = studentBody({ birthDate: '2010-11-30', pinfl, classId: classes.d9.id });
    const created = await send('/api/registration/student', body);
    expect(created.status).toBe(201);
    const list = await deputy
      .get('/api/registrations')
      .query({ view: 'students', days: 30, pageSize: 200 })
      .expect(200);
    expect(list.text).not.toContain(pinfl);
    expect(list.body.items[0].createdAt >= list.body.items.at(-1).createdAt).toBe(true);
    expect(list.body.items).toContainEqual({
      id: created.body.id,
      fullName: `${body.lastName} ${body.firstName}`,
      classId: classes.d9.id,
      className: classes.d9.name,
      birthDate: '2010-11-30',
      hasPinfl: true,
      status: 'ACTIVE',
      createdAt: expect.any(String),
      manageable: true,
      login: body.login,
    });
    // Administrator yaratgan o‘quvchi bu ro‘yxatda yo‘q.
    const manual = await createUser(prisma, ['STUDENT']);
    expect(list.body.items.map((item: { id: string }) => item.id)).not.toContain(manual.id);
  });
});

describe('Tezlik cheklovi', () => {
  it('bir IP dan ko‘p urinish cheklanadi (loginni almashtirish yordam bermaydi)', async () => {
    const ip = '203.0.113.7';
    for (let index = 0; index < 10; index += 1) {
      const response = await http()
        .post('/api/registration/student')
        .set('X-Forwarded-For', ip)
        .send({ login: `spam${index}.${word()}` });
      expect(response.status).toBe(400);
    }
    const blocked = await http()
      .post('/api/registration/student')
      .set('X-Forwarded-For', ip)
      .send({ login: `spam.${word()}` });
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe('TOO_MANY_REQUESTS');
    const other = await http().post('/api/registration/student').set('X-Forwarded-For', '203.0.113.8').send({});
    expect(other.status).toBe(400);
  });
});

describe('JSHSHIR himoyasi', () => {
  it('JSHSHIR hech bir javob va audit yozuvida ochiq ko‘rinmaydi', async () => {
    expect(usedPinfls.length).toBeGreaterThan(3);
    const events = await prisma.auditEvent.findMany({ select: { data: true } });
    const auditText = events.map((event) => JSON.stringify(event.data ?? null)).join('\n');
    const notifications = await prisma.notification.findMany({ select: { title: true, body: true } });
    const notificationText = JSON.stringify(notifications);
    for (const pinfl of usedPinfls) {
      expect(auditText).not.toContain(pinfl);
      expect(notificationText).not.toContain(pinfl);
      for (const text of responses) expect(text).not.toContain(pinfl);
    }
  });
});
