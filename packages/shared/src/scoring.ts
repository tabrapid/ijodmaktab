/**
 * Urinishni baholash qoidalari (reja, 6–9-bo‘limlar).
 *
 * - Har savol bitta asosiy kategoriyaga tegishli, shuning uchun ball ikki marta hisoblanmaydi.
 * - MVP: to‘g‘ri javob — to‘liq ball, noto‘g‘ri yoki bo‘sh javob — 0.
 * - Ballar ichkarida yuzdan birlarda (butun son) yig‘iladi, shunda 0,1 + 0,2 kabi
 *   kasr xatolari natijaga ta’sir qilmaydi.
 */
import { CATEGORIES, type Category, type GradingOverrideMode, type QuestionType } from './enums.js';

export interface SingleChoiceKey {
  correctOptionId: string;
}

export type AnswerKey = SingleChoiceKey;

export interface GradableQuestion {
  /** Test ichidagi savol identifikatori (TestQuestion.id). */
  id: string;
  type: QuestionType;
  category: Category;
  /** Savolning maksimal balli. */
  points: number;
  answerKey: AnswerKey;
}

/** Bitta savolga berilgan javob. `null` yoki `optionId: null` — javobsiz. */
export type AnswerResponse = { optionId: string | null } | null | undefined;

export interface GradingOverride {
  mode: GradingOverrideMode;
  /** CHANGE_KEY rejimida yangi to‘g‘ri variant. */
  correctOptionId?: string;
}

export type QuestionOutcome = 'CORRECT' | 'WRONG' | 'BLANK' | 'EXCLUDED' | 'CREDITED';

export interface QuestionGrade {
  questionId: string;
  category: Category;
  outcome: QuestionOutcome;
  earned: number;
  /** Hisobdan chiqarilgan savolda 0. */
  max: number;
}

export interface ScorePair {
  earned: number;
  max: number;
}

export type CategoryScores = Partial<Record<Category, ScorePair>>;

export interface AttemptGrade {
  questions: QuestionGrade[];
  /** Faqat testda mavjud kategoriyalar kiradi. */
  categories: CategoryScores;
  total: ScorePair;
}

const toCents = (value: number): number => Math.round(value * 100);
const fromCents = (cents: number): number => cents / 100;

function outcomeFor(
  question: GradableQuestion,
  response: AnswerResponse,
  override: GradingOverride | undefined,
): QuestionOutcome {
  if (override?.mode === 'EXCLUDE') return 'EXCLUDED';
  if (override?.mode === 'FULL_CREDIT') return 'CREDITED';

  const selected = response?.optionId ?? null;
  if (selected === null) return 'BLANK';

  const correct =
    override?.mode === 'CHANGE_KEY' && override.correctOptionId
      ? override.correctOptionId
      : question.answerKey.correctOptionId;
  return selected === correct ? 'CORRECT' : 'WRONG';
}

/**
 * Urinishni baholaydi.
 *
 * @param questions  test versiyasining (muzlatilgan) savollari
 * @param answers    savol identifikatori bo‘yicha javoblar
 * @param overrides  qayta baholash siyosati (xato savol topilganda)
 */
export function gradeAttempt(
  questions: readonly GradableQuestion[],
  answers: Readonly<Record<string, AnswerResponse>>,
  overrides: Readonly<Record<string, GradingOverride>> = {},
): AttemptGrade {
  const categoryCents = new Map<Category, { earned: number; max: number }>();
  let totalEarned = 0;
  let totalMax = 0;

  const graded: QuestionGrade[] = questions.map((question) => {
    const outcome = outcomeFor(question, answers[question.id], overrides[question.id]);
    const maxCents = outcome === 'EXCLUDED' ? 0 : toCents(question.points);
    const earnedCents = outcome === 'CORRECT' || outcome === 'CREDITED' ? maxCents : 0;

    const bucket = categoryCents.get(question.category) ?? { earned: 0, max: 0 };
    bucket.earned += earnedCents;
    bucket.max += maxCents;
    categoryCents.set(question.category, bucket);

    totalEarned += earnedCents;
    totalMax += maxCents;

    return {
      questionId: question.id,
      category: question.category,
      outcome,
      earned: fromCents(earnedCents),
      max: fromCents(maxCents),
    };
  });

  const categories: CategoryScores = {};
  for (const category of CATEGORIES) {
    const bucket = categoryCents.get(category);
    if (bucket) categories[category] = { earned: fromCents(bucket.earned), max: fromCents(bucket.max) };
  }

  return {
    questions: graded,
    categories,
    total: { earned: fromCents(totalEarned), max: fromCents(totalMax) },
  };
}

/**
 * Foiz = olingan / maksimal × 100. Maxraj 0 bo‘lsa `null` (“— / mavjud emas”).
 * Qiymat yaxlitlanmaydi: yaxlitlash faqat ko‘rsatishda bajariladi.
 */
export function percentOf(earned: number, max: number): number | null {
  if (!(max > 0)) return null;
  return (earned / max) * 100;
}

export function pairPercent(pair: ScorePair | undefined | null): number | null {
  return pair ? percentOf(pair.earned, pair.max) : null;
}

/** Ball ko‘pi bilan 2 xonali kasr ekanini tekshiradi (0,29 kabi qiymatlarda suzuvchi nuqta xatosisiz). */
export function hasAtMostTwoDecimals(value: number): boolean {
  return Number.isFinite(value) && Math.abs(Math.round(value * 100) - value * 100) < 1e-6;
}

/** Ballar yig‘indisi (yuzdan birlarda hisoblanadi). */
export function sumPoints(values: Iterable<number>): number {
  let cents = 0;
  for (const value of values) cents += toCents(value);
  return fromCents(cents);
}
