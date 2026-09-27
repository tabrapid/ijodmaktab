'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { useForm } from 'react-hook-form';
import { endEnrollmentSchema, id, isoDate, schoolToday, transferStudentSchema } from '@ijod/shared';
import { z } from 'zod';
import { Alert } from '@/components/ui/feedback';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import type { Ref } from '@/lib/types';
import { FormDialog, applyServerErrors, choiceError } from './form-dialog';
import { END_ENROLLMENT_REASONS, ENROLLMENT_END_REASON_LABELS } from './labels';
import { adminKeys, useClassList, useInvalidate } from './queries';

interface StudentRef {
  id: string;
  fullName: string;
}

const emptyToUndefined = (value: unknown) => (value === '' ? undefined : value);

function useEnrollmentInvalidate() {
  const invalidate = useInvalidate();
  return () => invalidate(adminKeys.users, adminKeys.classes, adminKeys.dashboard);
}

// ---------------------------------------------------------------- Boshqa sinfga ko‘chirish

function TransferForm({
  formId,
  fromClass,
  academicYearId,
  onSubmit,
}: {
  formId: string;
  fromClass: Ref;
  academicYearId?: string;
  onSubmit: (values: z.output<typeof transferStudentSchema>) => Promise<unknown>;
}) {
  const classes = useClassList(academicYearId);
  const [error, setError] = useState<string | null>(null);
  const form = useForm({
    resolver: zodResolver(transferStudentSchema),
    defaultValues: { toClassId: '', date: schoolToday(), reason: '' },
  });
  const targets = (classes.data ?? []).filter((item) => !item.archivedAt && item.id !== fromClass.id);
  const submit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await onSubmit(values);
    } catch (caught) {
      setError(applyServerErrors(caught, form.setError, ['toClassId', 'date', 'reason']));
    }
  });
  const errors = form.formState.errors;
  return (
    <form id={formId} onSubmit={submit} className="space-y-4" noValidate>
      {error && <Alert tone="danger">{error}</Alert>}
      <p className="text-sm text-slate-600">
        Hozirgi sinf: <span className="font-medium text-slate-900">{fromClass.name}</span>. Eski a’zolik ko‘chirish
        sanasi bilan yopiladi, oldingi test natijalari eski sinf bilan qoladi.
      </p>
      <Field label="Yangi sinf" required error={choiceError(errors.toClassId, 'Sinfni tanlang')}>
        <Select disabled={classes.isPending} {...form.register('toClassId')}>
          <option value="">{classes.isPending ? 'Yuklanmoqda…' : '— Sinfni tanlang —'}</option>
          {targets.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} ({item.studentCount} o‘quvchi)
            </option>
          ))}
        </Select>
      </Field>
      {classes.isError && <Alert tone="danger">Sinflar ro‘yxatini yuklab bo‘lmadi.</Alert>}
      {classes.isSuccess && targets.length === 0 && (
        <Alert tone="warning">Shu o‘quv yilida ko‘chirish mumkin bo‘lgan boshqa sinf yo‘q.</Alert>
      )}
      <Field label="Ko‘chirish sanasi" hint="Bo‘sh qoldirilsa — bugungi sana." error={errors.date?.message}>
        <Input type="date" {...form.register('date', { setValueAs: emptyToUndefined })} />
      </Field>
      <Field label="Sabab (ixtiyoriy)" error={errors.reason?.message}>
        <Textarea rows={2} maxLength={300} {...form.register('reason')} />
      </Field>
    </form>
  );
}

export function TransferDialog({
  open,
  onClose,
  student,
  fromClass,
  academicYearId,
}: {
  open: boolean;
  onClose: () => void;
  student: StudentRef;
  fromClass: Ref;
  /** Hozirgi a’zolik o‘quv yili (ko‘rsatilmasa — joriy o‘quv yili). */
  academicYearId?: string;
}) {
  const formId = useId();
  const toast = useToast();
  const refresh = useEnrollmentInvalidate();
  const mutation = useMutation({
    mutationFn: (values: z.output<typeof transferStudentSchema>) =>
      api.post(`/students/${student.id}/transfer`, values),
    onSuccess: async () => {
      toast.success(`${student.fullName} boshqa sinfga ko‘chirildi.`);
      onClose();
      await refresh();
    },
  });
  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title="Boshqa sinfga ko‘chirish"
      description={student.fullName}
      formId={formId}
      submitLabel="Ko‘chirish"
      pending={mutation.isPending}
    >
      <TransferForm
        formId={formId}
        fromClass={fromClass}
        academicYearId={academicYearId}
        onSubmit={(values) => mutation.mutateAsync(values)}
      />
    </FormDialog>
  );
}

// ---------------------------------------------------------------- A’zolikni tugatish

function EndEnrollmentForm({
  formId,
  className,
  onSubmit,
}: {
  formId: string;
  className: string;
  onSubmit: (values: z.output<typeof endEnrollmentSchema>) => Promise<unknown>;
}) {
  const [error, setError] = useState<string | null>(null);
  const form = useForm({
    resolver: zodResolver(endEnrollmentSchema),
    defaultValues: { date: schoolToday(), reason: 'LEFT' as const },
  });
  const reason = form.watch('reason');
  const submit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await onSubmit(values);
    } catch (caught) {
      setError(applyServerErrors(caught, form.setError, ['date', 'reason']));
    }
  });
  return (
    <form id={formId} onSubmit={submit} className="space-y-4" noValidate>
      {error && <Alert tone="danger">{error}</Alert>}
      <p className="text-sm text-slate-600">
        O‘quvchi <span className="font-medium text-slate-900">{className}</span> sinfi ro‘yxatidan chiqariladi. A’zolik
        tarixi va oldingi natijalar saqlanadi.
      </p>
      <Field label="Sabab" required error={form.formState.errors.reason?.message}>
        <Select {...form.register('reason')}>
          {END_ENROLLMENT_REASONS.map((value) => (
            <option key={value} value={value}>
              {ENROLLMENT_END_REASON_LABELS[value]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Tugash sanasi" hint="Bo‘sh qoldirilsa — bugungi sana." error={form.formState.errors.date?.message}>
        <Input type="date" {...form.register('date', { setValueAs: emptyToUndefined })} />
      </Field>
      {reason === 'GRADUATED' && (
        <Alert tone="info">
          Bitirgan o‘quvchi hisobini keyin “Arxivlash” orqali arxivlash tavsiya etiladi — tarixiy ma’lumotlar o‘chmaydi.
        </Alert>
      )}
    </form>
  );
}

export function EndEnrollmentDialog({
  open,
  onClose,
  student,
  enrollment,
}: {
  open: boolean;
  onClose: () => void;
  student: StudentRef;
  enrollment: { id: string; className: string };
}) {
  const formId = useId();
  const toast = useToast();
  const refresh = useEnrollmentInvalidate();
  const mutation = useMutation({
    mutationFn: (values: z.output<typeof endEnrollmentSchema>) => api.post(`/enrollments/${enrollment.id}/end`, values),
    onSuccess: async () => {
      toast.success(`${student.fullName}: sinfga a’zolik tugatildi.`);
      onClose();
      await refresh();
    },
  });
  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title="A’zolikni tugatish"
      description={student.fullName}
      formId={formId}
      submitLabel="A’zolikni tugatish"
      tone="danger"
      pending={mutation.isPending}
    >
      <EndEnrollmentForm
        formId={formId}
        className={enrollment.className}
        onSubmit={(values) => mutation.mutateAsync(values)}
      />
    </FormDialog>
  );
}

// ---------------------------------------------------------------- Sinfga biriktirish (sinfsiz o‘quvchi)

const enrollOneSchema = z.object({
  classId: id(),
  startsOn: isoDate().optional(),
});

function EnrollForm({
  formId,
  onSubmit,
}: {
  formId: string;
  onSubmit: (values: z.output<typeof enrollOneSchema>) => Promise<unknown>;
}) {
  const classes = useClassList();
  const [error, setError] = useState<string | null>(null);
  const form = useForm({ resolver: zodResolver(enrollOneSchema), defaultValues: { classId: '', startsOn: undefined } });
  const options = (classes.data ?? []).filter((item) => !item.archivedAt);
  const submit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await onSubmit(values);
    } catch (caught) {
      setError(applyServerErrors(caught, form.setError, ['classId', 'startsOn']));
    }
  });
  return (
    <form id={formId} onSubmit={submit} className="space-y-4" noValidate>
      {error && <Alert tone="danger">{error}</Alert>}
      <Field
        label="Sinf (joriy o‘quv yili)"
        required
        error={choiceError(form.formState.errors.classId, 'Sinfni tanlang')}
      >
        <Select disabled={classes.isPending} {...form.register('classId')}>
          <option value="">{classes.isPending ? 'Yuklanmoqda…' : '— Sinfni tanlang —'}</option>
          {options.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} ({item.studentCount} o‘quvchi)
            </option>
          ))}
        </Select>
      </Field>
      {classes.isSuccess && options.length === 0 && (
        <Alert tone="warning">
          Joriy o‘quv yilida faol sinf yo‘q. Avval “Maktab tuzilmasi” bo‘limida sinf yarating.
        </Alert>
      )}
      <Field
        label="A’zolik boshlanish sanasi"
        hint="Bo‘sh qoldirilsa — bugungi sana (o‘quv yili boshlanmagan bo‘lsa, o‘quv yili boshlanishi)."
        error={form.formState.errors.startsOn?.message}
      >
        <Input type="date" {...form.register('startsOn', { setValueAs: emptyToUndefined })} />
      </Field>
    </form>
  );
}

export function EnrollDialog({ open, onClose, student }: { open: boolean; onClose: () => void; student: StudentRef }) {
  const formId = useId();
  const toast = useToast();
  const refresh = useEnrollmentInvalidate();
  const mutation = useMutation({
    mutationFn: ({ classId, startsOn }: z.output<typeof enrollOneSchema>) =>
      api.post(`/classes/${classId}/students`, { studentIds: [student.id], startsOn }),
    onSuccess: async () => {
      toast.success(`${student.fullName} sinfga biriktirildi.`);
      onClose();
      await refresh();
    },
  });
  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title="Sinfga biriktirish"
      description={student.fullName}
      formId={formId}
      submitLabel="Biriktirish"
      pending={mutation.isPending}
    >
      <EnrollForm formId={formId} onSubmit={(values) => mutation.mutateAsync(values)} />
    </FormDialog>
  );
}
