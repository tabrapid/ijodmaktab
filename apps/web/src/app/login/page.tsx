import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { AuthCard } from '@/components/auth/auth-card';
import { LoginForm } from '@/components/auth/login-form';

export const metadata: Metadata = { title: 'Kirish' };

export default function LoginPage() {
  return (
    <AuthCard
      title="Tizimga kirish"
      description="Login va parolingizni kiriting"
      footer={
        <div className="space-y-4">
          <p className="rounded-xl border border-slate-200 bg-surface px-4 py-3 text-sm text-slate-600">
            Hisobingiz yo‘qmi?{' '}
            <Link href="/register" className="font-semibold text-brand-700 underline-offset-2 hover:underline">
              Ro‘yxatdan o‘tish
            </Link>
          </p>
          <p>
            Parolni unutgan bo‘lsangiz yoki hisob bloklangan bo‘lsa, direktor o‘rinbosari yoki maktab administratoriga
            murojaat qiling.
          </p>
        </div>
      }
    >
      <Suspense>
        <LoginForm realm="SCHOOL" />
      </Suspense>
    </AuthCard>
  );
}
