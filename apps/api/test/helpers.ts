import 'reflect-metadata';
import { randomBytes } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { userSearchText, type Role } from '@ijod/shared';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { hashPassword } from '../src/auth/passwords.js';
import { configureApp } from '../src/bootstrap.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

export const PASSWORD = 'Sinov2026!';
let passwordHash: Promise<string> | null = null;

export async function createApp() {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app);
  await app.init();
  return { app, prisma: app.get(PrismaService) };
}

export const suffix = () => randomBytes(3).toString('hex');

/** Tizimga kirgan HTTP mijoz (cookie saqlanadi). */
export async function login(app: INestApplication, loginName: string, password = PASSWORD) {
  const agent = request.agent(app.getHttpServer());
  const response = await agent.post('/api/auth/login').send({ login: loginName, password });
  if (response.status !== 200) throw new Error(`Kirish muvaffaqiyatsiz: ${loginName} ${JSON.stringify(response.body)}`);
  return agent;
}

export async function createUser(prisma: PrismaService, roles: Role[], name?: { lastName: string; firstName: string }) {
  passwordHash ??= hashPassword(PASSWORD);
  const id = suffix();
  const person = name ?? { lastName: `Test${id}`, firstName: `Foydalanuvchi${id}` };
  const loginName = `u${id}`;
  return prisma.user.create({
    data: {
      login: loginName,
      passwordHash: await passwordHash,
      mustChangePassword: false,
      ...person,
      searchText: userSearchText({ ...person, login: loginName }),
      roles: { create: roles.map((role) => ({ role })) },
    },
  });
}

/** Joriy o‘quv yili (barcha test fayllari uchun umumiy). */
export async function currentYear(prisma: PrismaService) {
  const existing = await prisma.academicYear.findFirst({ where: { isCurrent: true } });
  if (existing) return existing;
  try {
    return await prisma.academicYear.create({
      data: { name: '2026–2027', startsOn: new Date('2026-09-02'), endsOn: new Date('2027-05-25'), isCurrent: true },
    });
  } catch {
    return prisma.academicYear.findFirstOrThrow({ where: { isCurrent: true } });
  }
}

export interface Fixture {
  subjectId: string;
  classA: { id: string; name: string };
  classB: { id: string; name: string };
  teacher: { id: string; login: string };
  otherTeacher: { id: string; login: string };
  studentsA: { id: string; login: string }[];
  studentsB: { id: string; login: string }[];
}

/**
 * Har bir test fayli uchun alohida maktab bo‘lagi: fan, ikki sinf, o‘qituvchi (faqat A sinfga
 * biriktirilgan), boshqa o‘qituvchi va o‘quvchilar.
 */
export async function createFixture(prisma: PrismaService, studentsPerClass = 3): Promise<Fixture> {
  const year = await currentYear(prisma);
  const tag = suffix().toUpperCase();
  const subject = await prisma.subject.create({ data: { name: `Fan ${tag}` } });
  const teacher = await createUser(prisma, ['TEACHER']);
  const otherTeacher = await createUser(prisma, ['TEACHER']);
  const makeClass = (section: string, homeroomTeacherId: string | null) =>
    prisma.class.create({
      data: { academicYearId: year.id, gradeLevel: 9, section, name: `9-${section}`, homeroomTeacherId },
    });
  const classA = await makeClass(`A${tag}`, teacher.id);
  const classB = await makeClass(`B${tag}`, otherTeacher.id);
  await prisma.teachingAssignment.create({
    data: { teacherId: teacher.id, subjectId: subject.id, classId: classA.id, academicYearId: year.id },
  });
  await prisma.teachingAssignment.create({
    data: { teacherId: otherTeacher.id, subjectId: subject.id, classId: classB.id, academicYearId: year.id },
  });
  const enroll = async (classId: string) => {
    const students = [];
    for (let index = 0; index < studentsPerClass; index += 1) {
      const student = await createUser(prisma, ['STUDENT']);
      await prisma.enrollment.create({
        data: { studentId: student.id, classId, academicYearId: year.id, startsOn: year.startsOn },
      });
      students.push({ id: student.id, login: student.login });
    }
    return students;
  };
  return {
    subjectId: subject.id,
    classA: { id: classA.id, name: classA.name },
    classB: { id: classB.id, name: classB.name },
    teacher: { id: teacher.id, login: teacher.login },
    otherTeacher: { id: otherTeacher.id, login: otherTeacher.login },
    studentsA: await enroll(classA.id),
    studentsB: await enroll(classB.id),
  };
}

export const singleChoice = (
  stem: string,
  category: 'KNOWLEDGE' | 'APPLICATION' | 'REASONING',
  points: number,
  correct = 'a',
) => ({
  type: 'SINGLE_CHOICE' as const,
  stem,
  options: [
    { id: 'a', text: `${stem} — A` },
    { id: 'b', text: `${stem} — B` },
    { id: 'c', text: `${stem} — C` },
  ],
  correctOptionId: correct,
  category,
  difficulty: 'MEDIUM' as const,
  points,
});

type Agent = ReturnType<typeof request.agent>;

/** O‘qituvchi nomidan test yaratadi (savollar: kategoriya va ball bilan). */
export async function createTest(
  agent: Agent,
  subjectId: string,
  questions: { stem: string; category: 'KNOWLEDGE' | 'APPLICATION' | 'REASONING'; points: number; correct?: string }[],
) {
  const created = await agent.post('/api/tests').send({ title: `Test ${suffix()}`, subjectId, gradeLevel: 9 });
  if (created.status !== 201) throw new Error(JSON.stringify(created.body));
  let body = created.body;
  for (const question of questions) {
    const response = await agent
      .post(`/api/tests/${body.id}/questions`)
      .send({ content: singleChoice(question.stem, question.category, question.points, question.correct) });
    if (response.status !== 201) throw new Error(JSON.stringify(response.body));
    body = response.body;
  }
  return body as {
    id: string;
    version: { questions: { testQuestionId: string; questionId: string; correctOptionId: string }[] };
  };
}

export async function createSession(
  agent: Agent,
  testId: string,
  classIds: string[],
  overrides: Record<string, unknown> = {},
) {
  const now = Date.now();
  const response = await agent.post('/api/sessions').send({
    testId,
    audience: { classIds, studentIds: [] },
    startsAt: new Date(now - 60_000).toISOString(),
    endsAt: new Date(now + 60 * 60_000).toISOString(),
    durationMinutes: 30,
    scoreVisibility: 'AFTER_SUBMIT',
    ...overrides,
  });
  if (response.status !== 201) throw new Error(JSON.stringify(response.body));
  return response.body as { id: string; accessCode: string; state: string };
}

export const clientId = () => `client${suffix()}${suffix()}`;

export async function startAttempt(agent: Agent, sessionId: string, code: string, client = clientId()) {
  const response = await agent.post(`/api/me/sessions/${sessionId}/start`).send({ code, clientId: client });
  if (response.status !== 200) throw new Error(JSON.stringify(response.body));
  const view = await agent.get(`/api/attempts/${response.body.attemptId}`).query({ clientId: client });
  return { attemptId: response.body.attemptId as string, client, view: view.body };
}

/** supertest uchun ikkilik javobni Buffer sifatida o‘qish. */
export function binaryParser(res: unknown, callback: (error: Error | null, body: Buffer) => void) {
  const stream = res as NodeJS.ReadableStream;
  const chunks: Buffer[] = [];
  stream.on('data', (chunk: Buffer | string) =>
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, 'binary')),
  );
  stream.on('end', () => callback(null, Buffer.concat(chunks)));
}
