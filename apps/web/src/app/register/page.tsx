import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { RegisterChoice } from '@/components/registration/register-choice';
import { SESSION_COOKIE } from '@/lib/session-cookie';

export const metadata: Metadata = { title: 'Ro‘yxatdan o‘tish' };

/** Ochiq sahifa: o‘quvchi yoki o‘qituvchi sifatida ro‘yxatdan o‘tishni tanlash. */
export default async function RegisterPage() {
  // Kirish cookie’si bo‘lsagina sahifa foydalanuvchi allaqachon kirganmi — tekshiradi.
  const hasSession = (await cookies()).has(SESSION_COOKIE);
  return <RegisterChoice hasSession={hasSession} />;
}
