'use client';

import { ChevronRight, GraduationCap, Presentation, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { AuthCard } from '@/components/auth/auth-card';
import { Badge } from '@/components/ui/badge';
import { ErrorState, Skeleton } from '@/components/ui/feedback';
import { RegisterFooter } from './fields';
import { useRegistrationOptions, useSignedInRedirect } from './queries';

function Choice({
  href,
  icon: Icon,
  title,
  description,
  available,
  closedNote,
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
  available: boolean;
  closedNote: string;
}) {
  const body = (
    <>
      <span
        className={
          available
            ? 'flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700 ring-1 ring-brand-100'
            : 'flex size-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500'
        }
      >
        <Icon className="size-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-base font-semibold text-slate-900">{title}</span>
          {!available && <Badge tone="gray">Hozircha yopiq</Badge>}
        </span>
        <span className="mt-1 block text-sm leading-snug text-slate-600">{available ? description : closedNote}</span>
      </span>
    </>
  );

  if (!available) {
    return (
      <li>
        <div
          aria-disabled="true"
          className="flex items-start gap-3.5 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4"
        >
          {body}
        </div>
      </li>
    );
  }
  return (
    <li>
      <Link
        href={href}
        className="group flex items-start gap-3.5 rounded-xl border border-slate-200 bg-surface p-4 transition-colors hover:border-brand-300 hover:bg-brand-50/40"
      >
        {body}
        <ChevronRight
          className="mt-3 size-5 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-700"
          aria-hidden
        />
      </Link>
    </li>
  );
}

/** “Kim sifatida ro‘yxatdan o‘tasiz?” — o‘quvchi yoki o‘qituvchi. Yopiq tur ko‘rinadi, lekin tanlanmaydi. */
export function RegisterChoice() {
  const { checking } = useSignedInRedirect();
  const options = useRegistrationOptions();
  const data = options.data;

  return (
    <AuthCard
      title="Ro‘yxatdan o‘tish"
      description="Tizimda kim sifatida ishlaysiz? Tanlang."
      footer={<RegisterFooter back={false} />}
    >
      {checking || options.isPending ? (
        <div className="space-y-3" aria-busy="true">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
      ) : options.isError || !data ? (
        <ErrorState error={options.error} onRetry={() => options.refetch()} />
      ) : (
        <ul className="space-y-3">
          <Choice
            href="/register/student"
            icon={GraduationCap}
            title="O‘quvchi sifatida"
            description="Hujjatingizdagi ma’lumotlar bilan ro‘yxatdan o‘tasiz va darhol tizimga kirasiz."
            available={data.student.open && data.student.classes.length > 0}
            closedNote={
              data.student.open
                ? 'Joriy o‘quv yili sinflari hali kiritilmagan. Direktor o‘rinbosariga murojaat qiling.'
                : 'O‘quvchilar uchun ro‘yxatdan o‘tish hozircha yopiq.'
            }
          />
          <Choice
            href="/register/teacher"
            icon={Presentation}
            title="O‘qituvchi sifatida"
            description="Hisobingiz direktor o‘rinbosari tasdiqlagach ishlaydi."
            available={data.teacher.open && data.teacher.subjects.length > 0}
            closedNote={
              data.teacher.open
                ? 'Fanlar ro‘yxati hali kiritilmagan. Direktor o‘rinbosariga murojaat qiling.'
                : 'O‘qituvchilar uchun ro‘yxatdan o‘tish hozircha yopiq.'
            }
          />
        </ul>
      )}
    </AuthCard>
  );
}
