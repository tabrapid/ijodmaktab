import { describe, expect, it } from 'vitest';
import { parsePortfolioDetails, portfolioChanges, portfolioDetailsSummary } from './portfolio.js';
import { portfolioItemSchema } from './schemas.js';

describe('portfolio details', () => {
  it('IELTS: 0,5 qadamli ballar qabul qilinadi, boshqasi rad etiladi', () => {
    expect(parsePortfolioDetails('IELTS', { overall: 7.5, listening: 8, reading: 7.5 }).success).toBe(true);
    expect(parsePortfolioDetails('IELTS', { overall: 7.3 }).success).toBe(false);
    expect(parsePortfolioDetails('IELTS', { overall: 9.5 }).success).toBe(false);
  });

  it('SAT: umumiy ball bo‘limlar yig‘indisiga teng bo‘lishi kerak', () => {
    expect(parsePortfolioDetails('SAT', { total: 1450, readingWriting: 720, math: 730 }).success).toBe(true);
    expect(parsePortfolioDetails('SAT', { total: 1400, readingWriting: 720, math: 730 }).success).toBe(false);
    expect(parsePortfolioDetails('SAT', { total: 1455 }).success).toBe(false);
  });

  it('tuzilgan maydoni yo‘q turlarda details null bo‘ladi', () => {
    expect(parsePortfolioDetails('POEM', { anything: true })).toEqual({ success: true, data: null });
  });

  it('natija matni turga mos', () => {
    expect(portfolioDetailsSummary('NATIONAL_CERTIFICATE', { subject: 'Matematika', grade: 'A+', score: 95 })).toBe(
      'Matematika — A+ (95 ball)',
    );
    expect(
      portfolioDetailsSummary('IELTS', { overall: 7.5, listening: 8, reading: 7.5, writing: 6.5, speaking: 7 }),
    ).toBe('IELTS 7.5 (L 8 · R 7.5 · W 6.5 · S 7)');
    expect(portfolioDetailsSummary('SAT', { total: 1450, readingWriting: 720, math: 730 })).toBe(
      'SAT 1450 (RW 720 · M 730)',
    );
    expect(portfolioDetailsSummary('CEFR', { language: 'Ingliz tili', level: 'C1' })).toBe('Ingliz tili: C1');
    expect(portfolioDetailsSummary('OLYMPIAD', { subject: 'Fizika', place: 'FIRST' })).toBe('Fizika — 1-o‘rin');
  });

  it('portfolioItemSchema details xatosini maydon yo‘li bilan qaytaradi', () => {
    const result = portfolioItemSchema.safeParse({ type: 'CEFR', title: 'CEFR', details: { language: 'Ingliz tili' } });
    expect(result.success).toBe(false);
    expect(result.error?.issues.some((issue) => issue.path.join('.') === 'details.level')).toBe(true);
  });
});

describe('portfolioChanges', () => {
  it('oxirgi tasdiqlangan holat bilan farqni ko‘rsatadi, bo‘sh va null farq emas', () => {
    const before = {
      title: 'IELTS',
      result: '',
      details: { overall: 7, testType: 'ACADEMIC' },
      date: '2026-05-01T00:00:00.000Z',
    };
    const after = { title: 'IELTS', result: null, details: { testType: 'ACADEMIC', overall: 7.5 }, date: '2026-05-01' };
    const changes = portfolioChanges(before, after);
    expect(changes.map((change) => change.field)).toEqual(['details']);
    expect(changes[0]!.before).toEqual({ overall: 7, testType: 'ACADEMIC' });
  });

  it('hech qachon tasdiqlanmagan yozuv uchun bo‘sh ro‘yxat', () => {
    expect(portfolioChanges(null, { title: 'Yangi' })).toEqual([]);
  });
});
