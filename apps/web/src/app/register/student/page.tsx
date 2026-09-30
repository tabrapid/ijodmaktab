import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { StudentRegistration } from '@/components/registration/student-registration';
import { SESSION_COOKIE } from '@/lib/session-cookie';

export const metadata: Metadata = { title: 'O‘quvchi sifatida ro‘yxatdan o‘tish' };

export default async function StudentRegisterPage() {
  // Kirish cookie’si bo‘lsagina sahifa foydalanuvchi allaqachon kirganmi — tekshiradi.
  const hasSession = (await cookies()).has(SESSION_COOKIE);
  return <StudentRegistration hasSession={hasSession} />;
}
