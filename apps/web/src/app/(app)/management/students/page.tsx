'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { AllStudents } from '@/components/management-students/all-students';
import { ClassCards } from '@/components/management-students/class-cards';
import { useManagementClasses } from '@/components/management-students/queries';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/card';
import { PageLoader } from '@/components/ui/feedback';
import { Tabs } from '@/components/ui/tabs';

type Tab = 'students' | 'classes';

function StudentsHub() {
  const params = useSearchParams();
  const pathname = usePathname();
  const tab: Tab = params.get('tab') === 'classes' ? 'classes' : 'students';
  // Sinf rahbarisiz sinflar soni — “Sinflar” yorlig‘ida (kesh kartalar bilan umumiy).
  const classes = useManagementClasses();
  const withoutHomeroom = classes.data?.filter((item) => !item.homeroomTeacher).length ?? 0;

  // Yorliq almashganda boshqa yorliqning filtrlari tozalanadi.
  const select = (next: Tab) => {
    window.history.replaceState(null, '', next === 'students' ? pathname : `${pathname}?tab=${next}`);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="O‘quvchilar"
        description="Maktabning barcha o‘quvchilari sinflar bo‘yicha: 11-sinfdan 7-sinfgacha. O‘quvchini tanlang — uning ma’lumotlari, portfoliosi va natijalari bir sahifada ochiladi."
      />
      <Tabs<Tab>
        value={tab}
        onChange={select}
        tabs={[
          { id: 'students', label: 'Barcha o‘quvchilar' },
          {
            id: 'classes',
            label: 'Sinflar',
            badge:
              withoutHomeroom > 0 ? (
                <Badge tone="amber" className="tabular">
                  {withoutHomeroom}
                  <span className="sr-only"> ta sinfda sinf rahbari yo‘q</span>
                </Badge>
              ) : undefined,
          },
        ]}
      />
      <div role="tabpanel">{tab === 'students' ? <AllStudents /> : <ClassCards />}</div>
    </div>
  );
}

export default function ManagementStudentsPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <StudentsHub />
    </Suspense>
  );
}
