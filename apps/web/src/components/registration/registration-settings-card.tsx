'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link2 } from 'lucide-react';
import { useId, useSyncExternalStore } from 'react';
import { CopyButton } from '@/components/admin/temporary-password-dialog';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Alert, ErrorState, Skeleton } from '@/components/ui/feedback';
import { useToast } from '@/components/ui/toast';
import { api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import type { RegistrationSettings } from '@/lib/types';
import { registrationAdminKeys, useRegistrationSettings } from './queries';

/** Yoqish/o‘chirish tugmasi (`role="switch"`): holat yonida matn bilan ham yoziladi. */
function Switch({
  checked,
  onChange,
  disabled,
  labelledBy,
  describedBy,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  labelledBy: string;
  describedBy: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60',
        checked ? 'bg-brand-600' : 'bg-slate-300',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'inline-block size-5 rounded-full bg-white shadow-sm transition-transform',
          checked ? 'translate-x-5.5' : 'translate-x-0.5',
        )}
      />
    </button>
  );
}

function SettingRow({
  title,
  description,
  checked,
  pending,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  pending: boolean;
  onChange: (value: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4 py-3.5 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <p id={`${id}-label`} className="text-sm font-semibold text-slate-900">
          {title}
        </p>
        <p id={`${id}-description`} className="mt-0.5 text-sm text-slate-500">
          {description}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2.5 pt-0.5">
        <span aria-hidden className={cn('text-xs font-semibold', checked ? 'text-emerald-700' : 'text-slate-500')}>
          {checked ? 'Ochiq' : 'Yopiq'}
        </span>
        <Switch
          checked={checked}
          onChange={onChange}
          disabled={pending}
          labelledBy={`${id}-label`}
          describedBy={`${id}-description`}
        />
      </div>
    </div>
  );
}

const noSubscribe = () => () => {};

/** Sahifa manzili (serverda chizishda bo‘sh — faqat brauzerda ma’lum). */
function useOrigin() {
  return useSyncExternalStore(
    noSubscribe,
    () => window.location.origin,
    () => '',
  );
}

/** Ro‘yxatdan o‘tishni ochish/yopish (o‘quvchi va o‘qituvchi alohida) va ulashish uchun havola. */
export function RegistrationSettingsCard() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const settings = useRegistrationSettings();
  const link = `${useOrigin()}/register`;
  const update = useMutation({
    mutationFn: (patch: Partial<RegistrationSettings>) =>
      api.put<RegistrationSettings>('/registrations/settings', patch),
    onSuccess: (result, patch) => {
      queryClient.setQueryData(registrationAdminKeys.settings, result);
      const students = patch.studentRegistrationOpen !== undefined;
      const open = students ? result.studentRegistrationOpen : result.teacherRegistrationOpen;
      toast.success(
        `${students ? 'O‘quvchilar' : 'O‘qituvchilar'} uchun ro‘yxatdan o‘tish ${open ? 'ochildi' : 'yopildi'}.`,
      );
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const data = settings.data;

  return (
    <Card>
      <CardHeader
        title="Sozlamalar va havola"
        description="Ro‘yxatdan o‘tish o‘quvchilar va o‘qituvchilar uchun alohida ochiladi yoki yopiladi."
      />
      <CardBody className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="divide-y divide-slate-100">
          {settings.isPending ? (
            <div className="space-y-3">
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </div>
          ) : settings.isError ? (
            <ErrorState error={settings.error} onRetry={() => settings.refetch()} />
          ) : (
            <>
              <SettingRow
                title="O‘quvchilar ro‘yxatdan o‘tishi"
                description="O‘quvchi sinfini tanlab o‘zi ro‘yxatdan o‘tadi va darhol tizimga kiradi."
                checked={data!.studentRegistrationOpen}
                pending={update.isPending}
                onChange={(value) => update.mutate({ studentRegistrationOpen: value })}
              />
              <SettingRow
                title="O‘qituvchilar ro‘yxatdan o‘tishi"
                description="O‘qituvchi ariza qoldiradi; hisob siz tasdiqlagach ishlaydi."
                checked={data!.teacherRegistrationOpen}
                pending={update.isPending}
                onChange={(value) => update.mutate({ teacherRegistrationOpen: value })}
              />
            </>
          )}
        </div>
        <div className="space-y-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
              <Link2 className="size-3.5" aria-hidden />
              Ro‘yxatdan o‘tish havolasi
            </p>
            <p className="mt-1.5 font-mono text-sm font-semibold break-all text-slate-900">{link}</p>
            <div className="mt-3">
              <CopyButton text={link} label="Havolani nusxalash" />
            </div>
          </div>
          <p className="text-xs leading-relaxed text-slate-500">
            Havolani o‘quvchi va o‘qituvchilarga yuboring. Kirish sahifasida ham “Ro‘yxatdan o‘tish” havolasi bor.
            Parolini unutgan o‘quvchiga “Yangi o‘quvchilar” ro‘yxatidan yoki uning profilidan yangi vaqtinchalik parol
            bering.
          </p>
          {data && !data.studentRegistrationOpen && !data.teacherRegistrationOpen && (
            <Alert tone="warning">Hozir ikkalasi ham yopiq — havola orqali hech kim ro‘yxatdan o‘ta olmaydi.</Alert>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
