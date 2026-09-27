import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** Kichik ekranda gorizontal aylantiriladigan jadval. */
export function Table({ className, children, caption }: { className?: string; children: ReactNode; caption?: string }) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn('w-full border-collapse text-left text-sm', className)}>
        {caption && <caption className="sr-only">{caption}</caption>}
        {children}
      </table>
    </div>
  );
}

export function THead({ children, sticky }: { children: ReactNode; sticky?: boolean }) {
  return (
    <thead className={cn('bg-slate-50 text-xs uppercase tracking-wide text-slate-500', sticky && 'sticky top-0 z-10')}>
      {children}
    </thead>
  );
}

export function TH({ className, children, ...props }: ComponentProps<'th'>) {
  return (
    <th
      scope="col"
      className={cn('border-b border-slate-200 px-3 py-2.5 font-medium whitespace-nowrap', className)}
      {...props}
    >
      {children}
    </th>
  );
}

export function TR({ className, children, ...props }: ComponentProps<'tr'>) {
  return (
    <tr className={cn('border-b border-slate-100 last:border-0 hover:bg-slate-50/60', className)} {...props}>
      {children}
    </tr>
  );
}

export function TD({ className, children, ...props }: ComponentProps<'td'>) {
  return (
    <td className={cn('px-3 py-2.5 align-middle', className)} {...props}>
      {children}
    </td>
  );
}
