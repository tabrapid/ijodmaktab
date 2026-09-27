'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AttemptResult } from '@/components/attempt/attempt-result';
import { ButtonLink } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/card';
import { ErrorState, PageLoader } from '@/components/ui/feedback';
import { api } from '@/lib/api';
import type { AttemptView } from '@/lib/types';

export default function ResultDetailPage() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const query = useQuery({
    queryKey: ['attempt', attemptId, 'result'],
    queryFn: () => api.get<AttemptView>(`/attempts/${attemptId}`),
  });

  if (query.isPending) return <PageLoader />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  const view = query.data;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        back={
          <Link
            href="/student/results"
            className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
          >
            <ArrowLeft className="size-4" /> Natijalarim
          </Link>
        }
        title={view.session.title}
        description={`${view.session.subject.name} · ${view.attemptNo}-urinish`}
      />
      {view.status === 'IN_PROGRESS' ? (
        <ButtonLink href={`/attempt/${view.id}`}>Testni davom ettirish</ButtonLink>
      ) : (
        <AttemptResult view={view} />
      )}
    </div>
  );
}
