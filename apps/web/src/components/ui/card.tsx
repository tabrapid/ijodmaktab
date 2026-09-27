import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

// Qorong‘u rejimda soya ko‘rinmaydi — kartani chegara ajratib turadi. `min-w-0`: grid/flex ichida keng
// jadval kartani (va sahifani) kengaytirmaydi, jadvalning o‘zi aylantiriladi.
export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <section
      className={cn('min-w-0 rounded-xl border border-slate-200 bg-surface shadow-card dark:shadow-none', className)}
    >
      {children}
    </section>
  );
}

export function CardHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn('flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4', className)}
    >
      <div className="min-w-0">
        <h2 className="text-base font-semibold tracking-tight text-slate-900">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function CardBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('px-5 py-4', className)}>{children}</div>;
}

/** Sahifa sarlavhasi: nafis serif shrift va logotip nurlari rangidagi kichik chiziq. */
export function PageHeader({
  title,
  description,
  actions,
  back,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  back?: ReactNode;
}) {
  return (
    <div className="mb-6 space-y-2">
      {back}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <span aria-hidden className="mb-2.5 block h-[3px] w-9 rounded-full bg-accent-500" />
          <h1 className="font-display text-[1.75rem] leading-tight font-semibold tracking-tight text-slate-900 sm:text-3xl">
            {title}
          </h1>
          {description && <p className="mt-1.5 text-sm text-slate-500">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
