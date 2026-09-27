'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { AttemptResult } from '@/components/attempt/attempt-result';
import { AttemptRunner } from '@/components/attempt/attempt-runner';
import { ButtonLink } from '@/components/ui/button';
import { ErrorState, PageLoader } from '@/components/ui/feedback';
import { api } from '@/lib/api';
import { tabClientId } from '@/lib/attempt-storage';
import type { AttemptView } from '@/lib/types';

/** Test topshirish sahifasi — chalg‘ituvchi menyusiz, alohida oynada. */
export default function AttemptPage() {
  const { id } = useParams<{ id: string }>();
  const [clientId] = useState(() => (typeof window === 'undefined' ? '' : tabClientId()));
  const query = useQuery({
    queryKey: ['attempt', id, clientId],
    queryFn: () => api.get<AttemptView>(`/attempts/${id}?clientId=${encodeURIComponent(clientId)}`),
    enabled: Boolean(clientId),
    staleTime: Infinity,
    retry: 1,
  });

  if (query.isPending) return <PageLoader label="Test yuklanmoqda…" />;
  if (query.isError) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
        <ButtonLink href="/student" variant="outline" className="mt-4" icon={<ArrowLeft className="size-4" />}>
          Bosh sahifa
        </ButtonLink>
      </div>
    );
  }

  const view = query.data;
  if (view.status === 'IN_PROGRESS') {
    return <AttemptRunner key={view.id} initial={view} clientId={clientId} onFinished={() => void query.refetch()} />;
  }

  return (
    <div className="min-h-dvh bg-slate-50">
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
        <div>
          <p className="text-sm text-slate-500">{view.session.subject.name}</p>
          <h1 className="text-2xl font-semibold text-slate-900">{view.session.title}</h1>
        </div>
        <AttemptResult view={view} />
        <ButtonLink href="/student" icon={<ArrowLeft className="size-4" />}>
          Bosh sahifaga qaytish
        </ButtonLink>
      </div>
    </div>
  );
}
