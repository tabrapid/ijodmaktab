'use client';

import { useQuery } from '@tanstack/react-query';
import { Lock, UserX } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { formatInternalId } from '@ijod/shared';
import { BackLink } from '@/components/admin/info-list';
import { Avatar } from '@/components/avatar';
import { isUuid } from '@/components/portfolio/utils';
import { UserStatusBadge } from '@/components/status';
import { Badge } from '@/components/ui/badge';
import { Card, CardBody } from '@/components/ui/card';
import { Alert, EmptyState, ErrorState, PageLoader } from '@/components/ui/feedback';
import { Tabs } from '@/components/ui/tabs';
import { ApiError, api } from '@/lib/api';
import type { ManagementStudentProfile } from '@/lib/types';
import { AccountTab } from './account-tab';
import { classHref } from './class-cards';
import { OverviewTab } from './overview-tab';
import { StudentPortfolioPanel } from './portfolio-tab';
import { managementKeys } from './queries';
import { StudentResultsPanel } from './results-tab';
import { isNewRegistration, NewBadge } from './student-bits';

const TABS = ['overview', 'portfolio', 'results', 'account'] as const;
type Tab = (typeof TABS)[number];

const TAB_LABELS: Record<Tab, string> = {
  overview: 'Umumiy',
  portfolio: 'Portfolio',
  results: 'Natijalar',
  account: 'Hisob',
};

function ProfileHeader({ profile }: { profile: ManagementStudentProfile }) {
  const [now] = useState(() => Date.now());
  const current = profile.currentClass;
  return (
    <Card>
      <CardBody className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <Avatar name={profile.fullName} src={profile.avatarUrl} size="xl" />
        <div className="min-w-0 flex-1 space-y-2">
          <h1 className="font-display text-2xl leading-tight font-semibold tracking-tight break-words text-slate-900 sm:text-3xl">
            {profile.fullName}
          </h1>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600">
            {current ? (
              <Link href={classHref(current.id)} className="font-semibold text-brand-700 hover:underline">
                {current.name} sinf
              </Link>
            ) : (
              <span className="font-medium text-amber-700">Sinfga biriktirilmagan</span>
            )}
            {current && (
              <span>
                Sinf rahbari:{' '}
                {current.homeroomTeacher ? (
                  <span className="font-medium text-slate-800">{current.homeroomTeacher.fullName}</span>
                ) : (
                  <span className="text-amber-700">tayinlanmagan</span>
                )}
              </span>
            )}
            <span className="font-mono tabular">ID {formatInternalId(profile.internalId)}</span>
          </p>
          <p className="flex flex-wrap items-center gap-1.5">
            <UserStatusBadge status={profile.status} />
            {profile.locked && (
              <Badge tone="red">
                <Lock className="size-3" aria-hidden />
                Bloklangan
              </Badge>
            )}
            {profile.mustChangePassword && <Badge tone="amber">Parol almashtirilmagan</Badge>}
            {profile.registrationSource === 'SELF' && <Badge tone="blue">O‘zi ro‘yxatdan o‘tgan</Badge>}
            {isNewRegistration(profile.registrationSource, profile.createdAt, now) && <NewBadge />}
          </p>
        </div>
      </CardBody>
    </Card>
  );
}

/**
 * O‘quvchi profili (rahbariyat): hujjatdagi ma’lumotlar, portfolio, natijalar va hisob — yorliqlarda
 * (manzilda `?tab=`). Komponent <Suspense> ichida ishlatilishi shart.
 */
export function StudentProfileView({ id }: { id: string }) {
  const params = useSearchParams();
  const pathname = usePathname();
  const requested = params.get('tab');
  const tab: Tab = (TABS as readonly string[]).includes(requested ?? '') ? (requested as Tab) : 'overview';
  const valid = isUuid(id);
  const profile = useQuery({
    queryKey: managementKeys.student(id),
    queryFn: () => api.get<ManagementStudentProfile>(`/management/students/${id}`),
    enabled: valid,
  });

  const select = (next: Tab) => {
    window.history.replaceState(null, '', next === 'overview' ? pathname : `${pathname}?tab=${next}`);
  };
  const back = <BackLink href="/management/students">O‘quvchilar</BackLink>;

  if (!valid || (profile.error instanceof ApiError && profile.error.status === 404)) {
    return (
      <div className="space-y-6">
        {back}
        <Card>
          <EmptyState
            icon={UserX}
            title="O‘quvchi topilmadi"
            description="Havola noto‘g‘ri yoki hisob o‘chirilgan bo‘lishi mumkin."
          />
        </Card>
      </div>
    );
  }
  if (profile.isError) {
    return (
      <div className="space-y-6">
        {back}
        <ErrorState error={profile.error} onRetry={() => profile.refetch()} />
      </div>
    );
  }
  if (profile.isPending) return <PageLoader />;

  const data = profile.data;
  return (
    <div className="space-y-6">
      {back}
      <ProfileHeader profile={data} />
      {data.status !== 'ACTIVE' && (
        <Alert
          tone="warning"
          title={
            data.status === 'ARCHIVED'
              ? 'Hisob arxivlangan'
              : data.status === 'PENDING'
                ? 'Hisob tasdiqlanmagan'
                : 'Hisob faolsizlantirilgan'
          }
        >
          O‘quvchi tizimga kira olmaydi.{data.statusReason ? ` Sabab: ${data.statusReason}` : ''}
        </Alert>
      )}
      <Tabs<Tab> value={tab} onChange={select} tabs={TABS.map((value) => ({ id: value, label: TAB_LABELS[value] }))} />
      <div role="tabpanel" aria-label={TAB_LABELS[tab]}>
        {tab === 'overview' && <OverviewTab profile={data} onOpenPortfolio={() => select('portfolio')} />}
        {tab === 'portfolio' && <StudentPortfolioPanel studentId={data.id} />}
        {tab === 'results' && <StudentResultsPanel studentId={data.id} approvedCount={data.portfolio.approved} />}
        {tab === 'account' && <AccountTab profile={data} />}
      </div>
    </div>
  );
}
