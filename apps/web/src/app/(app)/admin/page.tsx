'use client';

import { useQuery } from '@tanstack/react-query';
import { FileSpreadsheet, School, ScrollText, Upload, UserPlus, Users } from 'lucide-react';
import { formatDateTime } from '@ijod/shared';
import { AccountStats, AttentionAlerts, HealthStats } from '@/components/admin/account-overview';
import { adminKeys } from '@/components/admin/queries';
import { QuickLinks } from '@/components/admin/quick-links';
import { RequireRole } from '@/components/app-shell';
import { Badge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { Card, CardHeader, PageHeader } from '@/components/ui/card';
import { EmptyState, ErrorState, PageLoader } from '@/components/ui/feedback';
import { api } from '@/lib/api';
import { hasRole, useMe } from '@/lib/auth';
import type { AdminDashboard } from '@/lib/types';

const LINKS = [
  { href: '/admin/users', title: 'Foydalanuvchilar', description: 'Hisoblar, rollar, parollar va holat', icon: Users },
  {
    href: '/admin/users/import',
    title: 'Excel import',
    description: 'Ro‘yxatdan hisoblarni birdaniga yaratish',
    icon: Upload,
  },
  {
    href: '/admin/structure',
    title: 'Maktab tuzilmasi',
    description: 'O‘quv yillari, fanlar, sinflar va biriktirishlar',
    icon: School,
  },
  { href: '/admin/audit', title: 'Audit jurnali', description: 'Muhim amallar tarixi', icon: ScrollText },
];

function RecentImports({ items }: { items: AdminDashboard['recentImports'] }) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={FileSpreadsheet}
        title="Hali import qilinmagan"
        description="O‘quvchilar ro‘yxatini Excel fayldan yuklab, hisoblarni birdaniga yaratish mumkin."
        action={
          <ButtonLink href="/admin/users/import" size="sm" variant="secondary">
            Import boshlash
          </ButtonLink>
        }
      />
    );
  }
  return (
    <ul className="divide-y divide-slate-100">
      {items.map((item) => (
        <li key={item.id} className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-900" title={item.fileName}>
              {item.fileName}
            </p>
            <p className="text-xs text-slate-500">
              {item.createdBy} · {formatDateTime(item.createdAt)}
            </p>
          </div>
          {item.committedAt ? (
            <Badge tone="green">Tasdiqlangan{item.created !== null ? ` · ${item.created} ta hisob` : ''}</Badge>
          ) : (
            <Badge tone="gray">Tasdiqlanmagan</Badge>
          )}
        </li>
      ))}
    </ul>
  );
}

function Dashboard() {
  const { data: me } = useMe();
  const query = useQuery({ queryKey: adminKeys.dashboard, queryFn: () => api.get<AdminDashboard>('/dashboard/admin') });

  if (query.isPending) return <PageLoader />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  const data = query.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Administrator paneli"
        description={
          data.academicYear
            ? `Hisoblar va maktab tuzilmasi holati · Joriy o‘quv yili: ${data.academicYear.name}`
            : 'Hisoblar va maktab tuzilmasi holati'
        }
        actions={
          <>
            <ButtonLink href="/admin/users/import" variant="outline" icon={<Upload className="size-4" aria-hidden />}>
              Excel import
            </ButtonLink>
            <ButtonLink href="/admin/users?new=1" icon={<UserPlus className="size-4" aria-hidden />}>
              Yangi foydalanuvchi
            </ButtonLink>
          </>
        }
      />

      <AttentionAlerts data={data} />

      <section aria-labelledby="accounts-title" className="space-y-3">
        <h2 id="accounts-title" className="text-sm font-semibold text-slate-700">
          Foydalanuvchilar
        </h2>
        <AccountStats data={data} showSuperAdmins={hasRole(me, 'SUPER_ADMIN')} />
      </section>

      <section aria-labelledby="health-title" className="space-y-3">
        <h2 id="health-title" className="text-sm font-semibold text-slate-700">
          Hisoblar va tuzilma holati
        </h2>
        <HealthStats data={data} />
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="So‘nggi importlar" description="Excel orqali yuklangan ro‘yxatlar" />
          <RecentImports items={data.recentImports} />
        </Card>
        <Card>
          <CardHeader title="Tez o‘tish" />
          <QuickLinks links={LINKS} />
        </Card>
      </div>
    </div>
  );
}

export default function AdminHomePage() {
  return (
    <RequireRole roles={['ADMIN', 'SUPER_ADMIN']}>
      <Dashboard />
    </RequireRole>
  );
}
