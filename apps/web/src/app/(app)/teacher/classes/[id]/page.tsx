'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CalendarClock } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { formatDateTime, formatInternalId, normalizeForSearch } from '@ijod/shared';
import { sessionTimeRange } from '@/components/sessions/session-list';
import { SessionStateBadge, UserStatusBadge } from '@/components/status';
import { Badge } from '@/components/ui/badge';
import { Card, CardBody, CardHeader, PageHeader } from '@/components/ui/card';
import { EmptyState, ErrorState, PageLoader } from '@/components/ui/feedback';
import { Input } from '@/components/ui/form';
import { TD, TH, THead, TR, Table } from '@/components/ui/table';
import { api } from '@/lib/api';
import { useMe } from '@/lib/auth';
import type { ClassDetail, Page, SessionListItem } from '@/lib/types';

export default function TeacherClassPage() {
  const { id } = useParams<{ id: string }>();
  const { data: me } = useMe();
  const [search, setSearch] = useState('');
  const detail = useQuery({ queryKey: ['class', id], queryFn: () => api.get<ClassDetail>(`/classes/${id}`) });
  const sessions = useQuery({
    queryKey: ['sessions', { classId: id, scope: 'all', pageSize: 20 }],
    queryFn: () => api.get<Page<SessionListItem>>(`/sessions?scope=all&classId=${id}&pageSize=20`),
  });
  const students = useMemo(() => {
    const text = normalizeForSearch(search);
    return (detail.data?.students ?? []).filter(
      (student) =>
        !text || normalizeForSearch(`${student.fullName} ${formatInternalId(student.internalId)}`).includes(text),
    );
  }, [detail.data, search]);

  if (detail.isPending) return <PageLoader />;
  if (detail.isError) return <ErrorState error={detail.error} onRetry={() => detail.refetch()} />;
  const data = detail.data;
  const isHomeroom = me ? data.homeroomTeacher?.id === me.id : false;

  return (
    <div>
      <PageHeader
        back={
          <Link
            href="/teacher/classes"
            className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Sinflarim
          </Link>
        }
        title={
          <span className="inline-flex items-center gap-2">
            {data.name}
            {isHomeroom && <Badge tone="brand">Siz sinf rahbarisiz</Badge>}
          </span>
        }
        description={`${data.academicYear.name} o‘quv yili · ${data.students.length} o‘quvchi · sinf rahbari: ${data.homeroomTeacher?.fullName ?? 'belgilanmagan'}`}
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_24rem]">
        <Card>
          <CardHeader
            title="O‘quvchilar"
            description="Ism ustiga bosing — o‘quvchining natijalar tarixi ochiladi."
            actions={
              <div className="w-56">
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Ism yoki ichki ID"
                  aria-label="O‘quvchini qidirish"
                />
              </div>
            }
          />
          {students.length === 0 ? (
            <EmptyState title="O‘quvchi topilmadi" />
          ) : (
            <Table caption="O‘quvchilar">
              <THead>
                <tr>
                  <TH>Ichki ID</TH>
                  <TH>F.I.Sh.</TH>
                  <TH>Holat</TH>
                  <TH>Oxirgi faollik</TH>
                </tr>
              </THead>
              <tbody>
                {students.map((student) => (
                  <TR key={student.id}>
                    <TD className="text-slate-500 tabular">{formatInternalId(student.internalId)}</TD>
                    <TD>
                      <Link
                        href={`/teacher/students/${student.id}`}
                        className="font-medium text-slate-900 hover:underline"
                      >
                        {student.fullName}
                      </Link>
                    </TD>
                    <TD>
                      <UserStatusBadge status={student.status} />
                    </TD>
                    <TD className="whitespace-nowrap text-slate-600">
                      {student.lastActiveAt ? formatDateTime(student.lastActiveAt) : '—'}
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Fanlar va o‘qituvchilar" />
            <CardBody>
              {data.subjects.length === 0 ? (
                <p className="text-sm text-slate-500">Biriktirish yo‘q.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {data.subjects.map((entry) => (
                    <li key={entry.assignmentId} className="flex justify-between gap-3">
                      <span className="font-medium text-slate-800">{entry.subject.name}</span>
                      <span className="text-right text-slate-600">{entry.teacher.fullName}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
          <Card>
            <CardHeader
              title="Sinf sessiyalari"
              description={isHomeroom ? 'Sinfingizdagi barcha sessiyalar' : 'Siz o‘tkazgan sessiyalar'}
            />
            {sessions.isPending ? (
              <PageLoader />
            ) : sessions.isError ? (
              <CardBody>
                <ErrorState error={sessions.error} onRetry={() => sessions.refetch()} />
              </CardBody>
            ) : sessions.data.items.length === 0 ? (
              <EmptyState icon={CalendarClock} title="Sessiya yo‘q" />
            ) : (
              <ul className="divide-y divide-slate-100">
                {sessions.data.items.map((session) => (
                  <li key={session.id} className="px-5 py-3">
                    <p className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/teacher/sessions/${session.id}`}
                        className="font-medium text-slate-900 hover:underline"
                      >
                        {session.title}
                      </Link>
                      <SessionStateBadge state={session.state} />
                    </p>
                    <p className="text-xs text-slate-500">
                      {session.subject.name} · {sessionTimeRange(session.startsAt, session.endsAt)} · yakunlagan{' '}
                      {session.finishedCount} / {session.assignedCount}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
