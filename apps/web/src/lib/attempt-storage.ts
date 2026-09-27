'use client';

/**
 * Brauzer xotirasi: kirish kodi (bir martalik), qurilma identifikatori va hali serverga
 * yetib bormagan javoblar (internet uzilganda yo‘qolmasligi uchun).
 */

const safe = <T>(fn: () => T, fallback: T): T => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};

export function rememberAccessCode(sessionId: string, code: string) {
  safe(() => sessionStorage.setItem(`ijod:code:${sessionId}`, code.toUpperCase()), undefined);
}

export function recallAccessCode(sessionId: string): string {
  return safe(() => sessionStorage.getItem(`ijod:code:${sessionId}`) ?? '', '');
}

export function forgetAccessCode(sessionId: string) {
  safe(() => sessionStorage.removeItem(`ijod:code:${sessionId}`), undefined);
}

function randomId() {
  const bytes = new Uint8Array(16);
  // crypto.getRandomValues HTTP (xavfsiz bo‘lmagan) muhitda ham ishlaydi.
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Brauzer oynasi identifikatori. Har bir oyna (tab) o‘z identifikatoriga ega — test bir vaqtda
 * ikki joyda ochilsa server buni aniqlaydi.
 */
export function tabClientId(): string {
  return safe(() => {
    const existing = sessionStorage.getItem('ijod:client');
    if (existing) return existing;
    const created = `tab${randomId()}`;
    sessionStorage.setItem('ijod:client', created);
    return created;
  }, `tab${randomId()}`);
}

export interface PendingAnswer {
  optionId: string | null;
  revision: number;
}

const pendingKey = (attemptId: string) => `ijod:pending:${attemptId}`;

export function loadPending(attemptId: string): Record<string, PendingAnswer> {
  return safe(
    () => JSON.parse(localStorage.getItem(pendingKey(attemptId)) ?? '{}') as Record<string, PendingAnswer>,
    {},
  );
}

export function savePending(attemptId: string, pending: Record<string, PendingAnswer>) {
  safe(() => {
    if (Object.keys(pending).length === 0) localStorage.removeItem(pendingKey(attemptId));
    else localStorage.setItem(pendingKey(attemptId), JSON.stringify(pending));
  }, undefined);
}
