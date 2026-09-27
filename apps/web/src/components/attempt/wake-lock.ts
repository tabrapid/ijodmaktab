'use client';

import { useEffect } from 'react';

/** Ekranni yoqiq ushlab turish API si bormi (Chrome/Android, Safari 16.4+, Firefox 126+). */
export function wakeLockSupported(): boolean {
  return typeof navigator !== 'undefined' && 'wakeLock' in navigator;
}

/**
 * Test davomida qurilma ekrani o‘z-o‘zidan o‘chmasligi uchun: ekran o‘chsa sahifa “yashirin”
 * bo‘lib qoladi va test to‘xtatiladi. Sahifa yashiringanda brauzer qulfni o‘zi bo‘shatadi —
 * sahifa qayta ko‘ringanda (yoki foydalanuvchi ekranga tekkanda) yana so‘raladi.
 */
export function useScreenWakeLock(enabled: boolean) {
  useEffect(() => {
    if (!enabled || !wakeLockSupported()) return;
    let active = true;
    let requesting = false;
    let sentinel: WakeLockSentinel | null = null;

    const request = async () => {
      if (!active || requesting || document.visibilityState !== 'visible') return;
      if (sentinel && !sentinel.released) return;
      requesting = true;
      try {
        const next = await navigator.wakeLock.request('screen');
        if (active) sentinel = next;
        else void next.release().catch(() => undefined);
      } catch {
        // Brauzer rad etdi (masalan, quvvatni tejash rejimi) — test baribir davom etadi.
      } finally {
        requesting = false;
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void request();
    };
    const onInteract = () => void request();

    void request();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pointerdown', onInteract);
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pointerdown', onInteract);
      void sentinel?.release().catch(() => undefined);
      sentinel = null;
    };
  }, [enabled]);
}
