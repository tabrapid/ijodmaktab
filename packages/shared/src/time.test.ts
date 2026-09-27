import { describe, expect, it } from 'vitest';
import { computeAttemptDeadline, isEntryOpen, sessionState } from './session.js';
import { normalizeForSearch } from './text.js';
import { dateToSchoolInput, formatDateTime, formatDuration, schoolInputToDate } from './time.js';

describe('vaqt: bazada UTC, interfeysda Asia/Tashkent', () => {
  it('UTC vaqtni Toshkent vaqtida ko‘rsatadi', () => {
    expect(formatDateTime('2026-09-27T04:30:00.000Z')).toBe('27.09.2026 09:30');
    expect(formatDateTime('2026-12-31T20:15:00.000Z')).toBe('01.01.2027 01:15');
  });

  it('datetime-local qiymatini Toshkent vaqti sifatida o‘qiydi', () => {
    const date = schoolInputToDate('2026-09-27T09:30');
    expect(date.toISOString()).toBe('2026-09-27T04:30:00.000Z');
    expect(dateToSchoolInput(date)).toBe('2026-09-27T09:30');
  });

  it('davomiylikni formatlaydi', () => {
    expect(formatDuration(309)).toBe('05:09');
    expect(formatDuration(3909)).toBe('1:05:09');
    expect(formatDuration(-5)).toBe('00:00');
  });
});

describe('sessiya holati va urinish muddati', () => {
  const session = {
    startsAt: '2026-09-27T04:00:00.000Z',
    endsAt: '2026-09-27T05:00:00.000Z',
  };

  it('holatlar', () => {
    expect(sessionState(session, new Date('2026-09-27T03:59:59Z'))).toBe('SCHEDULED');
    expect(sessionState(session, new Date('2026-09-27T04:00:00Z'))).toBe('OPEN');
    expect(sessionState(session, new Date('2026-09-27T05:00:00Z'))).toBe('CLOSED');
    expect(sessionState({ ...session, cancelledAt: new Date() }, new Date('2026-09-27T04:30:00Z'))).toBe('CANCELLED');
  });

  it('kirish muddati o‘tgach yangi urinish boshlanmaydi', () => {
    const withEntry = { ...session, entryClosesAt: '2026-09-27T04:15:00.000Z' };
    expect(isEntryOpen(withEntry, new Date('2026-09-27T04:10:00Z'))).toBe(true);
    expect(isEntryOpen(withEntry, new Date('2026-09-27T04:20:00Z'))).toBe(false);
  });

  it('yakun vaqti = sessiya yopilishi va (boshlanish + davomiylik + qo‘shimcha) ning ertarog‘i', () => {
    const early = computeAttemptDeadline({
      startedAt: new Date('2026-09-27T04:00:00Z'),
      durationMinutes: 40,
      extraMinutes: 10,
      sessionEndsAt: session.endsAt,
    });
    expect(early.toISOString()).toBe('2026-09-27T04:50:00.000Z');

    // Kech kirgan o‘quvchi kamaygan vaqtni oladi.
    const late = computeAttemptDeadline({
      startedAt: new Date('2026-09-27T04:45:00Z'),
      durationMinutes: 40,
      sessionEndsAt: session.endsAt,
    });
    expect(late.toISOString()).toBe('2026-09-27T05:00:00.000Z');
  });
});

describe('qidiruvda apostrof variantlari', () => {
  it('turli apostroflar bir xil qidiruv matniga keladi', () => {
    const variants = ['O‘quvchi', "O'quvchi", 'Oʻquvchi', 'O`quvchi', 'O’quvchi'];
    const normalized = new Set(variants.map(normalizeForSearch));
    expect(normalized.size).toBe(1);
    expect([...normalized][0]).toBe("o'quvchi");
  });
});
