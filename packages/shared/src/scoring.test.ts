import { describe, expect, it } from 'vitest';
import { gradeAttempt, pairPercent, percentOf, sumPoints, type GradableQuestion } from './scoring.js';

const q = (id: string, category: GradableQuestion['category'], points: number, correct = 'a'): GradableQuestion => ({
  id,
  type: 'SINGLE_CHOICE',
  category,
  points,
  answerKey: { correctOptionId: correct },
});

// Reja namunasidagi tuzilma: 5×2 + 5×4 + 5×6 = 60 ball.
const questions: GradableQuestion[] = [
  ...[1, 2, 3, 4, 5].map((n) => q(`k${n}`, 'KNOWLEDGE', 2)),
  ...[1, 2, 3, 4, 5].map((n) => q(`a${n}`, 'APPLICATION', 4)),
  ...[1, 2, 3, 4, 5].map((n) => q(`r${n}`, 'REASONING', 6)),
];

describe('gradeAttempt', () => {
  it('to‘g‘ri javobga to‘liq ball, noto‘g‘ri va bo‘sh javobga 0 beradi', () => {
    const grade = gradeAttempt(questions, {
      k1: { optionId: 'a' },
      k2: { optionId: 'a' },
      k3: { optionId: 'a' },
      k4: { optionId: 'a' },
      k5: { optionId: 'b' },
      a1: { optionId: 'a' },
      a2: { optionId: 'a' },
      a3: { optionId: 'a' },
      a4: { optionId: null },
      r1: { optionId: 'a' },
      r2: { optionId: 'a' },
      r3: { optionId: 'a' },
    });

    expect(grade.categories.KNOWLEDGE).toEqual({ earned: 8, max: 10 });
    expect(grade.categories.APPLICATION).toEqual({ earned: 12, max: 20 });
    expect(grade.categories.REASONING).toEqual({ earned: 18, max: 30 });
    expect(grade.total).toEqual({ earned: 38, max: 60 });

    const outcomes = Object.fromEntries(grade.questions.map((item) => [item.questionId, item.outcome]));
    expect(outcomes.k5).toBe('WRONG');
    expect(outcomes.a4).toBe('BLANK');
    expect(outcomes.a5).toBe('BLANK');
    expect(outcomes.r1).toBe('CORRECT');
  });

  it('umumiy foizni kategoriya foizlarining oddiy o‘rtachasi sifatida hisoblamaydi', () => {
    const grade = gradeAttempt(questions, {
      k1: { optionId: 'a' },
      k2: { optionId: 'a' },
      k3: { optionId: 'a' },
      k4: { optionId: 'a' },
      a1: { optionId: 'a' },
      a2: { optionId: 'a' },
      a3: { optionId: 'a' },
      r1: { optionId: 'a' },
      r2: { optionId: 'a' },
      r3: { optionId: 'a' },
    });
    const categoryPercents = [
      pairPercent(grade.categories.KNOWLEDGE)!,
      pairPercent(grade.categories.APPLICATION)!,
      pairPercent(grade.categories.REASONING)!,
    ];
    expect(categoryPercents).toEqual([80, 60, 60]);
    const naiveMean = categoryPercents.reduce((a, b) => a + b, 0) / 3;
    expect(naiveMean).toBeCloseTo(66.667, 2);
    // To‘g‘ri umumiy foiz: 38 / 60.
    expect(pairPercent(grade.total)).toBeCloseTo(63.333, 2);
  });

  it('testda yo‘q kategoriyani natijaga qo‘shmaydi', () => {
    const grade = gradeAttempt([q('k1', 'KNOWLEDGE', 1)], { k1: { optionId: 'a' } });
    expect(grade.categories).toEqual({ KNOWLEDGE: { earned: 1, max: 1 } });
    expect(grade.categories.REASONING).toBeUndefined();
    expect(pairPercent(grade.categories.REASONING)).toBeNull();
  });

  it('kasr ballarni suzuvchi nuqta xatosisiz yig‘adi', () => {
    const grade = gradeAttempt(
      [q('x', 'KNOWLEDGE', 0.1), q('y', 'KNOWLEDGE', 0.2)],
      { x: { optionId: 'a' }, y: { optionId: 'a' } },
    );
    expect(grade.total).toEqual({ earned: 0.3, max: 0.3 });
    expect(sumPoints([0.1, 0.2])).toBe(0.3);
  });

  describe('qayta baholash siyosati', () => {
    const base = [q('x', 'KNOWLEDGE', 2), q('y', 'APPLICATION', 4)];
    const answers = { x: { optionId: 'b' }, y: { optionId: 'a' } };

    it('savolni hisobdan chiqaradi (maksimal balldan ham)', () => {
      const grade = gradeAttempt(base, answers, { x: { mode: 'EXCLUDE' } });
      expect(grade.total).toEqual({ earned: 4, max: 4 });
      expect(grade.categories.KNOWLEDGE).toEqual({ earned: 0, max: 0 });
      expect(pairPercent(grade.categories.KNOWLEDGE)).toBeNull();
      expect(grade.questions[0]!.outcome).toBe('EXCLUDED');
    });

    it('barchaga to‘liq ball beradi', () => {
      const grade = gradeAttempt(base, answers, { x: { mode: 'FULL_CREDIT' } });
      expect(grade.total).toEqual({ earned: 6, max: 6 });
      expect(grade.questions[0]!.outcome).toBe('CREDITED');
    });

    it('javob kalitini tuzatadi', () => {
      const grade = gradeAttempt(base, answers, { x: { mode: 'CHANGE_KEY', correctOptionId: 'b' } });
      expect(grade.total).toEqual({ earned: 6, max: 6 });
      expect(grade.questions[0]!.outcome).toBe('CORRECT');
    });
  });
});

describe('percentOf', () => {
  it('maxraj 0 bo‘lsa null qaytaradi', () => {
    expect(percentOf(0, 0)).toBeNull();
    expect(percentOf(5, 0)).toBeNull();
  });

  it('nol ball — haqiqiy 0%', () => {
    expect(percentOf(0, 60)).toBe(0);
  });

  it('yaxlitlamaydi', () => {
    expect(percentOf(40, 60)).toBeCloseTo(66.6666667, 6);
  });
});
