import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** Kalit–qiymat ko‘rinishidagi ma’lumotlar ro‘yxati. */
export function InfoList({
  items,
  className,
}: {
  items: { label: ReactNode; value: ReactNode }[];
  className?: string;
}) {
  return (
    <dl className={cn('divide-y divide-slate-100 text-sm', className)}>
      {items.map((item, index) => (
        <div
          key={index}
          className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 py-2.5 first:pt-0 last:pb-0"
        >
          <dt className="text-slate-500">{item.label}</dt>
          <dd className="min-w-0 text-right font-medium break-words text-slate-900">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Sahifa sarlavhasi ustidagi “orqaga” havolasi. */
export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
      <ArrowLeft className="size-4" aria-hidden /> {children}
    </Link>
  );
}
