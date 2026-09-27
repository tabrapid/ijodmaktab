import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { hotp, totpStep } from '../src/auth/totp.js';
import { ExcelJS } from '../src/common/xlsx.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import { PASSWORD, binaryParser, createApp, createFixture, createUser, login, suffix, type Fixture } from './helpers.js';

let app: INestApplication;
let prisma: PrismaService;
let fx: Fixture;

beforeAll(async () => {
  ({ app, prisma } = await createApp());
  fx = await createFixture(prisma, 2);
});

afterAll(async () => {
  await app.close();
});

describe('Kirish va hisob xavfsizligi', () => {
  it('5 marta noto‘g‘ri paroldan keyin hisob vaqtincha bloklanadi, administrator ochadi', async () => {
    const user = await createUser(prisma, ['TEACHER']);
    const http = request(app.getHttpServer());
    for (let index = 0; index < 4; index += 1) {
      const response = await http.post('/api/auth/login').send({ login: user.login, password: 'xato-parol' });
      expect(response.body.code).toBe('INVALID_CREDENTIALS');
    }
    const locked = await http.post('/api/auth/login').send({ login: user.login, password: 'xato-parol' });
    expect(locked.body.code).toBe('ACCOUNT_LOCKED');
    // To‘g‘ri parol ham bloklangan vaqtda ishlamaydi.
    expect((await http.post('/api/auth/login').send({ login: user.login, password: PASSWORD })).body.code).toBe('ACCOUNT_LOCKED');

    const admin = await createUser(prisma, ['ADMIN']);
    const adminAgent = await login(app, admin.login);
    await adminAgent.post(`/api/users/${user.id}/unlock`).expect(200);
    await login(app, user.login);
  });

  it('mavjud bo‘lmagan login va noto‘g‘ri parol bir xil javob beradi', async () => {
    const http = request(app.getHttpServer());
    const unknown = await http.post('/api/auth/login').send({ login: `yoq${suffix()}`, password: 'x' });
    expect(unknown.status).toBe(401);
    expect(unknown.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('super admin faqat alohida manzildan va 2FA bilan ishlaydi', async () => {
    const root = await createUser(prisma, ['SUPER_ADMIN']);
    const http = request(app.getHttpServer());
    expect((await http.post('/api/auth/login').send({ login: root.login, password: PASSWORD })).status).toBe(401);

    const agent = request.agent(app.getHttpServer());
    const signedIn = await agent.post('/api/auth/system/login').send({ login: root.login, password: PASSWORD }).expect(200);
    expect(signedIn.body.mfa).toMatchObject({ required: true, enabled: false });
    expect((await agent.get('/api/audit')).body.code).toBe('MFA_SETUP_REQUIRED');

    const setup = await agent.post('/api/auth/mfa/setup').expect(200);
    expect(setup.body.otpauthUrl).toContain('otpauth://totp/');
    const code = hotp(setup.body.secret, totpStep(Date.now()));
    await agent.post('/api/auth/mfa/confirm').send({ code }).expect(200);
    await agent.get('/api/audit').expect(200);

    // Keyingi kirishda kod so‘raladi, bir kodni ikki marta ishlatib bo‘lmaydi.
    const again = request.agent(app.getHttpServer());
    await again.post('/api/auth/system/login').send({ login: root.login, password: PASSWORD }).expect(200);
    expect((await again.get('/api/audit')).body.code).toBe('MFA_REQUIRED');
    const reused = await again.post('/api/auth/mfa/verify').send({ code });
    expect(reused.body.code).toBe('INVALID_CODE');
  });

  it('vaqtinchalik parol almashtirilmaguncha boshqa amallar yopiq', async () => {
    const admin = await createUser(prisma, ['ADMIN']);
    const adminAgent = await login(app, admin.login);
    const created = await adminAgent
      .post('/api/users')
      .send({ lastName: 'Yangi', firstName: 'O‘quvchi', roles: ['STUDENT'], classId: fx.classA.id })
      .expect(201);
    expect(created.body.temporaryPassword).toMatch(/^[a-z]{4}-\d{4}$/);

    const agent = request.agent(app.getHttpServer());
    await agent.post('/api/auth/login').send({ login: created.body.user.login, password: created.body.temporaryPassword }).expect(200);
    expect((await agent.get('/api/me/sessions')).body.code).toBe('PASSWORD_CHANGE_REQUIRED');
    await agent
      .post('/api/auth/change-password')
      .send({ currentPassword: created.body.temporaryPassword, newPassword: 'YangiParol2026', confirmPassword: 'YangiParol2026' })
      .expect(200);
    await agent.get('/api/me/sessions').expect(200);
  });

  it('parol tiklanganda eski sessiyalar bekor qilinadi', async () => {
    const user = await createUser(prisma, ['TEACHER']);
    const agent = await login(app, user.login);
    await agent.get('/api/auth/me').expect(200);
    const admin = await createUser(prisma, ['ADMIN']);
    const adminAgent = await login(app, admin.login);
    await adminAgent.post(`/api/users/${user.id}/reset-password`).expect(200);
    await agent.get('/api/auth/me').expect(401);
  });

  it('boshqa saytdan yuborilgan so‘rov rad etiladi', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Origin', 'https://yomon-sayt.example')
      .send({ login: 'x', password: 'y' });
    expect(response.status).toBe(403);
    expect(response.body.code).toBe('FORBIDDEN_ORIGIN');
  });
});

describe('Rollar va ruxsatlar', () => {
  it('administrator ADMIN yoki SUPER_ADMIN rolini bera olmaydi, o‘qituvchi hisob yarata olmaydi', async () => {
    const admin = await createUser(prisma, ['ADMIN']);
    const adminAgent = await login(app, admin.login);
    const denied = await adminAgent.post('/api/users').send({ lastName: 'A', firstName: 'B', roles: ['ADMIN'] });
    expect(denied.status).toBe(403);

    const teacher = await login(app, fx.otherTeacher.login);
    expect((await teacher.post('/api/users').send({ lastName: 'A', firstName: 'B', roles: ['STUDENT'] })).status).toBe(403);
  });

  it('o‘qituvchi faqat biriktirilgan sinflaridagi o‘quvchilarni ko‘radi', async () => {
    const teacher = await login(app, fx.teacher.login);
    const list = await teacher.get('/api/users').query({ pageSize: 200 }).expect(200);
    const ids = new Set(list.body.items.map((item: { id: string }) => item.id));
    for (const student of fx.studentsA) expect(ids.has(student.id)).toBe(true);
    for (const student of fx.studentsB) expect(ids.has(student.id)).toBe(false);
    // Login va bloklash kabi hisob maydonlari o‘qituvchiga ko‘rsatilmaydi.
    expect(list.body.items[0].login).toBeUndefined();
    await teacher.get(`/api/users/${fx.studentsB[0]!.id}`).expect(404);
  });

  it('administrator o‘quv natijalarini ko‘rmaydi', async () => {
    const admin = await createUser(prisma, ['ADMIN']);
    const adminAgent = await login(app, admin.login);
    expect((await adminAgent.get('/api/sessions')).status).toBe(403);
  });
});

describe('Audit jurnali', () => {
  it('yozuvlarni o‘zgartirish va o‘chirish baza darajasida taqiqlangan', async () => {
    const event = await prisma.auditEvent.findFirstOrThrow({ orderBy: { id: 'desc' } });
    await expect(prisma.auditEvent.update({ where: { id: event.id }, data: { action: 'soxta' } })).rejects.toThrow();
    await expect(prisma.auditEvent.delete({ where: { id: event.id } })).rejects.toThrow();
    await expect(prisma.$executeRawUnsafe('TRUNCATE "AuditEvent"')).rejects.toThrow();
  });
});

describe('Excel orqali hisoblar importi', () => {
  async function workbook(rows: (string | null)[][]) {
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet('Ro‘yxat');
    for (const row of rows) sheet.addRow(row);
    return Buffer.from(await book.xlsx.writeBuffer());
  }

  it('ustunlarni moslashtiradi, xatolarni ko‘rsatadi va faqat to‘g‘ri qatorlarni yaratadi', async () => {
    const admin = await createUser(prisma, ['ADMIN']);
    const agent = await login(app, admin.login);
    const file = await workbook([
      ['F.I.Sh.', 'Sinf', 'Rol'],
      [`Importov${suffix()} Anvar Karimovich`, fx.classA.name.toLowerCase(), 'o‘quvchi'],
      [`Importova${suffix()} Dildora`, fx.classA.name, ''],
      ['Yolg‘iz', fx.classA.name, 'o‘quvchi'],
      [`Sinfsiz${suffix()} Bobur`, '11-Z', 'o‘quvchi'],
      [`Ustoz${suffix()} Kamola`, '', 'o‘qituvchi'],
      [`Importov X Y`, fx.classA.name, 'direktor'],
    ]);

    const upload = await agent
      .post('/api/users/import')
      .attach('file', file, { filename: 'royxat.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      .expect(200);
    expect(upload.body.mapping).toMatchObject({ fullName: 0, className: 1, role: 2 });
    const statuses = upload.body.rows.map((row: { status: string }) => row.status);
    expect(statuses).toEqual(['ok', 'ok', 'error', 'error', 'ok', 'error']);
    expect(upload.body.rows[2].errors.join(' ')).toContain('Ism ko‘rsatilmagan');
    expect(upload.body.rows[3].errors.join(' ')).toContain('Sinf topilmadi');
    expect(upload.body.rows[5].errors.join(' ')).toContain('Rol noma’lum');

    const errors = await agent.get(`/api/users/import/${upload.body.batchId}/errors.xlsx`).buffer(true).parse(binaryParser).expect(200);
    const check = new ExcelJS.Workbook();
    await check.xlsx.load(errors.body as unknown as ArrayBuffer);
    expect(check.worksheets[0]!.rowCount).toBe(4);

    const commit = await agent
      .post(`/api/users/import/${upload.body.batchId}/commit`)
      .send({ mapping: upload.body.mapping, defaultRole: 'STUDENT', skipRows: [] })
      .expect(200);
    expect(commit.body.createdCount).toBe(3);
    expect(commit.body.errorCount).toBe(3);
    expect(commit.body.credentialsXlsxBase64.length).toBeGreaterThan(100);
    // Parollar faqat bir martalik faylda — JSON ro‘yxatda yo‘q.
    expect(JSON.stringify(commit.body.created)).not.toContain('temporaryPassword');

    const enrolled = await prisma.enrollment.count({
      where: { classId: fx.classA.id, studentId: { in: commit.body.created.map((item: { id: string }) => item.id) } },
    });
    expect(enrolled).toBe(2);
    await agent
      .post(`/api/users/import/${upload.body.batchId}/commit`)
      .send({ mapping: upload.body.mapping, defaultRole: 'STUDENT', skipRows: [] })
      .expect(409);
  });

  it('Excel bo‘lmagan fayl qabul qilinmaydi', async () => {
    const admin = await createUser(prisma, ['ADMIN']);
    const agent = await login(app, admin.login);
    const response = await agent
      .post('/api/users/import')
      .attach('file', Buffer.from('ism,familiya\nAli,Valiyev'), { filename: 'royxat.xlsx' });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('UNSUPPORTED_FILE');
  });
});
