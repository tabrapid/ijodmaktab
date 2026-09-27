import { randomInt } from 'node:crypto';
import { sessionState } from '@ijod/shared';
import type { AssessmentSession } from '../generated/prisma/client.js';

type RuleSession = Pick<
  AssessmentSession,
  | 'startsAt'
  | 'endsAt'
  | 'entryClosesAt'
  | 'cancelledAt'
  | 'scoreVisibility'
  | 'reviewVisibility'
  | 'resultsPublishedAt'
  | 'reviewOpenedAt'
>;

export const stateOf = (session: RuleSession, now = new Date()) => sessionState(session, now);

/** O‘quvchiga ball ko‘rsatiladimi (natija siyosati, reja 7-bo‘lim, 9-bosqich). */
export function scoresReleased(session: RuleSession, now = new Date()): boolean {
  if (session.cancelledAt) return false;
  switch (session.scoreVisibility) {
    case 'AFTER_SUBMIT':
      return true;
    case 'AFTER_ALL_DONE':
      return Boolean(session.resultsPublishedAt) || stateOf(session, now) === 'CLOSED';
    case 'MANUAL':
      return Boolean(session.resultsPublishedAt);
  }
}

/**
 * To‘g‘ri javoblar va izohlar ochiladimi. Hali kimdir ishlayotgan bo‘lsa hech qachon ochilmaydi
 * (javoblar boshqalarga tarqalmasligi uchun).
 */
export function reviewReleased(session: RuleSession, someoneStillWorking: boolean, now = new Date()): boolean {
  if (someoneStillWorking || !scoresReleased(session, now)) return false;
  switch (session.reviewVisibility) {
    case 'NEVER':
      return false;
    case 'AFTER_CLOSE':
      return stateOf(session, now) === 'CLOSED';
    case 'MANUAL':
      return Boolean(session.reviewOpenedAt);
  }
}

/** Kriptografik tasodifiy aralashtirish (Fisher–Yates). */
export function shuffled<T>(items: readonly T[]): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = randomInt(index + 1);
    [copy[index], copy[swap]] = [copy[swap]!, copy[index]!];
  }
  return copy;
}

/** Chalkashtiriladigan belgilarsiz kirish kodi alifbosi (0/O, 1/I yo‘q). */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ACCESS_CODE_LENGTH = 6;

export function randomAccessCode(): string {
  return Array.from({ length: ACCESS_CODE_LENGTH }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
}
