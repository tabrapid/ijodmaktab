import { describe, expect, it } from 'vitest';
import { addMonthsToIsoDate, teacherCategoryValidUntil, teacherCategoryValidity } from './teacher.js';

describe('addMonthsToIsoDate', () => {
  it('oy va yil qo‘shadi, oy oxirini to‘g‘ri hisoblaydi', () => {
    expect(addMonthsToIsoDate('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonthsToIsoDate('2024-02-29', 12)).toBe('2025-02-28');
    expect(addMonthsToIsoDate('2026-03-31', -1)).toBe('2026-02-28');
    expect(addMonthsToIsoDate('2026-01-15', -1)).toBe('2025-12-15');
    expect(addMonthsToIsoDate('2026-12-01', 1)).toBe('2027-01-01');
    expect(() => addMonthsToIsoDate('2026-1-1', 1)).toThrow();
  });
});

describe('Malaka toifasi muddati', () => {
  it('berilgan sanadan 5 yil amal qiladi', () => {
    expect(teacherCategoryValidUntil('2021-05-20')).toBe('2026-05-20');
    expect(teacherCategoryValidUntil('2024-02-29')).toBe('2029-02-28');
  });

  it('muddat o‘tgan, yaqinlashgan va bemalol holatlar', () => {
    // Oxirgi kun hali amal qiladi.
    expect(teacherCategoryValidity('2021-05-20', '2026-05-20')).toEqual({
      validUntil: '2026-05-20',
      expired: false,
      expiresSoon: true,
    });
    expect(teacherCategoryValidity('2021-05-20', '2026-05-21').expired).toBe(true);
    expect(teacherCategoryValidity('2021-05-20', '2026-05-21').expiresSoon).toBe(false);
    // 6 oy qolganda ogohlantiriladi, undan oldin — yo‘q.
    expect(teacherCategoryValidity('2021-05-20', '2025-11-20').expiresSoon).toBe(true);
    expect(teacherCategoryValidity('2021-05-20', '2025-11-19').expiresSoon).toBe(false);
    expect(teacherCategoryValidity('2024-09-01', '2026-09-30')).toEqual({
      validUntil: '2029-09-01',
      expired: false,
      expiresSoon: false,
    });
  });
});
