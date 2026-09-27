import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthCard } from '@/components/auth/auth-card';
import { LoginForm } from '@/components/auth/login-form';

export const metadata: Metadata = { title: 'Kirish' };

export default function LoginPage() {
  return (
    <AuthCard
      title="Tizimga kirish"
      description="Maktab bergan login va parolni kiriting"
      footer="Parolni unutgan bo‘lsangiz yoki hisob bloklangan bo‘lsa, maktab administratoriga murojaat qiling."
    >
      <Suspense>
        <LoginForm realm="SCHOOL" />
      </Suspense>
    </AuthCard>
  );
}
