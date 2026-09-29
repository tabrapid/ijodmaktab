'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Users } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardBody, PageHeader } from '@/components/ui/card';
import { EmptyState, ErrorState, PageLoader } from '@/components/ui/feedback';
import { api } from '@/lib/api';
import type { ClassListItem } from '@/lib/types';

export default function TeacherClassesPage() {
  const classes = useQuery({
    queryKey: ['classes', 'mine'],
    queryFn: () => api.get<ClassListItem[]>('/classes?scope=mine'),
  });

  return (
    <div>
      <PageHeader
        title="Sinflarim"
        description="Siz dars beradigan va rahbarlik qiladigan sinflar (joriy o‘quv yili)."
      />
      {classes.isPending ? (
        <PageLoader />
      ) : classes.isError ? (
        <ErrorState error={classes.error} onRetry={() => classes.refetch()} />
      ) : classes.data.length === 0 ? (
        <Card>
          <EmptyState
            icon={Users}
            title="Sizga sinf biriktirilmagan"
            description="Administrator sizni fan va sinfga biriktirgach, sinflar shu yerda chiqadi."
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {classes.data.map((item) => {
            const mySubjects = item.subjects.filter((entry) => entry.isMine);
            return (
              <Link
                key={item.id}
                href={`/teacher/classes/${item.id}`}
                className="group block rounded-xl focus-visible:outline-2"
              >
                <Card className="h-full transition-colors group-hover:border-brand-300">
                  <CardBody className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xl font-semibold text-slate-900">{item.name}</p>
                        <p className="text-sm text-slate-500">{item.studentCount} o‘quvchi</p>
                      </div>
                      {item.isHomeroom && <Badge tone="brand">Sinf rahbari</Badge>}
                    </div>
                    <p className="text-sm text-slate-600">
                      {mySubjects.length > 0
                        ? `Fanlarim: ${mySubjects.map((entry) => entry.subject.name).join(', ')}`
                        : 'Bu sinfda fan o‘tmaysiz'}
                    </p>
                    <p className="text-xs text-slate-500">
                      Sinf rahbari: {item.homeroomTeacher?.fullName ?? 'belgilanmagan'}
                    </p>
                    <span className="inline-flex items-center gap-1 text-sm font-medium text-brand-700">
                      O‘quvchilar va sessiyalar{' '}
                      <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                    </span>
                  </CardBody>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
