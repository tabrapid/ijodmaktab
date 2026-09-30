'use client';

import { Suspense } from 'react';
import { pickParam, useUrlParams } from '@/components/admin/url-state';
import { RequireRole } from '@/components/app-shell';
import { usePendingCount } from '@/components/registration/queries';
import {
  NewStudentsList,
  NewTeachersList,
  PERIODS,
  PendingTeachersList,
} from '@/components/registration/registration-lists';
import { RegistrationSettingsCard } from '@/components/registration/registration-settings-card';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/card';
import { PageLoader } from '@/components/ui/feedback';
import { Tabs } from '@/components/ui/tabs';

const TABS = ['pending', 'students', 'teachers'] as const;
type Tab = (typeof TABS)[number];

const TAB_LABELS: Record<Tab, string> = {
  pending: 'Tasdiq kutayotgan o‘qituvchilar',
  students: 'Yangi o‘quvchilar',
  teachers: 'Yangi o‘qituvchilar',
};

function RegistrationsView() {
  const { params, update } = useUrlParams();
  const tab = pickParam(params.get('tab'), TABS) ?? 'pending';
  const period = pickParam(params.get('days'), PERIODS) ?? '30';
  const counts = usePendingCount();
  const pending = counts.data?.pending ?? 0;
  const onPeriod = (value: string) => update({ days: value === '30' ? null : value });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ro‘yxatdan o‘tish"
        description="O‘quvchi va o‘qituvchilarning o‘zi ro‘yxatdan o‘tishi: havola va sozlamalar, o‘qituvchi arizalarini tasdiqlash, yangi hisoblarni kuzatish."
      />
      <RegistrationSettingsCard />
      <div className="space-y-4">
        <Tabs
          tabs={TABS.map((id) => ({
            id,
            label: TAB_LABELS[id],
            badge:
              id === 'pending' && pending > 0 ? (
                <Badge tone="violet" className="tabular">
                  {pending}
                </Badge>
              ) : undefined,
          }))}
          value={tab}
          onChange={(next) => update({ tab: next === 'pending' ? null : next })}
        />
        <div role="tabpanel" aria-label={TAB_LABELS[tab]}>
          {tab === 'pending' ? (
            <PendingTeachersList />
          ) : tab === 'students' ? (
            // Davr o‘zgarsa, sahifalash boshidan boshlanadi.
            <NewStudentsList key={period} period={period} onPeriod={onPeriod} />
          ) : (
            <NewTeachersList key={period} period={period} onPeriod={onPeriod} />
          )}
        </div>
      </div>
    </div>
  );
}

export default function RegistrationsPage() {
  return (
    <RequireRole roles={['DEPUTY', 'SUPER_ADMIN']}>
      <Suspense fallback={<PageLoader />}>
        <RegistrationsView />
      </Suspense>
    </RequireRole>
  );
}
