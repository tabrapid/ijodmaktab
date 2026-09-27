import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Spinner } from './feedback';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const base =
  'inline-flex items-center justify-center gap-2 rounded-lg font-semibold whitespace-nowrap transition-[background-color,border-color,color,box-shadow] duration-150 select-none disabled:cursor-not-allowed disabled:opacity-55';

// Qorong‘u rejimda 700/800 qadamlar och rangga almashadi, shuning uchun to‘ldirilgan tugmalarning
// hover/active holati u yerda 500/600 da qoladi (oq matn kontrasti saqlanadi).
const variants: Record<Variant, string> = {
  primary:
    'bg-brand-600 text-white shadow-sm shadow-brand-900/20 hover:bg-brand-700 active:bg-brand-800 dark:shadow-none dark:hover:bg-brand-500 dark:active:bg-brand-600',
  secondary: 'bg-brand-50 text-brand-700 ring-1 ring-brand-100 ring-inset hover:bg-brand-100 active:bg-brand-200',
  outline:
    'border border-slate-300 bg-surface text-slate-700 shadow-xs hover:bg-slate-50 hover:text-slate-900 active:bg-slate-100 dark:shadow-none dark:hover:bg-slate-100 dark:active:bg-slate-200',
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 active:bg-slate-200',
  danger:
    'bg-red-600 text-white shadow-sm shadow-red-900/20 hover:bg-red-700 active:bg-red-800 dark:shadow-none dark:hover:bg-red-600/85 dark:active:bg-red-600/75',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-base',
};

export const buttonClass = (variant: Variant = 'primary', size: Size = 'md', className?: string) =>
  cn(base, variants[variant], sizes[size], className);

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  className,
  children,
  disabled,
  type = 'button',
  ...props
}: ComponentProps<'button'> & { variant?: Variant; size?: Size; loading?: boolean; icon?: ReactNode }) {
  return (
    <button
      type={type}
      className={buttonClass(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner className="size-4" /> : icon}
      {children}
    </button>
  );
}

export function ButtonLink({
  variant = 'primary',
  size = 'md',
  icon,
  className,
  children,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size; icon?: ReactNode }) {
  return (
    <Link className={buttonClass(variant, size, className)} {...props}>
      {icon}
      {children}
    </Link>
  );
}
