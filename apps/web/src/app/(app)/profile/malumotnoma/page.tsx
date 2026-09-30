'use client';

import { BackLink } from '@/components/admin/info-list';
import { RequireRole } from '@/components/app-shell';
import { useOwnReference } from '@/components/teacher-reference/queries';
import { ReferenceSheet } from '@/components/teacher-reference/reference-sheet';
import { PageHeader } from '@/components/ui/card';
import { ErrorState, PageLoader } from '@/components/ui/feedback';

function OwnReference() {
  const reference = useOwnReference();
  return (
    <div className="space-y-6">
      <PageHeader
        back={<BackLink href="/profile">Mening hisobim</BackLink>}
        title="Ma’lumotnoma"
        description="Pedagog haqidagi ma’lumotnoma: ta’lim, ilmiy daraja, malaka toifasi, sertifikatlar va o‘quvchilaringiz sertifikatlariga ustozlik. Hujjatlar yopiq saqlanadi — ularni faqat siz va rahbariyat ko‘radi."
      />
      {reference.isPending ? (
        <PageLoader />
      ) : reference.isError ? (
        <ErrorState error={reference.error} onRetry={() => reference.refetch()} />
      ) : (
        <ReferenceSheet data={reference.data} />
      )}
    </div>
  );
}

export default function TeacherReferencePage() {
  return (
    <RequireRole roles={['TEACHER']}>
      <OwnReference />
    </RequireRole>
  );
}
