'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { PASSWORD_MIN_LENGTH, changePasswordSchema, type ChangePasswordInput } from '@ijod/shared';
import { AuthCard } from '@/components/auth/auth-card';
import { Button } from '@/components/ui/button';
import { Alert, PageLoader } from '@/components/ui/feedback';
import { Field, Input } from '@/components/ui/form';
import { ApiError, api } from '@/lib/api';
import { ME_KEY, homeFor, useMe } from '@/lib/auth';

export default function ChangePasswordPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });

  if (!me) return <PageLoader />;

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await api.post('/auth/change-password', values);
      await queryClient.invalidateQueries({ queryKey: ME_KEY });
      router.replace(homeFor(me));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Parolni almashtirib bo‘lmadi.');
    }
  });

  return (
    <AuthCard
      title={me.mustChangePassword ? 'Yangi parol o‘rnating' : 'Parolni almashtirish'}
      description={
        me.mustChangePassword
          ? 'Siz vaqtinchalik parol bilan kirdingiz. Davom etish uchun o‘zingizning parolingizni o‘rnating.'
          : undefined
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {error && <Alert tone="danger">{error}</Alert>}
        <Field label="Joriy (vaqtinchalik) parol" error={form.formState.errors.currentPassword?.message}>
          <Input type="password" autoComplete="current-password" {...form.register('currentPassword')} />
        </Field>
        <Field
          label="Yangi parol"
          hint={`Kamida ${PASSWORD_MIN_LENGTH} ta belgi, harf va raqam bo‘lsin.`}
          error={form.formState.errors.newPassword?.message}
        >
          <Input type="password" autoComplete="new-password" {...form.register('newPassword')} />
        </Field>
        <Field label="Yangi parolni takrorlang" error={form.formState.errors.confirmPassword?.message}>
          <Input type="password" autoComplete="new-password" {...form.register('confirmPassword')} />
        </Field>
        <Button type="submit" className="w-full" loading={form.formState.isSubmitting}>
          Saqlash
        </Button>
      </form>
    </AuthCard>
  );
}
