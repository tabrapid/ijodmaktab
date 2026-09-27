import { schoolToday } from '@ijod/shared';

/**
 * `@db.Date` maydonlari uchun sana: “YYYY-MM-DD” → shu kunning UTC yarim tuni.
 * Qiymat berilmasa — bugungi sana (Toshkent vaqti bo‘yicha).
 */
export function dateOnly(value?: string | null): Date {
  return new Date(`${value ?? schoolToday()}T00:00:00.000Z`);
}

/** `@db.Date` qiymatini “YYYY-MM-DD” ko‘rinishiga keltiradi. */
export function isoDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}
