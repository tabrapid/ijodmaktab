'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { createUserSchema, type Role } from '@ijod/shared';
import type { z } from 'zod';
import { Alert } from '@/components/ui/feedback';
import { Field, Input, Select } from '@/components/ui/form';
import { api } from '@/lib/api';
import { hasRole, useMe } from '@/lib/auth';
import type { UserDetail } from '@/lib/types';
import { FormDialog, applyServerErrors, choiceError } from './form-dialog';
import { ADMIN_GRANTABLE_ROLES } from './labels';
import { adminKeys, useClassList, useInvalidate } from './queries';
import { RoleCheckboxes } from './role-checkboxes';

export interface CreateUserResult {
  user: UserDetail;
  temporaryPassword: string;
}

type CreateUserValues = z.output<typeof createUserSchema>;

const blankToUndefined = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? undefined : value);
const blankToNull = (value: unknown) => (value === '' ? null : value);

function CreateUserForm({
  formId,
  roleOptions,
  onSubmit,
}: {
  formId: string;
  roleOptions: readonly Role[];
  onSubmit: (values: CreateUserValues) => Promise<unknown>;
}) {
  const classes = useClassList();
  const [error, setError] = useState<string | null>(null);
  const form = useForm({
    resolver: zodResolver(createUserSchema),
    defaultValues: { lastName: '', firstName: '', middleName: '', roles: ['STUDENT'], login: undefined, classId: null },
  });
  const roles = form.watch('roles');
  const isStudent = roles.includes('STUDENT');
  const classOptions = (classes.data ?? []).filter((item) => !item.archivedAt);
  const errors = form.formState.errors;

  const submit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await onSubmit({ ...values, classId: values.roles.includes('STUDENT') ? values.classId : null });
    } catch (caught) {
      setError(
        applyServerErrors(caught, form.setError, ['lastName', 'firstName', 'middleName', 'roles', 'login', 'classId'], {
          LOGIN_TAKEN: 'login',
          CLASS_FOR_NON_STUDENT: 'classId',
        }),
      );
    }
  });

  return (
    <form id={formId} onSubmit={submit} className="space-y-4" noValidate>
      {error && <Alert tone="danger">{error}</Alert>}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Familiya" required error={errors.lastName?.message}>
          <Input autoComplete="off" autoFocus {...form.register('lastName')} />
        </Field>
        <Field label="Ism" required error={errors.firstName?.message}>
          <Input autoComplete="off" {...form.register('firstName')} />
        </Field>
        <Field label="Otasining ismi" error={errors.middleName?.message}>
          <Input autoComplete="off" {...form.register('middleName')} />
        </Field>
      </div>
      <Controller
        control={form.control}
        name="roles"
        render={({ field, fieldState }) => (
          <RoleCheckboxes
            options={roleOptions}
            value={field.value}
            onChange={field.onChange}
            error={fieldState.error?.message}
          />
        )}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Login (ixtiyoriy)"
          hint="Bo‘sh qoldirilsa, ism-familiyadan avtomatik yaratiladi (masalan, zebo.karimova)."
          error={errors.login?.message}
        >
          <Input
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            {...form.register('login', { setValueAs: blankToUndefined })}
          />
        </Field>
        {isStudent && (
          <Field
            label="Sinf (joriy o‘quv yili)"
            hint={
              classes.isSuccess && classOptions.length === 0
                ? 'Joriy o‘quv yilida faol sinf yo‘q.'
                : 'Keyinroq ham biriktirish mumkin.'
            }
            error={choiceError(errors.classId, 'Sinfni tanlang')}
          >
            <Select disabled={classes.isPending} {...form.register('classId', { setValueAs: blankToNull })}>
              <option value="">{classes.isPending ? 'Yuklanmoqda…' : '— Keyinroq biriktiriladi —'}</option>
              {classOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>
      <p className="text-xs text-slate-500">
        Hisob yaratilgach vaqtinchalik parol bir marta ko‘rsatiladi. Birinchi kirishda uni almashtirish talab qilinadi.
      </p>
    </form>
  );
}

export function CreateUserDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (result: CreateUserResult) => void;
}) {
  const formId = useId();
  const { data: me } = useMe();
  const invalidate = useInvalidate();
  const roleOptions: readonly Role[] = hasRole(me, 'SUPER_ADMIN')
    ? [...ADMIN_GRANTABLE_ROLES, 'ADMIN', 'SUPER_ADMIN']
    : ADMIN_GRANTABLE_ROLES;
  const mutation = useMutation({
    mutationFn: (values: CreateUserValues) => api.post<CreateUserResult>('/users', values),
    onSuccess: async (result) => {
      onCreated(result);
      await invalidate(adminKeys.users, adminKeys.dashboard, adminKeys.classes, adminKeys.staffAll);
    },
  });
  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title="Yangi foydalanuvchi"
      description="Hisob maktab tomonidan yaratiladi; ochiq ro‘yxatdan o‘tish yo‘q."
      formId={formId}
      submitLabel="Yaratish"
      pending={mutation.isPending}
      size="lg"
    >
      <CreateUserForm formId={formId} roleOptions={roleOptions} onSubmit={(values) => mutation.mutateAsync(values)} />
    </FormDialog>
  );
}
