'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRightLeft, GraduationCap, Lock, ScrollText, UserMinus, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  ROLES,
  formatDate,
  formatDateTime,
  formatInternalId,
  grantableRolesFor,
  updateUserSchema,
  type Role,
} from '@ijod/shared';
import type { z } from 'zod';
import { EndEnrollmentDialog, EnrollDialog, TransferDialog } from '@/components/admin/enrollment-dialogs';
import { applyServerErrors } from '@/components/admin/form-dialog';
import { BackLink, InfoList } from '@/components/admin/info-list';
import { endReasonLabel } from '@/components/admin/labels';
import { adminKeys, useInvalidate } from '@/components/admin/queries';
import { RoleCheckboxes } from '@/components/admin/role-checkboxes';
import {
  DeleteUserCard,
  RemoveAvatarButton,
  SecurityCard,
  StatusCard,
  StatusDialog,
  type ManualStatus,
} from '@/components/admin/user-account-actions';
import { RequireRole } from '@/components/app-shell';
import { Avatar } from '@/components/avatar';
import { RoleBadges, UserStatusBadge } from '@/components/status';
import { Badge } from '@/components/ui/badge';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card, CardBody, CardHeader, PageHeader } from '@/components/ui/card';
import { Alert, EmptyState, ErrorState, PageLoader } from '@/components/ui/feedback';
import { Field, Input } from '@/components/ui/form';
import { TD, TH, THead, TR, Table } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { ApiError, api } from '@/lib/api';
import { ME_KEY, hasRole, useMe } from '@/lib/auth';
import type { EnrollmentItem, UserDetail } from '@/lib/types';

type UpdateUserValues = z.output<typeof updateUserSchema>;

// ---------------------------------------------------------------- Shaxsiy ma’lumotlar

function ProfileCard({ user, disabled, isSelf }: { user: UserDetail; disabled: boolean; isSelf: boolean }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const invalidate = useInvalidate();
  const [error, setError] = useState<string | null>(null);
  const form = useForm({
    resolver: zodResolver(updateUserSchema),
    defaultValues: {
      lastName: user.lastName,
      firstName: user.firstName,
      middleName: user.middleName ?? '',
      login: user.login,
    },
  });
  const save = useMutation({
    mutationFn: (values: UpdateUserValues) => api.patch<UserDetail>(`/users/${user.id}`, values),
    onSuccess: async (result) => {
      queryClient.setQueryData(adminKeys.user(user.id), result);
      form.reset({
        lastName: result.lastName,
        firstName: result.firstName,
        middleName: result.middleName ?? '',
        login: result.login,
      });
      toast.success('Ma’lumotlar saqlandi.');
      await invalidate(adminKeys.users, adminKeys.classes, adminKeys.staffAll, ...(isSelf ? [ME_KEY] : []));
    },
  });
  const submit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await save.mutateAsync(values);
    } catch (caught) {
      setError(
        applyServerErrors(caught, form.setError, ['lastName', 'firstName', 'middleName', 'login'], {
          LOGIN_TAKEN: 'login',
        }),
      );
    }
  });
  const errors = form.formState.errors;

  return (
    <Card>
      <CardHeader
        title="Shaxsiy ma’lumotlar"
        description={user.login !== undefined ? 'F.I.Sh. va tizimga kirish logini' : 'F.I.Sh.'}
      />
      <CardBody>
        <form onSubmit={submit} className="space-y-4" noValidate>
          {error && <Alert tone="danger">{error}</Alert>}
          <fieldset disabled={disabled} className="grid gap-4 sm:grid-cols-2">
            <Field label="Familiya" required error={errors.lastName?.message}>
              <Input autoComplete="off" {...form.register('lastName')} />
            </Field>
            <Field label="Ism" required error={errors.firstName?.message}>
              <Input autoComplete="off" {...form.register('firstName')} />
            </Field>
            <Field label="Otasining ismi" error={errors.middleName?.message}>
              <Input autoComplete="off" {...form.register('middleName')} />
            </Field>
            {user.login !== undefined && (
              <Field
                label="Login"
                required
                hint="Lotin harflari, raqam, nuqta, chiziqcha (3–50 belgi)."
                error={errors.login?.message}
              >
                <Input autoComplete="off" autoCapitalize="none" spellCheck={false} {...form.register('login')} />
              </Field>
            )}
          </fieldset>
          {!disabled && (
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" loading={save.isPending} disabled={!form.formState.isDirty}>
                Saqlash
              </Button>
              {form.formState.isDirty && (
                <Button variant="ghost" onClick={() => form.reset()} disabled={save.isPending}>
                  O‘zgarishlarni bekor qilish
                </Button>
              )}
            </div>
          )}
        </form>
      </CardBody>
    </Card>
  );
}

// ---------------------------------------------------------------- Rollar

function RolesCard({
  user,
  disabled,
  viewerRoles,
}: {
  user: UserDetail;
  disabled: boolean;
  viewerRoles: readonly Role[];
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const invalidate = useInvalidate();
  const [roles, setRoles] = useState<Role[]>(user.roles);
  const [synced, setSynced] = useState(user.roles.join());
  if (synced !== user.roles.join()) {
    // Server javobidan keyin (yoki boshqa joyda o‘zgargach) tanlov yangilanadi.
    setSynced(user.roles.join());
    setRoles(user.roles);
  }
  // Berish mumkin bo‘lgan rollar va foydalanuvchida bor rollar (masalan, administrator ko‘rayotgan boshqa administrator).
  const grantable = grantableRolesFor(viewerRoles);
  const viewerIsSuperAdmin = viewerRoles.includes('SUPER_ADMIN');
  const viewerIsAdmin = viewerIsSuperAdmin || viewerRoles.includes('ADMIN');
  const options = ROLES.filter(
    (role) => role !== 'SUPER_ADMIN' && (grantable.includes(role) || user.roles.includes(role)),
  );
  const changed = roles.length !== user.roles.length || roles.some((role) => !user.roles.includes(role));
  const save = useMutation({
    mutationFn: () => api.put<UserDetail>(`/users/${user.id}/roles`, { roles }),
    onSuccess: async (result) => {
      queryClient.setQueryData(adminKeys.user(user.id), result);
      toast.success('Rollar saqlandi.');
      await invalidate(adminKeys.users, adminKeys.dashboard, adminKeys.staffAll);
    },
  });

  if (user.roles.includes('SUPER_ADMIN')) {
    return (
      <Card>
        <CardHeader title="Rollar" />
        <CardBody className="space-y-2">
          <RoleBadges roles={user.roles} />
          <p className="text-sm text-slate-500">
            Super admin hisobining roli o‘zgartirilmaydi va boshqa rollar bilan birlashtirilmaydi.
          </p>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader title="Rollar" description="Bir kishiga bir nechta rol berilishi mumkin." />
      <CardBody className="space-y-4">
        {save.isError && <Alert tone="danger">{save.error.message}</Alert>}
        <RoleCheckboxes
          options={options}
          value={roles}
          onChange={setRoles}
          disabled={disabled}
          error={roles.length === 0 ? 'Kamida bitta rol tanlang' : undefined}
        />
        {!viewerIsSuperAdmin && (
          <p className="text-xs text-slate-500">
            {viewerIsAdmin
              ? 'Administrator va super admin rollarini faqat super admin beradi.'
              : 'Direktor o‘rinbosari faqat o‘qituvchi va o‘quvchi rollarini beradi. Rahbariyat rolini administrator beradi.'}
          </p>
        )}
        {!disabled && (
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!changed || roles.length === 0}>
              Rollarni saqlash
            </Button>
            {changed && (
              <Button variant="ghost" onClick={() => setRoles(user.roles)} disabled={save.isPending}>
                Bekor qilish
              </Button>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

// ---------------------------------------------------------------- Sinfga a’zolik

type EnrollmentDialog = 'transfer' | 'end' | 'enroll' | null;

function EnrollmentsCard({
  user,
  canManage,
  classHref,
}: {
  user: UserDetail;
  canManage: boolean;
  classHref: (id: string) => string;
}) {
  const [dialog, setDialog] = useState<EnrollmentDialog>(null);
  const active: EnrollmentItem | undefined = user.enrollments.find((item) => item.endsOn === null);
  const isStudent = user.roles.includes('STUDENT');
  const activeYearId = active?.academicYearId;
  const student = { id: user.id, fullName: user.fullName };

  return (
    <Card>
      <CardHeader
        title="Sinfga a’zolik"
        description={
          active ? `Hozirgi sinf: ${active.class.name} (${active.academicYear})` : 'Hozir hech qaysi sinfda emas'
        }
        actions={
          canManage && isStudent ? (
            active ? (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setDialog('transfer')}
                  icon={<ArrowRightLeft className="size-4" aria-hidden />}
                >
                  Boshqa sinfga ko‘chirish
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setDialog('end')}
                  icon={<UserMinus className="size-4" aria-hidden />}
                >
                  A’zolikni tugatish
                </Button>
              </>
            ) : user.status === 'ACTIVE' ? (
              <Button size="sm" onClick={() => setDialog('enroll')} icon={<UserPlus className="size-4" aria-hidden />}>
                Sinfga biriktirish
              </Button>
            ) : undefined
          ) : undefined
        }
      />
      {user.enrollments.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title="A’zolik tarixi yo‘q"
          description={isStudent ? 'O‘quvchi hali hech bir sinfga biriktirilmagan.' : undefined}
        />
      ) : (
        <Table caption="Sinfga a’zolik tarixi">
          <THead>
            <tr>
              <TH>Sinf</TH>
              <TH>O‘quv yili</TH>
              <TH>Boshlangan</TH>
              <TH>Tugagan</TH>
              <TH>Sabab</TH>
            </tr>
          </THead>
          <tbody>
            {user.enrollments.map((item) => (
              <TR key={item.id}>
                <TD className="whitespace-nowrap">
                  <Link href={classHref(item.class.id)} className="font-medium text-brand-700 hover:underline">
                    {item.class.name}
                  </Link>
                  {item.endsOn === null && (
                    <Badge tone="green" className="ml-2">
                      Hozirgi
                    </Badge>
                  )}
                </TD>
                <TD className="whitespace-nowrap">{item.academicYear}</TD>
                <TD className="whitespace-nowrap tabular">{formatDate(item.startsOn)}</TD>
                <TD className="whitespace-nowrap tabular">{item.endsOn ? formatDate(item.endsOn) : '—'}</TD>
                <TD>{endReasonLabel(item.endReason)}</TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}
      {active && (
        <>
          <TransferDialog
            open={dialog === 'transfer'}
            onClose={() => setDialog(null)}
            student={student}
            fromClass={active.class}
            academicYearId={activeYearId}
          />
          <EndEnrollmentDialog
            open={dialog === 'end'}
            onClose={() => setDialog(null)}
            student={student}
            enrollment={{ id: active.id, className: active.class.name }}
          />
        </>
      )}
      <EnrollDialog open={dialog === 'enroll'} onClose={() => setDialog(null)} student={student} />
    </Card>
  );
}

// ---------------------------------------------------------------- O‘qituvchi

function TeachingCard({
  user,
  classHref,
  canManageStructure,
}: {
  user: UserDetail;
  classHref: (id: string) => string;
  canManageStructure: boolean;
}) {
  const assignments = user.teachingAssignments ?? [];
  const homeroom = user.homeroomClasses ?? [];
  return (
    <Card>
      <CardHeader
        title="Dars va sinf rahbarligi"
        description={
          canManageStructure
            ? 'Joriy o‘quv yili bo‘yicha'
            : 'Joriy o‘quv yili bo‘yicha. Fan va sinflarga biriktirishni administrator boshqaradi.'
        }
        actions={
          canManageStructure ? (
            <Link
              href="/admin/structure?tab=assignments"
              className="text-sm font-medium text-brand-700 hover:underline"
            >
              Biriktirishlarni boshqarish
            </Link>
          ) : undefined
        }
      />
      <CardBody className="space-y-4">
        <div>
          <h3 className="text-sm font-medium text-slate-700">Sinf rahbari</h3>
          {homeroom.length === 0 ? (
            <p className="mt-1 text-sm text-slate-500">Sinf rahbari emas.</p>
          ) : (
            <ul className="mt-2 flex flex-wrap gap-2">
              {homeroom.map((item) => (
                <li key={item.id}>
                  <Link
                    href={classHref(item.id)}
                    className="inline-flex rounded-md bg-brand-50 px-2 py-1 text-sm font-medium text-brand-700 hover:underline"
                  >
                    {item.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3 className="text-sm font-medium text-slate-700">Fan va sinflar</h3>
          {assignments.length === 0 ? (
            <p className="mt-1 text-sm text-slate-500">Hali fan va sinfga biriktirilmagan.</p>
          ) : (
            <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
              {assignments.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span className="text-slate-900">{item.subject.name}</span>
                  <Link href={classHref(item.class.id)} className="font-medium text-brand-700 hover:underline">
                    {item.class.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

// ---------------------------------------------------------------- Sahifa

function AccountInfoCard({ user }: { user: UserDetail }) {
  // Kirish ma’lumotlari faqat hisobni boshqara oladiganlarga (va administratorga) keladi.
  const credentials = user.login !== undefined;
  return (
    <Card>
      <CardHeader title="Hisob" />
      <CardBody>
        <InfoList
          items={[
            {
              label: 'Ichki ID',
              value: <span className="font-mono tabular">{formatInternalId(user.internalId)}</span>,
            },
            ...(credentials ? [{ label: 'Login', value: <span className="font-mono">{user.login}</span> }] : []),
            { label: 'Yaratilgan', value: formatDateTime(user.createdAt) },
            { label: 'Oxirgi kirish', value: user.lastLoginAt ? formatDateTime(user.lastLoginAt) : 'Hali kirmagan' },
            { label: 'Oxirgi faollik', value: user.lastActiveAt ? formatDateTime(user.lastActiveAt) : '—' },
          ]}
        />
        {credentials && <CredentialInfo user={user} />}
      </CardBody>
    </Card>
  );
}

function CredentialInfo({ user }: { user: UserDetail }) {
  return (
    <InfoList
      className="mt-2.5 border-t border-slate-100 pt-2.5"
      items={[
        {
          label: 'Parol',
          value: user.mustChangePassword ? (
            <Badge tone="amber">Vaqtinchalik, almashtirilmagan</Badge>
          ) : (
            'Foydalanuvchi o‘rnatgan'
          ),
        },
        {
          label: 'Ikki bosqichli kirish',
          value: user.mfaEnabled ? <Badge tone="green">Yoqilgan</Badge> : <Badge tone="gray">O‘chirilgan</Badge>,
        },
        {
          label: 'Blok',
          value: user.lockedUntil ? <Badge tone="red">{formatDateTime(user.lockedUntil)} gacha</Badge> : 'Yo‘q',
        },
      ]}
    />
  );
}

function UserDetailView() {
  const { id } = useParams<{ id: string }>();
  const { data: me } = useMe();
  const [statusTarget, setStatusTarget] = useState<ManualStatus | null>(null);
  const query = useQuery({ queryKey: adminKeys.user(id), queryFn: () => api.get<UserDetail>(`/users/${id}`) });

  if (query.isPending) return <PageLoader />;
  if (query.isError) {
    if (query.error instanceof ApiError && query.error.status === 404) {
      return (
        <EmptyState
          title="Foydalanuvchi topilmadi"
          description="Hisob o‘chirilgan yoki havola noto‘g‘ri bo‘lishi mumkin."
          action={<ButtonLink href="/admin/users">Foydalanuvchilar ro‘yxati</ButtonLink>}
        />
      );
    }
    return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  }

  const user = query.data;
  const viewerIsAdmin = hasRole(me, 'ADMIN', 'SUPER_ADMIN');
  const isSelf = me?.id === user.id;
  // Server hisoblaydi: o‘z hisobi va vakolatdan tashqari rollar (o‘rinbosar uchun rahbariyat, administrator) — yo‘q.
  const canManage = user.manageable;
  // Direktor o‘rinbosari administrator sahifalariga emas, o‘qituvchi bo‘limidagi sinf sahifasiga o‘tadi.
  const classHref = (classId: string) => (viewerIsAdmin ? `/admin/classes/${classId}` : `/teacher/classes/${classId}`);

  return (
    <div className="space-y-6">
      <PageHeader
        back={<BackLink href="/admin/users">Foydalanuvchilar</BackLink>}
        title={
          <span className="flex items-center gap-3">
            <Avatar name={user.fullName} src={user.avatarUrl} size="lg" />
            <span className="min-w-0">{user.fullName}</span>
          </span>
        }
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <span className="font-mono tabular">ID {formatInternalId(user.internalId)}</span>
            <RoleBadges roles={user.roles} />
            <UserStatusBadge status={user.status} />
            {user.lockedUntil && (
              <Badge tone="red">
                <Lock className="size-3" aria-hidden />
                Bloklangan
              </Badge>
            )}
            {user.mustChangePassword && <Badge tone="amber">Parol almashtirilmagan</Badge>}
          </span>
        }
        actions={
          <>
            {user.avatarUrl && canManage && <RemoveAvatarButton user={user} />}
            <ButtonLink
              href={`/admin/audit?entityType=User&entityId=${user.id}`}
              variant="outline"
              size="sm"
              icon={<ScrollText className="size-4" aria-hidden />}
            >
              Audit jurnali
            </ButtonLink>
          </>
        }
      />

      {isSelf && (
        <Alert tone="info" title="Bu sizning hisobingiz">
          Parol, profil rasmi, sessiyalar va ikki bosqichli kirish{' '}
          <Link href="/profile" className="font-medium underline">
            “Mening hisobim”
          </Link>{' '}
          sahifasida boshqariladi. Rollar, holat, blok va o‘chirish amallari o‘z hisobingiz uchun bajarilmaydi.
          {!viewerIsAdmin && ' Ism-familiya yoki loginda xato bo‘lsa, administratorga murojaat qiling.'}
        </Alert>
      )}
      {!canManage && !isSelf && (
        <Alert tone="warning" title="Faqat ko‘rish">
          {viewerIsAdmin
            ? 'Administrator hisoblarini faqat super admin boshqaradi.'
            : 'Direktor o‘rinbosari faqat o‘qituvchi va o‘quvchi hisoblarini boshqaradi. Bu hisob bo‘yicha administratorga murojaat qiling.'}
        </Alert>
      )}
      {user.lockedUntil && (
        <Alert tone="danger" title="Hisob vaqtincha bloklangan">
          Ko‘p marta noto‘g‘ri parol kiritilgani uchun {formatDateTime(user.lockedUntil)} gacha kirish yopiq. “Blokdan
          chiqarish” yoki “Parolni tiklash” orqali darhol ochish mumkin.
        </Alert>
      )}
      {user.status !== 'ACTIVE' && (
        <Alert tone="warning" title={user.status === 'ARCHIVED' ? 'Hisob arxivlangan' : 'Hisob faolsizlantirilgan'}>
          Foydalanuvchi tizimga kira olmaydi.{user.statusReason ? ` Sabab: ${user.statusReason}` : ''}
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <ProfileCard user={user} disabled={!canManage && !(isSelf && viewerIsAdmin)} isSelf={isSelf} />
          <RolesCard user={user} disabled={!canManage} viewerRoles={me?.roles ?? []} />
          {(user.roles.includes('STUDENT') || user.enrollments.length > 0) && (
            <EnrollmentsCard user={user} canManage={canManage} classHref={classHref} />
          )}
          {user.roles.includes('TEACHER') && (
            <TeachingCard user={user} classHref={classHref} canManageStructure={viewerIsAdmin} />
          )}
        </div>
        <div className="space-y-6">
          <AccountInfoCard user={user} />
          <SecurityCard user={user} disabled={!canManage} />
          <StatusCard user={user} disabled={!canManage} onChange={setStatusTarget} />
          <DeleteUserCard user={user} disabled={!canManage} onArchive={() => setStatusTarget('ARCHIVED')} />
        </div>
      </div>

      <StatusDialog user={user} status={statusTarget} onClose={() => setStatusTarget(null)} />
    </div>
  );
}

export default function UserDetailPage() {
  return (
    <RequireRole roles={['DEPUTY', 'ADMIN', 'SUPER_ADMIN']}>
      <UserDetailView />
    </RequireRole>
  );
}
