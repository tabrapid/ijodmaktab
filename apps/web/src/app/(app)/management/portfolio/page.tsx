'use client';

import { useQuery } from '@tanstack/react-query';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { RequireRole } from '@/components/app-shell';
import { GroupedReview } from '@/components/portfolio/grouped-review';
import { SCHOOL_ITEM_FILTER_KEYS, SchoolItems } from '@/components/portfolio/school-items';
import { StudentDirectory } from '@/components/portfolio/student-directory';
import { portfolioKeys } from '@/components/portfolio/utils';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/card';
import { PageLoader } from '@/components/ui/feedback';
import { Tabs } from '@/components/ui/tabs';
import { api } from '@/lib/api';
import type { PortfolioReviewGroup } from '@/lib/types';

const TABS = ['students', 'review', 'items'] as const;
type Tab = (typeof TABS)[number];

/**
 * Tanlangan yorliq. Yorliq ko‘rsatilmagan eski havolalar (masalan, `?status=APPROVED`) “Barcha yozuvlar”
 * yorlig‘iga tushadi.
 */
function currentTab(params: URLSearchParams): Tab {
  const value = params.get('tab');
  if (value && (TABS as readonly string[]).includes(value)) return value as Tab;
  return SCHOOL_ITEM_FILTER_KEYS.some((key) => params.has(key)) ? 'items' : 'students';
}

function PortfolioHub() {
  const params = useSearchParams();
  const pathname = usePathname();
  const tab = currentTab(new URLSearchParams(params.toString()));

  // Tekshiruv navbati soni (GroupedReview bilan bir xil so‘rov — kesh umumiy).
  const groups = useQuery({
    queryKey: portfolioKeys.reviewGroups,
    queryFn: () => api.get<PortfolioReviewGroup[]>('/portfolio/review-queue/students'),
    refetchInterval: 60_000,
  });
  const pending = groups.data?.reduce((sum, group) => sum + group.pending, 0) ?? 0;

  // Yorliq almashganda boshqa yorliqning filtrlari tozalanadi.
  const select = (next: Tab) => {
    window.history.replaceState(null, '', next === 'students' ? pathname : `${pathname}?tab=${next}`);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Portfoliolar"
        description="Maktab o‘quvchilarining sertifikatlari, olimpiada natijalari va ijodiy ishlari. O‘quvchini tanlang — uning butun portfoliosi bir sahifada ochiladi."
      />
      <Tabs<Tab>
        value={tab}
        onChange={select}
        tabs={[
          { id: 'students', label: 'O‘quvchilar' },
          {
            id: 'review',
            label: 'Tasdiqlash',
            badge:
              pending > 0 ? (
                <Badge tone="amber" className="tabular">
                  {pending}
                </Badge>
              ) : undefined,
          },
          { id: 'items', label: 'Barcha yozuvlar' },
        ]}
      />
      <div role="tabpanel">
        {tab === 'students' && <StudentDirectory />}
        {tab === 'review' && (
          <GroupedReview
            note="Rahbariyat barcha o‘quvchilar va o‘qituvchilarning yozuvlarini tasdiqlashi mumkin. O‘z yozuvlaringiz bu navbatda ko‘rinmaydi — o‘zini o‘zi tasdiqlash mumkin emas."
            emptyDescription="Yangi yoki o‘zgartirilgan yozuv tekshiruvga yuborilganda shu yerda o‘quvchi bo‘yicha guruhlanib ko‘rinadi va sizga bildirishnoma keladi."
          />
        )}
        {tab === 'items' && <SchoolItems />}
      </div>
    </div>
  );
}

export default function ManagementPortfolioPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <RequireRole roles={['DEPUTY', 'SUPER_ADMIN']}>
        <PortfolioHub />
      </RequireRole>
    </Suspense>
  );
}
