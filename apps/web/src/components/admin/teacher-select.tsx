'use client';

import { Search } from 'lucide-react';
import { useState } from 'react';
import { Input, Select } from '@/components/ui/form';
import type { PersonRef } from '@/lib/types';
import { useDebouncedValue, useStaff } from './queries';

/**
 * O‘qituvchini tanlash (xodimlar katalogidan, qidiruv bilan). Faqat O‘qituvchi roli borlar
 * ko‘rsatiladi — sinf rahbari va biriktirishlar uchun server shuni talab qiladi.
 * `Field` ichida ishlatilganda id va aria-atributlar ro‘yxatga beriladi.
 */
export function TeacherSelect({
  value,
  onChange,
  current,
  emptyLabel = '— Tanlanmagan —',
  allowEmpty = true,
  disabled,
  id,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
}: {
  value: string | null | undefined;
  onChange: (id: string | null) => void;
  /** Hozirgi tanlov (qidiruv natijasida bo‘lmasa ham ko‘rinib tursin). */
  current?: PersonRef | null;
  emptyLabel?: string;
  allowEmpty?: boolean;
  disabled?: boolean;
  id?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}) {
  const [search, setSearch] = useState('');
  const q = useDebouncedValue(search.trim(), 300);
  const staff = useStaff(q);
  const teachers = (staff.data ?? []).filter((person) => person.roles.includes('TEACHER'));
  const options = current && !teachers.some((person) => person.id === current.id) ? [current, ...teachers] : teachers;

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400"
          aria-hidden
        />
        <Input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="O‘qituvchini qidirish…"
          aria-label="O‘qituvchini ism yoki familiya bo‘yicha qidirish"
          className="h-9 pl-9"
          disabled={disabled}
        />
      </div>
      <Select
        id={id}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value || null)}
        disabled={disabled}
      >
        {allowEmpty || !value ? <option value="">{staff.isPending ? 'Yuklanmoqda…' : emptyLabel}</option> : null}
        {options.map((person) => (
          <option key={person.id} value={person.id}>
            {person.fullName}
          </option>
        ))}
      </Select>
      {staff.isError && <p className="text-xs font-medium text-red-700">O‘qituvchilar ro‘yxatini yuklab bo‘lmadi.</p>}
      {!staff.isPending && !staff.isError && teachers.length === 0 && (
        <p className="text-xs text-slate-500">
          {q ? 'Qidiruv bo‘yicha o‘qituvchi topilmadi.' : 'Faol o‘qituvchilar yo‘q.'}
        </p>
      )}
    </div>
  );
}
