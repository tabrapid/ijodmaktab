'use client';

import { useEffect, useRef } from 'react';
import { isUzbekLatinName, loginFromName, normalizeUzbekName } from '@ijod/shared';
import { ButtonLink } from '@/components/ui/button';
import { Alert } from '@/components/ui/feedback';
import { LOGIN_PATTERN } from './queries';

const CLOSED_TEXT = {
  student: 'O‘quvchilar uchun ro‘yxatdan o‘tish hozircha yopiq.',
  teacher: 'O‘qituvchilar uchun ro‘yxatdan o‘tish hozircha yopiq.',
};

/** Ro‘yxatdan o‘tish yopiq (yoki sinflar/fanlar hali kiritilmagan) bo‘lsa ko‘rsatiladi. */
export function ClosedNotice({
  who,
  reason = 'closed',
}: {
  who: 'student' | 'teacher';
  reason?: 'closed' | 'no-classes' | 'no-subjects';
}) {
  return (
    <div className="space-y-4">
      {reason === 'closed' ? (
        <Alert tone="info" title="Hozircha yopiq">
          {CLOSED_TEXT[who]} Direktor o‘rinbosari ro‘yxatdan o‘tishni ochgach, shu sahifadan foydalanishingiz mumkin.
        </Alert>
      ) : (
        <Alert
          tone="warning"
          title={reason === 'no-classes' ? 'Sinflar hali kiritilmagan' : 'Fanlar hali kiritilmagan'}
        >
          {reason === 'no-classes'
            ? 'Joriy o‘quv yili sinflari tizimga kiritilgach ro‘yxatdan o‘tishingiz mumkin.'
            : 'Fanlar ro‘yxati tizimga kiritilgach ro‘yxatdan o‘tishingiz mumkin.'}{' '}
          Direktor o‘rinbosariga murojaat qiling.
        </Alert>
      )}
      <ButtonLink href="/register" variant="outline" className="w-full">
        Orqaga
      </ButtonLink>
    </div>
  );
}

/** Ism-familiyadan login taklifi (“Alisher”, “Abdug‘aniyev” → “alisher.abduganiyev”). */
export function loginFromNames(firstName?: string | null, lastName?: string | null): string | null {
  if (!firstName?.trim() || !lastName?.trim()) return null;
  const first = normalizeUzbekName(firstName);
  const last = normalizeUzbekName(lastName);
  if (!isUzbekLatinName(first) || !isUzbekLatinName(last)) return null;
  const login = loginFromName(first, last);
  return LOGIN_PATTERN.test(login) ? login : null;
}

/** Server xabari chiqqanda uni ko‘rinadigan joyga suradi va fokus beradi (ekran o‘quvchisi uchun ham). */
export function useScrollIntoView(trigger: unknown) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!trigger || !ref.current) return;
    ref.current.scrollIntoView({ block: 'center', behavior: 'smooth' });
    ref.current.focus({ preventScroll: true });
  }, [trigger]);
  return ref;
}
