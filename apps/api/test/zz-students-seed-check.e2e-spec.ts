// Vaqtinchalik tekshiruv (seed ma’lumotlari) — ishga tushirilgach darhol o‘chiriladi.
import request from 'supertest';
import { createApp } from './helpers.js';

it('seed ma’lumotlari bilan “O‘quvchilar” bo‘limi', async () => {
  const { app } = await createApp();
  const agent = request.agent(app.getHttpServer());
  expect((await agent.post('/api/auth/login').send({ login: 'b.yusupov', password: 'Demo2026!' })).status).toBe(200);
  const list = await agent.get('/api/management/students').query({ pageSize: 1000 });
  const name = (classId: string | null) => list.body.items.find((i: any) => i.classId === classId)?.className ?? 'sinfsiz';
  console.log('total', list.body.total, 'groups', list.body.groups.map((g: any) => `${name(g.classId)}:${g.count}`).join(' '));
  const classes = await agent.get('/api/management/classes');
  console.log('classes', classes.body.map((c: any) => c.name + (c.homeroomTeacher ? '*' : '') + (c.newStudentCount ? `+${c.newStudentCount}` : '')).join(' '));
  const toirov = list.body.items.find((i: any) => i.login === 'shohjahon.toirov');
  const profile = await agent.get(`/api/management/students/${toirov.id}`);
  console.log('profile', profile.status, profile.body.pinflMasked, profile.body.birthDate, profile.body.currentClass?.name, JSON.stringify(profile.body.portfolio));
  const jaloliddin = list.body.items.find((i: any) => i.login === 'jaloliddin.abduganiyev');
  console.log('jaloliddin row', JSON.stringify(jaloliddin.portfolio), jaloliddin.className, jaloliddin.homeroomTeacher?.fullName);
  const olimov = (await agent.get('/api/users/staff').query({ q: 'olimov' })).body[0];
  const target = classes.body.find((c: any) => c.name === '11-B');
  const assign = await agent.put(`/api/management/classes/${target.id}/homeroom`).send({ teacherId: olimov.id });
  console.log('assign', assign.status, assign.body.homeroomTeacher?.fullName, JSON.stringify(assign.body.alsoHomeroomOf));
  await agent.put(`/api/management/classes/${target.id}/homeroom`).send({ teacherId: null }).expect(200);
  const pending = await request(app.getHttpServer()).post('/api/auth/login').send({ login: 's.nazarova', password: 'Demo2026!' });
  console.log('pending teacher login', pending.status, pending.body.code);
  await app.close();
});
