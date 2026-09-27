'use client';

import Link from 'next/link';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { Check, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

interface MenuApi {
  close: (focusButton?: boolean) => void;
}

const MenuContext = createContext<MenuApi | null>(null);

const ITEM_SELECTOR = '[role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"]';

/**
 * Ochiladigan menyu (WAI-ARIA menu button): strelkalar, Home/End, Esc va tashqariga bosish bilan
 * boshqariladi. Ichida MenuItem, MenuRadioItem, MenuSeparator va oddiy sarlavha bloklari bo‘ladi.
 */
export function Menu({
  label,
  button,
  buttonLabel,
  buttonClassName,
  align = 'end',
  focusChecked = false,
  className,
  children,
}: {
  /** Menyuning o‘zi uchun ekran o‘qigich nomi. */
  label: string;
  button: ReactNode;
  /** Tugmada matn bo‘lmasa — uning nomi. */
  buttonLabel?: string;
  buttonClassName?: string;
  align?: 'start' | 'end';
  /** Ochilganda tanlangan (aria-checked) bandga fokus — faqat tanlov menyulari uchun. */
  focusChecked?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = useCallback((focusButton = true) => {
    setOpen(false);
    if (focusButton) buttonRef.current?.focus();
  }, []);

  const items = () => Array.from(menuRef.current?.querySelectorAll<HTMLElement>(ITEM_SELECTOR) ?? []);

  useEffect(() => {
    if (!open) return;
    const list = Array.from(menuRef.current?.querySelectorAll<HTMLElement>(ITEM_SELECTOR) ?? []);
    ((focusChecked && list.find((item) => item.getAttribute('aria-checked') === 'true')) || list[0])?.focus();
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !buttonRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open, focusChecked]);

  const onMenuKeyDown = (event: KeyboardEvent) => {
    const list = items();
    if (list.length === 0) return;
    const index = list.indexOf(document.activeElement as HTMLElement);
    const focus = (next: number) => {
      event.preventDefault();
      list[(next + list.length) % list.length]?.focus();
    };
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowRight':
        return focus(index + 1);
      case 'ArrowUp':
      case 'ArrowLeft':
        return focus(index - 1);
      case 'Home':
        return focus(0);
      case 'End':
        return focus(list.length - 1);
      case 'Escape':
        event.preventDefault();
        return close();
      case 'Tab':
        return setOpen(false);
    }
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        id={`${id}-button`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? `${id}-menu` : undefined}
        aria-label={buttonLabel}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className={buttonClassName}
      >
        {button}
      </button>
      {open && (
        <div
          ref={menuRef}
          id={`${id}-menu`}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKeyDown}
          className={cn(
            'absolute top-full z-50 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-surface p-1.5 text-slate-900 shadow-pop dark:shadow-none',
            align === 'end' ? 'right-0' : 'left-0',
            className,
          )}
        >
          <MenuContext.Provider value={{ close }}>{children}</MenuContext.Provider>
        </div>
      )}
    </div>
  );
}

const itemClass =
  'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-slate-700 transition-colors outline-none hover:bg-slate-100 hover:text-slate-900 focus-visible:bg-slate-100 focus-visible:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-0';

export function MenuItem({
  icon: Icon,
  href,
  onSelect,
  tone = 'default',
  className,
  children,
}: {
  icon?: LucideIcon;
  href?: string;
  onSelect?: () => void;
  tone?: 'default' | 'danger';
  className?: string;
  children: ReactNode;
}) {
  const menu = useContext(MenuContext);
  const classes = cn(
    itemClass,
    tone === 'danger' && 'text-red-700 hover:bg-red-50 hover:text-red-800 focus-visible:bg-red-50',
    className,
  );
  const content = (
    <>
      {Icon && (
        <Icon className={cn('size-4 shrink-0', tone === 'danger' ? 'text-red-700' : 'text-slate-500')} aria-hidden />
      )}
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </>
  );
  if (href) {
    return (
      <Link
        href={href}
        role="menuitem"
        tabIndex={-1}
        className={classes}
        onClick={() => {
          menu?.close(false);
          onSelect?.();
        }}
      >
        {content}
      </Link>
    );
  }
  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      className={classes}
      onClick={() => {
        // Fokus menyu tugmasiga qaytadi — keyin ochilgan oyna yopilganda ham o‘sha yerga qaytadi.
        menu?.close(true);
        onSelect?.();
      }}
    >
      {content}
    </button>
  );
}

/** Tanlov bandi. Standart holatda menyu ochiq qoladi — natija darhol ko‘rinadi. */
export function MenuRadioItem({
  checked,
  onSelect,
  closeOnSelect = false,
  icon: Icon,
  className,
  children,
}: {
  checked: boolean;
  onSelect: () => void;
  closeOnSelect?: boolean;
  icon?: LucideIcon;
  className?: string;
  children: ReactNode;
}) {
  const menu = useContext(MenuContext);
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={checked}
      tabIndex={-1}
      onClick={() => {
        onSelect();
        if (closeOnSelect) menu?.close(true);
      }}
      className={cn(
        itemClass,
        checked && 'bg-brand-50 text-brand-800 hover:bg-brand-50 hover:text-brand-800',
        className,
      )}
    >
      {Icon && <Icon className={cn('size-4 shrink-0', checked ? 'text-brand-700' : 'text-slate-500')} aria-hidden />}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {checked && <Check className="size-4 shrink-0 text-brand-700" aria-hidden />}
    </button>
  );
}

export function MenuSeparator() {
  return <div role="separator" className="-mx-1.5 my-1.5 h-px bg-slate-100" />;
}

/** Menyu ichidagi bo‘lim nomi (masalan, “Mavzu”). */
export function MenuLabel({ children }: { children: ReactNode }) {
  return (
    <div role="none" className="px-2.5 pt-1.5 pb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">
      {children}
    </div>
  );
}
