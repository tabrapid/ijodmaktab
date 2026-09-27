'use client';

import { SessionList } from '@/components/sessions/session-list';
import { PageHeader } from '@/components/ui/card';

export default function ManagementSessionsPage() {
  return (
    <div>
      <PageHeader
        title="Barcha sessiyalar"
        description="Maktab bo‘yicha barcha test sessiyalari: holat, qatnashish va natijalar."
      />
      <SessionList defaultScope="all" detailBase="/management/sessions" />
    </div>
  );
}
