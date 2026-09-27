/**
 * Test yaratish ustasining 5-bosqichi: avtomatik tekshiruv (reja, 7-bo‘lim).
 * Qat’iy xatolar nashrni to‘xtatadi, tavsiyaviy ogohlantirishlar tushuntiriladi.
 * Bir xil funksiya brauzerda (darhol ko‘rsatish) va serverda (nashr oldidan) ishlatiladi.
 */
import { CATEGORIES, CATEGORY_LABELS, ENABLED_QUESTION_TYPES, type Category, type QuestionType } from './enums.js';
import { formatPoints } from './format.js';
import { hasAtMostTwoDecimals, sumPoints } from './scoring.js';
import { normalizeForSearch } from './text.js';

export interface BlueprintEntry {
  /** Rejalashtirilgan savollar soni. */
  count: number;
  /** Har bir savol uchun rejalashtirilgan ball. */
  pointsEach: number;
}

export type Blueprint = Partial<Record<Category, BlueprintEntry>>;

export interface DraftQuestionForValidation {
  /** Bank savoli identifikatori (takrorni aniqlash uchun). */
  questionId: string;
  type: QuestionType;
  stem: string;
  options: readonly { id: string; text: string }[];
  answerKey: { correctOptionId: string } | null;
  category: Category;
  points: number;
}

export interface DraftForValidation {
  title: string;
  subjectId: string | null;
  gradeLevel: number | null;
  blueprint: Blueprint | null;
  questions: readonly DraftQuestionForValidation[];
}

export type IssueLevel = 'error' | 'warning';

export interface ValidationIssue {
  level: IssueLevel;
  code: string;
  message: string;
  /** Savolga tegishli bo‘lsa, uning tartib raqami (1 dan boshlanadi). */
  questionNumber?: number;
}

export const MAX_QUESTION_POINTS = 100;

export function blueprintTotals(blueprint: Blueprint | null | undefined) {
  const perCategory: Partial<Record<Category, { count: number; points: number }>> = {};
  let count = 0;
  let points = 0;
  for (const category of CATEGORIES) {
    const entry = blueprint?.[category];
    if (!entry || entry.count <= 0) continue;
    const categoryPoints = sumPoints(Array.from({ length: entry.count }, () => entry.pointsEach));
    perCategory[category] = { count: entry.count, points: categoryPoints };
    count += entry.count;
    points = sumPoints([points, categoryPoints]);
  }
  return { perCategory, count, points };
}

export function draftTotals(questions: readonly Pick<DraftQuestionForValidation, 'category' | 'points'>[]) {
  const perCategory: Partial<Record<Category, { count: number; points: number }>> = {};
  for (const question of questions) {
    const entry = perCategory[question.category] ?? { count: 0, points: 0 };
    entry.count += 1;
    entry.points = sumPoints([entry.points, question.points]);
    perCategory[question.category] = entry;
  }
  return {
    perCategory,
    count: questions.length,
    points: sumPoints(questions.map((question) => question.points)),
  };
}

export function validateTestDraft(draft: DraftForValidation): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const error = (code: string, message: string, questionNumber?: number) =>
    issues.push({ level: 'error', code, message, questionNumber });
  const warning = (code: string, message: string, questionNumber?: number) =>
    issues.push({ level: 'warning', code, message, questionNumber });

  if (!draft.title.trim()) error('NO_TITLE', 'Test nomi kiritilmagan.');
  if (!draft.subjectId) error('NO_SUBJECT', 'Fan tanlanmagan.');
  if (!draft.gradeLevel) error('NO_GRADE', 'Sinf darajasi tanlanmagan.');
  if (draft.questions.length === 0) error('NO_QUESTIONS', 'Testda birorta ham savol yo‘q.');

  const seenBankIds = new Map<string, number>();
  const seenStems = new Map<string, number>();

  draft.questions.forEach((question, index) => {
    const n = index + 1;

    if (!ENABLED_QUESTION_TYPES.includes(question.type)) {
      error('UNSUPPORTED_TYPE', `${n}-savol turi hozircha qo‘llab-quvvatlanmaydi.`, n);
    }
    if (!question.stem.trim()) error('EMPTY_STEM', `${n}-savol matni bo‘sh.`, n);

    const filledOptions = question.options.filter((option) => option.text.trim());
    if (question.options.length < 2) {
      error('TOO_FEW_OPTIONS', `${n}-savolda kamida 2 ta javob varianti bo‘lishi kerak.`, n);
    }
    if (filledOptions.length !== question.options.length) {
      error('EMPTY_OPTION', `${n}-savolda matni bo‘sh variant bor.`, n);
    }
    const optionTexts = filledOptions.map((option) => normalizeForSearch(option.text));
    if (new Set(optionTexts).size !== optionTexts.length) {
      warning('DUPLICATE_OPTIONS', `${n}-savolda bir xil matnli variantlar bor.`, n);
    }

    if (!question.answerKey?.correctOptionId) {
      error('NO_KEY', `${n}-savolda to‘g‘ri javob belgilanmagan.`, n);
    } else if (!question.options.some((option) => option.id === question.answerKey!.correctOptionId)) {
      error('INVALID_KEY', `${n}-savol kaliti mavjud bo‘lmagan variantga ishora qiladi.`, n);
    }

    if (
      !Number.isFinite(question.points) ||
      question.points <= 0 ||
      question.points > MAX_QUESTION_POINTS ||
      !hasAtMostTwoDecimals(question.points)
    ) {
      error(
        'INVALID_POINTS',
        `${n}-savol balli noto‘g‘ri: 0 dan katta, ${MAX_QUESTION_POINTS} dan oshmaydigan va ko‘pi bilan 2 xonali kasr bo‘lishi kerak.`,
        n,
      );
    }

    const previousSame = seenBankIds.get(question.questionId);
    if (previousSame !== undefined) {
      error('DUPLICATE_QUESTION', `${previousSame}- va ${n}-savollar aynan bir xil (takror savol).`, n);
    } else {
      seenBankIds.set(question.questionId, n);
      const stemKey = normalizeForSearch(question.stem);
      const previousStem = stemKey ? seenStems.get(stemKey) : undefined;
      if (previousStem !== undefined) {
        warning('DUPLICATE_STEM', `${previousStem}- va ${n}-savollar matni bir xil.`, n);
      } else if (stemKey) {
        seenStems.set(stemKey, n);
      }
    }
  });

  // Reja (tuzilma) bilan solishtirish — tavsiyaviy.
  const planned = blueprintTotals(draft.blueprint);
  const actual = draftTotals(draft.questions);
  if (planned.count === 0) {
    warning('NO_BLUEPRINT', 'Tuzilma (kategoriyalar bo‘yicha reja) belgilanmagan.');
  } else {
    for (const category of CATEGORIES) {
      const plan = planned.perCategory[category];
      const fact = actual.perCategory[category];
      const label = CATEGORY_LABELS[category];
      if (plan && !fact) {
        warning('MISSING_CATEGORY', `${label}: rejada ${plan.count} ta savol bor, testda bu kategoriyadan savol yo‘q.`);
        continue;
      }
      if (!plan && fact) {
        warning('UNPLANNED_CATEGORY', `${label}: rejada yo‘q, lekin testda ${fact.count} ta savol bor.`);
        continue;
      }
      if (!plan || !fact) continue;
      if (plan.count !== fact.count) {
        warning('BLUEPRINT_COUNT_MISMATCH', `${label}: rejada ${plan.count} ta savol, testda ${fact.count} ta.`);
      }
      if (Math.round(plan.points * 100) !== Math.round(fact.points * 100)) {
        warning(
          'BLUEPRINT_POINTS_MISMATCH',
          `${label}: rejada ${formatPoints(plan.points)} ball, testda ${formatPoints(fact.points)} ball.`,
        );
      }
    }
  }

  return issues;
}

export const hasBlockingIssues = (issues: readonly ValidationIssue[]) =>
  issues.some((issue) => issue.level === 'error');
