'use client';

/**
 * To‘liq ekran rejimi: standart API va eski Safari (iPad) uchun webkit varianti.
 * Butun sahifa (documentElement) to‘liq ekranga o‘tadi — bildirishnoma va oynalar ko‘rinib
 * turadi, sahifalararo o‘tishda ham rejim saqlanadi.
 */

type WebkitDocument = Document & {
  webkitFullscreenEnabled?: boolean;
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => void;
};

type WebkitElement = HTMLElement & { webkitRequestFullscreen?: () => void };

/** Chromium’ning Keyboard Lock API si (Esc ni “bosib turish”ga aylantiradi). */
type KeyboardLock = { lock?: (keys?: string[]) => Promise<void>; unlock?: () => void };

const CHANGE_EVENTS = ['fullscreenchange', 'webkitfullscreenchange'] as const;
const ERROR_EVENTS = ['fullscreenerror', 'webkitfullscreenerror'] as const;

/** Qurilma to‘liq ekran rejimini qo‘llaydimi (iPhone Safari — yo‘q). */
export function fullscreenSupported(): boolean {
  if (typeof document === 'undefined') return false;
  const doc = document as WebkitDocument;
  return Boolean(doc.fullscreenEnabled || doc.webkitFullscreenEnabled);
}

export function isFullscreen(): boolean {
  if (typeof document === 'undefined') return false;
  const doc = document as WebkitDocument;
  return Boolean(doc.fullscreenElement ?? doc.webkitFullscreenElement);
}

function keyboard(): KeyboardLock | undefined {
  return (navigator as Navigator & { keyboard?: KeyboardLock }).keyboard;
}

/** Esc bilan tasodifan chiqishning oldini oladi (faqat Chromium; boshqa brauzerlarda jim o‘tadi). */
function lockEscapeKey() {
  try {
    void keyboard()
      ?.lock?.(['Escape'])
      ?.catch(() => undefined);
  } catch {
    // Qo‘llab-quvvatlanmaydi — muhim emas.
  }
}

/** Eski webkit API va’da qaytarmaydi: natijani hodisa orqali kutamiz. */
function waitForFullscreen(timeoutMs = 1500): Promise<void> {
  return new Promise((resolve, reject) => {
    if (isFullscreen()) {
      resolve();
      return;
    }
    const cleanup = () => {
      clearTimeout(timer);
      for (const name of CHANGE_EVENTS) document.removeEventListener(name, settle);
      for (const name of ERROR_EVENTS) document.removeEventListener(name, settle);
    };
    const settle = () => {
      cleanup();
      if (isFullscreen()) resolve();
      else reject(new Error('To‘liq ekranga o‘tib bo‘lmadi'));
    };
    const timer = setTimeout(settle, timeoutMs);
    for (const name of CHANGE_EVENTS) document.addEventListener(name, settle);
    for (const name of ERROR_EVENTS) document.addEventListener(name, settle);
  });
}

/**
 * Sahifani to‘liq ekranga o‘tkazadi. Brauzer talabi: foydalanuvchi bosgan tugma ishlovchisi
 * ichida, hech qanday `await` dan oldin chaqirilishi kerak.
 */
export function enterFullscreen(): Promise<void> {
  if (typeof document === 'undefined') return Promise.reject(new Error('Brauzer muhiti emas'));
  const element = document.documentElement as WebkitElement;
  try {
    if (typeof element.requestFullscreen === 'function') {
      const result = element.requestFullscreen({ navigationUI: 'hide' }) as Promise<void> | undefined;
      return Promise.resolve(result ?? waitForFullscreen()).then(lockEscapeKey);
    }
    if (typeof element.webkitRequestFullscreen === 'function') {
      element.webkitRequestFullscreen();
      return waitForFullscreen().then(lockEscapeKey);
    }
  } catch (error) {
    return Promise.reject(error instanceof Error ? error : new Error(String(error)));
  }
  return Promise.reject(new Error('Bu qurilmada to‘liq ekran rejimi yo‘q'));
}

/** Dasturning o‘zi to‘liq ekrandan chiqadi (test yakunlanganda). */
export function exitFullscreen() {
  try {
    keyboard()?.unlock?.();
  } catch {
    // E’tiborsiz.
  }
  if (!isFullscreen()) return;
  const doc = document as WebkitDocument;
  try {
    if (typeof doc.exitFullscreen === 'function') void doc.exitFullscreen().catch(() => undefined);
    else doc.webkitExitFullscreen?.();
  } catch {
    // Brauzer allaqachon chiqqan.
  }
}

/** To‘liq ekran holati o‘zgarishini kuzatadi; bekor qilish funksiyasini qaytaradi. */
export function onFullscreenChange(handler: () => void) {
  for (const name of CHANGE_EVENTS) document.addEventListener(name, handler);
  return () => {
    for (const name of CHANGE_EVENTS) document.removeEventListener(name, handler);
  };
}
