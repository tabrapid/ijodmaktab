import type { ReactNode } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2">
      <span
        className={cn(
          'inline-block size-5 animate-spin rounded-full border-2 border-current border-r-transparent',
          className,
        )}
        aria-hidden
      />
      <span className={label ? 'text-sm text-slate-600' : 'sr-only'}>{label ?? 'Yuklanmoqda…'}</span>
    </span>
  );
}

export function PageLoader({ label = 'Yuklanmoqda…' }: { label?: string }) {
  return (
    <div className="flex min-h-40 items-center justify-center py-10 text-brand-600">
      <Spinner label={label} />
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-slate-200', className)} aria-hidden />;
}

export function EmptyState({
  icon: Icon = Info,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 px-6 py-10 text-center', className)}>
      <Icon className="size-10 text-slate-300" aria-hidden />
      <p className="font-medium text-slate-800">{title}</p>
      {description && <p className="max-w-md text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

type Tone = 'info' | 'success' | 'warning' | 'danger';

const tones: Record<Tone, { box: string; icon: LucideIcon }> = {
  info: { box: 'border-sky-200 bg-sky-50 text-sky-900', icon: Info },
  success: { box: 'border-emerald-200 bg-emerald-50 text-emerald-900', icon: CheckCircle2 },
  warning: { box: 'border-amber-200 bg-amber-50 text-amber-900', icon: AlertTriangle },
  danger: { box: 'border-red-200 bg-red-50 text-red-900', icon: AlertCircle },
};

export function Alert({
  tone = 'info',
  title,
  children,
  action,
  className,
}: {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const { box, icon: Icon } = tones[tone];
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn('flex gap-3 rounded-lg border p-3 text-sm', box, className)}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className={cn(title && 'mt-0.5', 'opacity-90')}>{children}</div>}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof Error ? error.message : 'Ma’lumotni yuklab bo‘lmadi.';
  return (
    <Alert
      tone="danger"
      title="Ma’lumotni yuklab bo‘lmadi"
      action={
        onRetry ? (
          <button type="button" onClick={onRetry} className="text-sm font-medium underline">
            Qayta urinish
          </button>
        ) : undefined
      }
    >
      {message}
    </Alert>
  );
}
