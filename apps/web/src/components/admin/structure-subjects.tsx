'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { BookOpen, Pencil, Plus } from 'lucide-react';
import { useId, useState } from 'react';
import { useForm } from 'react-hook-form';
import { subjectSchema } from '@ijod/shared';
import type { z } from 'zod';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Alert, EmptyState, ErrorState, PageLoader } from '@/components/ui/feedback';
import { Checkbox, Field, Input } from '@/components/ui/form';
import { TD, TH, THead, TR, Table } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import type { Subject } from '@/lib/types';
import { FormDialog, applyServerErrors } from './form-dialog';
import { adminKeys, useInvalidate, useSubjects } from './queries';

type SubjectValues = z.output<typeof subjectSchema>;

function SubjectForm({
  formId,
  subject,
  onSubmit,
}: {
  formId: string;
  subject: Subject | null;
  onSubmit: (values: SubjectValues) => Promise<unknown>;
}) {
  const [error, setError] = useState<string | null>(null);
  const form = useForm({
    resolver: zodResolver(subjectSchema),
    defaultValues: {
      name: subject?.name ?? '',
      shortName: subject?.shortName ?? '',
      isActive: subject?.isActive ?? true,
    },
  });
  const errors = form.formState.errors;
  const submit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await onSubmit(values);
    } catch (caught) {
      setError(
        applyServerErrors(caught, form.setError, ['name', 'shortName', 'isActive'], {
          DUPLICATE: { field: 'name', message: 'Bunday nomli fan allaqachon bor.' },
        }),
      );
    }
  });
  return (
    <form id={formId} onSubmit={submit} className="space-y-4" noValidate>
      {error && <Alert tone="danger">{error}</Alert>}
      <Field label="Fan nomi" required error={errors.name?.message}>
        <Input autoComplete="off" {...form.register('name')} />
      </Field>
      <Field
        label="Qisqa nomi (ixtiyoriy)"
        hint="Jadval va hisobotlarda joy tejash uchun, masalan, “Ona tili”."
        error={errors.shortName?.message}
      >
        <Input autoComplete="off" {...form.register('shortName')} />
      </Field>
      <Checkbox
        label="Faol"
        description="Nofaol fan yangi test, savol va biriktirishlarda tanlanmaydi. Mavjud ma’lumotlar saqlanadi."
        {...form.register('isActive')}
      />
    </form>
  );
}

export function SubjectsTab() {
  const toast = useToast();
  const formId = useId();
  const invalidate = useInvalidate();
  const subjects = useSubjects(true);
  const [editing, setEditing] = useState<Subject | 'new' | null>(null);
  const save = useMutation({
    mutationFn: (values: SubjectValues) =>
      editing && editing !== 'new'
        ? api.put<Subject>(`/subjects/${editing.id}`, values)
        : api.post<Subject>('/subjects', values),
    onSuccess: async (subject) => {
      toast.success(editing === 'new' ? `“${subject.name}” fani qo‘shildi.` : 'Fan saqlandi.');
      setEditing(null);
      await invalidate(adminKeys.subjectsAll, adminKeys.dashboard);
    },
  });
  const list = subjects.data ?? [];

  return (
    <Card>
      <CardHeader
        title="Fanlar"
        description="Fanlarni o‘chirib bo‘lmaydi — ishlatilmaydigan fanni nofaol qiling."
        actions={
          <Button size="sm" onClick={() => setEditing('new')} icon={<Plus className="size-4" aria-hidden />}>
            Yangi fan
          </Button>
        }
      />
      {subjects.isPending ? (
        <PageLoader />
      ) : subjects.isError ? (
        <div className="p-5">
          <ErrorState error={subjects.error} onRetry={() => subjects.refetch()} />
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="Fanlar hali qo‘shilmagan"
          action={
            <Button size="sm" onClick={() => setEditing('new')}>
              Fan qo‘shish
            </Button>
          }
        />
      ) : (
        <Table caption="Fanlar">
          <THead>
            <tr>
              <TH>Nomi</TH>
              <TH>Qisqa nomi</TH>
              <TH>Holat</TH>
              <TH className="text-right">Amallar</TH>
            </tr>
          </THead>
          <tbody>
            {list.map((subject) => (
              <TR key={subject.id} className={subject.isActive ? undefined : 'text-slate-500'}>
                <TD className="font-medium">{subject.name}</TD>
                <TD>{subject.shortName ?? '—'}</TD>
                <TD>{subject.isActive ? <Badge tone="green">Faol</Badge> : <Badge tone="gray">Nofaol</Badge>}</TD>
                <TD className="text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditing(subject)}
                    icon={<Pencil className="size-4" aria-hidden />}
                  >
                    Tahrirlash
                  </Button>
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}
      <FormDialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'Yangi fan' : 'Fanni tahrirlash'}
        formId={formId}
        submitLabel={editing === 'new' ? 'Qo‘shish' : 'Saqlash'}
        pending={save.isPending}
      >
        {editing !== null && (
          <SubjectForm
            formId={formId}
            subject={editing === 'new' ? null : editing}
            onSubmit={(values) => save.mutateAsync(values)}
          />
        )}
      </FormDialog>
    </Card>
  );
}
