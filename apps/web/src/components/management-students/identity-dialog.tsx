'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { cleanPinfl, schoolToday, studentIdentityUpdateSchema } from '@ijod/shared';
import { z } from 'zod';
import { FormDialog, applyServerErrors } from '@/components/admin/form-dialog';
import { Alert } from '@/components/ui/feedback';
import { Field, Input } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import type { ManagementStudentProfile } from '@/lib/types';
import { managementKeys, useRefreshStudents } from './queries';

const PINFL_MODES = ['keep', 'set', 'remove'] as const;
type PinflMode = (typeof PINFL_MODES)[number];

const PINFL_MODE_LABELS: Record<PinflMode, string> = {
  keep: 'O‘zgarmasin',
  set: 'Yangisini kiritish',
  remove: 'O‘chirish (ID-karta yo‘q)',
};

const SERVER_FIELDS = ['lastName', 'firstName', 'middleName', 'birthDate', 'pinfl'] as const;

/**
 * Forma qiymatlari API so‘roviga aylantiriladi va umumiy sxema bilan tekshiriladi (server bilan bir xil
 * qoidalar: o‘zbek lotin alifbosi, JSHSHIR va tug‘ilgan sana mosligi). JSHSHIR faqat o‘zgartirilganda yuboriladi.
 */
function identityFormSchema(hasPinfl: boolean) {
  return z
    .object({
      lastName: z.string(),
      firstName: z.string(),
      middleName: z.string(),
      birthDate: z.string(),
      pinflMode: z.enum(PINFL_MODES),
      pinfl: z.string(),
    })
    .superRefine((data, ctx) => {
      if (hasPinfl && data.pinflMode === 'set' && !cleanPinfl(data.pinfl)) {
        ctx.addIssue({ code: 'custom', path: ['pinfl'], message: 'Yangi JSHSHIRni kiriting' });
      }
    })
    .transform(({ pinflMode, pinfl, birthDate, ...names }): z.input<typeof studentIdentityUpdateSchema> => {
      // JSHSHIRi yo‘q o‘quvchida maydon to‘ldirilsa — kiritiladi, bo‘sh qolsa — o‘zgarmaydi.
      const mode: PinflMode = hasPinfl ? pinflMode : cleanPinfl(pinfl) ? 'set' : 'keep';
      return {
        ...names,
        birthDate: birthDate || null,
        ...(mode === 'set' ? { pinfl } : mode === 'remove' ? { pinfl: null } : {}),
      };
    })
    .pipe(studentIdentityUpdateSchema);
}

/** Hujjat bo‘yicha shaxsiy ma’lumotlarni tuzatish: F.I.Sh., tug‘ilgan sana, JSHSHIR. */
export function IdentityDialog({ profile, onClose }: { profile: ManagementStudentProfile; onClose: () => void }) {
  const formId = useId();
  const toast = useToast();
  const queryClient = useQueryClient();
  const refresh = useRefreshStudents();
  const [error, setError] = useState<string | null>(null);
  const schema = useMemo(() => identityFormSchema(profile.hasPinfl), [profile.hasPinfl]);
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      lastName: profile.lastName,
      firstName: profile.firstName,
      middleName: profile.middleName ?? '',
      birthDate: profile.birthDate ?? '',
      pinflMode: 'keep' as PinflMode,
      pinfl: '',
    },
  });
  const mode = form.watch('pinflMode');
  const errors = form.formState.errors;

  const save = useMutation({
    mutationFn: (values: z.output<typeof schema>) =>
      api.patch<ManagementStudentProfile>(`/management/students/${profile.id}/identity`, values),
    onSuccess: async (result) => {
      queryClient.setQueryData(managementKeys.student(profile.id), result);
      toast.success('Ma’lumotlar saqlandi.');
      onClose();
      await refresh();
    },
  });

  const submit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await save.mutateAsync(values);
    } catch (caught) {
      setError(applyServerErrors(caught, form.setError, SERVER_FIELDS));
    }
  });

  const pinflInput = (label: string, hint?: string) => (
    <Field label={label} hint={hint} error={errors.pinfl?.message}>
      <Input
        inputMode="numeric"
        autoComplete="off"
        spellCheck={false}
        maxLength={20}
        placeholder="14 ta raqam"
        className="font-mono tracking-wide"
        {...form.register('pinfl')}
      />
    </Field>
  );

  return (
    <FormDialog
      open
      onClose={onClose}
      title="Shaxsiy ma’lumotlarni tuzatish"
      description={profile.fullName}
      formId={formId}
      pending={save.isPending}
      submitDisabled={!form.formState.isDirty}
      size="lg"
    >
      <form id={formId} onSubmit={submit} className="space-y-4" noValidate>
        {error && <Alert tone="danger">{error}</Alert>}
        <p className="text-sm text-slate-600">
          Ma’lumotlarni ID-karta yoki tug‘ilganlik haqidagi guvohnomadan hujjatdagidek, o‘zbek lotin alifbosida
          ko‘chiring. O‘ va G‘ harflaridagi belgi hamda tutuq belgisi avtomatik to‘g‘rilanadi.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Familiya" required error={errors.lastName?.message}>
            <Input autoComplete="off" autoCapitalize="words" {...form.register('lastName')} />
          </Field>
          <Field label="Ism" required error={errors.firstName?.message}>
            <Input autoComplete="off" autoCapitalize="words" {...form.register('firstName')} />
          </Field>
          <Field
            label="Otasining ismi"
            hint="Hujjatda bo‘lsa (masalan, “Baxtiyor o‘g‘li”)."
            error={errors.middleName?.message}
          >
            <Input autoComplete="off" autoCapitalize="words" {...form.register('middleName')} />
          </Field>
          <Field label="Tug‘ilgan sana" error={errors.birthDate?.message}>
            <Input type="date" max={schoolToday()} {...form.register('birthDate')} />
          </Field>
        </div>

        <fieldset className="space-y-3 rounded-xl border border-slate-200 p-4">
          <legend className="px-1 text-sm font-medium text-slate-700">JSHSHIR (PINFL)</legend>
          {profile.hasPinfl ? (
            <>
              <p className="text-sm text-slate-600">
                Hozirgi: <span className="font-mono tracking-wide">{profile.pinflMasked ?? '—'}</span>
              </p>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-x-5">
                {PINFL_MODES.map((value) => (
                  <label key={value} className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-800">
                    <input
                      type="radio"
                      value={value}
                      className="size-4 cursor-pointer accent-brand-600 dark:accent-brand-500"
                      {...form.register('pinflMode')}
                    />
                    {PINFL_MODE_LABELS[value]}
                  </label>
                ))}
              </div>
              {mode === 'set' &&
                pinflInput('Yangi JSHSHIR', 'Undagi tug‘ilgan sana yuqoridagi sana bilan mos bo‘lishi kerak.')}
              {mode === 'remove' && (
                <p className="text-sm text-amber-700">
                  JSHSHIR o‘chiriladi — o‘quvchi tug‘ilganlik haqidagi guvohnoma bilan o‘qiyotgan bo‘lsa.
                </p>
              )}
            </>
          ) : (
            pinflInput(
              'JSHSHIR',
              'ID-karta bo‘lsa — 14 ta raqam (undagi tug‘ilgan sana yuqoridagi bilan mos). Guvohnoma bo‘lsa — bo‘sh qoldiring.',
            )
          )}
        </fieldset>
      </form>
    </FormDialog>
  );
}
