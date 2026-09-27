import { describe, expect, it } from 'vitest';
import { hasBlockingIssues, validateTestDraft, type DraftQuestionForValidation } from './validation.js';

let counter = 0;
const question = (overrides: Partial<DraftQuestionForValidation> = {}): DraftQuestionForValidation => ({
  questionId: `question-${++counter}`,
  type: 'SINGLE_CHOICE',
  stem: `Savol ${counter}`,
  options: [
    { id: 'a', text: 'Birinchi' },
    { id: 'b', text: 'Ikkinchi' },
  ],
  answerKey: { correctOptionId: 'a' },
  category: 'KNOWLEDGE',
  points: 2,
  ...overrides,
});

const draft = (questions: DraftQuestionForValidation[]) => ({
  title: 'Algebra, 1-bob',
  subjectId: 'subject',
  gradeLevel: 9,
  blueprint: { KNOWLEDGE: { count: questions.length, pointsEach: 2 } },
  questions,
});

describe('validateTestDraft', () => {
  it('to‘g‘ri testda xato yo‘q', () => {
    const issues = validateTestDraft(draft([question(), question()]));
    expect(issues).toEqual([]);
  });

  it('qat’iy xatolar nashrni to‘xtatadi', () => {
    const repeated = question();
    const issues = validateTestDraft(
      draft([
        question({ stem: '  ' }),
        question({ answerKey: null }),
        question({ answerKey: { correctOptionId: 'z' } }),
        question({ points: 0 }),
        question({ options: [{ id: 'a', text: 'Yolg‘iz' }] }),
        repeated,
        repeated,
      ]),
    );
    const codes = issues.filter((issue) => issue.level === 'error').map((issue) => issue.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        'EMPTY_STEM',
        'NO_KEY',
        'INVALID_KEY',
        'INVALID_POINTS',
        'TOO_FEW_OPTIONS',
        'DUPLICATE_QUESTION',
      ]),
    );
    expect(hasBlockingIssues(issues)).toBe(true);
  });

  it('0,29 kabi kasr ballarni noto‘g‘ri deb hisoblamaydi', () => {
    const issues = validateTestDraft({
      ...draft([question({ points: 0.29 })]),
      blueprint: { KNOWLEDGE: { count: 1, pointsEach: 0.29 } },
    });
    expect(issues).toEqual([]);
  });

  it('reja bilan nomuvofiqlik — faqat ogohlantirish', () => {
    const issues = validateTestDraft({
      ...draft([question(), question({ category: 'APPLICATION', points: 4 })]),
      blueprint: {
        KNOWLEDGE: { count: 5, pointsEach: 2 },
        REASONING: { count: 5, pointsEach: 6 },
      },
    });
    const codes = issues.map((issue) => issue.code);
    expect(codes).toEqual(
      expect.arrayContaining(['BLUEPRINT_COUNT_MISMATCH', 'MISSING_CATEGORY', 'UNPLANNED_CATEGORY']),
    );
    expect(hasBlockingIssues(issues)).toBe(false);
  });
});
