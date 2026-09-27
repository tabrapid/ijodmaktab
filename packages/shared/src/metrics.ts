/**
 * Sinf va savol darajasidagi ko‘rsatkichlar (reja, 9–10-bo‘limlar).
 *
 * Asosiy qoidalar:
 * - Boshlamaganlar 0 ball sifatida o‘rtachaga yashirincha qo‘shilmaydi.
 * - Nol olgan yakunlangan ish haqiqiy 0 sifatida qatnashadi.
 * - Tekshirilayotgan yoki bekor qilingan ishlar yakuniy hisobdan alohida turadi.
 * - Har ko‘rsatkich surat/maxraj sonlari bilan qaytariladi.
 */
import {
  CATEGORIES,
  FINAL_ATTEMPT_STATUSES,
  PARTICIPATION_STATUSES,
  type AttemptPolicy,
  type AttemptStatus,
  type Category,
  type ParticipationStatus,
} from './enums.js';
import { percentOf, sumPoints, type CategoryScores, type QuestionOutcome, type ScorePair } from './scoring.js';

export interface Ratio {
  numerator: number;
  denominator: number;
  /** Yaxlitlanmagan foiz; maxraj 0 bo‘lsa `null`. */
  percent: number | null;
}

export const ratio = (numerator: number, denominator: number): Ratio => ({
  numerator,
  denominator,
  percent: percentOf(numerator, denominator),
});

/** Chegaraga yetganini tekshirishda suzuvchi nuqta xatolariga yo‘l qo‘ymaslik uchun. */
const EPSILON = 1e-9;

export const isFinalStatus = (status: AttemptStatus | ParticipationStatus): boolean =>
  (FINAL_ATTEMPT_STATUSES as readonly string[]).includes(status);

// ---------------------------------------------------------------- Urinishni tanlash

export interface AttemptSummary {
  attemptNo: number;
  status: AttemptStatus;
  total?: ScorePair | null;
}

const summaryPercent = (attempt: AttemptSummary): number =>
  (attempt.total ? percentOf(attempt.total.earned, attempt.total.max) : null) ?? -1;

/**
 * Bir nechta urinishga ruxsat berilganda qaysi urinish hisobga olinishini tanlaydi.
 * Siyosat (birinchi/oxirgi/eng yaxshi) sessiya boshlanishidan oldin belgilanadi.
 * Yakuniy baho bo‘lmasa, holatni ko‘rsatish uchun eng dolzarb urinish qaytariladi.
 */
export function selectCountedAttempt<T extends AttemptSummary>(
  attempts: readonly T[],
  policy: AttemptPolicy,
): T | null {
  const finals = attempts
    .filter((attempt) => isFinalStatus(attempt.status) && attempt.total)
    .sort((a, b) => a.attemptNo - b.attemptNo);

  if (finals.length > 0) {
    if (policy === 'FIRST') return finals[0]!;
    if (policy === 'LAST') return finals[finals.length - 1]!;
    let best = finals[0]!;
    for (const attempt of finals.slice(1)) {
      if (summaryPercent(attempt) > summaryPercent(best)) best = attempt;
    }
    return best;
  }

  const byRecency = [...attempts].sort((a, b) => b.attemptNo - a.attemptNo);
  for (const status of ['IN_PROGRESS', 'UNDER_REVIEW', 'CANCELLED'] as const) {
    const found = byRecency.find((attempt) => attempt.status === status);
    if (found) return found;
  }
  return null;
}

// ---------------------------------------------------------------- Sinf ko‘rsatkichlari

export interface StudentResultInput {
  /** Hisobga olingan urinish holati yoki `NOT_STARTED`. */
  status: ParticipationStatus;
  total?: ScorePair | null;
  categories?: CategoryScores | null;
}

export interface ThresholdReach {
  /** Chegaraga yetganlar / shu kategoriya bo‘yicha yakuniy bahosi borlar. */
  ofGraded: Ratio;
  /** Chegaraga yetganlar / barcha tayinlanganlar (alohida nom bilan ko‘rsatiladi). */
  ofAssigned: Ratio;
}

export interface DistributionBucket {
  from: number;
  to: number;
  count: number;
}

export interface ClassMetrics {
  assigned: number;
  statusCounts: Record<ParticipationStatus, number>;
  /** Qatnashish: yaroqli topshirganlar / tayinlanganlar. */
  participation: Ratio;
  /** Yakuniy bahosi bor ishlar soni. */
  graded: number;
  /** Kategoriya o‘zlashtirishi: Σ olingan ball / Σ maksimal ball. */
  categoryMastery: Partial<Record<Category, Ratio>>;
  /** Belgilangan mezonga yetganlar ulushi. */
  thresholdReach: Partial<Record<Category, ThresholdReach>>;
  thresholdPercent: number;
  overall: {
    /** Umumiy o‘zlashtirish: Σ olingan / Σ maksimal. */
    mastery: Ratio;
    meanPercent: number | null;
    medianPercent: number | null;
    minPercent: number | null;
    maxPercent: number | null;
    meanScore: number | null;
    distribution: DistributionBucket[];
  };
  /** O‘tish chegarasi belgilangan bo‘lsa. */
  pass: ThresholdReach | null;
  passPercent: number | null;
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

export function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** 0–10, 10–20, …, 90–100 oraliqlari (100% oxirgi oraliqqa kiradi). */
export function percentDistribution(percents: readonly number[], step = 10): DistributionBucket[] {
  const buckets: DistributionBucket[] = [];
  for (let from = 0; from < 100; from += step) buckets.push({ from, to: from + step, count: 0 });
  for (const value of percents) {
    const index = Math.min(Math.floor((value + EPSILON) / step), buckets.length - 1);
    buckets[Math.max(index, 0)]!.count += 1;
  }
  return buckets;
}

export function reachesThreshold(pair: ScorePair | undefined | null, thresholdPercent: number): boolean {
  if (!pair || !(pair.max > 0)) return false;
  return (pair.earned / pair.max) * 100 + EPSILON >= thresholdPercent;
}

export function computeClassMetrics(
  rows: readonly StudentResultInput[],
  options: { thresholdPercent: number; passPercent?: number | null },
): ClassMetrics {
  const statusCounts = Object.fromEntries(PARTICIPATION_STATUSES.map((s) => [s, 0])) as Record<
    ParticipationStatus,
    number
  >;
  for (const row of rows) statusCounts[row.status] += 1;

  const assigned = rows.length;
  const gradedRows = rows.filter((row) => isFinalStatus(row.status) && row.total);

  const categoryMastery: Partial<Record<Category, Ratio>> = {};
  const thresholdReach: Partial<Record<Category, ThresholdReach>> = {};

  for (const category of CATEGORIES) {
    const withCategory = gradedRows.filter((row) => (row.categories?.[category]?.max ?? 0) > 0);
    if (withCategory.length === 0) continue;

    const earned = sumPoints(withCategory.map((row) => row.categories![category]!.earned));
    const max = sumPoints(withCategory.map((row) => row.categories![category]!.max));
    categoryMastery[category] = ratio(earned, max);

    const reached = withCategory.filter((row) =>
      reachesThreshold(row.categories![category], options.thresholdPercent),
    ).length;
    thresholdReach[category] = {
      ofGraded: ratio(reached, withCategory.length),
      ofAssigned: ratio(reached, assigned),
    };
  }

  const totals = gradedRows.map((row) => row.total!);
  const percents = totals
    .map((total) => percentOf(total.earned, total.max))
    .filter((value): value is number => value !== null);

  let pass: ThresholdReach | null = null;
  if (options.passPercent !== undefined && options.passPercent !== null) {
    const passed = totals.filter((total) => reachesThreshold(total, options.passPercent!)).length;
    pass = { ofGraded: ratio(passed, gradedRows.length), ofAssigned: ratio(passed, assigned) };
  }

  return {
    assigned,
    statusCounts,
    participation: ratio(gradedRows.length, assigned),
    graded: gradedRows.length,
    categoryMastery,
    thresholdReach,
    thresholdPercent: options.thresholdPercent,
    overall: {
      mastery: ratio(sumPoints(totals.map((total) => total.earned)), sumPoints(totals.map((total) => total.max))),
      meanPercent: mean(percents),
      medianPercent: median(percents),
      minPercent: percents.length ? Math.min(...percents) : null,
      maxPercent: percents.length ? Math.max(...percents) : null,
      meanScore: mean(totals.map((total) => total.earned)),
      distribution: percentDistribution(percents),
    },
    pass,
    passPercent: options.passPercent ?? null,
  };
}

// ---------------------------------------------------------------- Savol tahlili

export interface QuestionStatInput {
  questionId: string;
  correctOptionId: string;
  optionIds: readonly string[];
}

export interface QuestionResponseInput {
  questionId: string;
  outcome: QuestionOutcome;
  selectedOptionId: string | null;
}

export interface QuestionStats {
  questionId: string;
  /** Hisobga olingan (yakunlangan) ishlar soni. */
  responses: number;
  correct: number;
  wrong: number;
  blank: number;
  excluded: boolean;
  credited: boolean;
  /** To‘g‘ri javob ulushi: to‘g‘ri / hisobga olingan ishlar. */
  correctRate: Ratio;
  /** Variantlarni tanlash taqsimoti. */
  optionCounts: Record<string, number>;
  /** “Tekshirish tavsiya etiladi” — avtomatik nuqsonli degani emas. */
  needsReview: boolean;
  reviewReasons: string[];
}

export const QUESTION_REVIEW_MIN_RESPONSES = 5;
export const QUESTION_REVIEW_LOW_CORRECT_PERCENT = 25;

export function computeQuestionStats(
  questions: readonly QuestionStatInput[],
  responses: readonly QuestionResponseInput[],
): QuestionStats[] {
  return questions.map((question) => {
    const own = responses.filter((response) => response.questionId === question.questionId);
    const optionCounts = Object.fromEntries(question.optionIds.map((id) => [id, 0])) as Record<string, number>;
    let correct = 0;
    let wrong = 0;
    let blank = 0;
    let excluded = false;
    let credited = false;

    for (const response of own) {
      if (response.selectedOptionId && response.selectedOptionId in optionCounts) {
        optionCounts[response.selectedOptionId]! += 1;
      }
      switch (response.outcome) {
        case 'CORRECT':
          correct += 1;
          break;
        case 'WRONG':
          wrong += 1;
          break;
        case 'BLANK':
          blank += 1;
          break;
        case 'EXCLUDED':
          excluded = true;
          break;
        case 'CREDITED':
          credited = true;
          break;
      }
    }

    // Hisobdan chiqarilgan yoki hammaga ball berilgan savolda asl javoblar bo‘yicha tahlil qilinadi.
    if (excluded || credited) {
      correct = 0;
      wrong = 0;
      blank = 0;
      for (const response of own) {
        if (!response.selectedOptionId) blank += 1;
        else if (response.selectedOptionId === question.correctOptionId) correct += 1;
        else wrong += 1;
      }
    }

    const total = own.length;
    const correctRate = ratio(correct, total);
    const reviewReasons: string[] = [];
    if (total >= QUESTION_REVIEW_MIN_RESPONSES) {
      if ((correctRate.percent ?? 100) <= QUESTION_REVIEW_LOW_CORRECT_PERCENT) {
        reviewReasons.push(`To‘g‘ri javob ulushi past (${QUESTION_REVIEW_LOW_CORRECT_PERCENT}% yoki kamroq)`);
      }
      const correctPicks = optionCounts[question.correctOptionId] ?? 0;
      const popularDistractor = Object.entries(optionCounts).some(
        ([optionId, count]) => optionId !== question.correctOptionId && count > correctPicks,
      );
      if (popularDistractor) {
        reviewReasons.push('Noto‘g‘ri variant to‘g‘ri javobdan ko‘p tanlangan');
      }
      if (blank * 2 > total) reviewReasons.push('Ishtirokchilarning yarmidan ko‘pi javobsiz qoldirgan');
    }

    return {
      questionId: question.questionId,
      responses: total,
      correct,
      wrong,
      blank,
      excluded,
      credited,
      correctRate,
      optionCounts,
      needsReview: reviewReasons.length > 0,
      reviewReasons,
    };
  });
}
