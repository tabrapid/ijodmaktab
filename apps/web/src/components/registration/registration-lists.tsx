'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { keepPreviousData, useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { Ban, Check, GraduationCap, KeyRound, Power, UserCheck, Users, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { formatDateTime, registrationRejectSchema, setUserStatusSchema } from '@ijod/shared';
import type { z } from 'zod';
import { FormDialog, applyServerErrors } from '@/components/admin/form-dialog';
import { adminKeys } from '@/components/admin/queries';
import { TemporaryPasswordDialog, accountRoleLabel } from '@/components/admin/temporary-password-dialog';
import { Avatar } from '@/components/avatar';
import { UserStatusBadge } from '@/components/status';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Alert, EmptyState, ErrorState, PageLoader } from '@/components/ui/feedback';
import { Field, Select, Textarea } from '@/components/ui/form';
import { Pagination } from '@/components/ui/pagination';
import { useToast } from '@/components/ui/toast';
import { api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import type { RegisteredStudentItem, RegisteredTeacherItem, RegistrationPage } from '@/lib/types';
import { registrationAdminKeys, registrationListPath, type RegistrationView } from './queries';

// ---------------------------------------------------------------- Umumiy

export const PERIODS = ['7', '30', '90', '365'] as const;
export type Period = (typeof PERIODS)[number];
const PERIOD_LABELS: Record<Period, string> = {
  '7': 'So‘nggi 7 kun',
  '30': 'So‘nggi 30 kun',
  '90': 'So‘nggi 90 kun',
  '365': 'So‘nggi 1 yil',
};

function PeriodSelect({ value, onChange }: { value: Period; onChange: (value: Period) => void }) {
  return (
    <Select
      aria-label="Davr"
      value={value}
      onChange={(event) => onChange(event.target.value as Period)}
      className="w-auto min-w-40"
    >
      {PERIODS.map((period) => (
        <option key={period} value={period}>
          {PERIOD_LABELS[period]}
        </option>
      ))}
    </Select>
  );
}

function useRegistrationList<T>(view: RegistrationView, days: number, page: number) {
  return useQuery({
    queryKey: registrationAdminKeys.list(view, days, page),
    queryFn: () => api.get<RegistrationPage<T>>(registrationListPath(view, days, page)),
    placeholderData: keepPreviousData,
  });
}

/** Amaldan keyin ro‘yxatlar, belgi soni va foydalanuvchilar bo‘limi yangilanadi. */
function useRefresh() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: registrationAdminKeys.all }),
      queryClient.invalidateQueries({ queryKey: adminKeys.users }),
    ]);
}

/** “2011-05-12” → “12.05.2011”. */
const formatBirthDate = (value: string | null) => (value ? value.split('-').reverse().join('.') : '—');

function Meta({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
      {items.map(([label, value]) => (
        <div key={label} className="flex min-w-0 gap-1">
          <dt className="shrink-0 text-slate-500">{label}:</dt>
          <dd className="min-w-0 break-words text-slate-700">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

const LoginValue = ({ login }: { login: string | null }) =>
  login ? <code className="font-mono text-[13px] break-all text-slate-900">{login}</code> : <>—</>;

/** Ro‘yxat qatori: telefonda amallar ism ostiga tushadi. */
function Row({
  fullName,
  title,
  meta,
  actions,
}: {
  fullName: string;
  title: ReactNode;
  meta: [string, ReactNode][];
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <Avatar name={fullName} size="md" />
        <div className="min-w-0 flex-1">
          {title}
          <Meta items={meta} />
        </div>
      </div>
      {actions && <div className="flex flex-wrap gap-2 pl-13 sm:shrink-0 sm:justify-end sm:pl-0">{actions}</div>}
    </div>
  );
}

function PersonName({ fullName, href, status }: { fullName: string; href?: string; status?: ReactNode }) {
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {href ? (
        <Link
          href={href}
          className="font-semibold break-words text-slate-900 underline-offset-2 hover:text-brand-700 hover:underline"
        >
          {fullName}
        </Link>
      ) : (
        <span className="font-semibold break-words text-slate-900">{fullName}</span>
      )}
      {status}
    </p>
  );
}

function ListBody<T extends { id: string }>({
  query,
  page,
  onPage,
  empty,
  children,
}: {
  query: UseQueryResult<RegistrationPage<T>>;
  page: number;
  onPage: (page: number) => void;
  empty: ReactNode;
  children: (item: T) => ReactNode;
}) {
  const data = query.data;
  // Oxirgi sahifadagi yagona yozuv ko‘rib chiqilsa — oldingi sahifaga qaytiladi.
  useEffect(() => {
    if (data && data.items.length === 0 && page > 1) onPage(page - 1);
  }, [data, page, onPage]);

  if (query.isPending) return <PageLoader />;
  if (query.isError) {
    return (
      <CardBody>
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      </CardBody>
    );
  }
  if (query.data.items.length === 0) return <>{empty}</>;
  return (
    <>
      <ul className={cn('divide-y divide-slate-100', query.isPlaceholderData && 'opacity-60')}>
        {query.data.items.map((item) => (
          <li key={item.id}>{children(item)}</li>
        ))}
      </ul>
      <div className="border-t border-slate-100 px-5 py-3">
        <Pagination page={query.data.page} pageSize={query.data.pageSize} total={query.data.total} onChange={onPage} />
      </div>
    </>
  );
}

// ---------------------------------------------------------------- Tasdiq kutayotgan o‘qituvchilar

function RejectForm({
  formId,
  onSubmit,
}: {
  formId: string;
  onSubmit: (values: z.output<typeof registrationRejectSchema>) => Promise<unknown>;
}) {
  const [error, setError] = useState<string | null>(null);
  const form = useForm({ resolver: zodResolver(registrationRejectSchema), defaultValues: { reason: '' } });
  const submit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await onSubmit(values);
    } catch (caught) {
      setError(applyServerErrors(caught, form.setError, ['reason']));
    }
  });
  return (
    <form id={formId} onSubmit={submit} className="space-y-4" noValidate>
      {error && <Alert tone="danger">{error}</Alert>}
      <p className="text-sm text-slate-600">
        Hisob butunlay o‘chiriladi va login yana bo‘shaydi. Ariza egasi xohlasa, qaytadan ro‘yxatdan o‘tishi mumkin.
        Amal audit jurnalida qayd etiladi.
      </p>
      <Field
        label="Sabab (ixtiyoriy)"
        hint="Sabab faqat audit jurnalida saqlanadi."
        error={form.formState.errors.reason?.message}
      >
        <Textarea rows={3} maxLength={300} autoFocus {...form.register('reason')} />
      </Field>
    </form>
  );
}

export function PendingTeachersList() {
  const toast = useToast();
  const refresh = useRefresh();
  const formId = useId();
  const [page, setPage] = useState(1);
  const [approving, setApproving] = useState<RegisteredTeacherItem | null>(null);
  const [rejecting, setRejecting] = useState<RegisteredTeacherItem | null>(null);
  const list = useRegistrationList<RegisteredTeacherItem>('pending', 30, page);

  const approve = useMutation({
    mutationFn: (item: RegisteredTeacherItem) => api.post(`/registrations/${item.id}/approve`),
    onSuccess: (_result, item) => toast.success(`${item.fullName} hisobi tasdiqlandi. O‘qituvchiga xabar yuborildi.`),
    onError: (error) => toast.error(errorMessage(error)),
    onSettled: async () => {
      setApproving(null);
      await refresh();
    },
  });
  const reject = useMutation({
    mutationFn: ({
      item,
      values,
    }: {
      item: RegisteredTeacherItem;
      values: z.output<typeof registrationRejectSchema>;
    }) => api.post(`/registrations/${item.id}/reject`, values),
    onSuccess: async (_result, { item }) => {
      toast.success(`${item.fullName} arizasi rad etildi, hisob o‘chirildi.`);
      setRejecting(null);
      await refresh();
    },
    // Xato formada ko‘rsatiladi; ariza boshqa o‘rinbosar tomonidan ko‘rib chiqilgan bo‘lishi mumkin.
    onError: () => void refresh(),
  });

  return (
    <Card>
      <CardHeader
        title="Tasdiq kutayotgan o‘qituvchilar"
        description="Tasdiqlangan o‘qituvchi maktab test bankini javob kalitlari bilan ko‘radi. Shaxsini aniqlab, keyin tasdiqlang."
      />
      <ListBody
        query={list}
        page={page}
        onPage={setPage}
        empty={
          <EmptyState
            icon={UserCheck}
            title="Tasdiq kutayotgan o‘qituvchi yo‘q"
            description="O‘qituvchi ro‘yxatdan o‘tsa, arizasi shu yerda paydo bo‘ladi va sizga bildirishnoma keladi."
          />
        }
      >
        {(item) => (
          <Row
            fullName={item.fullName}
            title={<PersonName fullName={item.fullName} />}
            meta={[
              ['Fan', item.specialtySubject?.name ?? '—'],
              ['Tug‘ilgan yil', item.birthYear ?? '—'],
              ['Login', <LoginValue key="login" login={item.login} />],
              ['Ariza yuborilgan', formatDateTime(item.createdAt)],
            ]}
            actions={
              item.manageable && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setRejecting(item)}
                    icon={<X className="size-4" aria-hidden />}
                  >
                    Rad etish
                  </Button>
                  <Button size="sm" onClick={() => setApproving(item)} icon={<Check className="size-4" aria-hidden />}>
                    Tasdiqlash
                  </Button>
                </>
              )
            }
          />
        )}
      </ListBody>

      <ConfirmDialog
        open={approving !== null}
        onClose={() => setApproving(null)}
        onConfirm={() => approving && approve.mutate(approving)}
        title="O‘qituvchi hisobini tasdiqlash"
        confirmLabel="Tasdiqlash"
        loading={approve.isPending}
      >
        <p>
          <span className="font-medium text-slate-900">{approving?.fullName}</span>
          {approving?.specialtySubject && ` (${approving.specialtySubject.name})`} hisobi faollashadi: u o‘z login va
          paroli bilan kirib, maktab test bankidan (javob kalitlari bilan) foydalana oladi.
        </p>
        <p className="mt-2">Tasdiqlashdan oldin shaxsini aniqlang. O‘qituvchiga bildirishnoma yuboriladi.</p>
      </ConfirmDialog>
      <FormDialog
        open={rejecting !== null}
        onClose={() => setRejecting(null)}
        title="Arizani rad etish"
        description={rejecting?.fullName}
        formId={formId}
        submitLabel="Rad etish"
        tone="danger"
        pending={reject.isPending}
      >
        {rejecting && (
          <RejectForm formId={formId} onSubmit={(values) => reject.mutateAsync({ item: rejecting, values })} />
        )}
      </FormDialog>
    </Card>
  );
}

// ---------------------------------------------------------------- Yangi o‘quvchilar

function BlockForm({
  formId,
  onSubmit,
}: {
  formId: string;
  onSubmit: (values: z.output<typeof setUserStatusSchema>) => Promise<unknown>;
}) {
  const [error, setError] = useState<string | null>(null);
  const form = useForm({
    resolver: zodResolver(setUserStatusSchema),
    defaultValues: { status: 'DEACTIVATED' as const, reason: '' },
  });
  const submit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await onSubmit(values);
    } catch (caught) {
      setError(applyServerErrors(caught, form.setError, ['reason']));
    }
  });
  return (
    <form id={formId} onSubmit={submit} className="space-y-4" noValidate>
      {error && <Alert tone="danger">{error}</Alert>}
      <p className="text-sm text-slate-600">
        O‘quvchi tizimga kira olmaydi, faol sessiyalari darhol yakunlanadi. Ma’lumotlari va sinf a’zoligi saqlanadi —
        keyin qayta faollashtirish mumkin.
      </p>
      <Field
        label="Sabab (ixtiyoriy)"
        hint="Masalan: soxta yoki takroriy ro‘yxatdan o‘tish."
        error={form.formState.errors.reason?.message}
      >
        <Textarea rows={3} maxLength={300} autoFocus {...form.register('reason')} />
      </Field>
    </form>
  );
}

export function NewStudentsList({ period, onPeriod }: { period: Period; onPeriod: (value: Period) => void }) {
  const toast = useToast();
  const refresh = useRefresh();
  const formId = useId();
  const [page, setPage] = useState(1);
  const [blocking, setBlocking] = useState<RegisteredStudentItem | null>(null);
  const [activating, setActivating] = useState<RegisteredStudentItem | null>(null);
  const [resetting, setResetting] = useState<RegisteredStudentItem | null>(null);
  const [credentials, setCredentials] = useState<{
    item: RegisteredStudentItem;
    login: string;
    temporaryPassword: string;
  } | null>(null);
  const days = Number(period);
  const list = useRegistrationList<RegisteredStudentItem>('students', days, page);

  const block = useMutation({
    mutationFn: ({ item, values }: { item: RegisteredStudentItem; values: z.output<typeof setUserStatusSchema> }) =>
      api.post(`/users/${item.id}/status`, values),
    onSuccess: async (_result, { item }) => {
      toast.success(`${item.fullName} hisobi bloklandi.`);
      setBlocking(null);
      await refresh();
    },
    onError: () => void refresh(),
  });
  const activate = useMutation({
    mutationFn: (item: RegisteredStudentItem) => api.post(`/users/${item.id}/status`, { status: 'ACTIVE' }),
    onSuccess: (_result, item) => toast.success(`${item.fullName} hisobi qayta faollashtirildi.`),
    onError: (error) => toast.error(errorMessage(error)),
    onSettled: async () => {
      setActivating(null);
      await refresh();
    },
  });
  const reset = useMutation({
    mutationFn: (item: RegisteredStudentItem) =>
      api.post<{ login: string; temporaryPassword: string }>(`/users/${item.id}/reset-password`),
    onSuccess: async (result, item) => {
      setResetting(null);
      setCredentials({ item, ...result });
      await refresh();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <Card>
      <CardHeader
        title="Yangi o‘quvchilar"
        description="O‘zi ro‘yxatdan o‘tgan o‘quvchilar. Soxta yoki takroriy hisobni bloklang; parolini unutganga yangi parol bering."
        actions={<PeriodSelect value={period} onChange={onPeriod} />}
      />
      <ListBody
        query={list}
        page={page}
        onPage={setPage}
        empty={
          <EmptyState
            icon={GraduationCap}
            title="Bu davrda ro‘yxatdan o‘tgan o‘quvchi yo‘q"
            description="Ro‘yxatdan o‘tish havolasini o‘quvchilarga yuboring. Ular sinfini tanlab o‘zi ro‘yxatdan o‘tadi."
          />
        }
      >
        {(item) => (
          <Row
            fullName={item.fullName}
            title={
              <PersonName
                fullName={item.fullName}
                href={`/management/students/${item.id}`}
                status={item.status !== 'ACTIVE' && <UserStatusBadge status={item.status} />}
              />
            }
            meta={[
              ['Sinf', item.className ?? 'biriktirilmagan'],
              ['Tug‘ilgan sana', formatBirthDate(item.birthDate)],
              ['JSHSHIR', item.hasPinfl ? 'kiritilgan' : 'kiritilmagan'],
              ['Login', <LoginValue key="login" login={item.login} />],
              ['Ro‘yxatdan o‘tgan', formatDateTime(item.createdAt)],
            ]}
            actions={
              !item.manageable ? undefined : item.status === 'ACTIVE' ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setResetting(item)}
                    icon={<KeyRound className="size-4" aria-hidden />}
                  >
                    Yangi parol berish
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setBlocking(item)}
                    className="text-red-700 hover:text-red-800"
                    icon={<Ban className="size-4" aria-hidden />}
                  >
                    Bloklash
                  </Button>
                </>
              ) : item.status === 'DEACTIVATED' ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setActivating(item)}
                  icon={<Power className="size-4" aria-hidden />}
                >
                  Faollashtirish
                </Button>
              ) : undefined
            }
          />
        )}
      </ListBody>

      <FormDialog
        open={blocking !== null}
        onClose={() => setBlocking(null)}
        title="Hisobni bloklash"
        description={
          blocking ? `${blocking.fullName}${blocking.className ? ` · ${blocking.className}` : ''}` : undefined
        }
        formId={formId}
        submitLabel="Bloklash"
        tone="danger"
        pending={block.isPending}
      >
        {blocking && <BlockForm formId={formId} onSubmit={(values) => block.mutateAsync({ item: blocking, values })} />}
      </FormDialog>
      <ConfirmDialog
        open={activating !== null}
        onClose={() => setActivating(null)}
        onConfirm={() => activating && activate.mutate(activating)}
        title="Hisobni qayta faollashtirish"
        confirmLabel="Faollashtirish"
        loading={activate.isPending}
      >
        <span className="font-medium text-slate-900">{activating?.fullName}</span> yana tizimga kira oladi.
      </ConfirmDialog>
      <ConfirmDialog
        open={resetting !== null}
        onClose={() => setResetting(null)}
        onConfirm={() => resetting && reset.mutate(resetting)}
        title="Yangi parol berish"
        confirmLabel="Yangi parol yaratish"
        loading={reset.isPending}
      >
        <p>
          <span className="font-medium text-slate-900">{resetting?.fullName}</span> uchun yangi vaqtinchalik parol
          yaratiladi va bir marta ko‘rsatiladi. Eski parol ishlamay qoladi.
        </p>
        <p className="mt-2">
          Parolni o‘quvchiga shaxsan ayting: u birinchi kirishda o‘z parolini o‘rnatadi. Login ham ko‘rsatiladi.
        </p>
      </ConfirmDialog>
      {credentials && (
        <TemporaryPasswordDialog
          open
          onClose={() => setCredentials(null)}
          reason="reset"
          fullName={credentials.item.fullName}
          roleLabel={accountRoleLabel(['STUDENT'], credentials.item.className)}
          login={credentials.login}
          password={credentials.temporaryPassword}
          profileHref={`/management/students/${credentials.item.id}`}
        />
      )}
    </Card>
  );
}

// ---------------------------------------------------------------- Yangi o‘qituvchilar

function approvalText(item: RegisteredTeacherItem) {
  if (item.status === 'PENDING') return 'kutilmoqda';
  if (!item.approvedAt) return '—';
  const when = formatDateTime(item.approvedAt);
  return item.approvedBy ? `${item.approvedBy.fullName}, ${when}` : when;
}

export function NewTeachersList({ period, onPeriod }: { period: Period; onPeriod: (value: Period) => void }) {
  const [page, setPage] = useState(1);
  const list = useRegistrationList<RegisteredTeacherItem>('teachers', Number(period), page);
  return (
    <Card>
      <CardHeader
        title="Yangi o‘qituvchilar"
        description="O‘zi ro‘yxatdan o‘tgan o‘qituvchilar va ularni kim tasdiqlagani."
        actions={<PeriodSelect value={period} onChange={onPeriod} />}
      />
      <ListBody
        query={list}
        page={page}
        onPage={setPage}
        empty={
          <EmptyState
            icon={Users}
            title="Bu davrda ro‘yxatdan o‘tgan o‘qituvchi yo‘q"
            description="Rad etilgan arizalar bu ro‘yxatda ko‘rinmaydi — ular audit jurnalida qayd etilgan."
          />
        }
      >
        {(item) => (
          <Row
            fullName={item.fullName}
            title={
              <PersonName
                fullName={item.fullName}
                href={`/admin/users/${item.id}`}
                status={<UserStatusBadge status={item.status} />}
              />
            }
            meta={[
              ['Fan', item.specialtySubject?.name ?? '—'],
              ['Tug‘ilgan yil', item.birthYear ?? '—'],
              ['Login', <LoginValue key="login" login={item.login} />],
              ['Ro‘yxatdan o‘tgan', formatDateTime(item.createdAt)],
              ['Tasdiq', approvalText(item)],
            ]}
          />
        )}
      </ListBody>
    </Card>
  );
}
