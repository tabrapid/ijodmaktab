import { describe, expect, it } from 'vitest';
import { formatPercent, formatRatio } from './format.js';
import {
  computeClassMetrics,
  computeQuestionStats,
  median,
  selectCountedAttempt,
  type StudentResultInput,
} from './metrics.js';

const finished = (k: number, a: number, r: number): StudentResultInput => ({
  status: 'SUBMITTED',
  categories: {
    KNOWLEDGE: { earned: k, max: 10 },
    APPLICATION: { earned: a, max: 20 },
    REASONING: { earned: r, max: 30 },
  },
  total: { earned: k + a + r, max: 60 },
});

describe('reja 9-bo‘lim namunalari', () => {
  it('Ali va Zebo natijalari', () => {
    const metrics = computeClassMetrics([finished(8, 14, 18), finished(10, 18, 27)], {
      thresholdPercent: 60,
    });
    expect(metrics.overall.mastery.numerator).toBe(95);
    expect(metrics.overall.mastery.denominator).toBe(120);
    // Alining umumiy foizi 66,7%, Zeboniki 91,7%; o‘rtacha — ikkalasining o‘rtachasi.
    expect(formatPercent(metrics.overall.minPercent)).toBe('66,7%');
    expect(formatPercent(metrics.overall.maxPercent)).toBe('91,7%');
    // Kategoriya o‘zlashtirishi = Σ olingan / Σ maksimal.
    expect(metrics.categoryMastery.KNOWLEDGE).toMatchObject({ numerator: 18, denominator: 20, percent: 90 });
    expect(metrics.categoryMastery.REASONING).toMatchObject({ numerator: 45, denominator: 60, percent: 75 });
  });

  it('mezonga yetganlar va qatnashish: 30 tayinlangan, 25 topshirgan, 20 tasi chegaraga yetgan', () => {
    const rows: StudentResultInput[] = [
      ...Array.from({ length: 20 }, () => finished(7, 14, 21)), // 70% — chegaradan yuqori
      ...Array.from({ length: 5 }, () => finished(3, 6, 9)), // 30% — chegaradan past
      ...Array.from({ length: 5 }, (): StudentResultInput => ({ status: 'NOT_STARTED' })),
    ];
    const metrics = computeClassMetrics(rows, { thresholdPercent: 60 });

    expect(metrics.participation).toMatchObject({ numerator: 25, denominator: 30 });
    expect(formatPercent(metrics.participation.percent)).toBe('83,3%');

    const reach = metrics.thresholdReach.KNOWLEDGE!;
    expect(formatRatio(reach.ofGraded)).toBe('80,0% (20 / 25)');
    expect(formatRatio(reach.ofAssigned)).toBe('66,7% (20 / 30)');
  });

  it('boshlamaganlar 0 ball sifatida o‘rtachaga qo‘shilmaydi, 0 olgan esa qo‘shiladi', () => {
    const withZero = computeClassMetrics([finished(10, 20, 30), finished(0, 0, 0), { status: 'NOT_STARTED' }], {
      thresholdPercent: 60,
    });
    expect(withZero.graded).toBe(2);
    expect(withZero.overall.meanPercent).toBe(50);
    expect(withZero.overall.minPercent).toBe(0);
    expect(withZero.participation).toMatchObject({ numerator: 2, denominator: 3 });
  });

  it('tekshirilayotgan va bekor qilingan ishlar yakuniy hisobdan alohida turadi', () => {
    const metrics = computeClassMetrics(
      [finished(10, 20, 30), { status: 'UNDER_REVIEW' }, { status: 'CANCELLED' }, { status: 'IN_PROGRESS' }],
      { thresholdPercent: 60 },
    );
    expect(metrics.graded).toBe(1);
    expect(metrics.statusCounts.UNDER_REVIEW).toBe(1);
    expect(metrics.statusCounts.CANCELLED).toBe(1);
    expect(metrics.statusCounts.IN_PROGRESS).toBe(1);
    expect(metrics.overall.meanPercent).toBe(100);
  });

  it('kategoriya yo‘q yoki maxraj 0 bo‘lsa ko‘rsatkich mavjud emas', () => {
    const metrics = computeClassMetrics([{ status: 'NOT_STARTED' }], { thresholdPercent: 60 });
    expect(metrics.categoryMastery.KNOWLEDGE).toBeUndefined();
    expect(metrics.overall.mastery.percent).toBeNull();
    expect(formatPercent(metrics.overall.meanPercent)).toBe('—');
  });

  it('o‘tish chegarasi belgilansa o‘tganlar ulushini hisoblaydi', () => {
    const metrics = computeClassMetrics([finished(10, 20, 30), finished(3, 6, 9)], {
      thresholdPercent: 60,
      passPercent: 50,
    });
    expect(metrics.pass?.ofGraded).toMatchObject({ numerator: 1, denominator: 2, percent: 50 });
  });
});

describe('median', () => {
  it('toq va juft sonli to‘plamlar', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

describe('selectCountedAttempt', () => {
  const attempts = [
    { attemptNo: 1, status: 'SUBMITTED' as const, total: { earned: 30, max: 60 } },
    { attemptNo: 2, status: 'SUBMITTED' as const, total: { earned: 50, max: 60 } },
    { attemptNo: 3, status: 'EXPIRED' as const, total: { earned: 40, max: 60 } },
    { attemptNo: 4, status: 'IN_PROGRESS' as const, total: null },
  ];

  it('birinchi, oxirgi va eng yaxshi urinish siyosatlari', () => {
    expect(selectCountedAttempt(attempts, 'FIRST')?.attemptNo).toBe(1);
    expect(selectCountedAttempt(attempts, 'LAST')?.attemptNo).toBe(3);
    expect(selectCountedAttempt(attempts, 'BEST')?.attemptNo).toBe(2);
  });

  it('yakuniy baho bo‘lmasa joriy holatni ko‘rsatadi', () => {
    expect(
      selectCountedAttempt(
        [
          { attemptNo: 1, status: 'CANCELLED' as const, total: null },
          { attemptNo: 2, status: 'IN_PROGRESS' as const, total: null },
        ],
        'FIRST',
      )?.attemptNo,
    ).toBe(2);
    expect(selectCountedAttempt([], 'FIRST')).toBeNull();
  });
});

describe('computeQuestionStats', () => {
  it('variantlar taqsimoti va “tekshirish tavsiya etiladi” belgisi', () => {
    const responses = [
      ...Array.from({ length: 4 }, () => ({ questionId: 'q1', outcome: 'WRONG' as const, selectedOptionId: 'b' })),
      { questionId: 'q1', outcome: 'CORRECT' as const, selectedOptionId: 'a' },
      { questionId: 'q1', outcome: 'BLANK' as const, selectedOptionId: null },
    ];
    const [stats] = computeQuestionStats(
      [{ questionId: 'q1', correctOptionId: 'a', optionIds: ['a', 'b', 'c'] }],
      responses,
    );
    expect(stats!.optionCounts).toEqual({ a: 1, b: 4, c: 0 });
    expect(stats!.correct).toBe(1);
    expect(stats!.wrong).toBe(4);
    expect(stats!.blank).toBe(1);
    expect(stats!.needsReview).toBe(true);
    expect(stats!.reviewReasons).toContain('Noto‘g‘ri variant to‘g‘ri javobdan ko‘p tanlangan');
  });

  it('kam javobda xulosa chiqarmaydi', () => {
    const [stats] = computeQuestionStats(
      [{ questionId: 'q1', correctOptionId: 'a', optionIds: ['a', 'b'] }],
      [{ questionId: 'q1', outcome: 'WRONG', selectedOptionId: 'b' }],
    );
    expect(stats!.needsReview).toBe(false);
  });
});
