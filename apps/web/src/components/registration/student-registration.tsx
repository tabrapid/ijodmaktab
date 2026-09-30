'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useMemo, useRef, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { studentRegistrationSchema } from '@ijod/shared';
import { applyServerErrors, choiceError } from '@/components/admin/form-dialog';
import { AuthCard } from '@/components/auth/auth-card';
import { Button } from '@/components/ui/button';
import { Alert, ErrorState, PageLoader } from '@/components/ui/feedback';
import { Checkbox, Field, Input, Select } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { ApiError, api } from '@/lib/api';
import { ME_KEY, afterLoginPath } from '@/lib/auth';
import type { Me, RegistrationClassOption } from '@/lib/types';
import {
  BirthDateField,
  FormSection,
  LOGIN_HINT,
  LoginNote,
  NAME_HINT,
  NamePreview,
  PASSWORD_HINT,
  PasswordInput,
  PinflField,
  RegisterFooter,
  birthDateError,
} from './fields';
import { ClosedNotice, loginFromNames, useScrollIntoView } from './shared';
import { registrationKeys, useLoginAvailability, useRegistrationOptions, useSignedInRedirect } from './queries';

const FIELDS = [
  'lastName',
  'firstName',
  'middleName',
  'birthDate',
  'pinfl',
  'classId',
  'login',
  'password',
  'confirmPassword',
] as const;

const TAKEN_MESSAGE = 'Bu login band. Boshqa login tanlang.';

/** Sinflar sinf darajasi bo‘yicha guruhlanadi (API tartibi saqlanadi: 11 → 7). */
function groupByGrade(classes: RegistrationClassOption[]) {
  const groups = new Map<number, RegistrationClassOption[]>();
  for (const item of classes) groups.set(item.gradeLevel, [...(groups.get(item.gradeLevel) ?? []), item]);
  return [...groups.entries()];
}

type ServerAlert = { title?: string; message: string; tone: 'danger' | 'warning' };

function StudentForm({ classes, onSignedIn }: { classes: RegistrationClassOption[]; onSignedIn: () => void }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [alert, setAlert] = useState<ServerAlert | null>(null);
  const alertRef = useScrollIntoView(alert);
  const [confirmed, setConfirmed] = useState(false);
  const [confirmError, setConfirmError] = useState(false);
  const thisYear = useRef(new Date().getFullYear()).current;
  const groups = useMemo(() => groupByGrade(classes), [classes]);

  const form = useForm({
    resolver: zodResolver(studentRegistrationSchema),
    mode: 'onTouched',
    defaultValues: {
      lastName: '',
      firstName: '',
      middleName: '',
      birthDate: '',
      pinfl: '',
      classId: '',
      login: '',
      password: '',
      confirmPassword: '',
    },
  });
  const { errors } = form.formState;
  const [lastName, firstName, middleName, birthDate, login] = useWatch({
    control: form.control,
    name: ['lastName', 'firstName', 'middleName', 'birthDate', 'login'],
  });
  const loginCheck = useLoginAvailability(login);
  const fromName = useMemo(() => loginFromNames(firstName, lastName), [firstName, lastName]);

  const onSubmit = form.handleSubmit(
    async (values) => {
      setAlert(null);
      if (loginCheck.state === 'taken') {
        form.setError('login', { type: 'server', message: TAKEN_MESSAGE }, { shouldFocus: true });
        return;
      }
      if (!confirmed) {
        setConfirmError(true);
        return;
      }
      try {
        const me = await api.post<Me>('/registration/student', values);
        queryClient.setQueryData(ME_KEY, me);
        toast.success(`Xush kelibsiz, ${me.firstName}! Siz ro‘yxatdan o‘tdingiz.`);
        router.replace(afterLoginPath(me));
      } catch (caught) {
        if (caught instanceof ApiError) {
          if (caught.code === 'ALREADY_AUTHENTICATED') {
            onSignedIn();
            return;
          }
          if (caught.code === 'LOGIN_TAKEN') {
            await queryClient.invalidateQueries({ queryKey: registrationKeys.login(values.login) });
          }
          if (caught.code === 'INVALID_CLASS' || caught.code === 'REGISTRATION_CLOSED') {
            // Sinflar ro‘yxati yoki sozlama o‘zgargan bo‘lishi mumkin.
            void queryClient.invalidateQueries({ queryKey: registrationKeys.options });
          }
        }
        const general = applyServerErrors(caught, form.setError, FIELDS, {
          LOGIN_TAKEN: 'login',
          PINFL_TAKEN: 'pinfl',
        });
        if (general) {
          const duplicate = caught instanceof ApiError && caught.code === 'DUPLICATE_PERSON';
          setAlert({
            title: duplicate ? 'Siz allaqachon ro‘yxatdan o‘tgansiz' : undefined,
            message: general,
            tone: duplicate ? 'warning' : 'danger',
          });
        }
      }
    },
    () => {
      if (!confirmed) setConfirmError(true);
    },
  );

  return (
    <form onSubmit={onSubmit} className="space-y-7" noValidate>
      {alert && (
        <div ref={alertRef} tabIndex={-1} className="outline-none">
          <Alert tone={alert.tone} title={alert.title}>
            {alert.message}
          </Alert>
        </div>
      )}

      <FormSection title="Hujjatdagi ma’lumotlar">
        <Field label="Familiya" required hint={NAME_HINT} error={errors.lastName?.message}>
          <Input autoComplete="family-name" autoCapitalize="words" spellCheck={false} {...form.register('lastName')} />
        </Field>
        <Field label="Ism" required error={errors.firstName?.message}>
          <Input autoComplete="given-name" autoCapitalize="words" spellCheck={false} {...form.register('firstName')} />
        </Field>
        <Field
          label="Otasining ismi"
          hint="Masalan: Baxtiyor o‘g‘li yoki Rustam qizi. Hujjatda bo‘lmasa — bo‘sh qoldiring."
          error={errors.middleName?.message}
        >
          <Input
            autoComplete="additional-name"
            autoCapitalize="words"
            spellCheck={false}
            {...form.register('middleName')}
          />
        </Field>
        <NamePreview names={[lastName, firstName, middleName]} />
        <Controller
          control={form.control}
          name="birthDate"
          rules={{ deps: ['pinfl'] }}
          render={({ field, fieldState }) => (
            <BirthDateField
              value={field.value ?? ''}
              onChange={field.onChange}
              onBlur={field.onBlur}
              inputRef={field.ref}
              error={birthDateError(field.value, fieldState.error?.message)}
              fromYear={thisYear - 8}
              toYear={thisYear - 30}
              hint="Hujjatdagi aniq sana."
            />
          )}
        />
        <Controller
          control={form.control}
          name="pinfl"
          render={({ field, fieldState }) => (
            <PinflField
              value={field.value ?? ''}
              onChange={field.onChange}
              onBlur={field.onBlur}
              inputRef={field.ref}
              birthDate={birthDate ?? ''}
              error={fieldState.error?.message}
            />
          )}
        />
      </FormSection>

      <FormSection title="Sinf">
        <Field label="Sinfingiz" required error={choiceError(errors.classId, 'Sinfingizni tanlang')}>
          <Select {...form.register('classId')}>
            <option value="">Sinfni tanlang</option>
            {groups.map(([grade, items]) => (
              <optgroup key={grade} label={`${grade}-sinflar`}>
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        </Field>
      </FormSection>

      <FormSection title="Kirish ma’lumotlari">
        <div className="space-y-1.5">
          <Field
            label="Login"
            required
            hint={LOGIN_HINT}
            error={errors.login?.message ?? (loginCheck.state === 'taken' ? TAKEN_MESSAGE : undefined)}
          >
            <Input
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="lowercase"
              {...form.register('login')}
            />
          </Field>
          <LoginNote
            check={loginCheck}
            fromName={fromName}
            onPick={(value) => form.setValue('login', value, { shouldValidate: true, shouldTouch: true })}
          />
        </div>
        <Field label="Parol" required hint={PASSWORD_HINT} error={errors.password?.message}>
          <PasswordInput autoComplete="new-password" {...form.register('password', { deps: ['confirmPassword'] })} />
        </Field>
        <Field label="Parolni takrorlang" required error={errors.confirmPassword?.message}>
          <PasswordInput autoComplete="new-password" {...form.register('confirmPassword')} />
        </Field>
      </FormSection>

      <div className="space-y-1.5 rounded-lg border border-slate-200 p-3">
        <Checkbox
          label="Ma’lumotlarim hujjatimdagi bilan bir xil"
          description="F.I.Sh. va tug‘ilgan sanani keyin faqat direktor o‘rinbosari o‘zgartira oladi."
          checked={confirmed}
          onChange={(event) => {
            setConfirmed(event.target.checked);
            if (event.target.checked) setConfirmError(false);
          }}
          aria-invalid={confirmError || undefined}
        />
        {confirmError && (
          <p className="text-xs font-medium text-red-700">
            Davom etish uchun ma’lumotlaringizni hujjat bilan solishtirib, belgilang.
          </p>
        )}
      </div>

      <Button type="submit" size="lg" className="w-full" loading={form.formState.isSubmitting}>
        Ro‘yxatdan o‘tish
      </Button>
    </form>
  );
}

/** O‘quvchining o‘zi ro‘yxatdan o‘tishi: muvaffaqiyatli bo‘lsa, darhol o‘quvchi paneliga o‘tadi. */
export function StudentRegistration({ hasSession }: { hasSession: boolean }) {
  const { checking, recheck } = useSignedInRedirect(hasSession);
  const options = useRegistrationOptions();
  const student = options.data?.student;

  return (
    <AuthCard
      title="O‘quvchi sifatida ro‘yxatdan o‘tish"
      description="Ma’lumotlarni ID-karta yoki tug‘ilganlik haqidagi guvohnomadagidek kiriting."
      footer={<RegisterFooter />}
    >
      {checking || options.isPending ? (
        <PageLoader />
      ) : options.isError ? (
        <ErrorState error={options.error} onRetry={() => options.refetch()} />
      ) : !student?.open ? (
        <ClosedNotice who="student" />
      ) : student.classes.length === 0 ? (
        <ClosedNotice who="student" reason="no-classes" />
      ) : (
        <StudentForm classes={student.classes} onSignedIn={() => void recheck()} />
      )}
    </AuthCard>
  );
}
