'use client';

import { UserSearch } from 'lucide-react';
import { useParams } from 'next/navigation';
import { BackLink } from '@/components/admin/info-list';
import { RequireRole, useActiveNav } from '@/components/app-shell';
import { Avatar } from '@/components/avatar';
import { UserStatusBadge } from '@/components/status';
import { useTeacherReference } from '@/components/teacher-reference/queries';
import { ReferenceSheet } from '@/components/teacher-reference/reference-sheet';
import { ButtonLink } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/card';
import { Alert, EmptyState, ErrorState, PageLoader } from '@/components/ui/feedback';
import { ApiError } from '@/lib/api';

/** Rahbariyat uchun o‘qituvchi ma’lumotnomasi — faqat ko‘rish (to‘ldiruvchi — o‘qituvchining o‘zi). */
function TeacherReference() {
  const { id } = useParams<{ id: string }>();
  // Sahifa “Foydalanuvchilar” bo‘limidan ochiladi.
  useActiveNav('/admin/users');
  const reference = useTeacherReference(id);
  const back = <BackLink href={`/admin/users/${id}`}>Foydalanuvchi sahifasi</BackLink>;

  if (reference.isPending) return <PageLoader />;
  if (reference.isError) {
    if (reference.error instanceof ApiError && reference.error.status === 404) {
      return (
        <EmptyState
          icon={UserSearch}
          title="O‘qituvchi topilmadi"
          description="Hisob o‘chirilgan, o‘qituvchi roli olib tashlangan yoki havola noto‘g‘ri bo‘lishi mumkin."
          action={<ButtonLink href="/admin/users">Foydalanuvchilar ro‘yxati</ButtonLink>}
        />
      );
    }
    return (
      <div className="space-y-6">
        {back}
        <ErrorState error={reference.error} onRetry={() => reference.refetch()} />
      </div>
    );
  }

  const data = reference.data;
  return (
    <div className="space-y-6">
      <PageHeader
        back={back}
        title={
          <span className="flex items-center gap-3">
            <Avatar name={data.teacher.fullName} src={data.teacher.avatarUrl} size="lg" />
            <span className="min-w-0 break-words">{data.teacher.fullName}</span>
          </span>
        }
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <span>
              Ma’lumotnoma · Mutaxassislik fani:{' '}
              <span className="font-medium text-slate-700">{data.specialtySubject?.name ?? 'belgilanmagan'}</span>
            </span>
            {data.teacher.status !== 'ACTIVE' && <UserStatusBadge status={data.teacher.status} />}
          </span>
        }
      />
      <Alert tone="info">
        Faqat ko‘rish: ma’lumotnomani o‘qituvchining o‘zi “Ma’lumotnoma” sahifasida to‘ldiradi. Hujjatlar yopiq — ularni
        o‘qituvchi va rahbariyat ko‘radi.
      </Alert>
      <ReferenceSheet data={data} readOnly />
    </div>
  );
}

export default function TeacherReferencePage() {
  return (
    <RequireRole roles={['DEPUTY', 'SUPER_ADMIN']}>
      <TeacherReference />
    </RequireRole>
  );
}
