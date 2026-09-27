'use client';

import { Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/form';
import { cn } from '@/lib/cn';
import { useDebouncedValue } from './queries';

/**
 * Kechiktirilgan qidiruv maydoni: yozish to‘xtagach `onSearch` chaqiriladi.
 * `value` — amaldagi qiymat (masalan, manzil satridan); u tashqaridan o‘zgarsa
 * (filtrlar tozalandi va h.k.), maydon matni ham yangilanadi.
 */
export function SearchInput({
  value,
  onSearch,
  placeholder,
  label,
  className,
  id,
}: {
  value: string;
  onSearch: (value: string) => void;
  placeholder?: string;
  label: string;
  className?: string;
  id?: string;
}) {
  const [text, setText] = useState(value);
  const debounced = useDebouncedValue(text.trim(), 350);
  /** Oxirgi marta shu maydon yuborgan (yoki tashqaridan kelgan) qiymat. */
  const committed = useRef(value.trim());
  const callback = useRef(onSearch);
  useEffect(() => {
    callback.current = onSearch;
  }, [onSearch]);

  useEffect(() => {
    if (value.trim() === committed.current) return;
    committed.current = value.trim();
    setText(value);
  }, [value]);

  useEffect(() => {
    if (debounced === committed.current) return;
    committed.current = debounced;
    callback.current(debounced);
  }, [debounced]);

  return (
    <div className={cn('relative', className)}>
      <Search
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400"
        aria-hidden
      />
      <Input
        id={id}
        type="search"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className="pl-9"
      />
    </div>
  );
}
