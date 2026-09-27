'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { CalendarPlus, Copy, FileText, Landmark, Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useId, useState } from 'react';
import { useForm } from 'react-hook-form';
import { formatDate, formatPoints, testPassportSchema, type TestPassportInput } from '@ijod/shared';
import { Avatar } from '@/components/avatar';
import { TestStatusBadge } from '@/components/status';
import { CopyTestDialog } from '@/components/teacher/copy-test-dialog';
import {
  conductBlockReason,
  isDeputyOnly,
  newSessionHref,
  permissionLabel,
  subjectBlockReason,
  useTaughtSubjects,
} from '@/components/teacher/test-helpers';
import { Badge } from '@/components/ui/badge';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card, CardBody, PageHeader } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Alert, EmptyState, ErrorState, PageLoader } from '@/components/ui/feedback';
import { Field, Input, Select } from '@/components/ui/form';
import { Pagination } from '@/components/ui/pagination';
import { TD, TH, THead, TR, Table } from '@/components/ui/table';
import { Tabs } from '@/components/ui/tabs';
import { api, errorMessage, qs } from '@/lib/api';
import { hasRole, useMe } from '@/lib/auth';
import { GRADE_LEVELS, useMySubjects } from '@/lib/teaching';
import type { Page, Subject, TestDetail, TestListItem } from '@/lib/types';

type Scope = 'mine' | 'shared' | 'school' | 'all';

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

/** Ro‘yxat bo‘sh bo‘lganda: har bir bo‘lim uchun tushunarli izoh va keyingi qadam. */
function LibraryEmpty({
  scope,
  filtered,
  onCreate,
  onScope,
}: {
  scope: Scope;
  filtered: boolean;
  onCreate: () => void;
  onScope: (scope: Scope) => void;
}) {
  if (filtered) {
    return (
      <EmptyState
        icon={Search}
        title="Mos test topilmadi"
        description="Qidiruv so‘zini yoki fan va sinf filtrlarini o‘zgartirib ko‘ring."
      />
    );
  }
  switch (scope) {
    case 'mine':
      return (
        <EmptyState
          icon={FileText}
          title="Sizda hali test yo‘q"
          description="Testni bir marta tuzing — keyin uni istalgan sinfda qayta-qayta sessiya sifatida o‘tkazasiz. Tayyor testni maktab test bankidan olish ham mumkin."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button icon={<Plus className="size-4" />} onClick={onCreate}>
                Yangi test
              </Button>
              <Button variant="outline" icon={<Landmark className="size-4" />} onClick={() => onScope('school')}>
                Maktab test banki
              </Button>
            </div>
          }
        />
      );
    case 'shared':
      return (
        <EmptyState
          icon={FileText}
          title="Siz bilan hali test ulashilmagan"
          description="Hamkasbingiz testini “Ulashish” tugmasi orqali siz bilan bo‘lishsa, u shu yerda paydo bo‘ladi. Barcha uchun ochiq testlar “Maktab test banki”da."
        />
      );
    case 'school':
      return (
        <EmptyState
          icon={Landmark}
          title="Maktab test bankida hali test yo‘q"
          description="O‘z testingizni bankka qo‘shish uchun uni oching va “Maktab bankiga chiqarish” tugmasini bosing. Bankdagi testlarni barcha o‘qituvchilar ko‘radi, nusxa oladi va o‘z sinflarida o‘tkazadi."
          action={
            <Button variant="outline" onClick={() => onScope('mine')}>
              Mening testlarim
            </Button>
          }
        />
      );
    default:
      return <EmptyState icon={FileText} title="Testlar topilmadi" />;
  }
}

function TestRow({
  test,
  taught,
  onCopy,
}: {
  test: TestListItem;
  taught: Set<string> | null;
  onCopy: (test: TestListItem) => void;
}) {
  const reasonId = useId();
  // Sabab ko‘rinadigan matn sifatida chiqadi (sensorli ekranda ham, klaviaturada ham o‘qiladi).
  const blocked = conductBlockReason(test) ?? subjectBlockReason(test, taught);
  const editor = test.permission === 'OWNER' || test.permission === 'EDIT';
  const copyable = test.permission !== 'VIEW' && (editor || test.publishedVersionNo !== null);
  return (
    <TR>
      <TD className="min-w-56">
        <Link href={`/teacher/tests/${test.id}`} className="font-medium text-slate-900 hover:underline">
          {test.title}
        </Link>
        <span className="mt-1 flex flex-wrap items-center gap-1.5">
          {test.visibility === 'SCHOOL' && (
            <Badge tone="brand">
              <Landmark className="size-3" aria-hidden /> Maktab banki
            </Badge>
          )}
          {test.permission !== 'OWNER' && test.permission !== 'SCHOOL' && (
            <Badge tone="violet">Huquq: {permissionLabel(test.permission).toLowerCase()}</Badge>
          )}
          {test.hasDraftChanges && <Badge tone="amber">Qoralamada o‘zgarishlar bor</Badge>}
        </span>
        <span className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
          {test.permission === 'OWNER' ? (
            'Muallif: siz'
          ) : (
            <>
              <Avatar name={test.owner.fullName} src={test.owner.avatarUrl} size="xs" />
              {test.owner.fullName}
            </>
          )}
          {test.topic && ` · ${test.topic}`}
        </span>
        {blocked && (
          <span id={reasonId} className="mt-1 block text-xs font-medium text-amber-700">
            Sessiya yaratib bo‘lmaydi: {blocked}
          </span>
        )}
      </TD>
      <TD className="whitespace-nowrap">
        {test.subject.name} · {test.gradeLevel}-sinf
      </TD>
      <TD className="text-right tabular">{test.questionCount}</TD>
      <TD className="hidden text-right tabular sm:table-cell">{formatPoints(test.totalPoints)}</TD>
      <TD>
        <span className="inline-flex flex-wrap gap-1">
          <TestStatusBadge status={test.status} />
          {test.publishedVersionNo !== null && <Badge tone="green">Tayyor v{test.publishedVersionNo}</Badge>}
        </span>
      </TD>
      <TD className="hidden text-right tabular md:table-cell">{test.sessionCount}</TD>
      <TD className="hidden whitespace-nowrap text-slate-500 lg:table-cell">{formatDate(test.updatedAt)}</TD>
      <TD>
        <div className="flex justify-end gap-1">
          {blocked ? (
            <Button
              size="sm"
              variant="secondary"
              icon={<CalendarPlus className="size-4" />}
              disabled
              title={blocked}
              aria-describedby={reasonId}
            >
              Sessiya yaratish
            </Button>
          ) : (
            <ButtonLink
              href={newSessionHref(test.id)}
              size="sm"
              variant="secondary"
              icon={<CalendarPlus className="size-4" />}
              aria-label={`“${test.title}” bilan sessiya yaratish`}
            >
              Sessiya yaratish
            </ButtonLink>
          )}
          {copyable && (
            <Button
              size="sm"
              variant="ghost"
              icon={<Copy className="size-4" />}
              onClick={() => onCopy(test)}
              aria-label={`“${test.title}” testidan nusxa olish`}
            >
              <span className="hidden xl:inline">Nusxa olish</span>
            </Button>
          )}
        </div>
      </TD>
    </TR>
  );
}

function TestsLibrary() {
  const { data: me } = useMe();
  const router = useRouter();
  const params = useSearchParams();
  const leadership = hasRole(me, 'DEPUTY', 'SUPER_ADMIN');
  const deputyOnly = isDeputyOnly(me);
  const taught = useTaughtSubjects();
  const [creating, setCreating] = useState(false);
  const [copying, setCopying] = useState<TestListItem | null>(null);
  const [filters, setFilters] = useState({ q: '', subjectId: '', gradeLevel: '', status: '', page: 1 });
  const set = (patch: Partial<typeof filters>) => setFilters((current) => ({ ...current, page: 1, ...patch }));

  const scopes: Scope[] = leadership ? ['mine', 'shared', 'school', 'all'] : ['mine', 'shared', 'school'];
  const requested = params.get('tab') as Scope | null;
  const scope: Scope = requested && scopes.includes(requested) ? requested : deputyOnly ? 'school' : 'mine';
  const setScope = (next: Scope) => {
    setFilters((current) => ({ ...current, page: 1, status: '' }));
    router.replace(`/teacher/tests?tab=${next}`, { scroll: false });
  };

  const subjects = useQuery({
    queryKey: ['subjects'],
    queryFn: () => api.get<Subject[]>('/subjects'),
    staleTime: 5 * 60_000,
  });
  const query = useQuery({
    queryKey: ['tests', scope, filters],
    queryFn: () => api.get<Page<TestListItem>>(`/tests${qs({ scope, ...filters, q: filters.q.trim(), pageSize: 25 })}`),
    placeholderData: (previous) => previous,
    enabled: Boolean(me),
  });
  const filtered = Boolean(filters.q.trim() || filters.subjectId || filters.gradeLevel || filters.status);

  return (
    <div>
      <PageHeader
        title={deputyOnly ? 'Test banki' : 'Testlar kutubxonasi'}
        description="Testni bir marta tuzing va istalgancha qayta ishlating: har bir sessiya testning muzlatilgan versiyasida o‘tadi. Maktab test banki barcha o‘qituvchilar uchun umumiy."
        actions={
          <>
            <ButtonLink href={newSessionHref()} variant="outline" icon={<CalendarPlus className="size-4" />}>
              Yangi sessiya
            </ButtonLink>
            <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
              Yangi test
            </Button>
          </>
        }
      />
      <Tabs<Scope>
        className="mb-4"
        value={scope}
        onChange={setScope}
        tabs={scopes.map((id) => ({
          id,
          label:
            id === 'mine'
              ? 'Mening testlarim'
              : id === 'shared'
                ? 'Menga ulashilgan'
                : id === 'school'
                  ? 'Maktab test banki'
                  : 'Barchasi',
        }))}
      />
      {scope === 'school' && (
        <Alert tone="info" className="mb-4">
          Bankdagi testning tayyor (muzlatilgan) versiyasi ko‘rinadi. Uni o‘zingiz shu fandan dars beradigan sinflarda
          o‘tkazishingiz mumkin; o‘zgartirish kerak bo‘lsa — nusxa oling.
        </Alert>
      )}
      <Card className="mb-4">
        <CardBody className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Qidiruv">
            <Input
              type="search"
              value={filters.q}
              onChange={(event) => set({ q: event.target.value })}
              placeholder="Nom, mavzu, teg yoki muallif"
            />
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
          <Field label="Sinf darajasi">
            <Select value={filters.gradeLevel} onChange={(event) => set({ gradeLevel: event.target.value })}>
              <option value="">Barchasi</option>
              {GRADE_LEVELS.map((grade) => (
                <option key={grade} value={grade}>
                  {grade}-sinf
                </option>
              ))}
            </Select>
          </Field>
          {scope !== 'school' && (
            <Field label="Holat">
              <Select value={filters.status} onChange={(event) => set({ status: event.target.value })}>
                <option value="">Faol (qoralama va e’lon qilingan)</option>
                <option value="DRAFT">Qoralama</option>
                <option value="ACTIVE">E’lon qilingan</option>
                <option value="ARCHIVED">Arxivlangan</option>
              </Select>
            </Field>
          )}
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
          <LibraryEmpty scope={scope} filtered={filtered} onCreate={() => setCreating(true)} onScope={setScope} />
        ) : (
          <>
            <Table caption="Testlar">
              <THead>
                <tr>
                  <TH>Test</TH>
                  <TH>Fan</TH>
                  <TH className="text-right">Savollar</TH>
                  <TH className="hidden text-right sm:table-cell">Ball</TH>
                  <TH>Holat</TH>
                  <TH className="hidden text-right md:table-cell">Sessiyalar</TH>
                  <TH className="hidden lg:table-cell">Yangilangan</TH>
                  <TH className="text-right">Amallar</TH>
                </tr>
              </THead>
              <tbody>
                {query.data.items.map((test) => (
                  <TestRow key={test.id} test={test} taught={taught} onCopy={setCopying} />
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
      <CopyTestDialog test={copying} open={Boolean(copying)} onClose={() => setCopying(null)} />
    </div>
  );
}

export default function TestsLibraryPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <TestsLibrary />
    </Suspense>
  );
}
