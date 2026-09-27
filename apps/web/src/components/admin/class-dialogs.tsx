'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { classSchema, updateClassSchema } from '@ijod/shared';
import type { z } from 'zod';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Alert } from '@/components/ui/feedback';
import { Field, Input, Select } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { api, errorMessage } from '@/lib/api';
import type { PersonRef } from '@/lib/types';
import { FormDialog, applyServerErrors } from './form-dialog';
import { adminKeys, useInvalidate } from './queries';
import { TeacherSelect } from './teacher-select';

const GRADES = Array.from({ length: 11 }, (_, index) => index + 1);

function useClassesChanged() {
  const invalidate = useInvalidate();
  return () => invalidate(adminKeys.classes, adminKeys.years, adminKeys.users, adminKeys.dashboard);
}

// ---------------------------------------------------------------- Yaratish

function CreateClassForm({
  formId,
  academicYearId,
  onSubmit,
}: {
  formId: string;
  academicYearId: string;
  onSubmit: (values: z.output<typeof classSchema>) => Promise<unknown>;
}) {
  const [error, setError] = useState<string | null>(null);
  const form = useForm({
    resolver: zodResolver(classSchema),
    defaultValues: { academicYearId, gradeLevel: 1, section: '', homeroomTeacherId: null },
  });
  const errors = form.formState.errors;
  const grade = form.watch('gradeLevel');
  const section = form.watch('section').trim().toUpperCase();
  const submit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await onSubmit(values);
    } catch (caught) {
      setError(
        applyServerErrors(caught, form.setError, ['gradeLevel', 'section', 'homeroomTeacherId'], {
          NOT_A_TEACHER: 'homeroomTeacherId',
          DUPLICATE: { field: 'section', message: 'Bu o‘quv yilida bunday sinf allaqachon bor.' },
        }),
      );
    }
  });
  return (
    <form id={formId} onSubmit={submit} className="space-y-4" noValidate>
      {error && <Alert tone="danger">{error}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Sinf darajasi" required error={errors.gradeLevel?.message}>
          <Select {...form.register('gradeLevel', { setValueAs: (value) => Number(value) })}>
            {GRADES.map((value) => (
              <option key={value} value={value}>
                {value}-sinf
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Harfi (parallel)" required hint="Masalan, A yoki B" error={errors.section?.message}>
          <Input autoComplete="off" maxLength={10} className="uppercase" {...form.register('section')} />
        </Field>
      </div>
      <p className="text-sm text-slate-600">
        Sinf nomi: <span className="font-semibold text-slate-900">{section ? `${grade}-${section}` : '—'}</span>
      </p>
      <Controller
        control={form.control}
        name="homeroomTeacherId"
        render={({ field, fieldState }) => (
          <Field label="Sinf rahbari (ixtiyoriy)" error={fieldState.error?.message}>
            <TeacherSelect value={field.value} onChange={field.onChange} />
          </Field>
        )}
      />
    </form>
  );
}

export function CreateClassDialog({
  open,
  onClose,
  academicYear,
}: {
  open: boolean;
  onClose: () => void;
  academicYear: { id: string; name: string };
}) {
  const formId = useId();
  const toast = useToast();
  const changed = useClassesChanged();
  const mutation = useMutation({
    mutationFn: (values: z.output<typeof classSchema>) => api.post<{ id: string; name: string }>('/classes', values),
    onSuccess: async (created) => {
      toast.success(`${created.name} sinfi yaratildi.`);
      onClose();
      await changed();
    },
  });
  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title="Yangi sinf"
      description={`O‘quv yili: ${academicYear.name}`}
      formId={formId}
      submitLabel="Yaratish"
      pending={mutation.isPending}
    >
      <CreateClassForm
        formId={formId}
        academicYearId={academicYear.id}
        onSubmit={(values) => mutation.mutateAsync(values)}
      />
    </FormDialog>
  );
}

// ---------------------------------------------------------------- Tahrirlash

export interface EditableClass {
  id: string;
  name: string;
  gradeLevel: number;
  section: string;
  homeroomTeacher: PersonRef | null;
}

function EditClassForm({
  formId,
  item,
  onSubmit,
}: {
  formId: string;
  item: EditableClass;
  onSubmit: (values: z.output<typeof updateClassSchema>) => Promise<unknown>;
}) {
  const [error, setError] = useState<string | null>(null);
  const form = useForm({
    resolver: zodResolver(updateClassSchema),
    defaultValues: { section: item.section, homeroomTeacherId: item.homeroomTeacher?.id ?? null },
  });
  const section = (form.watch('section') ?? '').trim().toUpperCase();
  const submit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await onSubmit(values);
    } catch (caught) {
      setError(
        applyServerErrors(caught, form.setError, ['section', 'homeroomTeacherId'], {
          NOT_A_TEACHER: 'homeroomTeacherId',
          DUPLICATE: { field: 'section', message: 'Bu o‘quv yilida bunday nomli sinf allaqachon bor.' },
        }),
      );
    }
  });
  return (
    <form id={formId} onSubmit={submit} className="space-y-4" noValidate>
      {error && <Alert tone="danger">{error}</Alert>}
      <Field
        label="Harfi (parallel)"
        required
        hint={`Sinf darajasi (${item.gradeLevel}) o‘zgarmaydi. Yangi nom: ${section ? `${item.gradeLevel}-${section}` : '—'}`}
        error={form.formState.errors.section?.message}
      >
        <Input autoComplete="off" maxLength={10} className="uppercase" {...form.register('section')} />
      </Field>
      <Controller
        control={form.control}
        name="homeroomTeacherId"
        render={({ field, fieldState }) => (
          <Field
            label="Sinf rahbari"
            hint="Bo‘sh qoldirilsa, sinf rahbari olib tashlanadi."
            error={fieldState.error?.message}
          >
            <TeacherSelect value={field.value} onChange={field.onChange} current={item.homeroomTeacher} />
          </Field>
        )}
      />
    </form>
  );
}

export function EditClassDialog({ item, onClose }: { item: EditableClass | null; onClose: () => void }) {
  const formId = useId();
  const toast = useToast();
  const changed = useClassesChanged();
  const mutation = useMutation({
    mutationFn: (values: z.output<typeof updateClassSchema>) =>
      api.patch<{ name: string }>(`/classes/${item?.id}`, values),
    onSuccess: async (updated) => {
      toast.success(`${updated.name} sinfi saqlandi.`);
      onClose();
      await changed();
    },
  });
  return (
    <FormDialog
      open={item !== null}
      onClose={onClose}
      title="Sinfni tahrirlash"
      description={item?.name}
      formId={formId}
      pending={mutation.isPending}
    >
      {item && <EditClassForm formId={formId} item={item} onSubmit={(values) => mutation.mutateAsync(values)} />}
    </FormDialog>
  );
}

// ---------------------------------------------------------------- Arxivlash

export function ArchiveClassDialog({
  item,
  onClose,
}: {
  item: { id: string; name: string; archived: boolean } | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const changed = useClassesChanged();
  const mutation = useMutation({
    mutationFn: (target: { id: string; archived: boolean }) =>
      api.post(`/classes/${target.id}/${target.archived ? 'unarchive' : 'archive'}`),
    onSuccess: async (_, target) => {
      toast.success(target.archived ? 'Sinf arxivdan chiqarildi.' : 'Sinf arxivlandi.');
      onClose();
      await changed();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const archived = item?.archived ?? false;
  return (
    <ConfirmDialog
      open={item !== null}
      onClose={onClose}
      onConfirm={() => item && mutation.mutate(item)}
      title={archived ? 'Sinfni arxivdan chiqarish' : 'Sinfni arxivlash'}
      confirmLabel={archived ? 'Arxivdan chiqarish' : 'Arxivlash'}
      tone={archived ? 'primary' : 'danger'}
      loading={mutation.isPending}
    >
      {archived ? (
        <>
          <span className="font-medium text-slate-900">{item?.name}</span> sinfi yana faol bo‘ladi: unga o‘quvchi
          qo‘shish va ko‘chirish mumkin.
        </>
      ) : (
        <>
          <span className="font-medium text-slate-900">{item?.name}</span> sinfiga o‘quvchi qo‘shib yoki ko‘chirib
          bo‘lmaydi. Mavjud a’zoliklar, biriktirishlar va natijalar saqlanadi.
        </>
      )}
    </ConfirmDialog>
  );
}
