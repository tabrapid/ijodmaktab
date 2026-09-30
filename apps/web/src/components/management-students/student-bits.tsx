import { AlertTriangle, Award, Hourglass } from 'lucide-react';
import { NEW_STUDENT_BADGE_DAYS, type RegistrationSource } from '@ijod/shared';
import { Avatar } from '@/components/avatar';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/cn';
import type { PersonWithAvatar, PortfolioBrief } from '@/lib/types';

const DAY = 24 * 60 * 60 * 1000;

/** O‘zi ro‘yxatdan o‘tgan va hali “yangi” hisoblanadigan o‘quvchi. */
export function isNewRegistration(source: RegistrationSource, createdAt: string, now = Date.now()) {
  return source === 'SELF' && now - new Date(createdAt).getTime() < NEW_STUDENT_BADGE_DAYS * DAY;
}

export function NewBadge() {
  return (
    <Badge tone="green">
      Yangi<span className="sr-only"> — so‘nggi {NEW_STUDENT_BADGE_DAYS} kunda o‘zi ro‘yxatdan o‘tgan</span>
    </Badge>
  );
}

/** Portfolio: tasdiqlangan yutuqlar va tekshiruvni kutayotgan yozuvlar soni. */
export function PortfolioCounts({ counts, className }: { counts: PortfolioBrief; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-3 text-sm tabular', className)}>
      <span
        className={cn('inline-flex items-center gap-1', counts.approved ? 'text-slate-800' : 'text-slate-400')}
        title="Tasdiqlangan yutuqlar"
      >
        <Award className={cn('size-4', counts.approved ? 'text-brand-700' : 'text-slate-400')} aria-hidden />
        <span className="sr-only">Tasdiqlangan yutuqlar:</span>
        {counts.approved}
      </span>
      {counts.pending > 0 && (
        <span className="inline-flex items-center gap-1 font-medium text-amber-700" title="Tekshiruvni kutmoqda">
          <Hourglass className="size-4" aria-hidden />
          <span className="sr-only">Tekshiruvni kutmoqda:</span>
          {counts.pending}
        </span>
      )}
    </span>
  );
}

/** Sinf rahbari (rasm va ism bilan) yoki “tayinlanmagan” ogohlantirishi. */
export function HomeroomTeacher({
  teacher,
  size = 'sm',
  className,
}: {
  teacher: PersonWithAvatar | null;
  size?: 'sm' | 'md';
  className?: string;
}) {
  if (!teacher) {
    return (
      <p className={cn('inline-flex items-center gap-1.5 text-sm font-medium text-amber-700', className)}>
        <AlertTriangle className="size-4 shrink-0" aria-hidden />
        Sinf rahbari tayinlanmagan
      </p>
    );
  }
  return (
    <div className={cn('flex min-w-0 items-center gap-2.5', className)}>
      <Avatar name={teacher.fullName} src={teacher.avatarUrl} size={size} />
      <div className="min-w-0">
        <p className="text-xs text-slate-500">Sinf rahbari</p>
        {/* To‘liq ism — kartochkaning asosiy ma’lumoti: kesilmaydi, kerak bo‘lsa ikki qatorga o‘tadi. */}
        <p className="text-sm font-medium break-words text-slate-900">{teacher.fullName}</p>
      </div>
    </div>
  );
}

/** Sinflar nomi ro‘yxati: “9-A, 10-B”. */
export const classNames = (items: readonly { name: string }[]) => items.map((item) => item.name).join(', ');
