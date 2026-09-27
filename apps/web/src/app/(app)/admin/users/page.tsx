'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { FilterX, Lock, Upload, UserPlus, Users } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Suspense, useState, type MouseEvent } from 'react';
import {
  ROLES,
  ROLE_LABELS,
  USER_LIST_FLAGS,
  USER_STATUSES,
  USER_STATUS_LABELS,
  formatDateTime,
  formatInternalId,
  type Role,
} from '@ijod/shared';
import { CreateUserDialog, type CreateUserResult } from '@/components/admin/create-user-dialog';
import { adminKeys, useClassList } from '@/components/admin/queries';
import { SearchInput } from '@/components/admin/search-input';
import { TemporaryPasswordDialog } from '@/components/admin/temporary-password-dialog';
import { intParam, pickParam, useUrlParams } from '@/components/admin/url-state';
import { RequireRole } from '@/components/app-shell';
import { RoleBadges, UserStatusBadge } from '@/components/status';
import { Badge } from '@/components/ui/badge';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card, CardBody, CardHeader, PageHeader } from '@/components/ui/card';
import { EmptyState, ErrorState, PageLoader, Spinner } from '@/components/ui/feedback';
import { Select } from '@/components/ui/form';
import { Pagination } from '@/components/ui/pagination';
import { TD, TH, THead, TR, Table } from '@/components/ui/table';
import { api, qs } from '@/lib/api';
import { hasRole, useMe } from '@/lib/auth';
import type { Page, UserListItem } from '@/lib/types';

const SORTS = ['name', 'internalId', 'lastActive', 'createdAt'] as const;
const SORT_LABELS: Record<(typeof SORTS)[number], string> = {
  name: 'F.I.Sh.',
  internalId: 'Ichki ID',
  lastActive: 'Oxirgi faollik',
  createdAt: 'Yaratilgan sana',
};
const ORDERS = ['asc', 'desc'] as const;
const PAGE_SIZES = [25, 50, 100] as const;

function UserStatusCell({ user }: { user: UserListItem }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      <UserStatusBadge status={user.status} />
      {user.locked && (
        <Badge tone="red">
          <Lock className="size-3" aria-hidden />
          Bloklangan
        </Badge>
      )}
      {user.mustChangePassword && <Badge tone="amber">Parol almashtirilmagan</Badge>}
    </span>
  );
}

const FLAG_LABELS: Record<(typeof USER_LIST_FLAGS)[number], string> = {
  locked: 'Bloklangan hisoblar',
  mustChangePassword: 'Parolni almashtirmaganlar',
  noClass: 'Sinfsiz o‘quvchilar',
};

function UsersList() {
  const router = useRouter();
  const { data: me } = useMe();
  const { params, update } = useUrlParams();
  const classes = useClassList();

  const page = intParam(params.get('page'), 1);
  const pageSize = pickParam(params.get('pageSize'), PAGE_SIZES.map(String)) ?? '25';
  const q = params.get('q') ?? '';
  const role = pickParam(params.get('role'), ROLES) ?? '';
  const status = pickParam(params.get('status'), USER_STATUSES) ?? '';
  const classId = params.get('classId') ?? '';
  const flag = pickParam(params.get('flag'), USER_LIST_FLAGS) ?? '';
  const sort = pickParam(params.get('sort'), SORTS) ?? 'name';
  const order = pickParam(params.get('order'), ORDERS) ?? 'asc';
  const filtered = Boolean(q || role || status || classId || flag);

  const [createOpen, setCreateOpen] = useState(() => params.get('new') === '1');
  const [created, setCreated] = useState<CreateUserResult | null>(null);

  const apiParams = { page, pageSize: Number(pageSize), q, role, status, classId, flag, sort, order };
  const users = useQuery({
    queryKey: adminKeys.userList(apiParams),
    queryFn: () => api.get<Page<UserListItem>>(`/users${qs(apiParams)}`),
    placeholderData: keepPreviousData,
  });

  const roleOptions: readonly Role[] = hasRole(me, 'SUPER_ADMIN')
    ? ROLES
    : ROLES.filter((item) => item !== 'SUPER_ADMIN');

  const clearFilters = () => update({ q: null, role: null, status: null, classId: null, flag: null });
  const closeCreate = () => {
    setCreateOpen(false);
    if (params.get('new')) update({ new: null }, { resetPage: false });
  };
  const openRow = (event: MouseEvent<HTMLTableRowElement>, id: string) => {
    if ((event.target as HTMLElement).closest('a, button')) return;
    router.push(`/admin/users/${id}`);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Foydalanuvchilar"
        description="O‘quvchi va xodimlar hisoblari: rollar, holat, sinf va kirish ma’lumotlari."
        actions={
          <>
            <ButtonLink href="/admin/users/import" variant="outline" icon={<Upload className="size-4" aria-hidden />}>
              Excel import
            </ButtonLink>
            <Button onClick={() => setCreateOpen(true)} icon={<UserPlus className="size-4" aria-hidden />}>
              Yangi foydalanuvchi
            </Button>
          </>
        }
      />

      <Card>
        <CardBody className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <SearchInput
              className="sm:col-span-2"
              value={q}
              onSearch={(value) => update({ q: value })}
              label="Ism, familiya, login yoki ichki ID bo‘yicha qidirish"
              placeholder="Ism, familiya, login yoki ichki ID"
            />
            <Select aria-label="Rol" value={role} onChange={(event) => update({ role: event.target.value })}>
              <option value="">Barcha rollar</option>
              {roleOptions.map((item) => (
                <option key={item} value={item}>
                  {ROLE_LABELS[item]}
                </option>
              ))}
            </Select>
            <Select aria-label="Holat" value={status} onChange={(event) => update({ status: event.target.value })}>
              <option value="">Barcha holatlar</option>
              {USER_STATUSES.map((item) => (
                <option key={item} value={item}>
                  {USER_STATUS_LABELS[item]}
                </option>
              ))}
            </Select>
            <Select
              aria-label="Sinf"
              value={classId}
              onChange={(event) => update({ classId: event.target.value })}
              disabled={classes.isPending}
            >
              <option value="">Barcha sinflar</option>
              {(classes.data ?? []).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                  {item.archivedAt ? ' (arxivlangan)' : ''}
                </option>
              ))}
            </Select>
            <Select aria-label="Ogohlantirish" value={flag} onChange={(event) => update({ flag: event.target.value })}>
              <option value="">Barcha hisoblar</option>
              {USER_LIST_FLAGS.map((item) => (
                <option key={item} value={item}>
                  {FLAG_LABELS[item]}
                </option>
              ))}
            </Select>
            <Select aria-label="Saralash" value={sort} onChange={(event) => update({ sort: event.target.value })}>
              {SORTS.map((item) => (
                <option key={item} value={item}>
                  Saralash: {SORT_LABELS[item]}
                </option>
              ))}
            </Select>
            <Select aria-label="Tartib" value={order} onChange={(event) => update({ order: event.target.value })}>
              <option value="asc">O‘sish tartibida</option>
              <option value="desc">Kamayish tartibida</option>
            </Select>
            <Select
              aria-label="Sahifadagi qatorlar soni"
              value={pageSize}
              onChange={(event) => update({ pageSize: event.target.value })}
            >
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  Sahifada: {size}
                </option>
              ))}
            </Select>
          </div>
          {filtered && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-slate-500">Filtr qo‘llangan.</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                icon={<FilterX className="size-4" aria-hidden />}
              >
                Filtrlarni tozalash
              </Button>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Ro‘yxat"
          description={users.data ? `Topildi: ${users.data.total}` : undefined}
          actions={
            users.isFetching && !users.isPending ? (
              <Spinner className="size-4 text-brand-600" label="Yangilanmoqda…" />
            ) : undefined
          }
        />
        {users.isPending ? (
          <PageLoader />
        ) : users.isError ? (
          <CardBody>
            <ErrorState error={users.error} onRetry={() => users.refetch()} />
          </CardBody>
        ) : users.data.items.length === 0 ? (
          filtered ? (
            <EmptyState
              icon={FilterX}
              title="Filtrga mos foydalanuvchi topilmadi"
              description="Qidiruv so‘zini yoki filtrlarni o‘zgartirib ko‘ring."
              action={
                <Button variant="outline" size="sm" onClick={clearFilters}>
                  Filtrlarni tozalash
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={Users}
              title="Hali foydalanuvchi yo‘q"
              description="Hisoblarni bittalab yarating yoki Excel fayldan import qiling."
              action={
                <Button size="sm" onClick={() => setCreateOpen(true)}>
                  Yangi foydalanuvchi
                </Button>
              }
            />
          )
        ) : (
          <>
            <Table caption="Foydalanuvchilar ro‘yxati">
              <THead>
                <tr>
                  <TH>Ichki ID</TH>
                  <TH>F.I.Sh.</TH>
                  <TH>Rollar</TH>
                  <TH>Sinf</TH>
                  <TH>Login</TH>
                  <TH>Holat</TH>
                  <TH>Oxirgi faollik</TH>
                </tr>
              </THead>
              <tbody className={users.isPlaceholderData ? 'opacity-60' : undefined}>
                {users.data.items.map((user) => (
                  <TR key={user.id} className="cursor-pointer" onClick={(event) => openRow(event, user.id)}>
                    <TD className="font-mono text-xs text-slate-600 tabular">{formatInternalId(user.internalId)}</TD>
                    <TD className="min-w-48">
                      <Link
                        href={`/admin/users/${user.id}`}
                        className="font-medium text-slate-900 hover:text-brand-700 hover:underline"
                      >
                        {user.fullName}
                      </Link>
                    </TD>
                    <TD>
                      <RoleBadges roles={user.roles} />
                    </TD>
                    <TD className="whitespace-nowrap">
                      {user.currentClass?.name ?? <span className="text-slate-400">—</span>}
                    </TD>
                    <TD className="font-mono text-xs whitespace-nowrap text-slate-700">{user.login ?? '—'}</TD>
                    <TD>
                      <UserStatusCell user={user} />
                    </TD>
                    <TD className="whitespace-nowrap text-slate-600 tabular">
                      {user.lastActiveAt ? (
                        formatDateTime(user.lastActiveAt)
                      ) : (
                        <span className="text-slate-500">Hali kirmagan</span>
                      )}
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
            <div className="border-t border-slate-100 px-5 py-3">
              <Pagination
                page={users.data.page}
                pageSize={users.data.pageSize}
                total={users.data.total}
                onChange={(next) => update({ page: next }, { resetPage: false })}
              />
            </div>
          </>
        )}
      </Card>

      <CreateUserDialog
        open={createOpen}
        onClose={closeCreate}
        onCreated={(result) => {
          closeCreate();
          setCreated(result);
        }}
      />
      {created && (
        <TemporaryPasswordDialog
          open
          onClose={() => setCreated(null)}
          reason="created"
          fullName={created.user.fullName}
          login={created.user.login ?? ''}
          password={created.temporaryPassword}
          profileHref={`/admin/users/${created.user.id}`}
        />
      )}
    </div>
  );
}

export default function UsersPage() {
  return (
    <RequireRole roles={['ADMIN', 'SUPER_ADMIN']}>
      <Suspense fallback={<PageLoader />}>
        <UsersList />
      </Suspense>
    </RequireRole>
  );
}
