/**
 * Vaqt qoidalari: bazada barcha vaqtlar UTC, interfeysda Asia/Tashkent (reja, 8-bo‘lim).
 * O‘zbekistonda yozgi vaqt yo‘q, mintaqa doimiy UTC+05:00.
 */

export const SCHOOL_TIME_ZONE = 'Asia/Tashkent';
export const SCHOOL_UTC_OFFSET = '+05:00';

const MONTHS = [
  'yanvar',
  'fevral',
  'mart',
  'aprel',
  'may',
  'iyun',
  'iyul',
  'avgust',
  'sentabr',
  'oktabr',
  'noyabr',
  'dekabr',
];

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const partsFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: SCHOOL_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

export function toSchoolWallClock(date: Date | string): WallClock {
  const parts = Object.fromEntries(
    partsFormatter.formatToParts(new Date(date)).map((part) => [part.type, part.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

const pad = (value: number) => String(value).padStart(2, '0');

/** “27.09.2026 14:30” */
export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return '—';
  const c = toSchoolWallClock(date);
  return `${pad(c.day)}.${pad(c.month)}.${c.year} ${pad(c.hour)}:${pad(c.minute)}`;
}

/** “27.09.2026” */
export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '—';
  const c = toSchoolWallClock(date);
  return `${pad(c.day)}.${pad(c.month)}.${c.year}`;
}

/** “27-sentabr, 14:30” */
export function formatHumanDateTime(date: Date | string | null | undefined): string {
  if (!date) return '—';
  const c = toSchoolWallClock(date);
  return `${c.day}-${MONTHS[c.month - 1]}, ${pad(c.hour)}:${pad(c.minute)}`;
}

/** “14:30” */
export function formatTime(date: Date | string | null | undefined): string {
  if (!date) return '—';
  const c = toSchoolWallClock(date);
  return `${pad(c.hour)}:${pad(c.minute)}`;
}

/** Brauzerdagi `datetime-local` qiymati (Toshkent vaqti) → UTC sana. */
export function schoolInputToDate(value: string): Date {
  const normalized = value.length === 16 ? `${value}:00` : value;
  return new Date(`${normalized}${SCHOOL_UTC_OFFSET}`);
}

/** UTC sana → `datetime-local` uchun Toshkent vaqti (“2026-09-27T14:30”). */
export function dateToSchoolInput(date: Date | string): string {
  const c = toSchoolWallClock(date);
  return `${c.year}-${pad(c.month)}-${pad(c.day)}T${pad(c.hour)}:${pad(c.minute)}`;
}

/** Toshkent bo‘yicha bugungi sana “YYYY-MM-DD”. */
export function schoolToday(now: Date = new Date()): string {
  const c = toSchoolWallClock(now);
  return `${c.year}-${pad(c.month)}-${pad(c.day)}`;
}

/** Soniyalarni “1:05:09” yoki “05:09” ko‘rinishiga keltiradi. */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
