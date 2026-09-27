import { describe, expect, it } from 'vitest';
import {
  ieltsOverallFromBands,
  parsePortfolioDetails,
  pickPortfolioHighlights,
  portfolioCategoryOf,
  portfolioChanges,
  portfolioChangesSince,
  portfolioDetailChanges,
  portfolioDetailsSummary,
  portfolioKeyChanges,
  portfolioStoredFields,
} from './portfolio.js';
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

describe('muhim maydonlar va snapshot farqi', () => {
  it('tavsif, yo‘nalish va ko‘rinish tasdiqqa ta’sir qilmaydi, details esa ta’sir qiladi', () => {
    const before = { title: 'IELTS', description: 'Eski', visibility: 'STAFF', details: { overall: 7 } };
    expect(portfolioKeyChanges(before, { ...before, description: 'Yangi', visibility: 'PRIVATE' })).toEqual([]);
    const changed = portfolioKeyChanges(before, { ...before, details: { overall: 7.5 } });
    expect(changed.map((change) => change.field)).toEqual(['details']);
  });

  it('to‘liq bo‘lmagan eski snapshot faqat o‘zidagi maydonlar bo‘yicha solishtiriladi', () => {
    const snapshot = { title: '“Kuz ohanglari” she’ri', level: 'SCHOOL' };
    const current = { title: '“Kuz ohanglari” she’ri', level: 'SCHOOL', organization: 'Ijod maktabi', type: 'POEM' };
    expect(portfolioChangesSince(snapshot, current)).toEqual([]);
    expect(portfolioChangesSince(snapshot, { ...current, level: 'DISTRICT' }).map((change) => change.field)).toEqual([
      'level',
    ]);
    expect(portfolioChangesSince(null, current)).toEqual([]);
  });

  it('saqlanadigan ko‘rinish: tuzilgan turda natija avtomatik, boshqasida details null', () => {
    expect(portfolioStoredFields('SAT', { total: 1450, readingWriting: 720, math: 730 }, 'boshqa')).toEqual({
      details: { total: 1450, readingWriting: 720, math: 730 },
      result: 'SAT 1450 (RW 720 · M 730)',
      valid: true,
    });
    expect(portfolioStoredFields('POEM', { total: 1 }, ' 1-o‘rin ')).toEqual({
      details: null,
      result: '1-o‘rin',
      valid: true,
    });
    expect(portfolioStoredFields('IELTS', { overall: 11 }, null).valid).toBe(false);
  });

  it('details farqi maydonma-maydon, nomlari bilan', () => {
    expect(
      portfolioDetailChanges(
        'NATIONAL_CERTIFICATE',
        { subject: 'Ona tili va adabiyot', grade: 'B+' },
        'NATIONAL_CERTIFICATE',
        { subject: 'Ona tili va adabiyot', grade: 'A', score: 88 },
      ),
    ).toEqual([
      { field: 'grade', label: 'Daraja', before: 'B+', after: 'A' },
      { field: 'score', label: 'Ball', before: '—', after: '88' },
    ]);
  });
});

describe('bo‘limlar va nishonlar', () => {
  it('turlar bo‘limlarga ajratiladi', () => {
    expect(portfolioCategoryOf('IELTS')).toBe('CERTIFICATES');
    expect(portfolioCategoryOf('CERTIFICATE')).toBe('CERTIFICATES');
    expect(portfolioCategoryOf('CONTEST')).toBe('OLYMPIADS');
    expect(portfolioCategoryOf('POEM')).toBe('CREATIVE');
    expect(portfolioCategoryOf('RESEARCH_PROJECT')).toBe('OTHER');
  });

  it('IELTS umumiy balli bo‘limlar o‘rtachasidan yaxlitlanadi', () => {
    expect(ieltsOverallFromBands(8, 7.5, 6.5, 7)).toBe(7.5);
    expect(ieltsOverallFromBands(6, 6, 6.5, 6.5)).toBe(6.5);
    expect(ieltsOverallFromBands(6.5, 6.5, 7, 7)).toBe(7);
    expect(ieltsOverallFromBands(6, 6, 6, 6.5)).toBe(6);
    expect(ieltsOverallFromBands(6, 6, undefined, 6.5)).toBeNull();
  });

  it('har imtihon bo‘yicha eng yaxshi natija, belgilangan tartibda, ko‘pi bilan 4 ta', () => {
    const highlights = pickPortfolioHighlights([
      { type: 'OLYMPIAD', details: { subject: 'Fizika', place: 'FIRST' } },
      { type: 'IELTS', details: { overall: 6.5 } },
      { type: 'IELTS', details: { overall: 7.5 } },
      { type: 'NATIONAL_CERTIFICATE', details: { subject: 'Matematika', grade: 'B' } },
      { type: 'NATIONAL_CERTIFICATE', details: { subject: 'Matematika', grade: 'A+' } },
      { type: 'SAT', details: { total: 1450 } },
      { type: 'CEFR', details: { language: 'Ingliz tili', level: 'B2' } },
      { type: 'POEM', details: null },
    ]);
    expect(highlights).toEqual(['IELTS 7.5', 'SAT 1450', 'CEFR B2', 'Milliy: Matematika A+']);
    expect(pickPortfolioHighlights([{ type: 'OLYMPIAD', details: { subject: 'Fizika', place: 'FIRST' } }])).toEqual([
      'Olimpiada: Fizika 1-o‘rin',
    ]);
  });
});
