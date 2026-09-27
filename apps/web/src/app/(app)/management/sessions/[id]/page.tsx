'use client';

import { useParams } from 'next/navigation';
import { Suspense } from 'react';
import { SessionDetailView } from '@/components/sessions/session-detail';
import { PageLoader } from '@/components/ui/feedback';

export default function ManagementSessionPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <Suspense fallback={<PageLoader />}>
      <SessionDetailView id={id} backHref="/management/sessions" backLabel="Barcha sessiyalar" />
    </Suspense>
  );
}
