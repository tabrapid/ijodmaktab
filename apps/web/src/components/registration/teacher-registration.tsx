'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { teacherRegistrationSchema } from '@ijod/shared';
import { applyServerErrors, choiceError } from '@/components/admin/form-dialog';
import { AuthCard } from '@/components/auth/auth-card';
import { Button, ButtonLink } from '@/components/ui/button';
import { Alert, ErrorState, PageLoader } from '@/components/ui/feedback';
import { Field, Input, Select } from '@/components/ui/form';
import { ApiError, api } from '@/lib/api';
import type { Ref } from '@/lib/types';
import {
  FormSection,
  LOGIN_HINT,
  LoginNote,
  NAME_HINT,
  NamePreview,
  PASSWORD_HINT,
  PasswordInput,
  RegisterFooter,
} from './fields';
import { registrationKeys, useLoginAvailability, useRegistrationOptions, useSignedInRedirect } from './queries';
import { ClosedNotice, loginFromNames, useScrollIntoView } from './shared';

const FIELDS = [
  'lastName',
  'firstName',
  'middleName',
  'birthYear',
  'specialtySubjectId',
  'login',
  'password',
  'confirmPassword',
] as const;

const TAKEN_MESSAGE = 'Bu login band. Boshqa login tanlang.';
const OLDEST_YEAR = 1940;

type ServerAlert = { title?: string; message: string; tone: 'danger' | 'warning' };

function TeacherForm({
  subjects,
  onSignedIn,
  onDone,
}: {
  subjects: Ref[];
  onSignedIn: () => void;
  onDone: (login: string) => void;
}) {
  const queryClient = useQueryClient();
  const [alert, setAlert] = useState<ServerAlert | null>(null);
  const alertRef = useScrollIntoView(alert);
  const thisYear = useRef(new Date().getFullYear()).current;
  const years = useMemo(
    () => Array.from({ length: thisYear - 18 - OLDEST_YEAR + 1 }, (_, index) => thisYear - 18 - index),
    [thisYear],
  );

  const form = useForm({
    resolver: zodResolver(teacherRegistrationSchema),
    mode: 'onTouched',
    defaultValues: {
      lastName: '',
      firstName: '',
      middleName: '',
      birthYear: '',
      specialtySubjectId: '',
      login: '',
      password: '',
      confirmPassword: '',
    },
  });
  const { errors } = form.formState;
  const [lastName, firstName, middleName, birthYear, login] = useWatch({
    control: form.control,
    name: ['lastName', 'firstName', 'middleName', 'birthYear', 'login'],
  });
  const loginCheck = useLoginAvailability(login);
  const fromName = useMemo(() => loginFromNames(firstName, lastName), [firstName, lastName]);

  const onSubmit = form.handleSubmit(async (values) => {
    setAlert(null);
    if (loginCheck.state === 'taken') {
      form.setError('login', { type: 'server', message: TAKEN_MESSAGE }, { shouldFocus: true });
      return;
    }
    try {
      await api.post<{ status: 'PENDING' }>('/registration/teacher', values);
      onDone(values.login);
    } catch (caught) {
      if (caught instanceof ApiError) {
        if (caught.code === 'ALREADY_AUTHENTICATED') {
          onSignedIn();
          return;
        }
        if (caught.code === 'LOGIN_TAKEN') {
          await queryClient.invalidateQueries({ queryKey: registrationKeys.login(values.login) });
        }
        if (caught.code === 'INVALID_SUBJECT' || caught.code === 'REGISTRATION_CLOSED') {
          void queryClient.invalidateQueries({ queryKey: registrationKeys.options });
        }
      }
      const general = applyServerErrors(caught, form.setError, FIELDS, { LOGIN_TAKEN: 'login' });
      if (general) {
        const duplicate = caught instanceof ApiError && caught.code === 'DUPLICATE_PERSON';
        setAlert({
          title: duplicate ? 'Siz allaqachon ro‘yxatdan o‘tgansiz' : undefined,
          message: general,
          tone: duplicate ? 'warning' : 'danger',
        });
      }
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-7" noValidate>
      {alert && (
        <div ref={alertRef} tabIndex={-1} className="outline-none">
          <Alert tone={alert.tone} title={alert.title}>
            {alert.message}
          </Alert>
        </div>
      )}

      <FormSection title="Shaxsiy ma’lumotlar">
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
        <Field
          label="Tug‘ilgan yil"
          required
          error={errors.birthYear ? (birthYear ? errors.birthYear.message : 'Tug‘ilgan yilingizni tanlang') : undefined}
        >
          <Select autoComplete="bday-year" {...form.register('birthYear')}>
            <option value="">Yilni tanlang</option>
            {years.map((year) => (
              <option key={year} value={String(year)}>
                {year}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Mutaxassislik fani"
          required
          hint="Qaysi fandan dars berasiz."
          error={choiceError(errors.specialtySubjectId, 'Fanni tanlang')}
        >
          <Select {...form.register('specialtySubjectId')}>
            <option value="">Fanni tanlang</option>
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
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

      <Alert tone="info">
        Hisobingiz direktor o‘rinbosari tasdiqlagach ishlaydi. Tasdiqlanganini bilish uchun keyinroq shu login bilan
        kirib ko‘ring yoki direktor o‘rinbosaridan so‘rang.
      </Alert>

      <Button type="submit" size="lg" className="w-full" loading={form.formState.isSubmitting}>
        Ariza yuborish
      </Button>
    </form>
  );
}

function Submitted({ login }: { login: string }) {
  return (
    <div className="space-y-5 text-center">
      <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-emerald-50 ring-8 ring-emerald-50/60">
        <CheckCircle2 className="size-7 text-emerald-700" aria-hidden />
      </span>
      <p className="text-sm leading-relaxed text-slate-700">
        Arizangiz qabul qilindi. Direktor o‘rinbosari tasdiqlagach, shu login va parol bilan kirasiz.
      </p>
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
        <p className="text-xs text-slate-500">Loginingiz</p>
        <p className="mt-0.5 font-mono text-lg font-semibold break-all text-slate-900">{login}</p>
      </div>
      <p className="text-xs leading-relaxed text-slate-500">
        Login va parolingizni eslab qoling. Tasdiqlanishidan oldin kirmoqchi bo‘lsangiz, “tasdiq kutilmoqda” degan xabar
        chiqadi.
      </p>
      <ButtonLink href="/login" className="w-full">
        Kirish sahifasiga o‘tish
      </ButtonLink>
    </div>
  );
}

/** O‘qituvchining o‘zi ro‘yxatdan o‘tishi: ariza direktor o‘rinbosari tasdig‘iga yuboriladi. */
export function TeacherRegistration() {
  const { checking, recheck } = useSignedInRedirect();
  const options = useRegistrationOptions();
  const [submitted, setSubmitted] = useState<string | null>(null);
  const teacher = options.data?.teacher;

  return (
    <AuthCard
      title={submitted ? 'Ariza yuborildi' : 'O‘qituvchi sifatida ro‘yxatdan o‘tish'}
      description={submitted ? undefined : 'Ma’lumotlarni pasportingiz yoki ID-kartangizdagidek kiriting.'}
      footer={<RegisterFooter back={!submitted} />}
    >
      {submitted ? (
        <Submitted login={submitted} />
      ) : checking || options.isPending ? (
        <PageLoader />
      ) : options.isError ? (
        <ErrorState error={options.error} onRetry={() => options.refetch()} />
      ) : !teacher?.open ? (
        <ClosedNotice who="teacher" />
      ) : teacher.subjects.length === 0 ? (
        <ClosedNotice who="teacher" reason="no-subjects" />
      ) : (
        <TeacherForm
          subjects={teacher.subjects}
          onSignedIn={() => void recheck()}
          onDone={(login) => {
            setSubmitted(login);
            window.scrollTo({ top: 0 });
          }}
        />
      )}
    </AuthCard>
  );
}
