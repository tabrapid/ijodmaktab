'use client';

import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react';
import { useRef, type KeyboardEvent } from 'react';
import { cn } from '@/lib/cn';
import { THEME_CHOICES, THEME_LABELS, useTheme, type ThemeChoice } from '@/lib/theme';
import { Menu, MenuLabel, MenuRadioItem } from './ui/menu';

const ICONS: Record<ThemeChoice, LucideIcon> = { light: Sun, dark: Moon, system: Monitor };

/**
 * Yorug‘ / qorong‘u rejim tanlovi.
 * - `compact` — sarlavha uchun ikonka-tugma va kichik menyu;
 * - `menu` — boshqa menyu ichidagi uchta band (masalan, foydalanuvchi menyusi);
 * - `segmented` — kirish sahifalari uchun uch bo‘lakli tanlagich.
 */
export function ThemeToggle({
  variant = 'compact',
  className,
}: {
  variant?: 'compact' | 'menu' | 'segmented';
  className?: string;
}) {
  const { choice, resolved, setTheme } = useTheme();

  if (variant === 'menu') {
    return (
      <div role="group" aria-label="Mavzu" className={className}>
        <MenuLabel>Mavzu</MenuLabel>
        {THEME_CHOICES.map((option) => (
          <MenuRadioItem
            key={option}
            icon={ICONS[option]}
            checked={choice === option}
            onSelect={() => setTheme(option)}
          >
            {THEME_LABELS[option]}
          </MenuRadioItem>
        ))}
      </div>
    );
  }

  if (variant === 'segmented') return <Segmented choice={choice} onChange={setTheme} className={className} />;

  const Current = choice === 'system' ? (resolved === 'dark' ? Moon : Sun) : ICONS[choice];
  return (
    <Menu
      label="Mavzu"
      buttonLabel={`Mavzu: ${THEME_LABELS[choice]}`}
      buttonClassName={cn(
        'inline-flex size-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900',
        className,
      )}
      button={<Current className="size-5" aria-hidden />}
      className="w-52"
      focusChecked
    >
      {THEME_CHOICES.map((option) => (
        <MenuRadioItem
          key={option}
          icon={ICONS[option]}
          checked={choice === option}
          onSelect={() => setTheme(option)}
          closeOnSelect
        >
          {THEME_LABELS[option]}
        </MenuRadioItem>
      ))}
    </Menu>
  );
}

function Segmented({
  choice,
  onChange,
  className,
}: {
  choice: ThemeChoice;
  onChange: (choice: ThemeChoice) => void;
  className?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (event: KeyboardEvent, index: number) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const next = (index + step + THEME_CHOICES.length) % THEME_CHOICES.length;
    refs.current[next]?.focus();
    onChange(THEME_CHOICES[next]!);
  };
  return (
    <div
      role="radiogroup"
      aria-label="Mavzu"
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full border border-slate-200 bg-surface/80 p-0.5 shadow-card backdrop-blur dark:shadow-none',
        className,
      )}
    >
      {THEME_CHOICES.map((option, index) => {
        const Icon = ICONS[option];
        const active = choice === option;
        return (
          <button
            key={option}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={THEME_LABELS[option]}
            title={THEME_LABELS[option]}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(option)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cn(
              'inline-flex size-8 items-center justify-center rounded-full transition-colors',
              active
                ? 'bg-brand-600 text-white shadow-sm dark:bg-brand-500'
                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900',
            )}
          >
            <Icon className="size-4" aria-hidden />
          </button>
        );
      })}
    </div>
  );
}
