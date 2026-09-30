'use client';

import { useQuery } from '@tanstack/react-query';
import { Search, UserCog, UserPlus, Users } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { NEW_STUDENT_CLASS_DAYS, REGISTRATION_SOURCE_LABELS, formatDate, normalizeForSearch } from '@ijod/shared';
import { BackLink } from '@/components/admin/info-list';
import { Avatar } from '@/components/avatar';
import { isUuid } from '@/components/portfolio/utils';
import { UserStatusBadge } from '@/components/status';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { EmptyState, ErrorState, PageLoader } from '@/components/ui/feedback';
import { Input } from '@/components/ui/form';
import { Stat } from '@/components/ui/stat';
import { TD, TH, THead, TR, Table } from '@/components/ui/table';
import { ApiError, api } from '@/lib/api';
import type { ManagementClassDetail, ManagementClassStudent } from '@/lib/types';
import { HomeroomDialog } from './homeroom-dialog';
import { managementKeys, useManagementClasses } from './queries';
import { HomeroomTeacher, isNewRegistration, NewBadge, PortfolioCounts } from './student-bits';

const studentHref = (id: string) => `/management/students/${id}`;
const backLink = <BackLink href="/management/students?tab=classes">Sinflar</BackLink>;

function RegisteredCell({ student, now }: { student: ManagementClassStudent; now: number }) {
  return (
    <span className="space-y-0.5">
      <span className="block text-slate-700 tabular">{formatDate(student.createdAt)}</span>
      <span className="block text-xs text-slate-500">{REGISTRATION_SOURCE_LABELS[student.registrationSource]}</span>
      {isNewRegistration(student.registrationSource, student.createdAt, now) && <NewBadge />}
    </span>
  );
}

function Roster({ students }: { students: ManagementClassStudent[] }) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [now] = useState(() => Date.now());
  const shown = useMemo(() => {
    const text = normalizeForSearch(search);
    return text
      ? students.filter((student) => normalizeForSearch(`${student.fullName} ${student.login}`).includes(text))
      : students;
  }, [students, search]);

  return (
    <Card>
      <CardHeader
        title="O‘quvchilar"
        description="Ism ustiga bosing — o‘quvchining to‘liq profili ochiladi."
        actions={
          students.length > 0 ? (
            <div className="relative w-full sm:w-64">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400"
                aria-hidden
              />
              <Input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Ism yoki login"
                aria-label="Sinf o‘quvchilarini qidirish"
                className="pl-9"
              />
            </div>
          ) : undefined
        }
      />
      {students.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Bu sinfda hali o‘quvchi yo‘q"
          description="O‘quvchilar ro‘yxatdan o‘tib shu sinfni tanlaganda yoki sinfga biriktirilganda shu yerda ko‘rinadi."
        />
      ) : shown.length === 0 ? (
        <EmptyState title="Qidiruv bo‘yicha o‘quvchi topilmadi" />
      ) : (
        <>
          {/* Telefon: kartochkalar */}
          <ul className="divide-y divide-slate-100 md:hidden">
            {shown.map((student) => (
              <li key={student.id}>
                <Link
                  href={studentHref(student.id)}
                  prefetch={false}
                  className="flex gap-3 px-4 py-3 hover:bg-slate-50 focus-visible:outline-2 focus-visible:-outline-offset-2"
                >
                  <Avatar name={student.fullName} src={student.avatarUrl} size="md" />
                  <span className="min-w-0 flex-1 space-y-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="font-medium break-words text-slate-900">{student.fullName}</span>
                      {isNewRegistration(student.registrationSource, student.createdAt, now) && <NewBadge />}
                    </span>
                    <span className="block truncate font-mono text-xs text-slate-500">{student.login}</span>
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <UserStatusBadge status={student.status} />
                      <PortfolioCounts counts={student.portfolio} />
                    </span>
                    <span className="block text-xs text-slate-500">
                      Ro‘yxatdan o‘tgan: <span className="tabular">{formatDate(student.createdAt)}</span> ·{' '}
                      {REGISTRATION_SOURCE_LABELS[student.registrationSource]}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          {/* Katta ekran: jadval */}
          <div className="hidden md:block">
            <Table caption="Sinf o‘quvchilari">
              <THead>
                <tr>
                  <TH>O‘quvchi</TH>
                  <TH>Login</TH>
                  <TH>Holat</TH>
                  <TH>Ro‘yxatdan o‘tgan</TH>
                  <TH>Portfolio</TH>
                </tr>
              </THead>
              <tbody>
                {shown.map((student) => (
                  <TR key={student.id} className="cursor-pointer" onClick={() => router.push(studentHref(student.id))}>
                    <TD className="min-w-56">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={student.fullName} src={student.avatarUrl} size="sm" />
                        <Link
                          href={studentHref(student.id)}
                          prefetch={false}
                          onClick={(event) => event.stopPropagation()}
                          className="font-medium text-slate-900 hover:text-brand-700 hover:underline"
                        >
                          {student.fullName}
                        </Link>
                      </div>
                    </TD>
                    <TD className="font-mono text-xs whitespace-nowrap text-slate-600">{student.login}</TD>
                    <TD>
                      <UserStatusBadge status={student.status} />
                    </TD>
                    <TD className="text-sm whitespace-nowrap">
                      <RegisteredCell student={student} now={now} />
                    </TD>
                    <TD>
                      <PortfolioCounts counts={student.portfolio} />
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </div>
        </>
      )}
    </Card>
  );
}

/**
 * Sinf sahifasi (rahbariyat): sinf, o‘quv yili, sinf rahbari (tayinlash yoki almashtirish) va
 * o‘quvchilar ro‘yxati — har biri o‘quvchi profiliga olib boradi.
 */
export function ClassView({ id }: { id: string }) {
  const valid = isUuid(id);
  const detail = useQuery({
    queryKey: managementKeys.classDetail(id),
    queryFn: () => api.get<ManagementClassDetail>(`/management/classes/${id}`),
    enabled: valid,
  });
  const classes = useManagementClasses();
  const [assigning, setAssigning] = useState(false);

  if (!valid || (detail.error instanceof ApiError && detail.error.status === 404)) {
    return (
      <div className="space-y-6">
        {backLink}
        <Card>
          <EmptyState
            icon={Users}
            title="Sinf topilmadi"
            description="Havola noto‘g‘ri yoki sinf o‘chirilgan bo‘lishi mumkin."
          />
        </Card>
      </div>
    );
  }
  if (detail.isError) {
    return (
      <div className="space-y-6">
        {backLink}
        <ErrorState error={detail.error} onRetry={() => detail.refetch()} />
      </div>
    );
  }
  if (detail.isPending) return <PageLoader />;

  const data = detail.data;
  const editable = data.academicYear.isCurrent && !data.archivedAt;
  const approved = data.students.reduce((sum, student) => sum + student.portfolio.approved, 0);
  const pending = data.students.reduce((sum, student) => sum + student.portfolio.pending, 0);

  return (
    <div className="space-y-6">
      {backLink}

      <Card>
        <CardBody className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 space-y-1">
            <h1 className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-display text-4xl leading-tight font-semibold tracking-tight text-slate-900">
                {data.name}
              </span>
              <span className="text-sm font-medium text-slate-500">sinf</span>
              {data.archivedAt && <Badge tone="gray">Arxivlangan</Badge>}
              {!data.academicYear.isCurrent && <Badge tone="amber">O‘tgan o‘quv yili</Badge>}
            </h1>
            <p className="text-sm text-slate-600">
              {data.academicYear.name} o‘quv yili · <span className="tabular">{data.studentCount}</span> o‘quvchi
            </p>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-3 sm:justify-end">
            <HomeroomTeacher teacher={data.homeroomTeacher} size="md" className="min-w-0" />
            {editable && (
              <Button
                size="sm"
                variant={data.homeroomTeacher ? 'outline' : 'primary'}
                onClick={() => setAssigning(true)}
                icon={
                  data.homeroomTeacher ? (
                    <UserCog className="size-4" aria-hidden />
                  ) : (
                    <UserPlus className="size-4" aria-hidden />
                  )
                }
              >
                {data.homeroomTeacher ? 'O‘zgartirish' : 'Tayinlash'}
              </Button>
            )}
          </div>
        </CardBody>
        {!editable && (
          <p className="border-t border-slate-100 px-5 py-3 text-sm text-slate-500">
            Sinf rahbari faqat joriy o‘quv yilining faol sinflarida o‘zgartiriladi.
          </p>
        )}
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="O‘quvchilar" value={data.studentCount} />
        <Stat
          label="Yangi ro‘yxatdan o‘tganlar"
          value={data.newStudentCount}
          tone={data.newStudentCount > 0 ? 'success' : 'default'}
          hint={`So‘nggi ${NEW_STUDENT_CLASS_DAYS} kunda o‘zi ro‘yxatdan o‘tgan`}
        />
        <Stat label="Tasdiqlangan yutuqlar" value={approved} hint="Sinf o‘quvchilari portfoliosida" />
        <Stat
          label="Tekshiruvni kutmoqda"
          value={pending}
          tone={pending > 0 ? 'warning' : 'default'}
          hint="Portfolio yozuvlari"
        />
      </div>

      <Roster students={data.students} />

      <HomeroomDialog
        target={assigning ? data : null}
        classes={classes.data ?? []}
        onClose={() => setAssigning(false)}
      />
    </div>
  );
}
