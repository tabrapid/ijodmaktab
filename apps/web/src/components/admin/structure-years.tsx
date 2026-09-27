'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { CalendarDays, CalendarPlus, Pencil, Star } from 'lucide-react';
import { useId, useState } from 'react';
import { useForm } from 'react-hook-form';
import { academicYearSchema, formatDate } from '@ijod/shared';
import type { z } from 'zod';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Alert, EmptyState, ErrorState, PageLoader } from '@/components/ui/feedback';
import { Checkbox, Field, Input } from '@/components/ui/form';
import { TD, TH, THead, TR, Table } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { api, errorMessage } from '@/lib/api';
import type { AcademicYear } from '@/lib/types';
import { FormDialog, applyServerErrors } from './form-dialog';
import { adminKeys, useAcademicYears, useInvalidate } from './queries';

type YearValues = z.output<typeof academicYearSchema>;

/** `@db.Date` qiymati (UTC yarim tuni) → “YYYY-MM-DD”. */
const dateInput = (value: string) => value.slice(0, 10);

/** Yangi o‘quv yili uchun taklif: oxirgi yildan keyingi yil (2-sentabr – 25-may). */
function suggestYear(years: AcademicYear[]) {
  const latest = years.reduce<number | null>((max, year) => {
    const start = Number(year.startsOn.slice(0, 4));
    return max === null || start > max ? start : max;
  }, null);
  const now = new Date();
  const start = latest !== null ? latest + 1 : now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  return {
    name: `${start}–${start + 1}`,
    startsOn: `${start}-09-02`,
    endsOn: `${start + 1}-05-25`,
    isCurrent: years.length === 0,
  };
}

function YearForm({
  formId,
  year,
  suggestion,
  onSubmit,
}: {
  formId: string;
  year: AcademicYear | null;
  suggestion: z.input<typeof academicYearSchema>;
  onSubmit: (values: YearValues) => Promise<unknown>;
}) {
  const [error, setError] = useState<string | null>(null);
  const form = useForm({
    resolver: zodResolver(academicYearSchema),
    defaultValues: year
      ? {
          name: year.name,
          startsOn: dateInput(year.startsOn),
          endsOn: dateInput(year.endsOn),
          isCurrent: year.isCurrent,
        }
      : suggestion,
  });
  const errors = form.formState.errors;
  const submit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await onSubmit(values);
    } catch (caught) {
      setError(
        applyServerErrors(caught, form.setError, ['name', 'startsOn', 'endsOn', 'isCurrent'], {
          DUPLICATE: { field: 'name', message: 'Bunday nomli o‘quv yili allaqachon bor.' },
        }),
      );
    }
  });
  return (
    <form id={formId} onSubmit={submit} className="space-y-4" noValidate>
      {error && <Alert tone="danger">{error}</Alert>}
      <Field label="Nomi" required hint="Masalan, 2026–2027" error={errors.name?.message}>
        <Input autoComplete="off" {...form.register('name')} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Boshlanish sanasi" required error={errors.startsOn?.message}>
          <Input type="date" {...form.register('startsOn')} />
        </Field>
        <Field label="Tugash sanasi" required error={errors.endsOn?.message}>
          <Input type="date" {...form.register('endsOn')} />
        </Field>
      </div>
      <Checkbox
        label="Joriy o‘quv yili"
        description="Yangi sinflar, import, biriktirishlar va sessiyalar joriy o‘quv yili bo‘yicha ishlaydi. Faqat bitta yil joriy bo‘ladi."
        disabled={year?.isCurrent}
        {...form.register('isCurrent')}
      />
    </form>
  );
}

export function AcademicYearsTab() {
  const toast = useToast();
  const formId = useId();
  const invalidate = useInvalidate();
  const years = useAcademicYears();
  const [editing, setEditing] = useState<AcademicYear | 'new' | null>(null);
  const [current, setCurrent] = useState<AcademicYear | null>(null);

  const refresh = () => invalidate(adminKeys.years, adminKeys.classes, adminKeys.assignments, adminKeys.dashboard);
  const save = useMutation({
    mutationFn: (values: YearValues) =>
      editing && editing !== 'new'
        ? api.put<AcademicYear>(`/academic-years/${editing.id}`, values)
        : api.post<AcademicYear>('/academic-years', values),
    onSuccess: async (year) => {
      toast.success(editing === 'new' ? `“${year.name}” o‘quv yili yaratildi.` : 'O‘quv yili saqlandi.');
      setEditing(null);
      await refresh();
    },
  });
  const makeCurrent = useMutation({
    mutationFn: (year: AcademicYear) => api.post<AcademicYear>(`/academic-years/${year.id}/make-current`),
    onSuccess: async (year) => {
      toast.success(`Joriy o‘quv yili: ${year.name}.`);
      setCurrent(null);
      await refresh();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const list = years.data ?? [];
  const hasCurrent = list.some((year) => year.isCurrent);

  return (
    <Card>
      <CardHeader
        title="O‘quv yillari"
        description="Sinflar, a’zolik va biriktirishlar o‘quv yili bilan bog‘lanadi. O‘tgan yillar ma’lumotlari saqlanadi."
        actions={
          <Button
            size="sm"
            onClick={() => setEditing('new')}
            icon={<CalendarPlus className="size-4" aria-hidden />}
            disabled={years.isPending}
          >
            Yangi o‘quv yili
          </Button>
        }
      />
      {years.isPending ? (
        <PageLoader />
      ) : years.isError ? (
        <div className="p-5">
          <ErrorState error={years.error} onRetry={() => years.refetch()} />
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="O‘quv yili hali yaratilmagan"
          description="Sinflar va o‘quvchilarni biriktirishdan oldin joriy o‘quv yilini yarating."
          action={
            <Button size="sm" onClick={() => setEditing('new')}>
              O‘quv yilini yaratish
            </Button>
          }
        />
      ) : (
        <>
          {!hasCurrent && (
            <div className="px-5 pt-4">
              <Alert tone="warning" title="Joriy o‘quv yili belgilanmagan">
                Sinf yaratish, import va biriktirishlar uchun o‘quv yillaridan birini joriy qiling.
              </Alert>
            </div>
          )}
          <Table caption="O‘quv yillari">
            <THead>
              <tr>
                <TH>Nomi</TH>
                <TH>Muddati</TH>
                <TH>Sinflar</TH>
                <TH className="text-right">Amallar</TH>
              </tr>
            </THead>
            <tbody>
              {list.map((year) => (
                <TR key={year.id}>
                  <TD className="font-medium whitespace-nowrap text-slate-900">
                    {year.name}
                    {year.isCurrent && (
                      <Badge tone="green" className="ml-2">
                        Joriy
                      </Badge>
                    )}
                  </TD>
                  <TD className="whitespace-nowrap tabular">
                    {formatDate(year.startsOn)} – {formatDate(year.endsOn)}
                  </TD>
                  <TD className="tabular">{year._count?.classes ?? '—'}</TD>
                  <TD>
                    <div className="flex justify-end gap-2">
                      {!year.isCurrent && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setCurrent(year)}
                          icon={<Star className="size-4" aria-hidden />}
                        >
                          Joriy qilish
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditing(year)}
                        icon={<Pencil className="size-4" aria-hidden />}
                      >
                        Tahrirlash
                      </Button>
                    </div>
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </>
      )}

      <FormDialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'Yangi o‘quv yili' : 'O‘quv yilini tahrirlash'}
        formId={formId}
        submitLabel={editing === 'new' ? 'Yaratish' : 'Saqlash'}
        pending={save.isPending}
      >
        {editing !== null && (
          <YearForm
            formId={formId}
            year={editing === 'new' ? null : editing}
            suggestion={suggestYear(list)}
            onSubmit={(values) => save.mutateAsync(values)}
          />
        )}
      </FormDialog>

      <ConfirmDialog
        open={current !== null}
        onClose={() => setCurrent(null)}
        onConfirm={() => current && makeCurrent.mutate(current)}
        title="Joriy o‘quv yilini almashtirish"
        confirmLabel="Joriy qilish"
        loading={makeCurrent.isPending}
      >
        <span className="font-medium text-slate-900">{current?.name}</span> joriy o‘quv yili bo‘ladi. Shundan so‘ng
        yangi sinflar, import, o‘quvchilarni biriktirish va o‘qituvchi biriktirishlari shu yil bo‘yicha ishlaydi.
        Oldingi yil ma’lumotlari o‘zgarmaydi.
      </ConfirmDialog>
    </Card>
  );
}
