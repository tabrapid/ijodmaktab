'use client';

import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface TabItem<T extends string> {
  id: T;
  label: ReactNode;
  badge?: ReactNode;
}

/** Klaviatura bilan boshqariladigan yorliqlar (chap/o‘ng strelkalar). */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (event: KeyboardEvent, index: number) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const next = (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    refs.current[next]?.focus();
    onChange(tabs[next]!.id);
  };
  return (
    <div role="tablist" className={cn('flex gap-1 overflow-x-auto border-b border-slate-200', className)}>
      {tabs.map((tab, index) => {
        const active = tab.id === value;
        return (
          <button
            key={tab.id}
            ref={(node) => {
              refs.current[index] = node;
            }}
            role="tab"
            type="button"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cn(
              '-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-semibold whitespace-nowrap transition-colors',
              active
                ? 'border-brand-600 text-brand-700 dark:border-brand-400'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800',
            )}
          >
            {tab.label}
            {tab.badge}
          </button>
        );
      })}
    </div>
  );
}
