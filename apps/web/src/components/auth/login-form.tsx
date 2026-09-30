'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { loginSchema, type LoginInput } from '@ijod/shared';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/feedback';
import { Field, Input } from '@/components/ui/form';
import { ApiError, api } from '@/lib/api';
import { ME_KEY, afterLoginPath } from '@/lib/auth';
import type { Me } from '@/lib/types';

export function LoginForm({ realm }: { realm: 'SCHOOL' | 'SYSTEM' }) {
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  // Tasdiq kutayotgan hisob (o‘zi ro‘yxatdan o‘tgan o‘qituvchi) — xato emas, ma’lumot sifatida ko‘rsatiladi.
  const [pending, setPending] = useState(false);
  const form = useForm<LoginInput>({ resolver: zodResolver(loginSchema), defaultValues: { login: '', password: '' } });

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      const me = await api.post<Me>(realm === 'SYSTEM' ? '/auth/system/login' : '/auth/login', values);
      queryClient.setQueryData(ME_KEY, me);
      router.replace(afterLoginPath(me, params.get('next')));
    } catch (caught) {
      setPending(caught instanceof ApiError && caught.code === 'ACCOUNT_PENDING');
      setError(caught instanceof ApiError ? caught.message : 'Kirishda xatolik yuz berdi.');
      form.setValue('password', '');
      form.setFocus('password');
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {params.get('expired') && !error && <Alert tone="info">Sessiya muddati tugadi. Qaytadan kiring.</Alert>}
      {error &&
        (pending ? (
          <Alert tone="info" title="Hisobingiz hali tasdiqlanmagan">
            {error}
          </Alert>
        ) : (
          <Alert tone="danger">{error}</Alert>
        ))}
      <Field label="Login" error={form.formState.errors.login?.message}>
        <Input autoComplete="username" autoCapitalize="none" spellCheck={false} autoFocus {...form.register('login')} />
      </Field>
      <Field label="Parol" error={form.formState.errors.password?.message}>
        <Input type="password" autoComplete="current-password" {...form.register('password')} />
      </Field>
      <Button type="submit" className="w-full" loading={form.formState.isSubmitting}>
        Kirish
      </Button>
    </form>
  );
}
