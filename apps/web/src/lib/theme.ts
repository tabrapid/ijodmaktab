'use client';

import { useEffect, useSyncExternalStore } from 'react';

/**
 * Yorug‘ / qorong‘u rejim tanlovi. Birinchi chizishdan oldingi qo‘llash app/layout.tsx dagi kichik
 * skriptda (u shu kalit va qoidani takrorlaydi); bu yerda — tanlovni saqlash va kuzatish.
 */
export type ThemeChoice = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'ijod:theme';
export const THEME_CHOICES: readonly ThemeChoice[] = ['light', 'dark', 'system'];
export const THEME_LABELS: Record<ThemeChoice, string> = {
  light: 'Yorug‘',
  dark: 'Qorong‘u',
  system: 'Tizim bo‘yicha',
};

const DARK_QUERY = '(prefers-color-scheme: dark)';
const listeners = new Set<() => void>();
let current: ThemeChoice | null = null;
let media: MediaQueryList | null = null;

const isChoice = (value: unknown): value is ThemeChoice => value === 'light' || value === 'dark' || value === 'system';

function readStored(): ThemeChoice {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isChoice(value) ? value : 'system';
  } catch {
    return 'system';
  }
}

function systemDark() {
  try {
    media ??= window.matchMedia(DARK_QUERY);
    return media.matches;
  } catch {
    return false;
  }
}

function resolve(choice: ThemeChoice): ResolvedTheme {
  return choice === 'dark' || (choice === 'system' && systemDark()) ? 'dark' : 'light';
}

/** <html> ga `dark` sinfi va color-scheme qo‘yiladi (chop etishda CSS yorug‘ rejimni majburlaydi). */
function apply(choice: ThemeChoice) {
  const dark = resolve(choice) === 'dark';
  const root = document.documentElement;
  root.classList.toggle('dark', dark);
  root.style.colorScheme = dark ? 'dark' : 'light';
}

function choiceNow(): ThemeChoice {
  current ??= readStored();
  return current;
}

function emit() {
  for (const listener of listeners) listener();
}

export function setTheme(choice: ThemeChoice) {
  current = choice;
  try {
    if (choice === 'system') window.localStorage.removeItem(THEME_STORAGE_KEY);
    else window.localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // Xotira yopiq (maxfiy oyna) — tanlov faqat shu sahifada amal qiladi.
  }
  apply(choice);
  emit();
}

function onSystemChange() {
  if (choiceNow() === 'system') apply('system');
  emit();
}

function onStorage(event: StorageEvent) {
  if (event.key !== null && event.key !== THEME_STORAGE_KEY) return;
  current = readStored();
  apply(current);
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    try {
      media ??= window.matchMedia(DARK_QUERY);
      media.addEventListener('change', onSystemChange);
    } catch {
      // matchMedia yo‘q — tizim rejimi kuzatilmaydi.
    }
    window.addEventListener('storage', onStorage);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      media?.removeEventListener('change', onSystemChange);
      window.removeEventListener('storage', onStorage);
    }
  };
}

const serverChoice = (): ThemeChoice => 'system';
const serverResolved = (): ResolvedTheme => 'light';
const clientResolved = (): ResolvedTheme => (document.documentElement.classList.contains('dark') ? 'dark' : 'light');

const noop = () => {};

/**
 * Tizim mavzusi va boshqa varaqdagi tanlovni doimo kuzatadi — mavzu tugmasi yo‘q sahifalarda ham
 * (masalan, /attempt). Ildiz provayderda bir marta chaqiriladi; qayta chizishga sabab bo‘lmaydi.
 */
export function useThemeSync() {
  useEffect(() => subscribe(noop), []);
}

/** Foydalanuvchi tanlovi (“Tizim bo‘yicha” ham) va hozir amaldagi rejim. */
export function useTheme() {
  const choice = useSyncExternalStore(subscribe, choiceNow, serverChoice);
  const resolved = useSyncExternalStore(subscribe, clientResolved, serverResolved);
  return { choice, resolved, setTheme };
}
