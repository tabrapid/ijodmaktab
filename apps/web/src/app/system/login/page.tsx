import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthCard } from '@/components/auth/auth-card';
import { LoginForm } from '@/components/auth/login-form';

export const metadata: Metadata = { title: 'Tizim boshqaruvi', robots: { index: false, follow: false } };

/** Super admin uchun alohida kirish manzili. Ikki bosqichli tasdiq majburiy. */
export default function SystemLoginPage() {
  return (
    <AuthCard
      variant="system"
      title="Super admin kirishi"
      description="Faqat super admin hisoblari uchun. Kirishdan so‘ng ikki bosqichli tasdiq talab qilinadi."
    >
      <Suspense>
        <LoginForm realm="SYSTEM" />
      </Suspense>
    </AuthCard>
  );
}
