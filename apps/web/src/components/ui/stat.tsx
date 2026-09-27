import type { ReactNode } from 'react';
import { formatPercent, formatPoints, type Ratio } from '@ijod/shared';
import { cn } from '@/lib/cn';

/** Ko‘rsatkich kartasi: katta raqam serif shriftda, ikonka ohangga mos yumshoq taglikda. */
export function Stat({
  label,
  value,
  hint,
  icon,
  tone = 'default',
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: 'default' | 'warning' | 'danger' | 'success';
}) {
  const styles = {
    default: { value: 'text-slate-900', chip: 'bg-brand-50 text-brand-700' },
    warning: { value: 'text-amber-700', chip: 'bg-amber-50 text-amber-700' },
    danger: { value: 'text-red-700', chip: 'bg-red-50 text-red-700' },
    success: { value: 'text-emerald-700', chip: 'bg-emerald-50 text-emerald-700' },
  }[tone];
  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-surface p-4 shadow-card dark:shadow-none">
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 pt-0.5 text-sm font-medium break-words text-slate-500">{label}</span>
        {icon && (
          <span className={cn('-mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg', styles.chip)}>
            {icon}
          </span>
        )}
      </div>
      <p className={cn('mt-1.5 font-display text-[1.75rem] leading-9 font-semibold tracking-tight', styles.value)}>
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

/** Foiz chizig‘i: rangdan tashqari son ham yoziladi (rangsiz ham tushunarli). */
export function ProgressBar({
  percent,
  label,
  className,
  tone,
}: {
  percent: number | null;
  label?: ReactNode;
  className?: string;
  tone?: 'brand' | 'green' | 'amber' | 'red';
}) {
  const value = percent === null ? 0 : Math.max(0, Math.min(100, percent));
  const auto =
    percent === null ? 'bg-slate-300' : value >= 70 ? 'bg-emerald-500' : value >= 50 ? 'bg-amber-500' : 'bg-red-500';
  const color = tone
    ? { brand: 'bg-brand-500', green: 'bg-emerald-500', amber: 'bg-amber-500', red: 'bg-red-500' }[tone]
    : auto;
  return (
    <div className={cn('space-y-1', className)}>
      {label && <div className="flex justify-between gap-2 text-xs text-slate-600">{label}</div>}
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-200"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent === null ? undefined : Math.round(value)}
      >
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

/** “80,0% (20 / 25)” — har ko‘rsatkich yonida surat va maxraj. */
export function RatioText({ ratio, className }: { ratio: Ratio | null | undefined; className?: string }) {
  if (!ratio) return <span className={className}>— / mavjud emas</span>;
  return (
    <span className={cn('tabular', className)}>
      <span className="font-medium">{formatPercent(ratio.percent)}</span>{' '}
      <span className="text-slate-500">
        ({formatPoints(ratio.numerator)} / {formatPoints(ratio.denominator)})
      </span>
    </span>
  );
}
