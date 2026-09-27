'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Archive, ImageOff, KeyRound, LockOpen, LogOut, Power, PowerOff, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { useForm } from 'react-hook-form';
import { USER_STATUSES, setUserStatusSchema, type UserStatus } from '@ijod/shared';
import type { z } from 'zod';
import { UserStatusBadge } from '@/components/status';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Alert } from '@/components/ui/feedback';
import { Field, Textarea } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { ApiError, api, errorMessage } from '@/lib/api';
import type { UserDetail } from '@/lib/types';
import { FormDialog, applyServerErrors } from './form-dialog';
import { adminKeys, useInvalidate } from './queries';
import { TemporaryPasswordDialog, accountRoleLabel } from './temporary-password-dialog';

const STATUS_ACTIONS: Record<
  UserStatus,
  { verb: string; title: string; explain: string; tone: 'primary' | 'danger'; icon: typeof Power }
> = {
  ACTIVE: {
    verb: 'Faollashtirish',
    title: 'Hisobni faollashtirish',
    explain:
      'Foydalanuvchi yana tizimga kira oladi. Arxivlashda yopilgan sinf a’zoligi avtomatik tiklanmaydi — kerak bo‘lsa, sinfga qayta biriktiring.',
    tone: 'primary',
    icon: Power,
  },
  DEACTIVATED: {
    verb: 'Faolsizlantirish',
    title: 'Hisobni faolsizlantirish',
    explain:
      'Foydalanuvchi tizimga kira olmaydi, barcha faol sessiyalari darhol yakunlanadi. Ma’lumotlari va sinf a’zoligi saqlanadi.',
    tone: 'danger',
    icon: PowerOff,
  },
  ARCHIVED: {
    verb: 'Arxivlash',
    title: 'Hisobni arxivlash',
    explain:
      'Tizimga kirish yopiladi, faol sinf a’zoligi tugatiladi va sessiyalar yakunlanadi. Natijalar va portfolio tarix sifatida saqlanadi. Bitiruvchilar va maktabdan ketganlar uchun.',
    tone: 'danger',
    icon: Archive,
  },
};

/** Foydalanuvchi ma’lumotlari o‘zgargach tegishli so‘rovlarni yangilaydi. */
function useUserUpdated(userId: string) {
  const queryClient = useQueryClient();
  const invalidate = useInvalidate();
  return async (user?: UserDetail) => {
    if (user) queryClient.setQueryData(adminKeys.user(userId), user);
    await invalidate(adminKeys.users, adminKeys.dashboard, adminKeys.classes, adminKeys.staffAll);
  };
}

// ---------------------------------------------------------------- Holat

function StatusForm({
  formId,
  status,
  onSubmit,
}: {
  formId: string;
  status: UserStatus;
  onSubmit: (values: z.output<typeof setUserStatusSchema>) => Promise<unknown>;
}) {
  const [error, setError] = useState<string | null>(null);
  const form = useForm({ resolver: zodResolver(setUserStatusSchema), defaultValues: { status, reason: '' } });
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
      <p className="text-sm text-slate-600">{STATUS_ACTIONS[status].explain}</p>
      <Field
        label="Sabab (ixtiyoriy)"
        hint="Sabab hisob ma’lumotlarida va audit jurnalida saqlanadi."
        error={form.formState.errors.reason?.message}
      >
        <Textarea rows={3} maxLength={300} autoFocus {...form.register('reason')} />
      </Field>
    </form>
  );
}

export function StatusDialog({
  user,
  status,
  onClose,
}: {
  user: UserDetail;
  status: UserStatus | null;
  onClose: () => void;
}) {
  const formId = useId();
  const toast = useToast();
  const updated = useUserUpdated(user.id);
  const mutation = useMutation({
    mutationFn: (values: z.output<typeof setUserStatusSchema>) =>
      api.post<UserDetail>(`/users/${user.id}/status`, values),
    onSuccess: async (result) => {
      toast.success(`Hisob holati o‘zgartirildi: ${result.fullName}.`);
      onClose();
      await updated(result);
    },
  });
  const action = status ? STATUS_ACTIONS[status] : null;
  return (
    <FormDialog
      open={status !== null}
      onClose={onClose}
      title={action?.title ?? ''}
      description={user.fullName}
      formId={formId}
      submitLabel={action?.verb}
      tone={action?.tone}
      pending={mutation.isPending}
    >
      {status && <StatusForm formId={formId} status={status} onSubmit={(values) => mutation.mutateAsync(values)} />}
    </FormDialog>
  );
}

export function StatusCard({
  user,
  disabled,
  onChange,
}: {
  user: UserDetail;
  disabled: boolean;
  onChange: (status: UserStatus) => void;
}) {
  return (
    <Card>
      <CardHeader title="Hisob holati" />
      <CardBody className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-slate-500">Hozirgi holat:</span>
          <UserStatusBadge status={user.status} />
        </div>
        {user.statusReason && user.status !== 'ACTIVE' && (
          <p className="text-sm text-slate-600">
            <span className="text-slate-500">Sabab:</span> {user.statusReason}
          </p>
        )}
        <div className="flex flex-col gap-2">
          {USER_STATUSES.filter((status) => status !== user.status).map((status) => {
            const action = STATUS_ACTIONS[status];
            const Icon = action.icon;
            return (
              <Button
                key={status}
                variant="outline"
                className="justify-start"
                disabled={disabled}
                onClick={() => onChange(status)}
                icon={<Icon className="size-4" aria-hidden />}
              >
                {action.verb}
              </Button>
            );
          })}
        </div>
      </CardBody>
    </Card>
  );
}

// ---------------------------------------------------------------- Kirish va xavfsizlik

type SecurityAction = 'reset' | 'unlock' | 'revoke';

export function SecurityCard({ user, disabled }: { user: UserDetail; disabled: boolean }) {
  const toast = useToast();
  const updated = useUserUpdated(user.id);
  const [confirm, setConfirm] = useState<SecurityAction | null>(null);
  const [credentials, setCredentials] = useState<{ login: string; temporaryPassword: string } | null>(null);

  const reset = useMutation({
    mutationFn: () => api.post<{ login: string; temporaryPassword: string }>(`/users/${user.id}/reset-password`),
    onSuccess: async (result) => {
      setConfirm(null);
      setCredentials(result);
      await updated();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const unlock = useMutation({
    mutationFn: () => api.post(`/users/${user.id}/unlock`),
    onSuccess: async () => {
      setConfirm(null);
      toast.success('Hisob blokdan chiqarildi.');
      await updated();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const revoke = useMutation({
    mutationFn: () => api.post<{ revoked: number }>(`/users/${user.id}/revoke-sessions`),
    onSuccess: ({ revoked }) => {
      setConfirm(null);
      toast.success(revoked > 0 ? `${revoked} ta faol sessiya yakunlandi.` : 'Faol sessiya yo‘q edi.');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const dialogs: Record<
    SecurityAction,
    { title: string; body: string; label: string; run: () => void; pending: boolean }
  > = {
    reset: {
      title: 'Parolni tiklash',
      body: 'Yangi vaqtinchalik parol yaratiladi va bir marta ko‘rsatiladi. Eski parol ishlamay qoladi, barcha faol sessiyalar yakunlanadi, blok olib tashlanadi.',
      label: 'Parolni tiklash',
      run: () => reset.mutate(),
      pending: reset.isPending,
    },
    unlock: {
      title: 'Blokdan chiqarish',
      body: 'Noto‘g‘ri parol urinishlari hisobi nolga tushiriladi va foydalanuvchi darhol qayta kira oladi.',
      label: 'Blokdan chiqarish',
      run: () => unlock.mutate(),
      pending: unlock.isPending,
    },
    revoke: {
      title: 'Sessiyalarni bekor qilish',
      body: 'Foydalanuvchi barcha qurilmalardan chiqariladi va qayta kirishi kerak bo‘ladi. Boshlangan test urinishlari saqlanib qoladi.',
      label: 'Bekor qilish',
      run: () => revoke.mutate(),
      pending: revoke.isPending,
    },
  };
  const active = confirm ? dialogs[confirm] : null;

  return (
    <Card>
      <CardHeader title="Kirish va xavfsizlik" />
      <CardBody className="flex flex-col gap-2">
        <Button
          variant="outline"
          className="justify-start"
          disabled={disabled}
          onClick={() => setConfirm('reset')}
          icon={<KeyRound className="size-4" aria-hidden />}
        >
          Parolni tiklash
        </Button>
        {user.lockedUntil && (
          <Button
            variant="outline"
            className="justify-start"
            disabled={disabled}
            onClick={() => setConfirm('unlock')}
            icon={<LockOpen className="size-4" aria-hidden />}
          >
            Blokdan chiqarish
          </Button>
        )}
        <Button
          variant="outline"
          className="justify-start"
          disabled={disabled}
          onClick={() => setConfirm('revoke')}
          icon={<LogOut className="size-4" aria-hidden />}
        >
          Sessiyalarni bekor qilish
        </Button>
      </CardBody>
      <ConfirmDialog
        open={active !== null}
        onClose={() => setConfirm(null)}
        onConfirm={() => active?.run()}
        title={active?.title ?? ''}
        confirmLabel={active?.label}
        loading={active?.pending}
      >
        {active?.body}
      </ConfirmDialog>
      {credentials && (
        <TemporaryPasswordDialog
          open
          onClose={() => setCredentials(null)}
          reason="reset"
          fullName={user.fullName}
          roleLabel={accountRoleLabel(user.roles, user.enrollments.find((item) => item.endsOn === null)?.class.name)}
          login={credentials.login}
          password={credentials.temporaryPassword}
        />
      )}
    </Card>
  );
}

// ---------------------------------------------------------------- Butunlay o‘chirish

export function DeleteUserCard({
  user,
  disabled,
  onArchive,
}: {
  user: UserDetail;
  disabled: boolean;
  onArchive: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const invalidate = useInvalidate();
  const [open, setOpen] = useState(false);
  const remove = useMutation({
    mutationFn: () => api.delete(`/users/${user.id}`),
    onSuccess: async () => {
      toast.success(`${user.fullName} hisobi o‘chirildi.`);
      setOpen(false);
      router.replace('/admin/users');
      await invalidate(adminKeys.users, adminKeys.dashboard, adminKeys.classes, adminKeys.staffAll);
    },
  });
  const hasHistory = remove.error instanceof ApiError && remove.error.code === 'HAS_HISTORY';
  const close = () => {
    setOpen(false);
    remove.reset();
  };

  return (
    <Card className="border-red-200">
      <CardHeader title="Butunlay o‘chirish" />
      <CardBody className="space-y-3">
        <p className="text-sm text-slate-600">
          Faqat xato yaratilgan va hech qanday tarixiy ma’lumoti (kirishlar, testlar, natijalar) bo‘lmagan hisob uchun.
          Aks holda hisobni arxivlang.
        </p>
        <Button
          variant="danger"
          disabled={disabled}
          onClick={() => setOpen(true)}
          icon={<Trash2 className="size-4" aria-hidden />}
        >
          Butunlay o‘chirish
        </Button>
      </CardBody>
      <ConfirmDialog
        open={open}
        onClose={close}
        onConfirm={() => remove.mutate()}
        title="Hisobni butunlay o‘chirish"
        confirmLabel="O‘chirish"
        tone="danger"
        loading={remove.isPending}
      >
        <div className="space-y-3">
          <p>
            <span className="font-medium text-slate-900">{user.fullName}</span> hisobi va unga bog‘liq sinf a’zoliklari
            qaytarib bo‘lmaydigan tarzda o‘chiriladi. Bu amal audit jurnalida qayd etiladi.
          </p>
          {remove.isError && (
            <Alert
              tone={hasHistory ? 'warning' : 'danger'}
              title={hasHistory ? 'Hisobni o‘chirib bo‘lmaydi' : undefined}
              action={
                hasHistory ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      close();
                      onArchive();
                    }}
                  >
                    Arxivlash
                  </Button>
                ) : undefined
              }
            >
              {errorMessage(remove.error)}
            </Alert>
          )}
        </div>
      </ConfirmDialog>
    </Card>
  );
}

// ---------------------------------------------------------------- Profil rasmi (moderatsiya)

/** Nomaqbul profil rasmini olib tashlash (foydalanuvchi keyin yangisini yuklashi mumkin). */
export function RemoveAvatarButton({ user }: { user: UserDetail }) {
  const toast = useToast();
  const updated = useUserUpdated(user.id);
  const [open, setOpen] = useState(false);
  const remove = useMutation({
    mutationFn: () => api.delete<UserDetail>(`/users/${user.id}/avatar`),
    onSuccess: async (result) => {
      setOpen(false);
      toast.success('Profil rasmi olib tashlandi.');
      await updated(result);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        icon={<ImageOff className="size-4" aria-hidden />}
      >
        Rasmni olib tashlash
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={() => remove.mutate()}
        title="Profil rasmini olib tashlash"
        confirmLabel="Olib tashlash"
        tone="danger"
        loading={remove.isPending}
      >
        <span className="font-medium text-slate-900">{user.fullName}</span> profil rasmi o‘chiriladi va o‘rniga bosh
        harflar ko‘rsatiladi. Nomaqbul rasmlar uchun. Amal audit jurnalida qayd etiladi.
      </ConfirmDialog>
    </>
  );
}
