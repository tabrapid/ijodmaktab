import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { TeacherRegistration } from '@/components/registration/teacher-registration';
import { SESSION_COOKIE } from '@/lib/session-cookie';

export const metadata: Metadata = { title: 'O‘qituvchi sifatida ro‘yxatdan o‘tish' };

export default async function TeacherRegisterPage() {
  // Kirish cookie’si bo‘lsagina sahifa foydalanuvchi allaqachon kirganmi — tekshiradi.
  const hasSession = (await cookies()).has(SESSION_COOKIE);
  return <TeacherRegistration hasSession={hasSession} />;
}
