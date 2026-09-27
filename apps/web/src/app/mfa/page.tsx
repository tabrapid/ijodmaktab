'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import QRCode from 'qrcode';
import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { AuthCard } from '@/components/auth/auth-card';
import { Button } from '@/components/ui/button';
import { Alert, PageLoader } from '@/components/ui/feedback';
import { Field, Input } from '@/components/ui/form';
import { api, errorMessage } from '@/lib/api';
import { ME_KEY, afterLoginPath, useMe } from '@/lib/auth';
import type { Me } from '@/lib/types';

function CodeInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <Input
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern="\d{6}"
      maxLength={6}
      autoFocus
      className="text-center text-lg tracking-[0.4em] tabular"
      value={value}
      onChange={(event) => onChange(event.target.value.replace(/\D/g, '').slice(0, 6))}
    />
  );
}

function MfaContent() {
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const [code, setCode] = useState('');
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string; qr: string } | null>(null);

  const start = useMutation({
    mutationFn: async () => {
      const result = await api.post<{ secret: string; otpauthUrl: string }>('/auth/mfa/setup');
      return { ...result, qr: await QRCode.toDataURL(result.otpauthUrl, { margin: 1, width: 220 }) };
    },
    onSuccess: setSetup,
  });

  const needsSetup = me ? !me.mfa.enabled : false;
  useEffect(() => {
    if (needsSetup && !setup && !start.isPending && !start.isError) start.mutate();
  }, [needsSetup, setup, start]);

  const finish = async () => {
    const fresh = await queryClient.fetchQuery({
      queryKey: ME_KEY,
      queryFn: () => api.get<Me>('/auth/me'),
      staleTime: 0,
    });
    router.replace(afterLoginPath(fresh, params.get('next')));
  };

  const confirm = useMutation({
    mutationFn: () => api.post(needsSetup ? '/auth/mfa/confirm' : '/auth/mfa/verify', { code }),
    onSuccess: finish,
    onError: () => setCode(''),
  });

  if (!me) return <PageLoader />;
  if (me.mfa.verified || !me.mfa.required) {
    void finish();
    return <PageLoader />;
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (code.length === 6) confirm.mutate();
  };

  return (
    <AuthCard
      variant={me.realm === 'SYSTEM' ? 'system' : 'school'}
      title={needsSetup ? 'Ikki bosqichli kirishni sozlang' : 'Tasdiqlash kodi'}
      description={
        needsSetup
          ? 'Autentifikator ilovasi (Google Authenticator, Microsoft Authenticator va h.k.) bilan QR kodni skanerlang va ko‘rsatilgan 6 xonali kodni kiriting.'
          : 'Autentifikator ilovasidagi 6 xonali kodni kiriting.'
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        {confirm.isError && <Alert tone="danger">{errorMessage(confirm.error)}</Alert>}
        {start.isError && <Alert tone="danger">{errorMessage(start.error)}</Alert>}
        {needsSetup && (
          <div className="flex flex-col items-center gap-2">
            {setup ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={setup.qr}
                  alt="Ikki bosqichli kirish uchun QR kod"
                  width={220}
                  height={220}
                  className="rounded-xl border border-slate-200 bg-white"
                />
                <p className="text-center text-xs text-slate-500">
                  QR kod skanerlanmasa, kalitni qo‘lda kiriting:
                  <br />
                  <code className="mt-1 inline-block rounded bg-slate-100 px-2 py-1 font-mono text-[13px] break-all text-slate-800">
                    {setup.secret}
                  </code>
                </p>
              </>
            ) : (
              <PageLoader label="Kalit tayyorlanmoqda…" />
            )}
          </div>
        )}
        <Field label="6 xonali kod">
          <CodeInput value={code} onChange={setCode} />
        </Field>
        <Button type="submit" className="w-full" loading={confirm.isPending} disabled={code.length !== 6}>
          Tasdiqlash
        </Button>
      </form>
    </AuthCard>
  );
}

export default function MfaPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <MfaContent />
    </Suspense>
  );
}
