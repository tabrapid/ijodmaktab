'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowRightLeft, KeyRound, LockOpen, ScrollText, UserMinus, UserPlus, UserRound } from 'lucide-react';
import { useState } from 'react';
import { formatDateTime } from '@ijod/shared';
import { EndEnrollmentDialog, EnrollDialog, TransferDialog } from '@/components/admin/enrollment-dialogs';
import { InfoList } from '@/components/admin/info-list';
import { adminKeys } from '@/components/admin/queries';
import { CopyButton, TemporaryPasswordDialog, accountRoleLabel } from '@/components/admin/temporary-password-dialog';
import { StatusCard, StatusDialog, type ManualStatus } from '@/components/admin/user-account-actions';
import { Badge } from '@/components/ui/badge';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Alert, ErrorState, PageLoader } from '@/components/ui/feedback';
import { useToast } from '@/components/ui/toast';
import { api, errorMessage } from '@/lib/api';
import type { ManagementStudentProfile, UserDetail } from '@/lib/types';
import { useRefreshStudents } from './queries';

type Credentials = { login: string; temporaryPassword: string };

/**
 * Login va parol. Parollar ochiq saqlanmaydi: unutilgan parol o‘rniga yangi vaqtinchalik parol beriladi
 * (bir marta ko‘rsatiladi, chop etiladigan varaqa bilan), o‘quvchi birinchi kirishda o‘zinikini o‘rnatadi.
 */
function CredentialsCard({ profile, disabled }: { profile: ManagementStudentProfile; disabled: boolean }) {
  const toast = useToast();
  const refresh = useRefreshStudents();
  const [confirm, setConfirm] = useState<'reset' | 'unlock' | null>(null);
  const [credentials, setCredentials] = useState<Credentials | null>(null);

  const reset = useMutation({
    mutationFn: () => api.post<Credentials>(`/users/${profile.id}/reset-password`),
    onSuccess: async (result) => {
      setConfirm(null);
      setCredentials(result);
      await refresh();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const unlock = useMutation({
    mutationFn: () => api.post(`/users/${profile.id}/unlock`),
    onSuccess: async () => {
      setConfirm(null);
      toast.success('Hisob blokdan chiqarildi — o‘quvchi darhol qayta kira oladi.');
      await refresh();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <Card>
      <CardHeader title="Login va parol" description="Login yoki parolini unutgan o‘quvchi uchun" />
      <CardBody className="space-y-4">
        <div>
          <p className="text-sm text-slate-500">Login</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <code className="rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 font-mono text-lg font-semibold break-all text-slate-900">
              {profile.login}
            </code>
            <CopyButton text={profile.login} label="Nusxalash" />
          </div>
        </div>
        <InfoList
          items={[
            {
              label: 'Parol',
              value: profile.mustChangePassword ? (
                <Badge tone="amber">Vaqtinchalik, hali almashtirilmagan</Badge>
              ) : (
                'O‘quvchi o‘zi o‘rnatgan'
              ),
            },
            {
              label: 'Oxirgi kirish',
              value: profile.lastLoginAt ? (
                <span className="tabular">{formatDateTime(profile.lastLoginAt)}</span>
              ) : (
                <span className="font-normal text-slate-500">Hali kirmagan</span>
              ),
            },
            {
              label: 'Noto‘g‘ri parol sababli blok',
              value: profile.locked ? <Badge tone="red">Bloklangan</Badge> : 'Yo‘q',
            },
          ]}
        />
        <Alert tone="info">
          Parollar tizimda ochiq saqlanmaydi va hech kimga ko‘rinmaydi. Parolini unutgan o‘quvchiga “Yangi parol berish”
          tugmasi orqali vaqtinchalik parol bering: u bir marta ko‘rsatiladi — o‘quvchiga ayting yoki chop etib bering.
          O‘quvchi birinchi kirishda o‘z parolini o‘rnatadi.
        </Alert>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => setConfirm('reset')}
            disabled={disabled}
            icon={<KeyRound className="size-4" aria-hidden />}
          >
            Yangi parol berish
          </Button>
          {profile.locked && (
            <Button
              variant="outline"
              onClick={() => setConfirm('unlock')}
              disabled={disabled}
              icon={<LockOpen className="size-4" aria-hidden />}
            >
              Blokdan chiqarish
            </Button>
          )}
        </div>
      </CardBody>
      <ConfirmDialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        onConfirm={() => (confirm === 'reset' ? reset.mutate() : unlock.mutate())}
        title={confirm === 'reset' ? 'Yangi parol berish' : 'Blokdan chiqarish'}
        confirmLabel={confirm === 'reset' ? 'Yangi parol yaratish' : 'Blokdan chiqarish'}
        loading={reset.isPending || unlock.isPending}
      >
        {confirm === 'reset'
          ? `${profile.fullName} uchun yangi vaqtinchalik parol yaratiladi va bir marta ko‘rsatiladi. Eski parol ishlamay qoladi, barcha faol sessiyalar yakunlanadi, blok olib tashlanadi.`
          : 'Noto‘g‘ri parol urinishlari hisobi nolga tushiriladi va o‘quvchi darhol qayta kira oladi.'}
      </ConfirmDialog>
      {credentials && (
        <TemporaryPasswordDialog
          open
          onClose={() => setCredentials(null)}
          reason="reset"
          fullName={profile.fullName}
          roleLabel={accountRoleLabel(['STUDENT'], profile.currentClass?.name)}
          login={credentials.login}
          password={credentials.temporaryPassword}
        />
      )}
    </Card>
  );
}

type EnrollmentAction = 'transfer' | 'end' | 'enroll' | null;

/** Sinf: boshqa sinfga ko‘chirish, a’zolikni tugatish yoki sinfga biriktirish (umumiy muloqot oynalari). */
function ClassCard({ profile, disabled }: { profile: ManagementStudentProfile; disabled: boolean }) {
  const refresh = useRefreshStudents();
  const [dialog, setDialog] = useState<EnrollmentAction>(null);
  const current = profile.currentClass;
  const student = { id: profile.id, fullName: profile.fullName };
  const close = () => {
    setDialog(null);
    void refresh();
  };

  return (
    <Card>
      <CardHeader
        title="Sinf"
        description={current ? `Hozirgi sinf: ${current.name}` : 'Joriy o‘quv yilida sinfga biriktirilmagan'}
      />
      <CardBody className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {current ? (
          <>
            <Button
              variant="outline"
              onClick={() => setDialog('transfer')}
              disabled={disabled}
              icon={<ArrowRightLeft className="size-4" aria-hidden />}
            >
              Boshqa sinfga ko‘chirish
            </Button>
            <Button
              variant="outline"
              onClick={() => setDialog('end')}
              disabled={disabled}
              icon={<UserMinus className="size-4" aria-hidden />}
            >
              A’zolikni tugatish
            </Button>
          </>
        ) : profile.status === 'ACTIVE' ? (
          <Button
            onClick={() => setDialog('enroll')}
            disabled={disabled}
            icon={<UserPlus className="size-4" aria-hidden />}
          >
            Sinfga biriktirish
          </Button>
        ) : (
          <p className="text-sm text-slate-500">Faol bo‘lmagan o‘quvchini sinfga biriktirib bo‘lmaydi.</p>
        )}
      </CardBody>
      {current && (
        <>
          <TransferDialog
            open={dialog === 'transfer'}
            onClose={close}
            student={student}
            fromClass={{ id: current.id, name: current.name }}
            academicYearId={current.academicYearId}
          />
          <EndEnrollmentDialog
            open={dialog === 'end'}
            onClose={close}
            student={student}
            enrollment={{ id: current.enrollmentId, className: current.name }}
          />
        </>
      )}
      <EnrollDialog open={dialog === 'enroll'} onClose={close} student={student} />
    </Card>
  );
}

/**
 * “Hisob” yorlig‘i: login (nusxalash), yangi vaqtinchalik parol, holat (faolsizlantirish/faollashtirish,
 * arxivlash) va sinfni o‘zgartirish — mavjud hisob amallari va muloqot oynalari orqali.
 */
export function AccountTab({ profile }: { profile: ManagementStudentProfile }) {
  const refresh = useRefreshStudents();
  const [statusTarget, setStatusTarget] = useState<ManualStatus | null>(null);
  // Holat kartasi va oynasi hisoblar bo‘limi bilan bir xil ma’lumotdan (GET /users/:id) foydalanadi.
  const user = useQuery({
    queryKey: adminKeys.user(profile.id),
    queryFn: () => api.get<UserDetail>(`/users/${profile.id}`),
  });
  const disabled = !profile.manageable;

  return (
    <div className="space-y-6">
      {disabled && (
        <Alert tone="warning" title="Faqat ko‘rish">
          Bu hisobni boshqarish vakolatingiz yo‘q. Zarur bo‘lsa, administratorga murojaat qiling.
        </Alert>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        <CredentialsCard profile={profile} disabled={disabled} />
        <div className="space-y-6">
          {user.isPending ? (
            <PageLoader />
          ) : user.isError ? (
            <ErrorState error={user.error} onRetry={() => user.refetch()} />
          ) : (
            <StatusCard user={user.data} disabled={disabled} onChange={setStatusTarget} />
          )}
          <ClassCard profile={profile} disabled={disabled} />
          <Card>
            <CardHeader title="Qo‘shimcha" />
            <CardBody className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <ButtonLink
                href={`/admin/audit?entityType=User&entityId=${profile.id}`}
                variant="outline"
                size="sm"
                icon={<ScrollText className="size-4" aria-hidden />}
              >
                Audit jurnali
              </ButtonLink>
              <ButtonLink
                href={`/admin/users/${profile.id}`}
                variant="outline"
                size="sm"
                icon={<UserRound className="size-4" aria-hidden />}
              >
                Foydalanuvchilar bo‘limida ochish
              </ButtonLink>
            </CardBody>
          </Card>
        </div>
      </div>
      {user.data && (
        <StatusDialog
          user={user.data}
          status={statusTarget}
          onClose={() => {
            setStatusTarget(null);
            void refresh();
          }}
        />
      )}
    </div>
  );
}
