import type { ReactNode } from 'react';

/** Kirish sahifalari uchun markazlashgan karta. */
export function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-brand-50 via-white to-amber-50 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="flex size-12 items-center justify-center rounded-xl bg-brand-600 text-2xl font-bold text-white shadow-sm">
            I
          </span>
          <p className="mt-3 text-sm font-medium text-slate-500">Ijod maktabi</p>
          <h1 className="mt-1 text-xl font-semibold text-slate-900">{title}</h1>
          {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">{children}</div>
        {footer && <div className="mt-4 text-center text-xs text-slate-500">{footer}</div>}
      </div>
    </div>
  );
}
