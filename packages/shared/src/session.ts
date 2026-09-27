/**
 * Test sessiyasi va urinish vaqti qoidalari (reja, 7–8-bo‘limlar).
 */
import type { SessionState } from './enums.js';

export interface SessionTiming {
  startsAt: Date | string;
  endsAt: Date | string;
  cancelledAt?: Date | string | null;
  entryClosesAt?: Date | string | null;
}

const time = (value: Date | string) => new Date(value).getTime();

export function sessionState(session: SessionTiming, now: Date = new Date()): SessionState {
  if (session.cancelledAt) return 'CANCELLED';
  const current = now.getTime();
  if (current < time(session.startsAt)) return 'SCHEDULED';
  if (current >= time(session.endsAt)) return 'CLOSED';
  return 'OPEN';
}

/** Yangi urinish boshlash mumkin bo‘lgan so‘nggi vaqt (kirish muddati). */
export function entryDeadline(session: SessionTiming): Date {
  const end = time(session.endsAt);
  if (!session.entryClosesAt) return new Date(end);
  return new Date(Math.min(end, time(session.entryClosesAt)));
}

export function isEntryOpen(session: SessionTiming, now: Date = new Date()): boolean {
  return sessionState(session, now) === 'OPEN' && now.getTime() < entryDeadline(session).getTime();
}

/**
 * Standart yakun vaqti = sessiya yopilishi bilan
 * (boshlangan vaqt + davomiylik + individual qo‘shimcha vaqt) orasidagi ertaroq vaqt.
 * Kech kirgan o‘quvchi kamaygan vaqtni oladi.
 */
export function computeAttemptDeadline(input: {
  startedAt: Date;
  durationMinutes: number;
  extraMinutes?: number;
  sessionEndsAt: Date | string;
}): Date {
  const byDuration = input.startedAt.getTime() + (input.durationMinutes + (input.extraMinutes ?? 0)) * 60_000;
  return new Date(Math.min(byDuration, time(input.sessionEndsAt)));
}
