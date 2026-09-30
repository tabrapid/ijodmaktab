'use client';

import { useParams } from 'next/navigation';
import { ClassView } from '@/components/management-students/class-view';

export default function ManagementClassPage() {
  const { id } = useParams<{ id: string }>();
  return <ClassView id={id} />;
}
