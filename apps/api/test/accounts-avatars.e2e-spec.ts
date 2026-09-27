/**
 * Direktor o‘rinbosari o‘qituvchi va o‘quvchi hisoblarini boshqaradi; profil rasmlari.
 */
import type { INestApplication } from '@nestjs/common';
import type { Role } from '@ijod/shared';
import sharp from 'sharp';
import request from 'supertest';
import type { AuthUser } from '../src/common/auth-user.js';
import { StorageService } from '../src/common/storage.service.js';
import { ExcelJS } from '../src/common/xlsx.js';
import { FilesService } from '../src/files/files.service.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import { AvatarService } from '../src/users/avatar.service.js';
import { binaryParser, createApp, createFixture, createUser, login, suffix, type Fixture } from './helpers.js';

let app: INestApplication;
let prisma: PrismaService;
let fx: Fixture;

type Agent = Awaited<ReturnType<typeof login>>;

beforeAll(async () => {
  ({ app, prisma } = await createApp());
  fx = await createFixture(prisma, 2);
});

afterAll(async () => {
  await app.close();
});

const person = () => ({ lastName: `Hisobov${suffix()}`, firstName: 'Sardor' });

async function deputyAgent() {
  const deputy = await createUser(prisma, ['DEPUTY']);
  return { deputy, agent: await login(app, deputy.login) };
}

// ---------------------------------------------------------------- Rasmlar

/** Rangli sinov rasmi. */
const solid = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: { r: 40, g: 120, b: 200 } } });

const pngImage = () => solid(900, 600).png().toBuffer();

/**
 * EXIF bo‘yicha 90° burilishi kerak bo‘lgan JPEG: xom piksellarda yuqori yarmi ko‘k, pastki yarmi
 * qizil; to‘g‘ri burilganda chap tomoni qizil, o‘ng tomoni ko‘k bo‘ladi.
 */
const orientedJpeg = () =>
  sharp({ create: { width: 600, height: 300, channels: 3, background: { r: 220, g: 30, b: 30 } } })
    .composite([
      {
        input: { create: { width: 600, height: 150, channels: 3, background: { r: 30, g: 30, b: 220 } } },
        top: 0,
        left: 0,
      },
    ])
    .jpeg()
    .withExif({ IFD0: { Copyright: 'Sinov', Artist: 'Maxfiy muallif' } })
    .withMetadata({ orientation: 6 })
    .toBuffer();

async function uploadAvatar(agent: Agent, buffer: Buffer, filename = 'rasm.png') {
  return agent.post('/api/me/avatar').attach('file', buffer, { filename });
}

const fetchFile = (agent: Agent, url: string) => agent.get(url).buffer(true).parse(binaryParser);

type CreatedUser = Awaited<ReturnType<typeof createUser>>;

/** Xizmatni so‘rovdan tashqari chaqirish uchun AuthUser (auditda ijrochisiz yoziladi). */
const authUserOf = (user: CreatedUser, roles: Role[]) =>
  ({
    id: user.id,
    internalId: user.internalId,
    login: user.login,
    lastName: user.lastName,
    firstName: user.firstName,
    middleName: null,
    roles,
    sessionId: '00000000-0000-0000-0000-000000000000',
    realm: 'SCHOOL',
    mustChangePassword: false,
    mfaEnabled: false,
    mfaVerified: false,
    avatarFileId: null,
  }) satisfies AuthUser;

const asUpload = (buffer: Buffer) => ({
  buffer,
  originalname: 'rasm.png',
  mimetype: 'image/png',
  size: buffer.length,
});

// ---------------------------------------------------------------- Hisoblar

describe('Direktor o‘rinbosari hisob yaratadi', () => {
  it('o‘qituvchi va sinfli o‘quvchi yaratadi; vaqtinchalik parol bilan kirib bo‘ladi', async () => {
    const { agent } = await deputyAgent();

    const teacher = await agent
      .post('/api/users')
      .send({ ...person(), roles: ['TEACHER'] })
      .expect(201);
    expect(teacher.body.user.login).toMatch(/^[a-z0-9._-]+$/);
    expect(teacher.body.temporaryPassword).toMatch(/^[a-z]{4}-\d{4}$/);
    expect(teacher.body.user.manageable).toBe(true);
    expect(teacher.body.user.roles).toEqual(['TEACHER']);

    const student = await agent
      .post('/api/users')
      .send({ ...person(), roles: ['STUDENT'], classId: fx.classA.id })
      .expect(201);
    expect(student.body.user.login).toBeTruthy();
    expect(student.body.user.enrollments[0].class.id).toBe(fx.classA.id);

    const fresh = request.agent(app.getHttpServer());
    const signedIn = await fresh
      .post('/api/auth/login')
      .send({ login: student.body.user.login, password: student.body.temporaryPassword })
      .expect(200);
    expect(signedIn.body.mustChangePassword).toBe(true);
    expect(signedIn.body.avatarUrl).toBeNull();
  });

  it('o‘rinbosar, administrator, super admin yoki aralash rollarni bera olmaydi', async () => {
    const { agent } = await deputyAgent();
    const forbiddenSets: Role[][] = [['DEPUTY'], ['ADMIN'], ['SUPER_ADMIN'], ['TEACHER', 'DEPUTY']];
    for (const roles of forbiddenSets) {
      const response = await agent.post('/api/users').send({ ...person(), roles });
      expect(response.status, roles.join('+')).toBe(403);
    }
    const denied = await agent.post('/api/users').send({ ...person(), roles: ['DEPUTY'] });
    expect(denied.body.message).toBe('Direktor o‘rinbosari faqat o‘qituvchi va o‘quvchi hisoblarini yarata oladi.');
  });

  it('o‘qituvchi hali ham hisob yarata olmaydi', async () => {
    const teacher = await login(app, fx.teacher.login);
    await teacher
      .post('/api/users')
      .send({ ...person(), roles: ['STUDENT'] })
      .expect(403);
    await teacher.post(`/api/users/${fx.studentsA[0]!.id}/reset-password`).expect(403);
  });
});

describe('Direktor o‘rinbosari hisoblarni boshqaradi', () => {
  it('rahbariyat va administrator hisoblariga tegolmaydi, super adminni ko‘rmaydi', async () => {
    const { deputy, agent } = await deputyAgent();
    const otherDeputy = await createUser(prisma, ['DEPUTY']);
    const admin = await createUser(prisma, ['ADMIN']);
    const teacherDeputy = await createUser(prisma, ['TEACHER', 'DEPUTY']);
    const root = await createUser(prisma, ['SUPER_ADMIN']);

    for (const target of [otherDeputy, admin, teacherDeputy]) {
      await agent.post(`/api/users/${target.id}/reset-password`).expect(403);
      await agent.post(`/api/users/${target.id}/status`).send({ status: 'DEACTIVATED' }).expect(403);
      await agent.post(`/api/users/${target.id}/unlock`).expect(403);
      await agent.post(`/api/users/${target.id}/revoke-sessions`).expect(403);
      await agent
        .put(`/api/users/${target.id}/roles`)
        .send({ roles: ['TEACHER'] })
        .expect(403);
      await agent.patch(`/api/users/${target.id}`).send({ firstName: 'Buzilgan' }).expect(403);
      await agent.delete(`/api/users/${target.id}`).expect(403);
      await agent.delete(`/api/users/${target.id}/avatar`).expect(403);
    }
    await agent.post(`/api/users/${root.id}/reset-password`).expect(404);
    await agent.post(`/api/users/${root.id}/status`).send({ status: 'DEACTIVATED' }).expect(404);
    await agent.delete(`/api/users/${root.id}`).expect(404);
    await agent
      .put(`/api/users/${root.id}/roles`)
      .send({ roles: ['SUPER_ADMIN'] })
      .expect(404);
    await agent.get(`/api/users/${root.id}`).expect(404);

    // O‘z hisobi ham boshqarilmaydi.
    const self = await agent.post(`/api/users/${deputy.id}/reset-password`);
    expect(self.status).toBe(403);
    expect(self.body.code).toBe('SELF_ACTION');
    await agent
      .patch(`/api/users/${deputy.id}`)
      .send({ login: `ozim${suffix()}` })
      .expect(403);

    // Hech narsa o‘zgarmagan.
    const untouched = await prisma.user.findUniqueOrThrow({ where: { id: otherDeputy.id } });
    expect(untouched.status).toBe('ACTIVE');
    expect(untouched.passwordHash).toBe(otherDeputy.passwordHash);
  });

  it('o‘qituvchi parolini tiklaydi, rollarni faqat ruxsat doirasida o‘zgartiradi', async () => {
    const { agent } = await deputyAgent();
    const teacher = await createUser(prisma, ['TEACHER']);

    const reset = await agent.post(`/api/users/${teacher.id}/reset-password`).expect(200);
    expect(reset.body.login).toBe(teacher.login);
    expect(reset.body.temporaryPassword).toMatch(/^[a-z]{4}-\d{4}$/);
    const signedIn = await request
      .agent(app.getHttpServer())
      .post('/api/auth/login')
      .send({ login: teacher.login, password: reset.body.temporaryPassword })
      .expect(200);
    expect(signedIn.body.mustChangePassword).toBe(true);

    const promote = await agent.put(`/api/users/${teacher.id}/roles`).send({ roles: ['TEACHER', 'DEPUTY'] });
    expect(promote.status).toBe(403);
    await agent
      .put(`/api/users/${teacher.id}/roles`)
      .send({ roles: ['TEACHER', 'STUDENT'] })
      .expect(200);

    const updated = await agent.patch(`/api/users/${teacher.id}`).send({ firstName: 'Yangilangan' }).expect(200);
    expect(updated.body.firstName).toBe('Yangilangan');

    const deactivated = await agent
      .post(`/api/users/${teacher.id}/status`)
      .send({ status: 'DEACTIVATED', reason: 'Ta’tilda' })
      .expect(200);
    expect(deactivated.body.status).toBe('DEACTIVATED');

    // Amallar audit jurnalida o‘rinbosar roli bilan yoziladi.
    const events = await prisma.auditEvent.findMany({
      where: { entityType: 'User', entityId: teacher.id, action: { startsWith: 'user.' } },
    });
    expect(events.map((event) => event.action)).toEqual(
      expect.arrayContaining(['user.password_reset', 'user.roles_changed', 'user.update', 'user.status_changed']),
    );
    for (const event of events) expect(event.actorRoles).toContain('DEPUTY');
  });

  it('xato yaratilgan o‘quvchi hisobini o‘chiradi, tarixi borini o‘chirmaydi', async () => {
    const { agent } = await deputyAgent();
    const created = await agent
      .post('/api/users')
      .send({ ...person(), roles: ['STUDENT'] })
      .expect(201);
    await agent.delete(`/api/users/${created.body.user.id}`).expect(200);
    expect(await prisma.user.findUnique({ where: { id: created.body.user.id } })).toBeNull();

    // Tizimga kirgan (tarixi bor) o‘quvchi o‘chirilmaydi.
    const active = await createUser(prisma, ['STUDENT']);
    await login(app, active.login);
    const history = await agent.delete(`/api/users/${active.id}`);
    expect(history.status).toBe(409);
    expect(history.body.code).toBe('HAS_HISTORY');
  });

  it('ro‘yxatda login faqat boshqara oladigan hisoblarda ko‘rinadi', async () => {
    const { deputy, agent } = await deputyAgent();
    const tag = `Royxat${suffix()}`;
    const teacher = await createUser(prisma, ['TEACHER'], { lastName: tag, firstName: 'Oqituvchi' });
    const otherDeputy = await createUser(prisma, ['DEPUTY'], { lastName: tag, firstName: 'Orinbosar' });
    const admin = await createUser(prisma, ['ADMIN'], { lastName: tag, firstName: 'Admin' });
    const root = await createUser(prisma, ['SUPER_ADMIN'], { lastName: tag, firstName: 'Root' });

    const list = await agent.get('/api/users').query({ q: tag, pageSize: 50 }).expect(200);
    type Item = { id: string; login?: string; manageable: boolean; avatarUrl: string | null };
    const byId = new Map<string, Item>(list.body.items.map((item: Item) => [item.id, item]));
    expect(byId.has(root.id)).toBe(false);
    expect(byId.get(teacher.id)).toMatchObject({ login: teacher.login, manageable: true, avatarUrl: null });
    expect(byId.get(otherDeputy.id)!.manageable).toBe(false);
    expect(byId.get(otherDeputy.id)!.login).toBeUndefined();
    expect(byId.get(admin.id)!.manageable).toBe(false);
    expect(byId.get(admin.id)!.login).toBeUndefined();

    const detail = await agent.get(`/api/users/${admin.id}`).expect(200);
    expect(detail.body.manageable).toBe(false);
    expect(detail.body.login).toBeUndefined();
    expect(detail.body.mfaEnabled).toBeUndefined();
    const own = await agent.get(`/api/users/${deputy.id}`).expect(200);
    expect(own.body.manageable).toBe(false);

    // Administrator barcha hisoblarda loginni ko‘radi, lekin boshqa administratorni boshqarmaydi.
    const adminAgent = await login(app, (await createUser(prisma, ['ADMIN'])).login);
    const adminList = await adminAgent.get('/api/users').query({ q: tag, pageSize: 50 }).expect(200);
    const adminView = adminList.body.items.find((item: Item) => item.id === admin.id);
    expect(adminView).toMatchObject({ login: admin.login, manageable: false });
    const adminTeacher = adminList.body.items.find((item: Item) => item.id === teacher.id);
    expect(adminTeacher.manageable).toBe(true);

    // Ogohlantirish filtri o‘rinbosarga faqat o‘qituvchi va o‘quvchi hisoblarini qaytaradi.
    await prisma.user.updateMany({
      where: { id: { in: [teacher.id, otherDeputy.id] } },
      data: { mustChangePassword: true },
    });
    const flagged = await agent.get('/api/users').query({ q: tag, flag: 'mustChangePassword' }).expect(200);
    expect(flagged.body.items.map((item: Item) => item.id)).toEqual([teacher.id]);
  });

  it('sinfga biriktiradi, boshqa sinfga ko‘chiradi va a’zolikni tugatadi', async () => {
    const { agent } = await deputyAgent();
    const created = await agent
      .post('/api/users')
      .send({ ...person(), roles: ['STUDENT'] })
      .expect(201);
    const studentId = created.body.user.id as string;

    await agent
      .post(`/api/classes/${fx.classA.id}/students`)
      .send({ studentIds: [studentId] })
      .expect(200);
    await agent.post(`/api/students/${studentId}/transfer`).send({ toClassId: fx.classB.id }).expect(200);
    const active = await prisma.enrollment.findFirstOrThrow({ where: { studentId, endsOn: null } });
    expect(active.classId).toBe(fx.classB.id);
    await agent.post(`/api/enrollments/${active.id}/end`).send({ reason: 'LEFT' }).expect(200);
    expect(await prisma.enrollment.count({ where: { studentId, endsOn: null } })).toBe(0);

    // Sinf va biriktirishlarni boshqarish administratorda qoladi.
    await agent
      .post('/api/classes')
      .send({ academicYearId: active.academicYearId, gradeLevel: 5, section: 'Z' })
      .expect(403);
    const teacher = await login(app, fx.teacher.login);
    await teacher
      .post(`/api/classes/${fx.classA.id}/students`)
      .send({ studentIds: [studentId] })
      .expect(403);
  });

  it('Excel importi faqat o‘quvchi va o‘qituvchi hisoblarini yaratadi', async () => {
    const { agent } = await deputyAgent();
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet('Ro‘yxat');
    for (const row of [
      ['F.I.Sh.', 'Sinf', 'Rol'],
      [`Importov${suffix()} Anvar`, fx.classA.name, 'o‘quvchi'],
      [`Ustozova${suffix()} Kamola`, '', 'o‘qituvchi'],
      [`Rahbarov${suffix()} Botir`, '', 'direktor'],
    ]) {
      sheet.addRow(row);
    }
    const file = Buffer.from(await book.xlsx.writeBuffer());
    const upload = await agent
      .post('/api/users/import')
      .attach('file', file, {
        filename: 'royxat.xlsx',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      .expect(200);
    expect(upload.body.rows.map((row: { status: string }) => row.status)).toEqual(['ok', 'ok', 'error']);
    const commit = await agent
      .post(`/api/users/import/${upload.body.batchId}/commit`)
      .send({ mapping: upload.body.mapping, defaultRole: 'STUDENT', skipRows: [] })
      .expect(200);
    expect(commit.body.createdCount).toBe(2);
    const ids = commit.body.created.map((item: { id: string }) => item.id);
    const roles = await prisma.roleAssignment.findMany({ where: { userId: { in: ids } } });
    expect(roles.map((item) => item.role).sort()).toEqual(['STUDENT', 'TEACHER']);

    const audit = await prisma.auditEvent.findFirstOrThrow({
      where: { action: 'user.import', entityId: upload.body.batchId },
    });
    expect(audit.actorRoles).toContain('DEPUTY');
  });
});

// ---------------------------------------------------------------- Profil rasmlari

describe('Profil rasmi', () => {
  it('PNG va EXIF burilishli JPEG 512×512 WEBP ga o‘giriladi, metama’lumotsiz saqlanadi', async () => {
    const owner = await login(app, fx.studentsA[0]!.login);
    const storage = app.get(StorageService);

    const first = await uploadAvatar(owner, await pngImage(), 'men.png');
    expect(first.status).toBe(200);
    expect(first.body.avatarUrl).toMatch(/^\/api\/files\/[0-9a-f-]{36}$/);
    const firstId = (first.body.avatarUrl as string).split('/').pop()!;
    const firstAsset = await prisma.fileAsset.findUniqueOrThrow({ where: { id: firstId } });
    expect(firstAsset).toMatchObject({ mimeType: 'image/webp', originalName: 'avatar.webp', status: 'CLEAN' });

    const pngFile = await fetchFile(owner, first.body.avatarUrl).expect(200);
    expect(pngFile.headers['content-type']).toBe('image/webp');
    expect(pngFile.headers['cache-control']).toBe('private, max-age=3600');
    expect(pngFile.headers['content-disposition']).toMatch(/^inline;/);
    const pngMeta = await sharp(pngFile.body as Buffer).metadata();
    expect(pngMeta).toMatchObject({ format: 'webp', width: 512, height: 512 });

    // Almashtirish: eski fayl yozuvi va ombordagi fayl o‘chadi.
    const second = await uploadAvatar(owner, await orientedJpeg(), 'telefon.jpg');
    expect(second.status).toBe(200);
    expect(second.body.avatarUrl).not.toBe(first.body.avatarUrl);
    expect(await prisma.fileAsset.findUnique({ where: { id: firstId } })).toBeNull();
    expect(await storage.exists('files', firstAsset.storageKey)).toBe(false);
    await owner.get(first.body.avatarUrl).expect(404);

    const me = await owner.get('/api/auth/me').expect(200);
    expect(me.body.avatarUrl).toBe(second.body.avatarUrl);

    const jpegFile = await fetchFile(owner, second.body.avatarUrl).expect(200);
    const image = sharp(jpegFile.body as Buffer);
    const meta = await image.metadata();
    expect(meta).toMatchObject({ format: 'webp', width: 512, height: 512 });
    expect(meta.exif).toBeUndefined();
    expect(meta.orientation).toBeUndefined();
    const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
    const pixel = (x: number, y: number) => {
      const index = (y * info.width + x) * info.channels;
      return { r: data[index]!, b: data[index + 2]! };
    };
    // To‘g‘ri burilgan: chap tomon qizil, o‘ng tomon ko‘k.
    expect(pixel(10, 10).r).toBeGreaterThan(150);
    expect(pixel(10, 10).b).toBeLessThan(100);
    expect(pixel(500, 10).b).toBeGreaterThan(150);
    expect(pixel(500, 10).r).toBeLessThan(100);

    const audit = await prisma.auditEvent.findMany({
      where: { action: 'user.avatar_updated', entityId: fx.studentsA[0]!.id },
    });
    expect(audit.length).toBeGreaterThanOrEqual(2);
  });

  it('boshqa foydalanuvchilar rasmni ko‘radi, lekin boshqa yopiq fayllarni emas', async () => {
    const owner = await login(app, fx.teacher.login);
    const stranger = await login(app, fx.studentsB[0]!.login);

    const uploaded = await uploadAvatar(owner, await pngImage());
    expect(uploaded.status).toBe(200);
    await stranger.get(uploaded.body.avatarUrl).expect(200);

    const PDF = Buffer.from(
      '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
        '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
    );
    const privateFile = await owner
      .post('/api/files')
      .attach('file', PDF, { filename: 'maxfiy.pdf', contentType: 'application/pdf' })
      .expect(201);
    await stranger.get(`/api/files/${privateFile.body.id}`).expect(404);
    const pdf = await owner.get(`/api/files/${privateFile.body.id}`).expect(200);
    expect(pdf.headers['cache-control']).toBe('private, no-store');

    // Rasm foydalanuvchilar ro‘yxati, profil va sinf tarkibida ko‘rinadi.
    const deputy = await login(app, (await createUser(prisma, ['DEPUTY'])).login);
    const detail = await deputy.get(`/api/users/${fx.teacher.id}`).expect(200);
    expect(detail.body.avatarUrl).toBe(uploaded.body.avatarUrl);
    const student = await login(app, fx.studentsA[1]!.login);
    const studentAvatar = await uploadAvatar(student, await pngImage());
    const classDetail = await owner.get(`/api/classes/${fx.classA.id}`).expect(200);
    const row = classDetail.body.students.find((item: { id: string }) => item.id === fx.studentsA[1]!.id);
    expect(row.avatarUrl).toBe(studentAvatar.body.avatarUrl);
    const list = await deputy.get('/api/users').query({ q: fx.studentsA[1]!.login }).expect(200);
    expect(list.body.items[0].avatarUrl).toBe(studentAvatar.body.avatarUrl);
  });

  it('rasm bo‘lmagan va juda katta fayllar rad etiladi', async () => {
    const owner = await login(app, fx.studentsB[1]!.login);
    const text = await uploadAvatar(owner, Buffer.from('Bu rasm emas, oddiy matn.\n'.repeat(20)), 'rasm.png');
    expect(text.status).toBe(400);
    expect(text.body.code).toBe('AVATAR_TYPE_NOT_ALLOWED');

    const pdf = await uploadAvatar(owner, Buffer.from('%PDF-1.4\n%%EOF\n'), 'rasm.png');
    expect(pdf.status).toBe(400);

    const huge = Buffer.alloc(5 * 1024 * 1024 + 100, 0);
    (await pngImage()).copy(huge);
    const tooLarge = await uploadAvatar(owner, huge, 'katta.png');
    expect(tooLarge.status).toBe(413);

    const missing = await owner.post('/api/me/avatar');
    expect(missing.status).toBe(400);
    expect((await owner.get('/api/auth/me')).body.avatarUrl).toBeNull();
  });

  it('megapiksel chegarasidan katta rasm alohida xabar bilan rad etiladi', async () => {
    const owner = await login(app, fx.studentsB[0]!.login);
    // 7000×7000 = 49 MP: fayl hajmi kichik, lekin piksellar soni chegaradan ko‘p.
    const response = await uploadAvatar(owner, await solid(7000, 7000).png().toBuffer(), 'skaner.png');
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('AVATAR_TOO_LARGE');
    expect(response.body.message).toContain('megapiksel');

    const broken = await uploadAvatar(owner, (await pngImage()).subarray(0, 200), 'buzuq.png');
    expect(broken.status).toBe(400);
    expect(broken.body.code).toBe('AVATAR_UNREADABLE');
  });

  it('bir vaqtdagi yuklash va olib tashlashlar bir-birini qulflab qo‘ymaydi', async () => {
    const user = await createUser(prisma, ['TEACHER']);
    const authUser = authUserOf(user, ['TEACHER']);
    const avatars = app.get(AvatarService);
    const file = await pngImage();
    for (let round = 0; round < 6; round++) {
      const results = await Promise.allSettled([
        avatars.upload(authUser, asUpload(file)),
        avatars.upload(authUser, asUpload(file)),
        ...(round % 2 === 1 ? [avatars.remove(user.id, true)] : []),
      ]);
      expect(results.filter((result) => result.status === 'rejected')).toEqual([]);
    }
    await avatars.upload(authUser, asUpload(file));
    // Oxirida faqat joriy rasm qoladi, eski rasmlar yozuvlari o‘chirilgan.
    const current = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    const assets = await prisma.fileAsset.findMany({ where: { ownerId: user.id } });
    expect(assets.map((asset) => asset.id)).toEqual([current.avatarFileId]);
  });

  it('o‘z rasmini olib tashlaydi', async () => {
    const owner = await login(app, fx.otherTeacher.login);
    const uploaded = await uploadAvatar(owner, await pngImage());
    const fileId = (uploaded.body.avatarUrl as string).split('/').pop()!;
    const removed = await owner.delete('/api/me/avatar').expect(200);
    expect(removed.body.avatarUrl).toBeNull();
    expect(removed.body.id).toBe(fx.otherTeacher.id);
    expect((await owner.get('/api/auth/me')).body.avatarUrl).toBeNull();
    expect(await prisma.fileAsset.findUnique({ where: { id: fileId } })).toBeNull();
    await owner.get(uploaded.body.avatarUrl).expect(404);
    // Takroriy o‘chirish xato bermaydi.
    await owner.delete('/api/me/avatar').expect(200);
    expect(
      await prisma.auditEvent.count({ where: { action: 'user.avatar_removed', entityId: fx.otherTeacher.id } }),
    ).toBe(1);
  });

  it('yetim fayllarni tozalash joriy profil rasmlariga tegmaydi', async () => {
    const teacher = await createUser(prisma, ['TEACHER']);
    const owner = await login(app, teacher.login);
    const uploaded = await uploadAvatar(owner, await pngImage());
    const fileId = (uploaded.body.avatarUrl as string).split('/').pop()!;

    await app.get(FilesService).cleanupOrphans(new Date(Date.now() + 25 * 60 * 60_000));
    expect((await prisma.fileAsset.findUniqueOrThrow({ where: { id: fileId } })).deletedAt).toBeNull();
    await owner.get(uploaded.body.avatarUrl).expect(200);
  });

  it('rahbariyat va administrator nomaqbul rasmni olib tashlaydi, o‘qituvchi — yo‘q', async () => {
    const student = await createUser(prisma, ['STUDENT']);
    const studentAgent = await login(app, student.login);
    const { agent: deputy } = await deputyAgent();
    const admin = await login(app, (await createUser(prisma, ['ADMIN'])).login);
    const teacher = await login(app, fx.teacher.login);

    await uploadAvatar(studentAgent, await pngImage());
    await teacher.delete(`/api/users/${student.id}/avatar`).expect(403);
    const byDeputy = await deputy.delete(`/api/users/${student.id}/avatar`).expect(200);
    expect(byDeputy.body.avatarUrl).toBeNull();
    expect((await studentAgent.get('/api/auth/me')).body.avatarUrl).toBeNull();

    await uploadAvatar(studentAgent, await pngImage());
    const byAdmin = await admin.delete(`/api/users/${student.id}/avatar`).expect(200);
    expect(byAdmin.body.avatarUrl).toBeNull();
    const event = await prisma.auditEvent.findFirstOrThrow({
      where: { action: 'user.avatar_removed', entityId: student.id },
      orderBy: { id: 'desc' },
    });
    expect(event.data).toMatchObject({ moderated: true });
    expect(event.actorRoles).toContain('ADMIN');
  });

  it('faqat profil rasmi bor hisob o‘chiriladi (rasm bilan birga)', async () => {
    const user = await createUser(prisma, ['STUDENT']);
    // So‘rovdan tashqari (auditda ijrochisiz) yuklanadi: hisobning boshqa tarixi yo‘q.
    const me = await app.get(AvatarService).upload(authUserOf(user, ['STUDENT']), asUpload(await pngImage()));
    const fileId = me.avatarUrl!.split('/').pop()!;
    const asset = await prisma.fileAsset.findUniqueOrThrow({ where: { id: fileId } });

    const admin = await login(app, (await createUser(prisma, ['ADMIN'])).login);
    await admin.delete(`/api/users/${user.id}`).expect(200);
    expect(await prisma.user.findUnique({ where: { id: user.id } })).toBeNull();
    expect(await prisma.fileAsset.findUnique({ where: { id: fileId } })).toBeNull();
    expect(await app.get(StorageService).exists('files', asset.storageKey)).toBe(false);
  });
});
