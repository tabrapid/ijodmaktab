'use client';

import { School, UserCog, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { NEW_STUDENT_CLASS_DAYS } from '@ijod/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Alert, EmptyState, ErrorState, PageLoader } from '@/components/ui/feedback';
import type { ManagementClassCard } from '@/lib/types';
import { HomeroomDialog } from './homeroom-dialog';
import { useManagementClasses } from './queries';
import { classNames, HomeroomTeacher } from './student-bits';

/** Sinf sahifasi manzili. */
export const classHref = (id: string) => `/management/students/classes/${id}`;

/** Parallellar bo‘yicha guruhlash (sinflar serverdan 11 → 7 tartibida keladi). */
function byGrade(items: readonly ManagementClassCard[]) {
  const groups: { grade: number; items: ManagementClassCard[] }[] = [];
  for (const item of items) {
    const last = groups.at(-1);
    if (last && last.grade === item.gradeLevel) last.items.push(item);
    else groups.push({ grade: item.gradeLevel, items: [item] });
  }
  return groups;
}

function ClassCardItem({ item, onAssign }: { item: ManagementClassCard; onAssign: () => void }) {
  return (
    <li className="relative flex min-w-0 flex-col rounded-xl border border-slate-200 bg-surface p-4 shadow-card transition-[border-color,box-shadow] hover:border-brand-300 hover:shadow-md dark:shadow-none">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {/* Butun karta bosiladi: havola kartani qoplaydi, tugma esa ustida qoladi. */}
          <Link
            href={classHref(item.id)}
            className="font-display text-3xl leading-tight font-semibold tracking-tight text-slate-900 outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-2 focus-visible:after:ring-brand-500"
          >
            {item.name}
            <span className="sr-only"> sinf — o‘quvchilar ro‘yxati</span>
          </Link>
          <p className="mt-1 text-sm text-slate-600">
            <span className="font-semibold text-slate-900 tabular">{item.studentCount}</span> o‘quvchi
          </p>
        </div>
        {item.newStudentCount > 0 && (
          <Badge tone="green" className="shrink-0 tabular">
            +{item.newStudentCount} yangi
            <span className="sr-only"> (so‘nggi {NEW_STUDENT_CLASS_DAYS} kunda o‘zi ro‘yxatdan o‘tganlar)</span>
          </Badge>
        )}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
        <HomeroomTeacher teacher={item.homeroomTeacher} className="min-w-0 flex-1" />
        <Button
          size="sm"
          variant={item.homeroomTeacher ? 'outline' : 'secondary'}
          className="relative z-10"
          onClick={onAssign}
          aria-label={`${item.name} sinfi rahbarini ${item.homeroomTeacher ? 'o‘zgartirish' : 'tayinlash'}`}
          icon={
            item.homeroomTeacher ? (
              <UserCog className="size-4" aria-hidden />
            ) : (
              <UserPlus className="size-4" aria-hidden />
            )
          }
        >
          {item.homeroomTeacher ? 'O‘zgartirish' : 'Tayinlash'}
        </Button>
      </div>
    </li>
  );
}

/**
 * “Sinflar” yorlig‘i: joriy o‘quv yili sinflari parallellar bo‘yicha (11 → 7). Karta bosilsa — sinf
 * o‘quvchilari, tugma orqali — sinf rahbarini tayinlash yoki almashtirish.
 */
export function ClassCards() {
  const classes = useManagementClasses();
  const [target, setTarget] = useState<ManagementClassCard | null>(null);

  if (classes.isPending) return <PageLoader />;
  if (classes.isError) return <ErrorState error={classes.error} onRetry={() => classes.refetch()} />;

  const list = classes.data;
  if (list.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={School}
          title="Joriy o‘quv yilida sinflar yo‘q"
          description="Sinflarni (7-A … 11-D) administrator “Maktab tuzilmasi” bo‘limida yaratadi. Shundan so‘ng o‘quvchilar ro‘yxatdan o‘tib, sinflarini tanlay oladi."
        />
      </Card>
    );
  }

  const withoutHomeroom = list.filter((item) => !item.homeroomTeacher);
  const students = list.reduce((sum, item) => sum + item.studentCount, 0);

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-600">
        <span className="font-semibold text-slate-900 tabular">{list.length}</span> ta sinf ·{' '}
        <span className="font-semibold text-slate-900 tabular">{students}</span> nafar o‘quvchi
      </p>
      {withoutHomeroom.length > 0 && (
        <Alert tone="warning" title={`${withoutHomeroom.length} ta sinfda sinf rahbari tayinlanmagan`}>
          {classNames(withoutHomeroom)}. Kartadagi “Tayinlash” tugmasi orqali mavjud o‘qituvchilardan birini tanlang.
        </Alert>
      )}
      {byGrade(list).map((group) => (
        <section key={group.grade} aria-labelledby={`grade-${group.grade}`} className="space-y-3">
          <h2
            id={`grade-${group.grade}`}
            className="flex flex-wrap items-baseline gap-x-2 font-display text-xl font-semibold tracking-tight text-slate-900"
          >
            {group.grade}-sinflar
            <span className="font-sans text-sm font-normal text-slate-500 tabular">
              {group.items.reduce((sum, item) => sum + item.studentCount, 0)} o‘quvchi
            </span>
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {group.items.map((item) => (
              <ClassCardItem key={item.id} item={item} onAssign={() => setTarget(item)} />
            ))}
          </ul>
        </section>
      ))}
      <HomeroomDialog target={target} classes={list} onClose={() => setTarget(null)} />
    </div>
  );
}
