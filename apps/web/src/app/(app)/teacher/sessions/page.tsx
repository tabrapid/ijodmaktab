'use client';

import { Plus } from 'lucide-react';
import { SessionList } from '@/components/sessions/session-list';
import { ButtonLink } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/card';

export default function TeacherSessionsPage() {
  return (
    <div>
      <PageHeader
        title="Test sessiyalari"
        description="Rejalashtirilgan, ochiq va yakunlangan sessiyalar. Jonli kuzatuv, natijalar va eksport sessiya sahifasida."
        actions={
          <ButtonLink href="/teacher/tests" icon={<Plus className="size-4" />}>
            Yangi sessiya
          </ButtonLink>
        }
      />
      <SessionList />
    </div>
  );
}
