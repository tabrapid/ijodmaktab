import { ChevronRight, type LucideIcon } from 'lucide-react';
import Link from 'next/link';

export interface QuickLink {
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
}

/** Tez o‘tish havolalari ro‘yxati. */
export function QuickLinks({ links }: { links: QuickLink[] }) {
  return (
    <ul className="divide-y divide-slate-100">
      {links.map((link) => {
        const Icon = link.icon;
        return (
          <li key={link.href}>
            <Link href={link.href} className="group flex items-center gap-3 px-5 py-3 hover:bg-slate-50">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                <Icon className="size-4.5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-slate-900 group-hover:text-brand-700">
                  {link.title}
                </span>
                <span className="block text-xs text-slate-500">{link.description}</span>
              </span>
              <ChevronRight className="size-4 text-slate-400" aria-hidden />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
