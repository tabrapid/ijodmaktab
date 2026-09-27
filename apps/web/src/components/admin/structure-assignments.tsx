'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link2, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useId, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { teachingAssignmentSchema } from '@ijod/shared';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Alert, EmptyState, ErrorState, PageLoader } from '@/components/ui/feedback';
import { Field, Select } from '@/components/ui/form';
import { TD, TH, THead, TR, Table } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { ApiError, api, errorMessage } from '@/lib/api';
import type { TeachingAssignmentItem } from '@/lib/types';
import { FormDialog, applyServerErrors, choiceError } from './form-dialog';
import { adminKeys, useClassList, useInvalidate, useSubjects } from './queries';
import { TeacherSelect } from './teacher-select';

type AssignmentValues = z.output<typeof teachingAssignmentSchema>;

function AssignmentForm({
  formId,
  onSubmit,
}: {
  formId: string;
  onSubmit: (values: AssignmentValues) => Promise<unknown>;
}) {
  const subjects = useSubjects(false);
  const classes = useClassList();
  const [error, setError] = useState<string | null>(null);
  const form = useForm({
    resolver: zodResolver(teachingAssignmentSchema),
    defaultValues: { teacherId: '', subjectId: '', classId: '' },
  });
  const errors = form.formState.errors;
  const classOptions = (classes.data ?? []).filter((item) => !item.archivedAt);
  const submit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await onSubmit(values);
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === 'DUPLICATE') {
        setError('Bu o‘qituvchi shu sinfda ushbu fanga allaqachon biriktirilgan.');
        return;
      }
      setError(
        applyServerErrors(caught, form.setError, ['teacherId', 'subjectId', 'classId'], { NOT_A_TEACHER: 'teacherId' }),
      );
    }
  });
  return (
    <form id={formId} onSubmit={submit} className="space-y-4" noValidate>
      {error && <Alert tone="danger">{error}</Alert>}
      <Controller
        control={form.control}
        name="teacherId"
        render={({ field, fieldState }) => (
          <Field label="O‘qituvchi" required error={choiceError(fieldState.error, 'O‘qituvchini tanlang')}>
            <TeacherSelect
              value={field.value}
              onChange={(value) => field.onChange(value ?? '')}
              emptyLabel="— O‘qituvchini tanlang —"
            />
          </Field>
        )}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Fan" required error={choiceError(errors.subjectId, 'Fanni tanlang')}>
          <Select disabled={subjects.isPending} {...form.register('subjectId')}>
            <option value="">{subjects.isPending ? 'Yuklanmoqda…' : '— Fanni tanlang —'}</option>
            {(subjects.data ?? []).map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Sinf (joriy o‘quv yili)" required error={choiceError(errors.classId, 'Sinfni tanlang')}>
          <Select disabled={classes.isPending} {...form.register('classId')}>
            <option value="">{classes.isPending ? 'Yuklanmoqda…' : '— Sinfni tanlang —'}</option>
            {classOptions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <p className="text-xs text-slate-500">
        O‘qituvchi shu sinfga shu fan bo‘yicha test o‘tkaza oladi va sinf o‘quvchilarini ko‘radi.
      </p>
    </form>
  );
}

export function AssignmentsTab() {
  const toast = useToast();
  const formId = useId();
  const invalidate = useInvalidate();
  const [creating, setCreating] = useState(false);
  const [removing, setRemoving] = useState<TeachingAssignmentItem | null>(null);
  const [classFilter, setClassFilter] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('');
  const [teacherFilter, setTeacherFilter] = useState('');
  const assignments = useQuery({
    queryKey: adminKeys.assignments,
    queryFn: () => api.get<TeachingAssignmentItem[]>('/teaching-assignments'),
  });
  const refresh = () => invalidate(adminKeys.assignments, adminKeys.classes, adminKeys.users);

  const create = useMutation({
    mutationFn: (values: AssignmentValues) => api.post('/teaching-assignments', values),
    onSuccess: async () => {
      toast.success('Biriktiruv qo‘shildi.');
      setCreating(false);
      await refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/teaching-assignments/${id}`),
    onSuccess: async () => {
      toast.success('Biriktiruv o‘chirildi.');
      setRemoving(null);
      await refresh();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const items = assignments.data ?? [];
  const options = useMemo(() => {
    const unique = <T extends { id: string }>(values: T[]) => [
      ...new Map(values.map((value) => [value.id, value])).values(),
    ];
    return {
      classes: unique(items.map((item) => item.class)),
      subjects: unique(items.map((item) => item.subject)).sort((a, b) => a.name.localeCompare(b.name, 'uz')),
      teachers: unique(items.map((item) => item.teacher)).sort((a, b) => a.fullName.localeCompare(b.fullName, 'uz')),
    };
  }, [items]);
  const visible = items.filter(
    (item) =>
      (!classFilter || item.class.id === classFilter) &&
      (!subjectFilter || item.subject.id === subjectFilter) &&
      (!teacherFilter || item.teacher.id === teacherFilter),
  );

  return (
    <Card>
      <CardHeader
        title="O‘qituvchi – fan – sinf biriktirishlari"
        description="Joriy o‘quv yili bo‘yicha. O‘qituvchi faqat biriktirilgan sinf va fanlar bilan ishlaydi."
        actions={
          <Button size="sm" onClick={() => setCreating(true)} icon={<Plus className="size-4" aria-hidden />}>
            Yangi biriktiruv
          </Button>
        }
      />
      {items.length > 0 && (
        <CardBody className="grid gap-3 border-b border-slate-100 sm:grid-cols-3">
          <Select
            aria-label="Sinf bo‘yicha filtr"
            value={classFilter}
            onChange={(event) => setClassFilter(event.target.value)}
          >
            <option value="">Barcha sinflar</option>
            {options.classes.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Fan bo‘yicha filtr"
            value={subjectFilter}
            onChange={(event) => setSubjectFilter(event.target.value)}
          >
            <option value="">Barcha fanlar</option>
            {options.subjects.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
          <Select
            aria-label="O‘qituvchi bo‘yicha filtr"
            value={teacherFilter}
            onChange={(event) => setTeacherFilter(event.target.value)}
          >
            <option value="">Barcha o‘qituvchilar</option>
            {options.teachers.map((item) => (
              <option key={item.id} value={item.id}>
                {item.fullName}
              </option>
            ))}
          </Select>
        </CardBody>
      )}
      {assignments.isPending ? (
        <PageLoader />
      ) : assignments.isError ? (
        <div className="p-5">
          <ErrorState error={assignments.error} onRetry={() => assignments.refetch()} />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Link2}
          title="Hali biriktiruv yo‘q"
          description="O‘qituvchini fan va sinfga biriktiring — shundan so‘ng u shu sinfga test o‘tkaza oladi."
          action={
            <Button size="sm" onClick={() => setCreating(true)}>
              Biriktirish
            </Button>
          }
        />
      ) : visible.length === 0 ? (
        <EmptyState title="Filtrga mos biriktiruv yo‘q" />
      ) : (
        <Table caption="Biriktirishlar">
          <THead>
            <tr>
              <TH>O‘qituvchi</TH>
              <TH>Fan</TH>
              <TH>Sinf</TH>
              <TH className="text-right">Amal</TH>
            </tr>
          </THead>
          <tbody>
            {visible.map((item) => (
              <TR key={item.id}>
                <TD className="min-w-48">
                  <Link
                    href={`/admin/users/${item.teacher.id}`}
                    className="font-medium text-slate-900 hover:text-brand-700 hover:underline"
                  >
                    {item.teacher.fullName}
                  </Link>
                </TD>
                <TD>{item.subject.name}</TD>
                <TD className="whitespace-nowrap">
                  <Link href={`/admin/classes/${item.class.id}`} className="text-brand-700 hover:underline">
                    {item.class.name}
                  </Link>
                </TD>
                <TD className="text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-700 hover:bg-red-50 hover:text-red-800"
                    onClick={() => setRemoving(item)}
                    icon={<Trash2 className="size-4" aria-hidden />}
                    aria-label={`${item.teacher.fullName}: ${item.subject.name}, ${item.class.name} — biriktiruvni o‘chirish`}
                  >
                    <span className="hidden sm:inline">O‘chirish</span>
                  </Button>
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}

      <FormDialog
        open={creating}
        onClose={() => setCreating(false)}
        title="Yangi biriktiruv"
        formId={formId}
        submitLabel="Biriktirish"
        pending={create.isPending}
      >
        <AssignmentForm formId={formId} onSubmit={(values) => create.mutateAsync(values)} />
      </FormDialog>
      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        onConfirm={() => removing && remove.mutate(removing.id)}
        title="Biriktiruvni o‘chirish"
        confirmLabel="O‘chirish"
        tone="danger"
        loading={remove.isPending}
      >
        {removing && (
          <>
            <span className="font-medium text-slate-900">{removing.teacher.fullName}</span> endi{' '}
            <span className="font-medium text-slate-900">{removing.class.name}</span> sinfida{' '}
            <span className="font-medium text-slate-900">{removing.subject.name}</span> fanidan yangi test o‘tkaza
            olmaydi. O‘tkazilgan sessiyalar va natijalar saqlanadi.
          </>
        )}
      </ConfirmDialog>
    </Card>
  );
}
