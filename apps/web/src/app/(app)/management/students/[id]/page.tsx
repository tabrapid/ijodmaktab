'use client';

import { useParams } from 'next/navigation';
import { Suspense } from 'react';
import { StudentProfileView } from '@/components/management-students/student-profile';
import { PageLoader } from '@/components/ui/feedback';

export default function ManagementStudentPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <Suspense fallback={<PageLoader />}>
      <StudentProfileView id={id} />
    </Suspense>
  );
}
