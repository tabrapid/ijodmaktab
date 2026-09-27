'use client';

import { cloneElement, isValidElement, useId, type ComponentProps, type ReactElement, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

const control =
  'block w-full rounded-lg border border-slate-300 bg-surface px-3 text-sm text-slate-900 shadow-xs transition-[border-color,box-shadow] placeholder:text-slate-400 focus:border-brand-500 focus:ring-3 focus:ring-brand-500/25 focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 aria-[invalid=true]:border-red-500 aria-[invalid=true]:focus:ring-red-500/25 dark:shadow-none dark:focus:border-brand-400 dark:focus:ring-brand-400/30';

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(control, 'h-10', className)} {...props} />;
}

export function Textarea({ className, rows = 3, ...props }: ComponentProps<'textarea'>) {
  return <textarea rows={rows} className={cn(control, 'py-2', className)} {...props} />;
}

export function Select({ className, children, ...props }: ComponentProps<'select'>) {
  return (
    <select className={cn(control, 'h-10 pr-8', className)} {...props}>
      {children}
    </select>
  );
}

export function Checkbox({
  label,
  description,
  className,
  ...props
}: ComponentProps<'input'> & { label: ReactNode; description?: ReactNode }) {
  const id = useId();
  return (
    <label htmlFor={props.id ?? id} className={cn('flex cursor-pointer items-start gap-3 text-sm', className)}>
      <input
        id={props.id ?? id}
        type="checkbox"
        className="mt-0.5 size-4 shrink-0 cursor-pointer accent-brand-600 disabled:cursor-not-allowed dark:accent-brand-500"
        {...props}
      />
      <span>
        <span className="text-slate-800">{label}</span>
        {description && <span className="block text-slate-500">{description}</span>}
      </span>
    </label>
  );
}

/**
 * Yorliq, izoh va xato xabari bilan maydon. Ichidagi boshqaruv elementiga id va
 * aria-atributlar avtomatik beriladi.
 */
export function Field({
  label,
  hint,
  error,
  required,
  className,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  className?: string;
  children: ReactElement<{ id?: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string }>;
}) {
  const id = useId();
  const controlId = children.props.id ?? id;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const control = isValidElement(children)
    ? cloneElement(children, {
        id: controlId,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': [hintId, errorId].filter(Boolean).join(' ') || undefined,
      })
    : children;
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={controlId} className="block text-sm font-medium text-slate-700">
        {label}
        {required && (
          <span className="text-red-700" aria-hidden>
            {' '}
            *
          </span>
        )}
      </label>
      {control}
      {hint && !error && (
        <p id={hintId} className="text-xs text-slate-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs font-medium text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
