/**
 * Mahalliy ishlab chiqish uchun demo ma’lumotlar: maktab, o‘quv yili, fanlar, sinflar,
 * xodimlar va o‘quvchilar, savollar banki, test va sessiyalar, portfolio yozuvlari.
 *
 * Ishga tushirish: pnpm db:seed
 * Barcha demo hisoblar paroli SEED_DEMO_PASSWORD (standart: Demo2026!).
 * DIQQAT: haqiqiy maktab bazasida ishlatmang.
 */
import 'dotenv/config';
import { createHash, randomInt, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  gradeAttempt,
  normalizeForSearch,
  portfolioDetailsSummary,
  userSearchText,
  type AchievementLevel,
  type Category,
  type GradableQuestion,
  type PortfolioItemType,
  type Role,
} from '@ijod/shared';
import { hashPassword } from '../src/auth/passwords.js';
import { PrismaClient, type Prisma } from '../src/generated/prisma/client.js';
import { snapshotOf } from '../src/portfolio/portfolio-common.js';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
});

const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD || 'Demo2026!';
const DEMO_ACCESS_CODE = 'KV2026';

const difficultyOf = (category: Category) =>
  category === 'KNOWLEDGE' ? 'EASY' : category === 'APPLICATION' ? 'MEDIUM' : 'HARD';

const toLogin = (first: string, last: string) =>
  `${first}.${last}`
    .toLowerCase()
    .replace(/[‘’'ʻʼ`]/g, '')
    .replace(/[^a-z0-9.]/g, '');

async function main() {
  if ((await prisma.user.count()) > 0) {
    console.log('Baza allaqachon to‘ldirilgan — seed o‘tkazib yuborildi.');
    return;
  }

  const passwordHash = await hashPassword(DEMO_PASSWORD);

  await prisma.school.create({
    data: { id: 1, name: 'Hamid Olimjon va Zulfiya ijod maktabi', shortName: 'Ijod maktabi' },
  });

  const year = await prisma.academicYear.create({
    data: {
      name: '2026–2027',
      startsOn: new Date('2026-09-02'),
      endsOn: new Date('2027-05-25'),
      isCurrent: true,
    },
  });

  const subjectNames = [
    'Matematika',
    'Ona tili va adabiyot',
    'Ingliz tili',
    'Fizika',
    'Tarix',
    'Informatika',
    'Kimyo',
    'Biologiya',
  ];
  const subjects = Object.fromEntries(
    await Promise.all(
      subjectNames.map(async (name) => [name, await prisma.subject.create({ data: { name } })] as const),
    ),
  );

  async function createUser(input: {
    lastName: string;
    firstName: string;
    middleName?: string;
    login?: string;
    roles: Role[];
  }) {
    const login = input.login ?? toLogin(input.firstName, input.lastName);
    return prisma.user.create({
      data: {
        login,
        passwordHash,
        mustChangePassword: false,
        lastName: input.lastName,
        firstName: input.firstName,
        middleName: input.middleName ?? null,
        searchText: userSearchText({ ...input, login }),
        roles: { create: input.roles.map((role) => ({ role })) },
      },
    });
  }

  // ---------------------------------------------------------------- Xodimlar
  await createUser({
    lastName: 'Tizim',
    firstName: 'Administratori',
    login: 'superadmin',
    roles: ['SUPER_ADMIN'],
  });
  await createUser({
    lastName: 'Saidova',
    firstName: 'Nigora',
    middleName: 'Alisherovna',
    login: 'admin',
    roles: ['ADMIN'],
  });
  const deputy = await createUser({
    lastName: 'Yusupov',
    firstName: 'Bahodir',
    middleName: 'Karimovich',
    login: 'b.yusupov',
    roles: ['DEPUTY', 'TEACHER'],
  });
  // Dars bermaydigan direktor o‘rinbosari: faqat rahbariyat bo‘limlari (test banki, sessiyalar, hisoblar).
  await createUser({
    lastName: 'Rahbarova',
    firstName: 'Nodira',
    middleName: 'Shavkatovna',
    login: 'n.rahbarova',
    roles: ['DEPUTY'],
  });
  const karimova = await createUser({
    lastName: 'Karimova',
    firstName: 'Dilnoza',
    middleName: 'Rustamovna',
    login: 'd.karimova',
    roles: ['TEACHER'],
  });
  const rahimov = await createUser({
    lastName: 'Rahimov',
    firstName: 'Jasur',
    middleName: 'Anvarovich',
    login: 'j.rahimov',
    roles: ['TEACHER'],
  });
  const tursunova = await createUser({
    lastName: 'Tursunova',
    firstName: 'Malika',
    middleName: 'Baxtiyorovna',
    login: 'm.tursunova',
    roles: ['TEACHER'],
  });

  // ---------------------------------------------------------------- Sinflar
  const makeClass = (gradeLevel: number, section: string, homeroomTeacherId: string) =>
    prisma.class.create({
      data: {
        academicYearId: year.id,
        gradeLevel,
        section,
        name: `${gradeLevel}-${section}`,
        homeroomTeacherId,
      },
    });
  const class9A = await makeClass(9, 'A', karimova.id);
  const class9B = await makeClass(9, 'B', tursunova.id);
  const class10A = await makeClass(10, 'A', rahimov.id);

  const roster: Record<string, [string, string, string][]> = {
    [class9A.id]: [
      ['Aliyev', 'Ali', 'Valiyevich'],
      ['Karimova', 'Zebo', 'Anvarovna'],
      ['Toshmatov', 'Sardor', 'Ilhomovich'],
      ['Qodirova', 'Madina', 'Sherzodovna'],
      ['Ergashev', 'Bekzod', 'Rustamovich'],
      ['Nazarova', 'Shahzoda', 'Olimovna'],
      ['G‘ulomov', 'Otabek', 'Farhodovich'],
      ['O‘rinboyeva', 'Nilufar', 'Akmalovna'],
    ],
    [class9B.id]: [
      ['Abdullayev', 'Jahongir', 'Botirovich'],
      ['Xolmatova', 'Sevara', 'Ulug‘bekovna'],
      ['Rustamov', 'Doniyor', 'Shuhratovich'],
      ['Islomova', 'Feruza', 'Nodirovna'],
      ['Sobirov', 'Aziz', 'Jamshidovich'],
      ['Umarova', 'Laylo', 'Baxromovna'],
    ],
    [class10A.id]: [
      ['Mirzayev', 'Temur', 'Sanjarovich'],
      ['Hamidova', 'Dilafruz', 'Erkinovna'],
      ['Yo‘ldoshev', 'Shoxrux', 'Dilshodovich'],
      ['Ahmedova', 'Kamola', 'Rashidovna'],
      ['Nurmatov', 'Eldor', 'Hasanovich'],
      ['Saidova', 'Munisa', 'Anvarovna'],
      ['Abduganiyev', 'Jaloliddin', 'Baxtiyorovich'],
    ],
  };

  const studentsByClass: Record<string, { id: string }[]> = {};
  for (const [classId, people] of Object.entries(roster)) {
    studentsByClass[classId] = [];
    for (const [lastName, firstName, middleName] of people) {
      const student = await createUser({ lastName, firstName, middleName, roles: ['STUDENT'] });
      await prisma.enrollment.create({
        data: { studentId: student.id, classId, academicYearId: year.id, startsOn: year.startsOn },
      });
      studentsByClass[classId]!.push(student);
    }
  }

  // ---------------------------------------------------------------- Biriktirishlar
  const teach = (teacherId: string, subject: string, classId: string) =>
    prisma.teachingAssignment.create({
      data: { teacherId, subjectId: subjects[subject]!.id, classId, academicYearId: year.id },
    });
  await teach(karimova.id, 'Matematika', class9A.id);
  await teach(karimova.id, 'Matematika', class9B.id);
  // 9-B da matematika ikki guruhda o‘tiladi: sinf rahbari ham bankdagi algebra testini o‘z sinfiga o‘tkaza oladi.
  await teach(tursunova.id, 'Matematika', class9B.id);
  await teach(karimova.id, 'Fizika', class10A.id);
  await teach(rahimov.id, 'Ona tili va adabiyot', class9A.id);
  await teach(rahimov.id, 'Ona tili va adabiyot', class9B.id);
  await teach(rahimov.id, 'Ona tili va adabiyot', class10A.id);
  await teach(tursunova.id, 'Ingliz tili', class10A.id);
  await teach(tursunova.id, 'Informatika', class9B.id);
  await teach(deputy.id, 'Tarix', class10A.id);

  // ---------------------------------------------------------------- Savollar banki
  type Seeded = { stem: string; options: string[]; category: Category; points: number; explanation?: string };
  const math: Seeded[] = [
    {
      stem: 'Kvadrat tenglamaning umumiy ko‘rinishini ko‘rsating.',
      options: ['ax² + bx + c = 0, bunda a ≠ 0', 'ax + b = 0', 'ax³ + bx = 0', 'a/x + b = 0'],
      category: 'KNOWLEDGE',
      points: 2,
    },
    {
      stem: 'Kvadrat tenglama diskriminantining formulasi qaysi?',
      options: ['D = b² − 4ac', 'D = b² + 4ac', 'D = 4ac − b²', 'D = b − 4ac'],
      category: 'KNOWLEDGE',
      points: 2,
    },
    {
      stem: 'Agar D < 0 bo‘lsa, kvadrat tenglama nechta haqiqiy ildizga ega?',
      options: ['Haqiqiy ildizi yo‘q', 'Bitta', 'Ikkita', 'Cheksiz ko‘p'],
      category: 'KNOWLEDGE',
      points: 2,
    },
    {
      stem: 'x² − 5x + 6 = 0 tenglamaning ildizlarini toping.',
      options: ['2 va 3', '−2 va −3', '1 va 6', '−1 va 6'],
      category: 'APPLICATION',
      points: 4,
      explanation: 'Viyet teoremasi: x₁ + x₂ = 5, x₁·x₂ = 6, demak 2 va 3.',
    },
    {
      stem: 'x² − 16 = 0 tenglamaning musbat ildizi nechaga teng?',
      options: ['4', '8', '−4', '16'],
      category: 'APPLICATION',
      points: 4,
    },
    {
      stem: '2x² + 3x − 2 = 0 tenglamaning diskriminantini hisoblang.',
      options: ['25', '7', '−7', '17'],
      category: 'APPLICATION',
      points: 4,
      explanation: 'D = 3² − 4·2·(−2) = 9 + 16 = 25.',
    },
    {
      stem: 'x² + px + 9 = 0 tenglama ikkita teng ildizga ega bo‘lishi uchun p ning musbat qiymati qancha bo‘lishi kerak?',
      options: ['6', '3', '9', '18'],
      category: 'REASONING',
      points: 6,
      explanation: 'Teng ildizlar uchun D = p² − 36 = 0, demak p = 6.',
    },
    {
      stem: 'Ildizlari 3 va −5 bo‘lgan keltirilgan kvadrat tenglamani toping.',
      options: ['x² + 2x − 15 = 0', 'x² − 2x − 15 = 0', 'x² + 2x + 15 = 0', 'x² − 8x + 15 = 0'],
      category: 'REASONING',
      points: 6,
    },
    {
      stem: 'To‘g‘ri to‘rtburchakning yuzi 24 sm², bir tomoni ikkinchisidan 2 sm uzun. Kichik tomoni necha sm?',
      options: ['4', '6', '3', '8'],
      category: 'REASONING',
      points: 6,
      explanation: 'x(x + 2) = 24 ⇒ x² + 2x − 24 = 0 ⇒ x = 4.',
    },
  ];

  const optionIds = ['a', 'b', 'c', 'd'];
  const questionVersions: { id: string; category: Category; points: number }[] = [];
  for (const item of math) {
    const question = await prisma.question.create({
      data: {
        ownerId: karimova.id,
        subjectId: subjects['Matematika']!.id,
        gradeLevel: 9,
        topic: 'Kvadrat tenglamalar',
        tags: ['algebra', '1-bob'],
        searchText: normalizeForSearch(`${item.stem} Kvadrat tenglamalar`),
        category: item.category,
        difficulty: difficultyOf(item.category),
        versions: {
          create: {
            versionNo: 1,
            type: 'SINGLE_CHOICE',
            stem: item.stem,
            options: item.options.map((text, index) => ({ id: optionIds[index]!, text })),
            answerKey: { correctOptionId: 'a' },
            explanation: item.explanation ?? null,
            category: item.category,
            difficulty: difficultyOf(item.category),
            points: item.points,
            lockedAt: new Date(),
            createdById: karimova.id,
          },
        },
      },
      include: { versions: true },
    });
    const version = question.versions[0]!;
    questionVersions.push({ id: version.id, category: item.category, points: item.points });
  }

  // ---------------------------------------------------------------- Test (muzlatilgan versiya bilan)
  const template = await prisma.testTemplate.create({
    data: {
      ownerId: karimova.id,
      originalAuthorId: karimova.id,
      title: 'Algebra: kvadrat tenglamalar (1-bob)',
      subjectId: subjects['Matematika']!.id,
      gradeLevel: 9,
      topic: 'Kvadrat tenglamalar',
      goal: 'Kvadrat tenglamalarni yechish va diskriminantdan foydalanish ko‘nikmasini tekshirish',
      academicYearId: year.id,
      tags: ['algebra', 'nazorat ishi'],
      status: 'ACTIVE',
      // Maktab test bankida: barcha o‘qituvchilar muzlatilgan v1 ni ko‘radi va nusxa oladi. Sessiya esa
      // Matematikadan dars beriladigan sinfga o‘tkaziladi: d.karimova (9-A, 9-B), m.tursunova (9-B);
      // rahbariyat (b.yusupov, n.rahbarova) — istalgan sinfga.
      visibility: 'SCHOOL',
      schoolSharedAt: new Date(),
      searchText: normalizeForSearch('Algebra: kvadrat tenglamalar (1-bob) Kvadrat tenglamalar'),
    },
  });
  const blueprint = {
    KNOWLEDGE: { count: 3, pointsEach: 2 },
    APPLICATION: { count: 3, pointsEach: 4 },
    REASONING: { count: 3, pointsEach: 6 },
  };
  const frozen = await prisma.testVersion.create({
    data: {
      templateId: template.id,
      versionNo: 1,
      status: 'FROZEN',
      title: template.title,
      instructions: 'Har bir savolda bitta to‘g‘ri javobni tanlang. Javoblar avtomatik saqlanadi.',
      blueprint,
      totalPoints: 36,
      frozenAt: new Date(),
      frozenById: karimova.id,
      questions: {
        create: questionVersions.map((version, index) => ({
          questionVersionId: version.id,
          position: index,
          points: version.points,
        })),
      },
    },
    include: { questions: true },
  });
  // Tahrirlash uchun ish nusxasi (keyingi versiya qoralamasi).
  await prisma.testVersion.create({
    data: {
      templateId: template.id,
      versionNo: 2,
      status: 'DRAFT',
      title: template.title,
      instructions: frozen.instructions,
      blueprint,
      totalPoints: 36,
      questions: {
        create: questionVersions.map((version, index) => ({
          questionVersionId: version.id,
          position: index,
          points: version.points,
        })),
      },
    },
  });

  const now = Date.now();
  const minutes = (value: number) => value * 60_000;

  // 1) 9-A uchun hozir ochiq sessiya — demo uchun o‘quvchi sifatida kirib topshirish mumkin.
  const openSession = await prisma.assessmentSession.create({
    data: {
      testVersionId: frozen.id,
      title: 'Algebra: kvadrat tenglamalar — nazorat ishi',
      subjectId: subjects['Matematika']!.id,
      academicYearId: year.id,
      createdById: karimova.id,
      conductorId: karimova.id,
      startsAt: new Date(now - minutes(5)),
      endsAt: new Date(now + minutes(60 * 24 * 7)),
      durationMinutes: 20,
      scoreVisibility: 'AFTER_SUBMIT',
      reviewVisibility: 'AFTER_CLOSE',
      categoryThresholdPercent: 60,
      passPercent: 50,
      accessCode: DEMO_ACCESS_CODE,
    },
  });
  for (const student of studentsByClass[class9A.id]!) {
    await prisma.sessionAssignment.create({
      data: {
        sessionId: openSession.id,
        studentId: student.id,
        classId: class9A.id,
        assignedById: karimova.id,
      },
    });
  }

  // 2) 9-B uchun o‘tgan hafta yakunlangan sessiya — tahlil va eksportni ko‘rish uchun natijalar bilan.
  const closedStart = now - minutes(60 * 24 * 7);
  const closedSession = await prisma.assessmentSession.create({
    data: {
      testVersionId: frozen.id,
      title: 'Algebra: kvadrat tenglamalar — nazorat ishi',
      subjectId: subjects['Matematika']!.id,
      academicYearId: year.id,
      createdById: karimova.id,
      conductorId: karimova.id,
      startsAt: new Date(closedStart),
      endsAt: new Date(closedStart + minutes(45)),
      durationMinutes: 30,
      categoryThresholdPercent: 60,
      passPercent: 50,
      accessCode: 'TX' + String(randomInt(1000, 9999)),
      resultsPublishedAt: new Date(closedStart + minutes(45)),
    },
  });

  const gradable: GradableQuestion[] = frozen.questions.map((question) => {
    const meta = questionVersions.find((version) => version.id === question.questionVersionId)!;
    return {
      id: question.id,
      type: 'SINGLE_CHOICE',
      category: meta.category,
      points: meta.points,
      answerKey: { correctOptionId: 'a' },
    };
  });
  // Har bir o‘quvchi uchun javoblar: 'a' — to‘g‘ri, boshqa harf — noto‘g‘ri, null — javobsiz.
  const answerSheets: (string | null)[][] = [
    ['a', 'a', 'a', 'a', 'a', 'a', 'a', 'b', 'a'],
    ['a', 'a', 'b', 'a', 'a', 'c', 'b', 'b', 'a'],
    ['a', 'b', 'a', 'a', 'c', 'b', 'c', 'b', null],
    ['a', 'a', 'a', 'b', 'a', 'a', 'b', 'b', 'c'],
    ['b', 'c', 'a', 'b', 'c', 'c', 'b', null, null],
  ];
  const students9B = studentsByClass[class9B.id]!;
  for (const [index, student] of students9B.entries()) {
    const assignment = await prisma.sessionAssignment.create({
      data: {
        sessionId: closedSession.id,
        studentId: student.id,
        classId: class9B.id,
        assignedById: karimova.id,
      },
    });
    const sheet = answerSheets[index];
    if (!sheet) continue; // oxirgi o‘quvchi qatnashmagan
    const startedAt = new Date(closedStart + minutes(2 + index));
    const submittedAt = new Date(startedAt.getTime() + minutes(15 + index * 2));
    const answers = Object.fromEntries(
      gradable.map((question, qIndex) => [question.id, { optionId: sheet[qIndex] ?? null }]),
    );
    const grade = gradeAttempt(gradable, answers);
    await prisma.attempt.create({
      data: {
        sessionId: closedSession.id,
        assignmentId: assignment.id,
        studentId: student.id,
        attemptNo: 1,
        status: 'SUBMITTED',
        startedAt,
        deadlineAt: new Date(startedAt.getTime() + minutes(30)),
        submittedAt,
        submitSource: 'STUDENT',
        questionOrder: gradable.map((question) => question.id),
        score: grade.total.earned,
        maxScore: grade.total.max,
        categoryScores: grade.categories as Prisma.InputJsonValue,
        gradedAt: submittedAt,
        gradingVersion: 1,
        lastSeenAt: submittedAt,
        answers: {
          create: grade.questions.map((result) => ({
            testQuestionId: result.questionId,
            optionId: answers[result.questionId]?.optionId ?? null,
            revision: 1,
            savedAt: submittedAt,
            isCorrect: result.outcome === 'CORRECT',
            pointsAwarded: result.earned,
          })),
        },
      },
    });
  }

  // ---------------------------------------------------------------- Ona tili testi (qoralama)
  await prisma.testTemplate.create({
    data: {
      ownerId: rahimov.id,
      originalAuthorId: rahimov.id,
      title: 'Ona tili: fe’l zamonlari',
      subjectId: subjects['Ona tili va adabiyot']!.id,
      gradeLevel: 10,
      topic: 'Fe’l zamonlari',
      academicYearId: year.id,
      tags: ['grammatika'],
      searchText: normalizeForSearch('Ona tili: fe’l zamonlari'),
      versions: {
        create: {
          versionNo: 1,
          status: 'DRAFT',
          title: 'Ona tili: fe’l zamonlari',
          blueprint: { KNOWLEDGE: { count: 5, pointsEach: 2 }, APPLICATION: { count: 5, pointsEach: 4 } },
        },
      },
    },
  });

  // ---------------------------------------------------------------- Portfolio
  const storageDir = resolve(process.env.STORAGE_DIR || './storage');
  await mkdir(join(storageDir, 'files'), { recursive: true });

  /** Demo dalil fayli: kichik haqiqiy PDF (matni lotin harflarida, xref jadvali bilan) yopiq omborga yoziladi. */
  async function demoPdf(ownerId: string, originalName: string, lines: string[]) {
    const text = lines
      .map((line, index) => `BT /F1 ${index === 0 ? 20 : 12} Tf 60 ${770 - index * 28} Td (${line}) Tj ET`)
      .join('\n');
    const objects = [
      '<</Type/Catalog/Pages 2 0 R>>',
      '<</Type/Pages/Kids[3 0 R]/Count 1>>',
      '<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>',
      `<</Length ${Buffer.byteLength(text)}>>stream\n${text}\nendstream`,
      '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>',
    ];
    let body = '%PDF-1.4\n';
    const offsets: number[] = [];
    objects.forEach((object, index) => {
      offsets.push(Buffer.byteLength(body));
      body += `${index + 1} 0 obj\n${object}\nendobj\n`;
    });
    const xref = Buffer.byteLength(body);
    body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    body += offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
    body += `trailer\n<</Size ${objects.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF\n`;
    const pdf = Buffer.from(body, 'latin1');
    const storageKey = `${randomUUID()}.pdf`;
    await writeFile(join(storageDir, 'files', storageKey), pdf, { mode: 0o600 });
    return prisma.fileAsset.create({
      data: {
        ownerId,
        storageKey,
        originalName,
        mimeType: 'application/pdf',
        sizeBytes: pdf.length,
        sha256: createHash('sha256').update(pdf).digest('hex'),
      },
    });
  }

  const daysAgo = (days: number) => new Date(now - days * 24 * 60 * 60_000);

  interface DemoItem {
    ownerId: string;
    type: PortfolioItemType;
    title: string;
    subject?: string;
    organization?: string;
    date: string;
    level?: AchievementLevel;
    details?: Record<string, unknown>;
    result?: string;
    description?: string;
    direction?: string;
    file?: { name: string; lines: string[] };
    status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'RETURNED';
    reviewerId?: string;
    returnReason?: string;
    /** Necha kun oldin tekshiruvga yuborilgan (va ko‘rib chiqilgan). */
    sentDaysAgo?: number;
  }

  /** Portfolio yozuvi: tuzilgan turlarda natija details dan yasaladi, qarorlar to‘liq snapshot bilan saqlanadi. */
  async function addPortfolio(input: DemoItem) {
    const file = input.file ? await demoPdf(input.ownerId, input.file.name, input.file.lines) : null;
    const result = input.details ? portfolioDetailsSummary(input.type, input.details) : (input.result ?? null);
    const sentAt = daysAgo(input.sentDaysAgo ?? 3);
    const reviewed = input.status === 'APPROVED' || input.status === 'RETURNED';
    const item = await prisma.portfolioItem.create({
      data: {
        ownerId: input.ownerId,
        type: input.type,
        title: input.title,
        subjectId: input.subject ? subjects[input.subject]!.id : null,
        direction: input.direction ?? null,
        description: input.description ?? null,
        organization: input.organization ?? null,
        date: new Date(input.date),
        level: input.level ?? null,
        result,
        details: (input.details ?? undefined) as Prisma.InputJsonValue | undefined,
        evidenceFileId: file?.id ?? null,
        status: input.status,
        submittedAt: input.status === 'DRAFT' ? null : sentAt,
        reviewerId: reviewed ? input.reviewerId : null,
        reviewedAt: reviewed ? new Date(sentAt.getTime() + 26 * 60 * 60_000) : null,
        returnReason: input.status === 'RETURNED' ? input.returnReason : null,
        searchText: normalizeForSearch(
          [input.title, input.direction, input.organization, result].filter(Boolean).join(' '),
        ),
      },
      include: { subject: { select: { name: true } }, evidenceFile: { select: { originalName: true } } },
    });
    if (reviewed) {
      await prisma.portfolioReview.create({
        data: {
          itemId: item.id,
          reviewerId: input.reviewerId!,
          decision: input.status,
          reason: input.status === 'RETURNED' ? input.returnReason : null,
          snapshot: snapshotOf(item) as Prisma.InputJsonValue,
          createdAt: item.reviewedAt!,
        },
      });
    }
    return item;
  }

  const student = (login: string) => prisma.user.findUniqueOrThrow({ where: { login } });

  // Zebo (9-A): tasdiqlangan she’r va tekshiruvdagi olimpiada.
  const zebo = studentsByClass[class9A.id]![1]!;
  await addPortfolio({
    ownerId: zebo.id,
    type: 'POEM',
    title: '“Kuz ohanglari” she’ri',
    direction: 'Badiiy ijod',
    description: 'Maktab devoriy gazetasida chop etilgan she’r.',
    organization: 'Ijod maktabi',
    date: '2026-09-20',
    level: 'SCHOOL',
    status: 'APPROVED',
    reviewerId: karimova.id,
    sentDaysAgo: 5,
  });
  await addPortfolio({
    ownerId: zebo.id,
    type: 'OLYMPIAD',
    title: 'Matematika fan olimpiadasi, tuman bosqichi',
    subject: 'Matematika',
    organization: 'Tuman xalq ta’limi bo‘limi',
    date: '2026-09-25',
    level: 'DISTRICT',
    details: { subject: 'Matematika', place: 'SECOND' },
    file: {
      name: 'olimpiada-diplom.pdf',
      lines: ['Diplom (DEMO)', 'Matematika fan olimpiadasi, tuman bosqichi', "2-o'rin"],
    },
    status: 'SUBMITTED',
    sentDaysAgo: 1,
  });
  await prisma.portfolioItem.create({
    data: {
      ownerId: karimova.id,
      type: 'METHODICAL_WORK',
      title: '“Kvadrat tenglamalar” mavzusi bo‘yicha interaktiv mashqlar to‘plami',
      subjectId: subjects['Matematika']!.id,
      date: new Date('2026-09-15'),
      level: 'SCHOOL',
      status: 'SUBMITTED',
      submittedAt: new Date(),
      searchText: normalizeForSearch('Kvadrat tenglamalar interaktiv mashqlar'),
    },
  });

  // Jaloliddin Abduganiyev (10-A): xalqaro va milliy sertifikatlar, olimpiada; ikkita yozuv tekshiruvda.
  const jaloliddin = await student('jaloliddin.abduganiyev');
  await addPortfolio({
    ownerId: jaloliddin.id,
    type: 'IELTS',
    title: 'IELTS Academic — 7.5',
    organization: 'British Council',
    date: '2026-06-13',
    level: 'INTERNATIONAL',
    details: {
      testType: 'ACADEMIC',
      overall: 7.5,
      listening: 8,
      reading: 7.5,
      writing: 6.5,
      speaking: 7,
      trfNumber: '26UZ004512ABDJ001A',
    },
    file: {
      name: 'IELTS_TRF_Abduganiyev.pdf',
      lines: ['IELTS Test Report Form (DEMO)', 'Candidate: Abduganiyev Jaloliddin', 'Academic - Overall band 7.5'],
    },
    status: 'APPROVED',
    reviewerId: rahimov.id,
    sentDaysAgo: 90,
  });
  await addPortfolio({
    ownerId: jaloliddin.id,
    type: 'NATIONAL_CERTIFICATE',
    title: 'Milliy sertifikat — Matematika (A+)',
    subject: 'Matematika',
    organization: 'Bilim va malakalarni baholash agentligi',
    date: '2026-05-20',
    level: 'NATIONAL',
    details: {
      subject: 'Matematika',
      grade: 'A+',
      score: 95,
      certificateNumber: 'MS-2026-104578',
      validUntil: '2029-05-20',
    },
    file: {
      name: 'milliy-sertifikat-matematika.pdf',
      lines: ['Milliy sertifikat (DEMO)', 'Abduganiyev Jaloliddin', 'Matematika - A+ (95 ball)'],
    },
    status: 'APPROVED',
    reviewerId: rahimov.id,
    sentDaysAgo: 110,
  });
  await addPortfolio({
    ownerId: jaloliddin.id,
    type: 'SAT',
    title: 'SAT — 1450',
    organization: 'College Board',
    date: '2026-03-14',
    level: 'INTERNATIONAL',
    details: { total: 1450, readingWriting: 720, math: 730 },
    file: { name: 'SAT_score_report.pdf', lines: ['SAT Score Report (DEMO)', 'Total 1450: RW 720, Math 730'] },
    status: 'APPROVED',
    reviewerId: deputy.id,
    sentDaysAgo: 170,
  });
  await addPortfolio({
    ownerId: jaloliddin.id,
    type: 'OLYMPIAD',
    title: 'Fizika fan olimpiadasi — viloyat bosqichi',
    subject: 'Fizika',
    organization: 'Viloyat maktabgacha va maktab ta’limi boshqarmasi',
    date: '2026-02-18',
    level: 'REGION',
    details: { subject: 'Fizika', place: 'FIRST' },
    file: {
      name: 'fizika-olimpiada-diplom.pdf',
      lines: ['Diplom (DEMO)', 'Fizika fan olimpiadasi, viloyat bosqichi', "1-o'rin"],
    },
    status: 'APPROVED',
    reviewerId: rahimov.id,
    sentDaysAgo: 200,
  });
  // Yangi yozuv: hali hech qachon tasdiqlanmagan.
  await addPortfolio({
    ownerId: jaloliddin.id,
    type: 'CEFR',
    title: 'CEFR — Ingliz tili (B2)',
    organization: 'Bilim va malakalarni baholash agentligi',
    date: '2026-09-10',
    level: 'NATIONAL',
    details: {
      language: 'Ingliz tili',
      level: 'B2',
      score: 58,
      provider: 'Multilevel',
      certificateNumber: 'ML-2026-33871',
    },
    file: { name: 'cefr-b2-sertifikat.pdf', lines: ['CEFR sertifikati (DEMO)', 'Ingliz tili - B2 (Multilevel)'] },
    status: 'SUBMITTED',
    sentDaysAgo: 2,
  });
  // O‘zgartirilgan yozuv: avval B+ bilan tasdiqlangan, o‘quvchi qayta topshirib A oldi va yangiladi.
  const previousFile = await demoPdf(jaloliddin.id, 'milliy-ona-tili-2025.pdf', [
    'Milliy sertifikat (DEMO)',
    'Ona tili va adabiyot - B+ (78 ball)',
  ]);
  const retaken = await addPortfolio({
    ownerId: jaloliddin.id,
    type: 'NATIONAL_CERTIFICATE',
    title: 'Milliy sertifikat — Ona tili va adabiyot (A)',
    subject: 'Ona tili va adabiyot',
    organization: 'Bilim va malakalarni baholash agentligi',
    date: '2026-08-22',
    level: 'NATIONAL',
    details: { subject: 'Ona tili va adabiyot', grade: 'A', score: 88, certificateNumber: 'MS-2026-219044' },
    file: {
      name: 'milliy-ona-tili-2026.pdf',
      lines: ['Milliy sertifikat (DEMO)', 'Ona tili va adabiyot - A (88 ball)'],
    },
    status: 'SUBMITTED',
    sentDaysAgo: 1,
  });
  await prisma.portfolioReview.create({
    data: {
      itemId: retaken.id,
      reviewerId: rahimov.id,
      decision: 'APPROVED',
      createdAt: daysAgo(280),
      snapshot: {
        ...snapshotOf({
          ...retaken,
          title: 'Milliy sertifikat — Ona tili va adabiyot (B+)',
          date: new Date('2025-11-29'),
          result: 'Ona tili va adabiyot — B+ (78 ball)',
          details: { subject: 'Ona tili va adabiyot', grade: 'B+', score: 78, certificateNumber: 'MS-2025-087310' },
          evidenceFileId: previousFile.id,
          evidenceFile: { originalName: previousFile.originalName },
        }),
      } as Prisma.InputJsonValue,
    },
  });

  // Boshqa o‘quvchilar: katalogda turli natijalar (9-B sinfida hali yozuv yo‘q).
  const temur = await student('temur.mirzayev');
  await addPortfolio({
    ownerId: temur.id,
    type: 'IELTS',
    title: 'IELTS Academic — 6.5',
    organization: 'IDP',
    date: '2026-04-25',
    level: 'INTERNATIONAL',
    details: { testType: 'ACADEMIC', overall: 6.5, listening: 7, reading: 6.5, writing: 6, speaking: 6.5 },
    file: { name: 'ielts-trf.pdf', lines: ['IELTS Test Report Form (DEMO)', 'Academic - Overall band 6.5'] },
    status: 'APPROVED',
    reviewerId: rahimov.id,
    sentDaysAgo: 140,
  });
  await addPortfolio({
    ownerId: temur.id,
    type: 'NATIONAL_CERTIFICATE',
    title: 'Milliy sertifikat — Tarix (B+)',
    subject: 'Tarix',
    organization: 'Bilim va malakalarni baholash agentligi',
    date: '2026-05-27',
    level: 'NATIONAL',
    details: { subject: 'Tarix', grade: 'B+', score: 76 },
    status: 'APPROVED',
    reviewerId: rahimov.id,
    sentDaysAgo: 100,
  });
  const dilafruz = await student('dilafruz.hamidova');
  await addPortfolio({
    ownerId: dilafruz.id,
    type: 'NATIONAL_CERTIFICATE',
    title: 'Milliy sertifikat — Ona tili va adabiyot (A+)',
    subject: 'Ona tili va adabiyot',
    organization: 'Bilim va malakalarni baholash agentligi',
    date: '2026-05-20',
    level: 'NATIONAL',
    details: { subject: 'Ona tili va adabiyot', grade: 'A+', score: 97 },
    file: { name: 'milliy-sertifikat.pdf', lines: ['Milliy sertifikat (DEMO)', 'Ona tili va adabiyot - A+ (97 ball)'] },
    status: 'APPROVED',
    reviewerId: rahimov.id,
    sentDaysAgo: 105,
  });
  await addPortfolio({
    ownerId: dilafruz.id,
    type: 'CONTEST',
    title: '“Zulfiya izdoshlari” respublika ko‘rik-tanlovi',
    direction: 'She’riyat',
    organization: 'O‘zbekiston Yozuvchilar uyushmasi',
    date: '2026-03-08',
    level: 'NATIONAL',
    result: 'Faxriy yorliq',
    status: 'APPROVED',
    reviewerId: rahimov.id,
    sentDaysAgo: 190,
  });
  await addPortfolio({
    ownerId: dilafruz.id,
    type: 'IELTS',
    title: 'IELTS Academic — 7.0',
    organization: 'British Council',
    date: '2026-09-05',
    level: 'INTERNATIONAL',
    details: { testType: 'ACADEMIC', overall: 7, listening: 7.5, reading: 7, writing: 6.5, speaking: 7 },
    file: { name: 'ielts-7.pdf', lines: ['IELTS Test Report Form (DEMO)', 'Academic - Overall band 7.0'] },
    status: 'SUBMITTED',
    sentDaysAgo: 4,
  });
  const kamola = await student('kamola.ahmedova');
  await addPortfolio({
    ownerId: kamola.id,
    type: 'SAT',
    title: 'SAT — 1320',
    organization: 'College Board',
    date: '2026-06-06',
    level: 'INTERNATIONAL',
    details: { total: 1320, readingWriting: 680, math: 640 },
    status: 'APPROVED',
    reviewerId: deputy.id,
    sentDaysAgo: 80,
  });
  await addPortfolio({
    ownerId: kamola.id,
    type: 'IELTS',
    title: 'IELTS General Training — 6.0',
    organization: 'IDP',
    date: '2026-09-19',
    details: { testType: 'GENERAL', overall: 6 },
    status: 'DRAFT',
  });
  const madina = await student('madina.qodirova');
  await addPortfolio({
    ownerId: madina.id,
    type: 'CEFR',
    title: 'CEFR — Ingliz tili (B1)',
    organization: 'Bilim va malakalarni baholash agentligi',
    date: '2026-06-18',
    level: 'NATIONAL',
    details: { language: 'Ingliz tili', level: 'B1', provider: 'Multilevel' },
    status: 'APPROVED',
    reviewerId: karimova.id,
    sentDaysAgo: 75,
  });
  const sardor = await student('sardor.toshmatov');
  await addPortfolio({
    ownerId: sardor.id,
    type: 'OLYMPIAD',
    title: 'Informatika fan olimpiadasi — tuman bosqichi',
    subject: 'Informatika',
    organization: 'Tuman xalq ta’limi bo‘limi',
    date: '2026-02-05',
    level: 'DISTRICT',
    details: { subject: 'Informatika', place: 'THIRD' },
    status: 'APPROVED',
    reviewerId: karimova.id,
    sentDaysAgo: 210,
  });
  await addPortfolio({
    ownerId: sardor.id,
    type: 'CERTIFICATE',
    title: 'Python dasturlash kursi sertifikati',
    organization: 'IT Park',
    date: '2026-07-30',
    result: 'Kurs tugatildi',
    status: 'RETURNED',
    reviewerId: karimova.id,
    returnReason: 'Sertifikat nusxasini (PDF yoki rasm) biriktiring.',
    sentDaysAgo: 20,
  });

  console.log('Demo ma’lumotlar yaratildi.');
  console.log(`  Parol (barcha demo hisoblar): ${DEMO_PASSWORD}`);
  console.log('  Super admin: superadmin (alohida kirish: /system/login, 2FA sozlash talab qilinadi)');
  console.log('  Administrator: admin');
  console.log('  Direktor o‘rinbosarlari: b.yusupov (Tarix o‘qituvchisi ham), n.rahbarova (dars bermaydi)');
  console.log('  O‘qituvchilar: d.karimova, j.rahimov, m.tursunova (9-B — bankdagi algebra testini o‘tkaza oladi)');
  console.log('  O‘quvchilar: ali.aliyev, zebo.karimova (9-A), jahongir.abdullayev (9-B) va boshqalar');
  console.log('  Portfolio namunasi: jaloliddin.abduganiyev (10-A — IELTS, SAT, milliy sertifikatlar, olimpiada)');
  console.log(`  9-A uchun ochiq test kodi: ${DEMO_ACCESS_CODE}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
