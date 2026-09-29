'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { Search, X } from 'lucide-react';
import { useState } from 'react';
import { formatInternalId, schoolToday } from '@ijod/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Alert, Spinner } from '@/components/ui/feedback';
import { Field, Input } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { api, errorMessage, qs } from '@/lib/api';
import { cn } from '@/lib/cn';
import type { Page, UserListItem } from '@/lib/types';
import { adminKeys, useDebouncedValue, useInvalidate } from './queries';

interface TargetClass {
  id: string;
  name: string;
  isCurrentYear: boolean;
  studentIds: ReadonlySet<string>;
}

function StudentSearch({
  target,
  selected,
  onToggle,
}: {
  target: TargetClass;
  selected: ReadonlyMap<string, UserListItem>;
  onToggle: (student: UserListItem, checked: boolean) => void;
}) {
  const [text, setText] = useState('');
  const q = useDebouncedValue(text.trim(), 300);
  const searchable = q.length >= 2 || /^\d+$/.test(q);
  const results = useQuery({
    queryKey: adminKeys.studentSearch(q),
    queryFn: () => api.get<Page<UserListItem>>(`/users${qs({ role: 'STUDENT', status: 'ACTIVE', q, pageSize: 20 })}`),
    enabled: searchable,
  });

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400"
          aria-hidden
        />
        <Input
          type="search"
          autoFocus
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Ism, familiya yoki ichki ID"
          aria-label="O‘quvchini ism, familiya yoki ichki ID bo‘yicha qidirish"
          className="pl-9"
        />
      </div>
      <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-200" aria-live="polite">
        {!searchable ? (
          <p className="px-4 py-6 text-center text-sm text-slate-500">
            Qidirish uchun kamida 2 ta harf yoki ichki ID raqamini kiriting. Faqat faol o‘quvchilar ko‘rsatiladi.
          </p>
        ) : results.isPending ? (
          <div className="flex justify-center py-6 text-brand-700">
            <Spinner label="Qidirilmoqda…" />
          </div>
        ) : results.isError ? (
          <div className="p-3">
            <Alert tone="danger">{errorMessage(results.error)}</Alert>
          </div>
        ) : results.data.items.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-slate-500">Hech kim topilmadi.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {results.data.items.map((student) => {
              const here = target.studentIds.has(student.id);
              return (
                <li key={student.id}>
                  <label
                    className={cn(
                      'flex items-center gap-3 px-3 py-2.5 text-sm',
                      here ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-slate-50',
                    )}
                  >
                    <input
                      type="checkbox"
                      className="size-4 shrink-0"
                      checked={here || selected.has(student.id)}
                      disabled={here}
                      onChange={(event) => onToggle(student, event.target.checked)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-slate-900">{student.fullName}</span>
                      <span className="font-mono text-xs text-slate-500 tabular">
                        ID {formatInternalId(student.internalId)}
                      </span>
                    </span>
                    {here ? (
                      <Badge tone="green">Shu sinfda</Badge>
                    ) : student.currentClass ? (
                      <Badge tone="amber">Hozir: {student.currentClass.name}</Badge>
                    ) : (
                      <Badge>Sinfsiz</Badge>
                    )}
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {results.data && searchable && results.data.total > results.data.items.length && (
        <p className="text-xs text-slate-500">
          Birinchi {results.data.items.length} ta natija ko‘rsatildi (jami {results.data.total}). Qidiruvni
          aniqlashtiring.
        </p>
      )}
    </div>
  );
}

/** Sinfga o‘quvchilarni qidirib qo‘shish (bir nechtasini birdaniga). */
export function AddStudentsDialog({
  open,
  onClose,
  target,
}: {
  open: boolean;
  onClose: () => void;
  target: TargetClass;
}) {
  const toast = useToast();
  const invalidate = useInvalidate();
  const [selected, setSelected] = useState<Map<string, UserListItem>>(new Map());
  const [startsOn, setStartsOn] = useState(schoolToday());
  const enroll = useMutation({
    mutationFn: () =>
      api.post<{ enrolled: number }>(`/classes/${target.id}/students`, {
        studentIds: [...selected.keys()],
        startsOn: startsOn || undefined,
      }),
    onSuccess: async ({ enrolled }) => {
      toast.success(`${target.name} sinfiga ${enrolled} nafar o‘quvchi qo‘shildi.`);
      close();
      await invalidate(adminKeys.classes, adminKeys.users, adminKeys.dashboard);
    },
  });

  function close() {
    setSelected(new Map());
    setStartsOn(schoolToday());
    enroll.reset();
    onClose();
  }
  const toggle = (student: UserListItem, checked: boolean) => {
    setSelected((current) => {
      const next = new Map(current);
      if (checked) next.set(student.id, student);
      else next.delete(student.id);
      return next;
    });
  };
  const inOtherClass =
    target.isCurrentYear &&
    [...selected.values()].some((student) => student.currentClass && student.currentClass.id !== target.id);

  return (
    <Dialog
      open={open}
      onClose={close}
      title={`${target.name} sinfiga o‘quvchi qo‘shish`}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={close} disabled={enroll.isPending}>
            Bekor qilish
          </Button>
          <Button onClick={() => enroll.mutate()} loading={enroll.isPending} disabled={selected.size === 0}>
            {selected.size > 0 ? `${selected.size} nafarni qo‘shish` : 'Qo‘shish'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <StudentSearch target={target} selected={selected} onToggle={toggle} />
        {selected.size > 0 && (
          <div>
            <p className="text-sm font-medium text-slate-700">Tanlangan: {selected.size} nafar</p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {[...selected.values()].map((student) => (
                <li
                  key={student.id}
                  className="inline-flex items-center gap-1 rounded-full bg-brand-50 py-1 pr-1 pl-3 text-sm text-brand-800"
                >
                  {student.fullName}
                  <button
                    type="button"
                    onClick={() => toggle(student, false)}
                    className="rounded-full p-0.5 text-brand-700 hover:bg-brand-100"
                    aria-label={`${student.fullName} — tanlovdan olib tashlash`}
                  >
                    <X className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {inOtherClass && (
          <Alert tone="warning">
            Tanlanganlar orasida boshqa sinfda o‘qiyotganlar bor — server ularni qabul qilmaydi. Bunday o‘quvchini o‘z
            sinfi sahifasidagi “Ko‘chirish” amali orqali o‘tkazing.
          </Alert>
        )}
        <Field
          label="A’zolik boshlanish sanasi"
          hint="Bo‘sh qoldirilsa — bugungi sana (o‘quv yili boshlanmagan bo‘lsa, uning boshlanishi)."
        >
          <Input type="date" value={startsOn} onChange={(event) => setStartsOn(event.target.value)} />
        </Field>
        {enroll.isError && (
          <Alert tone="danger" title="O‘quvchilarni qo‘shib bo‘lmadi">
            {errorMessage(enroll.error)}
          </Alert>
        )}
      </div>
    </Dialog>
  );
}
