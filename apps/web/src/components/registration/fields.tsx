'use client';

import { CheckCircle2, Eye, EyeOff, Lightbulb } from 'lucide-react';
import Link from 'next/link';
import { useId, useState, type ComponentProps, type ReactNode, type Ref } from 'react';
import { checkPinfl, isUzbekLatinName, normalizeUzbekName } from '@ijod/shared';
import { Spinner } from '@/components/ui/feedback';
import { Input, Select } from '@/components/ui/form';
import { cn } from '@/lib/cn';
import type { LoginCheck } from './queries';

// ---------------------------------------------------------------- Umumiy

/** Forma bo‘limi sarlavhasi (uzun formani qismlarga ajratadi). */
export function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-4">
      <legend className="mb-3 text-xs font-bold tracking-[0.12em] text-slate-500 uppercase">{title}</legend>
      {children}
    </fieldset>
  );
}

/** Ro‘yxatdan o‘tish sahifalari ostidagi havolalar. */
export function RegisterFooter({ back = true }: { back?: boolean }) {
  const link = 'font-semibold text-brand-700 underline-offset-2 hover:underline';
  return (
    <div className="space-y-2 text-sm">
      <p>
        Hisobingiz bormi?{' '}
        <Link href="/login" className={link}>
          Kirish
        </Link>
      </p>
      {back && (
        <p>
          <Link href="/register" className={link}>
            ← Boshqa turni tanlash
          </Link>
        </p>
      )}
    </div>
  );
}

/** Parol maydoni: ko‘rsatish/yashirish tugmasi bilan (telefonda xato yozmaslik uchun). */
export function PasswordInput({ className, ...props }: Omit<ComponentProps<'input'>, 'type'>) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={visible ? 'text' : 'password'} className={cn('pr-11', className)} />
      <button
        type="button"
        onClick={() => setVisible((current) => !current)}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg text-slate-500 transition-colors hover:text-slate-800"
        aria-label={visible ? 'Parolni yashirish' : 'Parolni ko‘rsatish'}
        aria-pressed={visible}
      >
        {visible ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- Ism-familiya

/** Kiritilgan F.I.Sh. tizimda qanday yozilishi (hujjatdagi KATTA harflar, apostroflar to‘g‘rilanadi). */
export function NamePreview({ names }: { names: (string | null | undefined)[] }) {
  const parts = names
    .map((value) => (value && value.trim() ? normalizeUzbekName(value) : null))
    .filter((value): value is string => value !== null);
  if (parts.length === 0 || !parts.every(isUzbekLatinName)) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
      <p className="text-xs text-slate-500">Tizimda shunday yoziladi:</p>
      <p className="mt-0.5 text-sm font-semibold break-words text-slate-900">{parts.join(' ')}</p>
    </div>
  );
}

export const NAME_HINT = 'Hujjatdagidek, lotin harflarida. Katta-kichik harf va apostroflar o‘zi to‘g‘rilanadi.';

// ---------------------------------------------------------------- Tug‘ilgan sana

const MONTH_NAMES = [
  'Yanvar',
  'Fevral',
  'Mart',
  'Aprel',
  'May',
  'Iyun',
  'Iyul',
  'Avgust',
  'Sentabr',
  'Oktabr',
  'Noyabr',
  'Dekabr',
];

/** Uchala qism tanlangan, lekin bunday kun yo‘q (masalan, 30-fevral). */
export const INVALID_DATE = 'mavjud-emas';

const pad = (value: number) => String(value).padStart(2, '0');

function isRealDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** Forma xatosini tushunarli qiladi: bo‘sh yoki mavjud bo‘lmagan sana uchun o‘z xabari. */
export function birthDateError(value: string | undefined, message: string | undefined) {
  if (!message) return undefined;
  if (!value) return 'Tug‘ilgan sanani tanlang: kun, oy va yil.';
  if (value === INVALID_DATE) return 'Bunday sana mavjud emas. Kun va oyni tekshiring.';
  return message;
}

/**
 * Tug‘ilgan sana — kun, oy (nomi bilan) va yil alohida tanlanadi: brauzer tiliga qarab kun va oy
 * o‘rni almashib ketmaydi, telefonda ham qulay. Qiymat: “YYYY-MM-DD”, to‘liq bo‘lmasa — bo‘sh satr.
 */
export function BirthDateField({
  value,
  onChange,
  onBlur,
  error,
  fromYear,
  toYear,
  inputRef,
  hint,
}: {
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  error?: string;
  /** Eng katta yil (ro‘yxat boshida). */
  fromYear: number;
  /** Eng kichik yil. */
  toYear: number;
  inputRef?: Ref<HTMLSelectElement>;
  hint?: ReactNode;
}) {
  const id = useId();
  const [initialYear = '', initialMonth = '', initialDay = ''] = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value.split('-')
    : [];
  const [parts, setParts] = useState({ year: initialYear, month: initialMonth, day: initialDay });
  const update = (patch: Partial<typeof parts>) => {
    const next = { ...parts, ...patch };
    setParts(next);
    if (!next.year || !next.month || !next.day) return onChange('');
    const [year, month, day] = [Number(next.year), Number(next.month), Number(next.day)];
    onChange(isRealDate(year, month, day) ? `${next.year}-${next.month}-${next.day}` : INVALID_DATE);
  };
  const years = Array.from({ length: fromYear - toYear + 1 }, (_, index) => fromYear - index);
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  // Tor ekranda (360 px) oy nomi to‘liq ko‘rinishi uchun ichki bo‘shliq kichikroq.
  const common = {
    onBlur,
    className: 'pr-7 pl-2.5',
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy,
  } as const;

  return (
    <fieldset className="space-y-1.5">
      <legend className="text-sm font-medium text-slate-700">
        Tug‘ilgan sana
        <span className="text-red-700" aria-hidden>
          {' '}
          *
        </span>
      </legend>
      <div className="grid grid-cols-[4.5rem_minmax(0,1fr)_5.25rem] gap-2">
        <Select
          ref={inputRef}
          aria-label="Tug‘ilgan kun"
          value={parts.day}
          onChange={(event) => update({ day: event.target.value })}
          {...common}
        >
          <option value="">Kun</option>
          {Array.from({ length: 31 }, (_, index) => (
            <option key={index} value={pad(index + 1)}>
              {index + 1}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Tug‘ilgan oy"
          value={parts.month}
          onChange={(event) => update({ month: event.target.value })}
          {...common}
        >
          <option value="">Oy</option>
          {MONTH_NAMES.map((name, index) => (
            <option key={name} value={pad(index + 1)}>
              {name}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Tug‘ilgan yil"
          value={parts.year}
          onChange={(event) => update({ year: event.target.value })}
          {...common}
        >
          <option value="">Yil</option>
          {years.map((year) => (
            <option key={year} value={String(year)}>
              {year}
            </option>
          ))}
        </Select>
      </div>
      {error ? (
        <p id={`${id}-error`} className="text-xs font-medium text-red-700">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className="text-xs text-slate-500">
            {hint}
          </p>
        )
      )}
    </fieldset>
  );
}

// ---------------------------------------------------------------- JSHSHIR

const PINFL_DIGITS = 14;

/** “30101985840021” → “3010 1985 8400 21” (o‘qish va tekshirish oson). */
const groupPinfl = (digits: string) => digits.replace(/(\d{4})(?=\d)/g, '$1 ');

/** Kursor oldidagi raqamlar soni saqlanadi: o‘rtadan tahrirlaganda kursor oxiriga sakramaydi. */
function caretAfterDigits(formatted: string, digits: number) {
  if (digits <= 0) return 0;
  let seen = 0;
  for (let index = 0; index < formatted.length; index += 1) {
    if (/\d/.test(formatted.charAt(index))) {
      seen += 1;
      if (seen === digits) return index + 1;
    }
  }
  return formatted.length;
}

/**
 * JSHSHIR maydoni: faqat raqamlar, 4 tadan guruhlanadi; 14 raqam kiritilgach umumiy `checkPinfl`
 * bilan darhol tekshiriladi (nazorat raqami va tug‘ilgan sanaga mosligi).
 */
export function PinflField({
  value,
  onChange,
  onBlur,
  birthDate,
  error,
  inputRef,
}: {
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  /** Tanlangan tug‘ilgan sana (to‘liq bo‘lsa, JSHSHIR bilan solishtiriladi). */
  birthDate: string;
  error?: string;
  inputRef?: Ref<HTMLInputElement>;
}) {
  const id = useId();
  const digits = value.replace(/\D/g, '');
  const dateKnown = /^\d{4}-\d{2}-\d{2}$/.test(birthDate);
  const check = digits.length === PINFL_DIGITS ? checkPinfl(digits, dateKnown ? birthDate : undefined) : null;
  const liveError = check && !check.ok ? check.message : undefined;
  const shownError = liveError ?? error;
  const noteId = `${id}-note`;

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        JSHSHIR <span className="font-normal text-slate-500">(ixtiyoriy)</span>
      </label>
      <Input
        id={id}
        ref={inputRef}
        value={groupPinfl(digits)}
        onChange={(event) => {
          const input = event.target;
          const caret = input.selectionStart ?? input.value.length;
          const before = input.value.slice(0, caret).replace(/\D/g, '').length;
          const next = input.value.replace(/\D/g, '').slice(0, PINFL_DIGITS);
          const formatted = groupPinfl(next);
          onChange(formatted);
          requestAnimationFrame(() => {
            if (document.activeElement !== input) return;
            const position = caretAfterDigits(formatted, Math.min(before, next.length));
            input.setSelectionRange(position, position);
          });
        }}
        onBlur={onBlur}
        inputMode="numeric"
        autoComplete="off"
        spellCheck={false}
        maxLength={PINFL_DIGITS + 3}
        placeholder="14 ta raqam"
        className="font-mono tracking-wider tabular"
        aria-invalid={shownError ? true : undefined}
        aria-describedby={noteId}
      />
      <div id={noteId} className="text-xs">
        {shownError ? (
          <p className="font-medium text-red-700">{shownError}</p>
        ) : check?.ok ? (
          <p className="inline-flex items-center gap-1 font-medium text-emerald-700">
            <CheckCircle2 className="size-3.5" aria-hidden />
            JSHSHIR to‘g‘ri{dateKnown ? ' va tug‘ilgan sanaga mos' : ''}
          </p>
        ) : (
          <p className="text-slate-500">
            ID-kartaning orqa tomonidagi 14 xonali raqam. Tug‘ilganlik haqidagi guvohnoma bo‘lsa — bo‘sh qoldiring.
            {digits.length > 0 && (
              <span className="mt-0.5 block font-medium text-slate-700 tabular">
                Kiritildi: {digits.length}/{PINFL_DIGITS}
              </span>
            )}
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Login

/** Login bandligi holati va taklif (band bo‘lsa — bo‘sh variant, bo‘sh maydonda — ism-familiyadan). */
export function LoginNote({
  check,
  fromName,
  onPick,
}: {
  check: LoginCheck;
  /** Ism-familiyadan tuzilgan login (login maydoni bo‘sh bo‘lsa taklif qilinadi). */
  fromName: string | null;
  onPick: (login: string) => void;
}) {
  const suggestion = check.state === 'taken' ? check.suggestion : check.state === 'idle' ? fromName : null;
  return (
    <div aria-live="polite" className="min-h-5 text-xs">
      {check.state === 'checking' && (
        <span className="inline-flex items-center gap-1.5 text-slate-500">
          <Spinner className="size-3" /> Tekshirilmoqda…
        </span>
      )}
      {check.state === 'available' && (
        <span className="inline-flex items-center gap-1 font-medium text-emerald-700">
          <CheckCircle2 className="size-3.5" aria-hidden />
          Login bo‘sh
        </span>
      )}
      {suggestion && (
        <span className="inline-flex flex-wrap items-center gap-1.5 text-slate-600">
          <Lightbulb className="size-3.5 text-accent-700" aria-hidden />
          {check.state === 'taken' ? 'Bo‘sh variant:' : 'Taklif:'}
          <button
            type="button"
            onClick={() => onPick(suggestion)}
            className="rounded-md bg-brand-50 px-2 py-0.5 font-mono font-semibold break-all text-brand-700 ring-1 ring-brand-200 transition-colors ring-inset hover:bg-brand-100"
          >
            {suggestion}
          </button>
        </span>
      )}
    </div>
  );
}

export const LOGIN_HINT = 'Lotin harflari, raqamlar, nuqta, chiziqcha yoki pastki chiziq (3–50 belgi).';
export const PASSWORD_HINT = 'Kamida 8 ta belgi, harf va raqam bo‘lsin. Parolni hech kimga aytmang.';
