import type { Metadata } from 'next';
import { RegisterChoice } from '@/components/registration/register-choice';

export const metadata: Metadata = { title: 'Ro‘yxatdan o‘tish' };

/** Ochiq sahifa: o‘quvchi yoki o‘qituvchi sifatida ro‘yxatdan o‘tishni tanlash. */
export default function RegisterPage() {
  return <RegisterChoice />;
}
