'use client';

import { Archive, ArchiveRestore, Pencil, Plus, School } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Alert, EmptyState, ErrorState, PageLoader } from '@/components/ui/feedback';
import { Field, Select } from '@/components/ui/form';
import { TD, TH, THead, TR, Table } from '@/components/ui/table';
import { cn } from '@/lib/cn';
import type { ClassListItem } from '@/lib/types';
import { ArchiveClassDialog, CreateClassDialog, EditClassDialog, type EditableClass } from './class-dialogs';
import { useAcademicYears, useClassList } from './queries';

export function ClassesTab({
  yearParam,
  onYearChange,
  onGoToYears,
}: {
  yearParam: string | null;
  onYearChange: (id: string) => void;
  onGoToYears: () => void;
}) {
  const years = useAcademicYears();
  const list = years.data ?? [];
  const year = list.find((item) => item.id === yearParam) ?? list.find((item) => item.isCurrent) ?? list[0];
  const classes = useClassList(year?.id, Boolean(year));
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<EditableClass | null>(null);
  const [archiving, setArchiving] = useState<{ id: string; name: string; archived: boolean } | null>(null);

  if (years.isPending) return <PageLoader />;
  if (years.isError) return <ErrorState error={years.error} onRetry={() => years.refetch()} />;
  if (!year) {
    return (
      <Card>
        <EmptyState
          icon={School}
          title="Avval o‘quv yilini yarating"
          description="Sinflar o‘quv yiliga bog‘lanadi."
          action={
            <Button size="sm" onClick={onGoToYears}>
              O‘quv yillariga o‘tish
            </Button>
          }
        />
      </Card>
    );
  }

  const items = classes.data ?? [];
  const active = items.filter((item) => !item.archivedAt);

  return (
    <Card>
      <CardHeader
        title="Sinflar"
        description={`${year.name} o‘quv yili: ${active.length} ta faol sinf, ${active.reduce((sum, item) => sum + item.studentCount, 0)} nafar o‘quvchi`}
        actions={
          <Button size="sm" onClick={() => setCreating(true)} icon={<Plus className="size-4" aria-hidden />}>
            Yangi sinf
          </Button>
        }
      />
      <CardBody className="border-b border-slate-100">
        <Field label="O‘quv yili" className="max-w-xs">
          <Select value={year.id} onChange={(event) => onYearChange(event.target.value)}>
            {list.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
                {item.isCurrent ? ' (joriy)' : ''}
              </option>
            ))}
          </Select>
        </Field>
        {!year.isCurrent && (
          <Alert tone="info" className="mt-3">
            Joriy bo‘lmagan o‘quv yili tanlangan. O‘quvchilarni yaratish va import faqat joriy yil sinflariga
            bog‘lanadi.
          </Alert>
        )}
      </CardBody>
      {classes.isPending ? (
        <PageLoader />
      ) : classes.isError ? (
        <div className="p-5">
          <ErrorState error={classes.error} onRetry={() => classes.refetch()} />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={School}
          title="Bu o‘quv yilida sinf yo‘q"
          action={
            <Button size="sm" onClick={() => setCreating(true)}>
              Sinf yaratish
            </Button>
          }
        />
      ) : (
        <Table caption="Sinflar">
          <THead>
            <tr>
              <TH>Sinf</TH>
              <TH>O‘quvchilar</TH>
              <TH>Sinf rahbari</TH>
              <TH>Fanlar va o‘qituvchilar</TH>
              <TH className="text-right">Amallar</TH>
            </tr>
          </THead>
          <tbody>
            {items.map((item: ClassListItem) => (
              <TR key={item.id} className={cn(item.archivedAt && 'bg-slate-50/80 text-slate-500')}>
                <TD className="whitespace-nowrap">
                  <Link href={`/admin/classes/${item.id}`} className="font-semibold text-brand-700 hover:underline">
                    {item.name}
                  </Link>
                  {item.archivedAt && (
                    <Badge tone="gray" className="ml-2">
                      Arxivlangan
                    </Badge>
                  )}
                </TD>
                <TD className="tabular">{item.studentCount}</TD>
                <TD className="min-w-44">
                  {item.homeroomTeacher ? (
                    <Link href={`/admin/users/${item.homeroomTeacher.id}`} className="hover:underline">
                      {item.homeroomTeacher.fullName}
                    </Link>
                  ) : (
                    <Badge tone="amber">Belgilanmagan</Badge>
                  )}
                </TD>
                <TD className="min-w-64">
                  {item.subjects.length === 0 ? (
                    <span className="text-slate-500">Biriktirilmagan</span>
                  ) : (
                    <ul className="space-y-0.5 text-xs">
                      {item.subjects.map((entry) => (
                        <li key={entry.assignmentId}>
                          <span className="font-medium text-slate-800">{entry.subject.name}</span>
                          <span className="text-slate-500"> — {entry.teacher.fullName}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </TD>
                <TD>
                  <div className="flex justify-end gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditing(item)}
                      icon={<Pencil className="size-4" aria-hidden />}
                      aria-label={`${item.name} sinfini tahrirlash`}
                    >
                      <span className="hidden xl:inline">Tahrirlash</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setArchiving({ id: item.id, name: item.name, archived: Boolean(item.archivedAt) })}
                      icon={
                        item.archivedAt ? (
                          <ArchiveRestore className="size-4" aria-hidden />
                        ) : (
                          <Archive className="size-4" aria-hidden />
                        )
                      }
                      aria-label={
                        item.archivedAt ? `${item.name} sinfini arxivdan chiqarish` : `${item.name} sinfini arxivlash`
                      }
                    >
                      <span className="hidden xl:inline">{item.archivedAt ? 'Arxivdan chiqarish' : 'Arxivlash'}</span>
                    </Button>
                  </div>
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}

      <CreateClassDialog open={creating} onClose={() => setCreating(false)} academicYear={year} />
      <EditClassDialog item={editing} onClose={() => setEditing(null)} />
      <ArchiveClassDialog item={archiving} onClose={() => setArchiving(null)} />
    </Card>
  );
}
