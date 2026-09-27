'use client';

import { Plus } from 'lucide-react';
import { SessionList } from '@/components/sessions/session-list';
import { ButtonLink } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/card';

export default function ManagementSessionsPage() {
  return (
    <div>
      <PageHeader
        title="Barcha sessiyalar"
        description="Maktab bo‘yicha barcha test sessiyalari: holat, qatnashish va natijalar. Yangi sessiyani o‘zingiz ham o‘tkazishingiz mumkin — test bankidan istalgan testni tanlang."
        actions={
          <ButtonLink href="/teacher/sessions/new" icon={<Plus className="size-4" />}>
            Yangi sessiya
          </ButtonLink>
        }
      />
      <SessionList defaultScope="all" detailBase="/management/sessions" />
    </div>
  );
}
