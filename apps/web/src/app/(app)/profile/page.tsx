'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, KeyRound, LogOut, Monitor, ShieldCheck, ShieldOff, Smartphone, Trash2 } from 'lucide-react';
import Link from 'next/link';
import QRCode from 'qrcode';
import { useId, useState, type FormEvent } from 'react';
import { formatDateTime, formatHumanDateTime, formatInternalId } from '@ijod/shared';
import { InfoList } from '@/components/admin/info-list';
import { Avatar } from '@/components/avatar';
import { AvatarUploadDialog, useRemoveOwnAvatar } from '@/components/avatar-upload-dialog';
import { RoleBadges } from '@/components/status';
import { TeacherReferenceLinkCard } from '@/components/teacher-reference/reference-link-card';
import { Badge } from '@/components/ui/badge';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card, CardBody, CardHeader, PageHeader } from '@/components/ui/card';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { Alert, EmptyState, ErrorState, PageLoader } from '@/components/ui/feedback';
import { Field, Input } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { api, errorMessage } from '@/lib/api';
import { ME_KEY, hasRole, useMe } from '@/lib/auth';
import type { AuthSessionItem, Me } from '@/lib/types';

const SESSIONS_KEY = ['auth', 'sessions'] as const;

/** Brauzer va operatsion tizimni user-agent satridan taxminan aniqlaydi. */
function describeDevice(userAgent: string | null) {
  if (!userAgent) return { label: 'Noma’lum qurilma', mobile: false };
  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /OPR\/|Opera/.test(userAgent)
      ? 'Opera'
      : /YaBrowser/.test(userAgent)
        ? 'Yandex Browser'
        : /Chrome\//.test(userAgent)
          ? 'Chrome'
          : /Firefox\//.test(userAgent)
            ? 'Firefox'
            : /Safari\//.test(userAgent)
              ? 'Safari'
              : null;
  const os = /Windows/.test(userAgent)
    ? 'Windows'
    : /Android/.test(userAgent)
      ? 'Android'
      : /iPhone|iPad|iPod/.test(userAgent)
        ? 'iOS'
        : /Mac OS X|Macintosh/.test(userAgent)
          ? 'macOS'
          : /CrOS/.test(userAgent)
            ? 'ChromeOS'
            : /Linux/.test(userAgent)
              ? 'Linux'
              : null;
  const label = [browser, os].filter(Boolean).join(' · ') || userAgent.slice(0, 60);
  return { label, mobile: /Mobile|Android|iPhone|iPad/.test(userAgent) };
}

function CodeInput({
  value,
  onChange,
  ...aria
}: {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}) {
  return (
    <Input
      {...aria}
      inputMode="numeric"
      autoComplete="one-time-code"
      maxLength={6}
      className="max-w-48 text-center text-lg tracking-[0.4em] tabular"
      value={value}
      onChange={(event) => onChange(event.target.value.replace(/\D/g, '').slice(0, 6))}
    />
  );
}

// ---------------------------------------------------------------- Profil rasmi

function AvatarCard({ me }: { me: Me }) {
  const [open, setOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const remove = useRemoveOwnAvatar(() => setConfirmRemove(false));
  // Xodimlarning sinfdoshlari yo‘q — izoh roliga mos yoziladi.
  const student = hasRole(me, 'STUDENT') && !hasRole(me, 'TEACHER', 'DEPUTY', 'ADMIN', 'SUPER_ADMIN');
  return (
    <Card>
      <CardBody className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="group relative shrink-0 rounded-full focus-visible:outline-2 focus-visible:outline-offset-4"
          aria-label="Profil rasmini o‘zgartirish"
        >
          <Avatar
            name={me.fullName}
            src={me.avatarUrl}
            size="xl"
            className="transition-opacity group-hover:opacity-90"
          />
          <span
            className="absolute right-0 bottom-0 flex size-8 items-center justify-center rounded-full bg-brand-600 text-white shadow-sm ring-2 ring-surface"
            aria-hidden
          >
            <Camera className="size-4" />
          </span>
        </button>
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <p className="text-lg font-semibold break-words text-slate-900">{me.fullName}</p>
            <div className="mt-1 flex justify-center sm:justify-start">
              <RoleBadges roles={me.roles} />
            </div>
          </div>
          <p className="text-sm text-slate-500">
            {me.avatarUrl
              ? 'Profil rasmingiz sarlavhada va ro‘yxatlarda ko‘rinadi.'
              : `Profil rasmini qo‘shing — ${
                  student ? 'o‘qituvchilar va sinfdoshlaringiz' : 'hamkasblaringiz va o‘quvchilar'
                } sizni ro‘yxatlarda tezroq taniydi.`}
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2 sm:flex-col sm:items-stretch">
          <Button variant="outline" onClick={() => setOpen(true)} icon={<Camera className="size-4" aria-hidden />}>
            {me.avatarUrl ? 'Rasmni o‘zgartirish' : 'Rasm qo‘shish'}
          </Button>
          {me.avatarUrl && (
            <Button
              variant="ghost"
              className="text-red-700 hover:bg-red-50 hover:text-red-800"
              onClick={() => setConfirmRemove(true)}
              icon={<Trash2 className="size-4" aria-hidden />}
            >
              Olib tashlash
            </Button>
          )}
        </div>
      </CardBody>
      <AvatarUploadDialog open={open} onClose={() => setOpen(false)} />
      <ConfirmDialog
        open={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        onConfirm={() => remove.mutate()}
        title="Profil rasmini olib tashlash"
        confirmLabel="Olib tashlash"
        tone="danger"
        loading={remove.isPending}
      >
        Rasm o‘chiriladi va o‘rniga ismingizning bosh harflari ko‘rsatiladi. Keyin istalgan vaqtda yangi rasm qo‘shish
        mumkin.
      </ConfirmDialog>
    </Card>
  );
}

// ---------------------------------------------------------------- Ma’lumotlar va parol

function AccountCard({ me }: { me: Me }) {
  const manager = hasRole(me, 'ADMIN', 'SUPER_ADMIN');
  return (
    <Card>
      <CardHeader title="Shaxsiy ma’lumotlar" />
      <CardBody className="space-y-4">
        <InfoList
          items={[
            { label: 'F.I.Sh.', value: me.fullName },
            { label: 'Login', value: <span className="font-mono">{me.login}</span> },
            { label: 'Ichki ID', value: <span className="font-mono tabular">{formatInternalId(me.internalId)}</span> },
            { label: 'Rollar', value: <RoleBadges roles={me.roles} /> },
            { label: 'Kirish turi', value: me.realm === 'SYSTEM' ? 'Tizim boshqaruvi' : 'Maktab hisobi' },
          ]}
        />
        <p className="text-xs text-slate-500">
          {manager ? (
            <>
              Ism-familiya va loginni{' '}
              <Link href={`/admin/users/${me.id}`} className="font-medium text-brand-700 hover:underline">
                foydalanuvchi sahifasida
              </Link>{' '}
              o‘zgartirish mumkin.
            </>
          ) : (
            'Ism-familiya yoki loginda xato bo‘lsa, maktab administratoriga murojaat qiling.'
          )}
        </p>
      </CardBody>
    </Card>
  );
}

function PasswordCard() {
  return (
    <Card>
      <CardHeader title="Parol" />
      <CardBody className="space-y-3">
        <p className="text-sm text-slate-600">
          Parolni muntazam almashtirib turing va hech kimga aytmang. Almashtirilgach boshqa qurilmalardagi sessiyalar
          yakunlanadi.
        </p>
        <ButtonLink href="/change-password" variant="outline" icon={<KeyRound className="size-4" aria-hidden />}>
          Parolni almashtirish
        </ButtonLink>
      </CardBody>
    </Card>
  );
}

// ---------------------------------------------------------------- Faol sessiyalar

function SessionsCard() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [confirmAll, setConfirmAll] = useState(false);
  const sessions = useQuery({ queryKey: SESSIONS_KEY, queryFn: () => api.get<AuthSessionItem[]>('/auth/sessions') });
  const others = (sessions.data ?? []).filter((session) => !session.current);

  const revoke = useMutation({
    mutationFn: (id: string) => api.delete(`/auth/sessions/${id}`),
    onSuccess: () => toast.success('Sessiya yakunlandi.'),
    onError: (error) => toast.error(errorMessage(error)),
    onSettled: () => queryClient.invalidateQueries({ queryKey: SESSIONS_KEY }),
  });
  const revokeAll = useMutation({
    mutationFn: async (ids: string[]) => {
      for (const id of ids) await api.delete(`/auth/sessions/${id}`);
      return ids.length;
    },
    onSuccess: (count) => {
      setConfirmAll(false);
      toast.success(`${count} ta sessiya yakunlandi.`);
    },
    onError: (error) => toast.error(errorMessage(error)),
    onSettled: () => queryClient.invalidateQueries({ queryKey: SESSIONS_KEY }),
  });

  return (
    <Card>
      <CardHeader
        title="Faol sessiyalar"
        description="Hisobingizga kirilgan qurilmalar. Tanimagan qurilmani darhol yakunlang va parolni almashtiring."
        actions={
          others.length > 0 ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setConfirmAll(true)}
              icon={<LogOut className="size-4" aria-hidden />}
            >
              Boshqa barchasini yakunlash
            </Button>
          ) : undefined
        }
      />
      {sessions.isPending ? (
        <PageLoader />
      ) : sessions.isError ? (
        <CardBody>
          <ErrorState error={sessions.error} onRetry={() => sessions.refetch()} />
        </CardBody>
      ) : sessions.data.length === 0 ? (
        <EmptyState title="Faol sessiya yo‘q" />
      ) : (
        <ul className="divide-y divide-slate-100">
          {sessions.data.map((session) => {
            const device = describeDevice(session.userAgent);
            const Icon = device.mobile ? Smartphone : Monitor;
            const pending = revoke.isPending && revoke.variables === session.id;
            return (
              <li key={session.id} className="flex flex-col gap-3 px-5 py-3 sm:flex-row sm:items-center">
                <Icon className="hidden size-5 shrink-0 text-slate-400 sm:block" aria-hidden />
                <div className="min-w-0 flex-1 text-sm">
                  <p
                    className="flex flex-wrap items-center gap-2 font-medium text-slate-900"
                    title={session.userAgent ?? undefined}
                  >
                    {device.label}
                    {session.current && <Badge tone="green">Joriy qurilma</Badge>}
                  </p>
                  <p className="text-xs text-slate-500">
                    IP: {session.ip ?? '—'} · Kirgan: {formatDateTime(session.createdAt)} · So‘nggi faollik:{' '}
                    {formatHumanDateTime(session.lastSeenAt)}
                  </p>
                </div>
                {!session.current && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => revoke.mutate(session.id)}
                    loading={pending}
                    disabled={revokeAll.isPending}
                  >
                    Yakunlash
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <ConfirmDialog
        open={confirmAll}
        onClose={() => setConfirmAll(false)}
        onConfirm={() => revokeAll.mutate(others.map((session) => session.id))}
        title="Boshqa sessiyalarni yakunlash"
        confirmLabel="Yakunlash"
        tone="danger"
        loading={revokeAll.isPending}
      >
        Joriy qurilmadan tashqari barcha qurilmalarda ({others.length} ta) hisobingizdan chiqiladi.
      </ConfirmDialog>
    </Card>
  );
}

// ---------------------------------------------------------------- Ikki bosqichli kirish

function MfaSetup({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [code, setCode] = useState('');
  const start = useMutation({
    mutationFn: async () => {
      const result = await api.post<{ secret: string; otpauthUrl: string }>('/auth/mfa/setup');
      return { ...result, qr: await QRCode.toDataURL(result.otpauthUrl, { margin: 1, width: 200 }) };
    },
  });
  const confirm = useMutation({
    mutationFn: () => api.post('/auth/mfa/confirm', { code }),
    onSuccess: onDone,
    onError: () => setCode(''),
  });
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (code.length === 6) confirm.mutate();
  };

  if (!start.data) {
    return (
      <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
        <p>
          Telefoningizga autentifikator ilovasini (Google Authenticator, Microsoft Authenticator va h.k.) o‘rnating.
          Keyingi qadamda QR kod ko‘rsatiladi.
        </p>
        {start.isError && <Alert tone="danger">{errorMessage(start.error)}</Alert>}
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => start.mutate()} loading={start.isPending}>
            QR kodni ko‘rsatish
          </Button>
          <Button variant="ghost" onClick={onCancel} disabled={start.isPending}>
            Bekor qilish
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={start.data.qr}
          alt="Autentifikator ilovasi uchun QR kod"
          width={200}
          height={200}
          className="size-50 shrink-0 self-center rounded-lg border border-slate-200 bg-surface"
        />
        <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700">
          <li>Ilovada “Hisob qo‘shish” → “QR kodni skanerlash”ni tanlang.</li>
          <li>
            Skanerlab bo‘lmasa, kalitni qo‘lda kiriting:
            <code className="mt-1 block rounded bg-surface px-2 py-1 font-mono text-[13px] break-all text-slate-800">
              {start.data.secret}
            </code>
          </li>
          <li>Ilova ko‘rsatgan 6 xonali kodni pastga kiriting.</li>
        </ol>
      </div>
      {confirm.isError && <Alert tone="danger">{errorMessage(confirm.error)}</Alert>}
      <Field label="6 xonali kod">
        <CodeInput value={code} onChange={setCode} />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={confirm.isPending} disabled={code.length !== 6}>
          Tasdiqlash va yoqish
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={confirm.isPending}>
          Bekor qilish
        </Button>
      </div>
    </form>
  );
}

function DisableMfaDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [code, setCode] = useState('');
  const disable = useMutation({
    mutationFn: () => api.post('/auth/mfa/disable', { code }),
    onSuccess: () => {
      setCode('');
      onDone();
    },
    onError: () => setCode(''),
  });
  const close = () => {
    setCode('');
    disable.reset();
    onClose();
  };
  const formId = useId();
  return (
    <Dialog
      open={open}
      onClose={close}
      title="Ikki bosqichli kirishni o‘chirish"
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={close} disabled={disable.isPending}>
            Bekor qilish
          </Button>
          <Button type="submit" form={formId} variant="danger" loading={disable.isPending} disabled={code.length !== 6}>
            O‘chirish
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (code.length === 6) disable.mutate();
        }}
      >
        <p className="text-sm text-slate-600">
          Tasdiqlash uchun autentifikator ilovasidagi joriy 6 xonali kodni kiriting. Shundan so‘ng kirishda faqat parol
          so‘raladi.
        </p>
        {disable.isError && <Alert tone="danger">{errorMessage(disable.error)}</Alert>}
        <Field label="6 xonali kod">
          <CodeInput value={code} onChange={setCode} />
        </Field>
      </form>
    </Dialog>
  );
}

function MfaCard({ me }: { me: Me }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<'idle' | 'setup'>('idle');
  const [disableOpen, setDisableOpen] = useState(false);
  const enabled = me.mfa.enabled;
  const system = me.realm === 'SYSTEM';
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ME_KEY }),
      queryClient.invalidateQueries({ queryKey: SESSIONS_KEY }),
    ]);

  return (
    <Card>
      <CardHeader
        title="Ikki bosqichli kirish (2FA)"
        description="Paroldan tashqari telefoningizdagi ilova bergan kod so‘raladi — parol o‘g‘irlansa ham hisob himoyalangan bo‘ladi."
        actions={
          enabled ? (
            <Badge tone="green">
              <ShieldCheck className="size-3.5" aria-hidden />
              Yoqilgan{system ? ' (majburiy)' : ''}
            </Badge>
          ) : (
            <Badge tone="gray">
              <ShieldOff className="size-3.5" aria-hidden />
              O‘chirilgan
            </Badge>
          )
        }
      />
      <CardBody className="space-y-4">
        {mode === 'setup' ? (
          <MfaSetup
            onCancel={() => setMode('idle')}
            onDone={async () => {
              setMode('idle');
              toast.success('Ikki bosqichli kirish yoqildi. Boshqa qurilmalardagi sessiyalar yakunlandi.');
              await refresh();
            }}
          />
        ) : enabled ? (
          <>
            <p className="text-sm text-slate-600">
              {system
                ? 'Super admin hisobi uchun ikki bosqichli kirish majburiy va uni o‘chirib bo‘lmaydi.'
                : 'Har kirishda autentifikator ilovasidagi kod so‘raladi.'}{' '}
              Telefon almashtirilsa, autentifikatorni qayta sozlang.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => setMode('setup')}
                icon={<KeyRound className="size-4" aria-hidden />}
              >
                Autentifikatorni qayta sozlash
              </Button>
              {!system && (
                <Button
                  variant="ghost"
                  className="text-red-700 hover:bg-red-50 hover:text-red-800"
                  onClick={() => setDisableOpen(true)}
                >
                  O‘chirish
                </Button>
              )}
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-slate-600">
              Xodim hisoblari (o‘qituvchi, rahbariyat, administrator) uchun ikki bosqichli kirishni yoqish tavsiya
              etiladi.
            </p>
            <Button onClick={() => setMode('setup')} icon={<ShieldCheck className="size-4" aria-hidden />}>
              Yoqish
            </Button>
          </>
        )}
      </CardBody>
      <DisableMfaDialog
        open={disableOpen}
        onClose={() => setDisableOpen(false)}
        onDone={async () => {
          setDisableOpen(false);
          toast.success('Ikki bosqichli kirish o‘chirildi.');
          await refresh();
        }}
      />
    </Card>
  );
}

// ---------------------------------------------------------------- Sahifa

export default function ProfilePage() {
  const { data: me } = useMe();
  if (!me) return <PageLoader />;
  const staff = hasRole(me, 'TEACHER', 'DEPUTY', 'ADMIN');
  const showMfa = staff || me.mfa.enabled || me.realm === 'SYSTEM';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mening hisobim"
        description="Profil rasmi, shaxsiy ma’lumotlar, parol, faol sessiyalar va ikki bosqichli kirish."
      />
      <AvatarCard me={me} />
      {/* O‘qituvchining ma’lumotnomasi (ta’lim, toifa, sertifikatlar, ustozlik) — alohida sahifada. */}
      {hasRole(me, 'TEACHER') && <TeacherReferenceLinkCard />}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <SessionsCard />
          {showMfa && <MfaCard me={me} />}
        </div>
        <div className="space-y-6">
          <AccountCard me={me} />
          <PasswordCard />
        </div>
      </div>
    </div>
  );
}
