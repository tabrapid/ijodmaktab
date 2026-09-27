'use client';

import { Suspense } from 'react';
import { ClassesTab } from '@/components/admin/structure-classes';
import { AssignmentsTab } from '@/components/admin/structure-assignments';
import { SubjectsTab } from '@/components/admin/structure-subjects';
import { AcademicYearsTab } from '@/components/admin/structure-years';
import { pickParam, useUrlParams } from '@/components/admin/url-state';
import { RequireRole } from '@/components/app-shell';
import { PageHeader } from '@/components/ui/card';
import { PageLoader } from '@/components/ui/feedback';
import { Tabs } from '@/components/ui/tabs';

const TABS = ['years', 'subjects', 'classes', 'assignments'] as const;
type Tab = (typeof TABS)[number];

const TAB_LABELS: Record<Tab, string> = {
  years: 'O‘quv yillari',
  subjects: 'Fanlar',
  classes: 'Sinflar',
  assignments: 'Biriktirishlar',
};

function Structure() {
  const { params, update } = useUrlParams();
  const tab = pickParam(params.get('tab'), TABS) ?? 'classes';
  const select = (next: Tab) => update({ tab: next }, { resetPage: false });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Maktab tuzilmasi"
        description="O‘quv yillari, fanlar, sinflar, sinf rahbarlari va o‘qituvchi–fan–sinf biriktirishlari."
      />
      <Tabs<Tab> tabs={TABS.map((id) => ({ id, label: TAB_LABELS[id] }))} value={tab} onChange={select} />
      <div role="tabpanel" aria-label={TAB_LABELS[tab]}>
        {tab === 'years' && <AcademicYearsTab />}
        {tab === 'subjects' && <SubjectsTab />}
        {tab === 'classes' && (
          <ClassesTab
            yearParam={params.get('year')}
            onYearChange={(year) => update({ year }, { resetPage: false })}
            onGoToYears={() => select('years')}
          />
        )}
        {tab === 'assignments' && <AssignmentsTab />}
      </div>
    </div>
  );
}

export default function StructurePage() {
  return (
    <RequireRole roles={['ADMIN', 'SUPER_ADMIN']}>
      <Suspense fallback={<PageLoader />}>
        <Structure />
      </Suspense>
    </RequireRole>
  );
}
