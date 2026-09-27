'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { FileText, Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  SHARE_PERMISSION_LABELS,
  formatDate,
  formatPoints,
  testPassportSchema,
  type TestPassportInput,
} from '@ijod/shared';
import { TestStatusBadge } from '@/components/status';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, PageHeader } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Alert, EmptyState, ErrorState, PageLoader } from '@/components/ui/feedback';
import { Field, Input, Select } from '@/components/ui/form';
import { Pagination } from '@/components/ui/pagination';
import { TD, TH, THead, TR, Table } from '@/components/ui/table';
import { api, errorMessage, qs } from '@/lib/api';
import { hasRole, useMe } from '@/lib/auth';
import { GRADE_LEVELS, useMySubjects } from '@/lib/teaching';
import type { Page, TestDetail, TestListItem } from '@/lib/types';

function NewTestDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const subjects = useMySubjects();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<TestPassportInput>({
    resolver: zodResolver(testPassportSchema),
    values: { title: '', subjectId: subjects.data?.[0]?.id ?? '', gradeLevel: 9, topic: '', tags: [] },
  });
  const errors = form.formState.errors;
  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      const test = await api.post<TestDetail>('/tests', values);
      router.push(`/teacher/tests/${test.id}?step=2`);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  });
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Yangi test"
      description="Asosiy ma’lumotlar. Qolganini test yaratish ustasida to‘ldirasiz."
      size="md"
    >
      {subjects.data?.length === 0 ? (
        <EmptyState
          title="Sizga fan biriktirilmagan"
          description="Test yaratish uchun administrator sizni fan va sinfga biriktirishi kerak."
        />
      ) : (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {error && <Alert tone="danger">{error}</Alert>}
          <Field label="Test nomi" required error={errors.title?.message}>
            <Input {...form.register('title')} placeholder="Masalan: Algebra, 1-bob" autoFocus />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Fan" required error={errors.subjectId?.message}>
              <Select {...form.register('subjectId')}>
                {(subjects.data ?? []).map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Sinf darajasi" required error={errors.gradeLevel?.message}>
              <Select {...form.register('gradeLevel', { valueAsNumber: true })}>
                {GRADE_LEVELS.map((grade) => (
                  <option key={grade} value={grade}>
                    {grade}-sinf
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Bob / mavzu" error={errors.topic?.message}>
            <Input {...form.register('topic')} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Bekor qilish
            </Button>
            <Button type="submit" loading={form.formState.isSubmitting}>
              Yaratish
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

export default function TestsLibraryPage() {
  const { data: me } = useMe();
  const subjects = useMySubjects();
  const leadership = hasRole(me, 'DEPUTY', 'SUPER_ADMIN');
  const [creating, setCreating] = useState(false);
  const [filters, setFilters] = useState({ scope: 'mine', q: '', subjectId: '', status: '', page: 1 });
  const set = (patch: Partial<typeof filters>) => setFilters((current) => ({ ...current, page: 1, ...patch }));
  const query = useQuery({
    queryKey: ['tests', filters],
    queryFn: () => api.get<Page<TestListItem>>(`/tests${qs({ ...filters, pageSize: 25 })}`),
    placeholderData: (previous) => previous,
  });

  return (
    <div>
      <PageHeader
        title="Testlar kutubxonasi"
        description="Test shablonlari: savollar, ballar va sozlamalar. Sessiya yaratilganda test versiyasi muzlatiladi."
        actions={
          <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
            Yangi test
          </Button>
        }
      />
      <Card className="mb-4">
        <CardBody className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Qidiruv">
            <Input
              value={filters.q}
              onChange={(event) => set({ q: event.target.value })}
              placeholder="Nom, mavzu yoki teg"
            />
          </Field>
          <Field label="Ko‘rinish">
            <Select value={filters.scope} onChange={(event) => set({ scope: event.target.value })}>
              <option value="mine">Mening testlarim</option>
              <option value="shared">Men bilan ulashilgan</option>
              {leadership && <option value="all">Barcha testlar</option>}
            </Select>
          </Field>
          <Field label="Fan">
            <Select value={filters.subjectId} onChange={(event) => set({ subjectId: event.target.value })}>
              <option value="">Barchasi</option>
              {(subjects.data ?? []).map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Holat">
            <Select value={filters.status} onChange={(event) => set({ status: event.target.value })}>
              <option value="">Faol (qoralama va e’lon qilingan)</option>
              <option value="DRAFT">Qoralama</option>
              <option value="ACTIVE">E’lon qilingan</option>
              <option value="ARCHIVED">Arxivlangan</option>
            </Select>
          </Field>
        </CardBody>
      </Card>

      <Card>
        {query.isPending ? (
          <PageLoader />
        ) : query.isError ? (
          <div className="p-4">
            <ErrorState error={query.error} onRetry={() => query.refetch()} />
          </div>
        ) : query.data.items.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="Testlar topilmadi"
            action={
              <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
                Yangi test
              </Button>
            }
          />
        ) : (
          <>
            <Table caption="Testlar">
              <THead>
                <tr>
                  <TH>Nomi</TH>
                  <TH>Fan</TH>
                  <TH className="text-right">Savollar</TH>
                  <TH className="text-right">Ball</TH>
                  <TH>Holat</TH>
                  <TH className="text-right">Sessiyalar</TH>
                  <TH>Yangilangan</TH>
                </tr>
              </THead>
              <tbody>
                {query.data.items.map((test) => (
                  <TR key={test.id}>
                    <TD>
                      <Link href={`/teacher/tests/${test.id}`} className="font-medium text-slate-900 hover:underline">
                        {test.title}
                      </Link>
                      <p className="text-xs text-slate-500">
                        {test.topic && `${test.topic} · `}
                        {test.permission === 'OWNER'
                          ? 'Siz'
                          : `${test.owner.fullName} · ${SHARE_PERMISSION_LABELS[test.permission as keyof typeof SHARE_PERMISSION_LABELS]}`}
                      </p>
                    </TD>
                    <TD className="whitespace-nowrap">
                      {test.subject.name} · {test.gradeLevel}-sinf
                    </TD>
                    <TD className="text-right tabular">{test.questionCount}</TD>
                    <TD className="text-right tabular">{formatPoints(test.totalPoints)}</TD>
                    <TD>
                      <span className="inline-flex flex-wrap gap-1">
                        <TestStatusBadge status={test.status} />
                        {test.hasDraftChanges && <Badge tone="amber">O‘zgarishlar bor</Badge>}
                      </span>
                    </TD>
                    <TD className="text-right tabular">{test.sessionCount}</TD>
                    <TD className="whitespace-nowrap text-slate-500">{formatDate(test.updatedAt)}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
            <div className="border-t border-slate-100 p-3">
              <Pagination
                page={query.data.page}
                pageSize={query.data.pageSize}
                total={query.data.total}
                onChange={(page) => setFilters((current) => ({ ...current, page }))}
              />
            </div>
          </>
        )}
      </Card>
      <NewTestDialog open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}
