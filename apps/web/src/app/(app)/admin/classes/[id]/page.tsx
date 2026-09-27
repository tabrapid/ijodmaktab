'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowRightLeft, Pencil, UserMinus, UserPlus, Users } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { formatDate, formatDateTime, formatInternalId, normalizeForSearch } from '@ijod/shared';
import { AddStudentsDialog } from '@/components/admin/add-students-dialog';
import { EditClassDialog, type EditableClass } from '@/components/admin/class-dialogs';
import { EndEnrollmentDialog, TransferDialog } from '@/components/admin/enrollment-dialogs';
import { BackLink } from '@/components/admin/info-list';
import { adminKeys } from '@/components/admin/queries';
import { RequireRole } from '@/components/app-shell';
import { Avatar } from '@/components/avatar';
import { UserStatusBadge } from '@/components/status';
import { Badge } from '@/components/ui/badge';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card, CardBody, CardHeader, PageHeader } from '@/components/ui/card';
import { EmptyState, ErrorState, PageLoader } from '@/components/ui/feedback';
import { Input } from '@/components/ui/form';
import { TD, TH, THead, TR, Table } from '@/components/ui/table';
import { ApiError, api } from '@/lib/api';
import type { ClassDetail, ClassStudent } from '@/lib/types';

type StudentDialog = { kind: 'transfer' | 'end'; student: ClassStudent } | null;

function ClassDetailView() {
  const { id } = useParams<{ id: string }>();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<EditableClass | null>(null);
  const [dialog, setDialog] = useState<StudentDialog>(null);
  const [filter, setFilter] = useState('');
  const query = useQuery({
    queryKey: adminKeys.classDetail(id),
    queryFn: () => api.get<ClassDetail>(`/classes/${id}`),
  });

  if (query.isPending) return <PageLoader />;
  if (query.isError) {
    if (query.error instanceof ApiError && query.error.status === 404) {
      return (
        <EmptyState
          title="Sinf topilmadi"
          description="Sinf o‘chirilgan yoki havola noto‘g‘ri bo‘lishi mumkin."
          action={<ButtonLink href="/admin/structure?tab=classes">Sinflar ro‘yxati</ButtonLink>}
        />
      );
    }
    return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  }

  const item = query.data;
  const needle = normalizeForSearch(filter);
  const students = needle
    ? item.students.filter((student) =>
        normalizeForSearch(`${student.fullName} ${formatInternalId(student.internalId)}`).includes(needle),
      )
    : item.students;

  return (
    <div className="space-y-6">
      <PageHeader
        back={<BackLink href={`/admin/structure?tab=classes&year=${item.academicYear.id}`}>Sinflar</BackLink>}
        title={`${item.name} sinfi`}
        description={
          <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>
              O‘quv yili: {item.academicYear.name}
              {item.academicYear.isCurrent ? ' (joriy)' : ''}
            </span>
            {item.archivedAt && <Badge tone="gray">Arxivlangan — o‘quvchi qo‘shib bo‘lmaydi</Badge>}
            <span>
              Sinf rahbari:{' '}
              {item.homeroomTeacher ? (
                <Link
                  href={`/admin/users/${item.homeroomTeacher.id}`}
                  className="font-medium text-slate-700 hover:underline"
                >
                  {item.homeroomTeacher.fullName}
                </Link>
              ) : (
                <Badge tone="amber">Belgilanmagan</Badge>
              )}
            </span>
          </span>
        }
        actions={
          item.canManage ? (
            <>
              <Button
                variant="outline"
                onClick={() =>
                  setEditing({
                    id: item.id,
                    name: item.name,
                    gradeLevel: item.gradeLevel,
                    section: item.section,
                    homeroomTeacher: item.homeroomTeacher,
                  })
                }
                icon={<Pencil className="size-4" aria-hidden />}
              >
                Tahrirlash
              </Button>
              {!item.archivedAt && (
                <Button onClick={() => setAdding(true)} icon={<UserPlus className="size-4" aria-hidden />}>
                  O‘quvchi qo‘shish
                </Button>
              )}
            </>
          ) : undefined
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title={`O‘quvchilar (${item.students.length})`}
            description="Faol a’zolar. Ko‘chirilgan yoki chiqarilgan o‘quvchilarning tarixi ularning profilida saqlanadi."
            actions={
              item.students.length > 8 ? (
                <Input
                  type="search"
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                  placeholder="Ro‘yxatdan qidirish"
                  aria-label="Sinf ro‘yxatidan ism yoki ichki ID bo‘yicha qidirish"
                  className="h-9 w-56"
                />
              ) : undefined
            }
          />
          {item.students.length === 0 ? (
            <EmptyState
              icon={Users}
              title="Sinfda hali o‘quvchi yo‘q"
              action={
                item.canManage && !item.archivedAt ? (
                  <Button size="sm" onClick={() => setAdding(true)}>
                    O‘quvchi qo‘shish
                  </Button>
                ) : undefined
              }
            />
          ) : students.length === 0 ? (
            <EmptyState title="Qidiruv bo‘yicha o‘quvchi topilmadi" />
          ) : (
            <Table caption={`${item.name} sinfi o‘quvchilari`}>
              <THead>
                <tr>
                  <TH>Ichki ID</TH>
                  <TH>F.I.Sh.</TH>
                  <TH>Holat</TH>
                  <TH>Sinfda</TH>
                  <TH>Oxirgi faollik</TH>
                  {item.canManage && <TH className="text-right">Amallar</TH>}
                </tr>
              </THead>
              <tbody>
                {students.map((student) => (
                  <TR key={student.enrollmentId}>
                    <TD className="font-mono text-xs text-slate-600 tabular">{formatInternalId(student.internalId)}</TD>
                    <TD className="min-w-48">
                      <span className="flex items-center gap-2.5">
                        <Avatar name={student.fullName} src={student.avatarUrl} size="sm" />
                        <Link
                          href={`/admin/users/${student.id}`}
                          className="font-medium text-slate-900 hover:text-brand-700 hover:underline"
                        >
                          {student.fullName}
                        </Link>
                      </span>
                    </TD>
                    <TD>
                      <UserStatusBadge status={student.status} />
                    </TD>
                    <TD className="whitespace-nowrap tabular">{formatDate(student.startsOn)} dan</TD>
                    <TD className="whitespace-nowrap text-slate-600 tabular">
                      {student.lastActiveAt ? (
                        formatDateTime(student.lastActiveAt)
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </TD>
                    {item.canManage && (
                      <TD>
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setDialog({ kind: 'transfer', student })}
                            icon={<ArrowRightLeft className="size-4" aria-hidden />}
                            aria-label={`${student.fullName}ni boshqa sinfga ko‘chirish`}
                          >
                            <span className="hidden md:inline">Ko‘chirish</span>
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-700 hover:bg-red-50 hover:text-red-800"
                            onClick={() => setDialog({ kind: 'end', student })}
                            icon={<UserMinus className="size-4" aria-hidden />}
                            aria-label={`${student.fullName}: a’zolikni tugatish`}
                          >
                            <span className="hidden md:inline">A’zolikni tugatish</span>
                          </Button>
                        </div>
                      </TD>
                    )}
                  </TR>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Fanlar va o‘qituvchilar"
            actions={
              item.canManage ? (
                <Link
                  href="/admin/structure?tab=assignments"
                  className="text-sm font-medium text-brand-700 hover:underline"
                >
                  Boshqarish
                </Link>
              ) : undefined
            }
          />
          <CardBody>
            {item.subjects.length === 0 ? (
              <p className="text-sm text-slate-500">Bu sinfga hali o‘qituvchi biriktirilmagan.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {item.subjects.map((entry) => (
                  <li key={entry.assignmentId} className="py-2.5 first:pt-0 last:pb-0">
                    <p className="text-sm font-medium text-slate-900">{entry.subject.name}</p>
                    <Link
                      href={`/admin/users/${entry.teacher.id}`}
                      className="text-sm text-slate-600 hover:text-brand-700 hover:underline"
                    >
                      {entry.teacher.fullName}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      {item.canManage && (
        <>
          <AddStudentsDialog
            open={adding}
            onClose={() => setAdding(false)}
            target={{
              id: item.id,
              name: item.name,
              isCurrentYear: item.academicYear.isCurrent,
              studentIds: new Set(item.students.map((student) => student.id)),
            }}
          />
          <EditClassDialog item={editing} onClose={() => setEditing(null)} />
          {dialog && (
            <>
              <TransferDialog
                open={dialog.kind === 'transfer'}
                onClose={() => setDialog(null)}
                student={dialog.student}
                fromClass={{ id: item.id, name: item.name }}
                academicYearId={item.academicYear.id}
              />
              <EndEnrollmentDialog
                open={dialog.kind === 'end'}
                onClose={() => setDialog(null)}
                student={dialog.student}
                enrollment={{ id: dialog.student.enrollmentId, className: item.name }}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}

export default function ClassDetailPage() {
  return (
    <RequireRole roles={['ADMIN', 'SUPER_ADMIN']}>
      <ClassDetailView />
    </RequireRole>
  );
}
