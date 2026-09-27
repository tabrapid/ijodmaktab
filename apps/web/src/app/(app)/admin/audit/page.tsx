'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Filter, FilterX, ScrollText, X } from 'lucide-react';
import Link from 'next/link';
import { Suspense, type ReactNode } from 'react';
import { dateToSchoolInput, formatDateTime, formatInternalId, schoolInputToDate } from '@ijod/shared';
import { AUDIT_ENTITY_LABELS, AUDIT_PREFIXES, auditActionLabel, auditEntityLabel } from '@/components/admin/labels';
import { adminKeys } from '@/components/admin/queries';
import { SearchInput } from '@/components/admin/search-input';
import { intParam, useUrlParams } from '@/components/admin/url-state';
import { RoleBadges } from '@/components/status';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, PageHeader } from '@/components/ui/card';
import { Alert, EmptyState, ErrorState, PageLoader, Spinner } from '@/components/ui/feedback';
import { Field, Input, Select } from '@/components/ui/form';
import { Pagination } from '@/components/ui/pagination';
import { TD, TH, THead, TR, Table } from '@/components/ui/table';
import { api, qs } from '@/lib/api';
import { hasRole, useMe } from '@/lib/auth';
import type { AuditItem, Page } from '@/lib/types';

const PAGE_SIZE = 50;
const DATETIME_LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/** `datetime-local` qiymati (Toshkent vaqti) → ISO; noto‘g‘ri bo‘lsa `undefined`. */
function toIso(value: string | null) {
  if (!value || !DATETIME_LOCAL.test(value)) return undefined;
  const date = schoolInputToDate(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function hasData(data: unknown) {
  if (data === null || data === undefined) return false;
  if (typeof data === 'object') return Object.keys(data).length > 0;
  return true;
}

function FilterChip({ label, onRemove }: { label: ReactNode; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 py-1 pr-1 pl-3 text-sm text-brand-800">
      {label}
      <button
        type="button"
        onClick={onRemove}
        className="rounded-full p-0.5 text-brand-600 hover:bg-brand-100"
        aria-label="Filtrni olib tashlash"
      >
        <X className="size-3.5" />
      </button>
    </span>
  );
}

function AuditRow({
  item,
  canOpenUsers,
  classPath,
  onFilter,
}: {
  item: AuditItem;
  canOpenUsers: boolean;
  /** Sinf sahifasi: administratorga — boshqaruv, rahbariyatga — o‘qituvchi bo‘limidagi sahifa. */
  classPath: string;
  onFilter: (changes: Record<string, string | null>) => void;
}) {
  const label = auditActionLabel(item.action);
  const entityHref =
    item.entityId && canOpenUsers
      ? item.entityType === 'User'
        ? `/admin/users/${item.entityId}`
        : item.entityType === 'Class'
          ? `${classPath}/${item.entityId}`
          : null
      : null;
  return (
    <TR className="align-top">
      <TD className="whitespace-nowrap text-slate-600 tabular">{formatDateTime(item.createdAt)}</TD>
      <TD className="min-w-48">
        {item.actor ? (
          <div className="space-y-1">
            <div className="flex items-center gap-1">
              {canOpenUsers ? (
                <Link
                  href={`/admin/users/${item.actor.id}`}
                  className="font-medium text-slate-900 hover:text-brand-700 hover:underline"
                >
                  {item.actor.lastName} {item.actor.firstName}
                </Link>
              ) : (
                <span className="font-medium text-slate-900">
                  {item.actor.lastName} {item.actor.firstName}
                </span>
              )}
              <button
                type="button"
                onClick={() => onFilter({ actorId: item.actor?.id ?? null })}
                className="rounded p-0.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                aria-label={`Faqat ${item.actor.lastName} ${item.actor.firstName} amallarini ko‘rsatish`}
                title="Shu foydalanuvchi amallari"
              >
                <Filter className="size-3.5" />
              </button>
            </div>
            <p className="font-mono text-xs text-slate-500 tabular">ID {formatInternalId(item.actor.internalId)}</p>
            {item.actorRoles.length > 0 && <RoleBadges roles={item.actorRoles} />}
          </div>
        ) : (
          <span className="text-slate-500">Tizim yoki noma’lum</span>
        )}
      </TD>
      <TD className="min-w-56">
        <p className="font-medium text-slate-900">{label ?? 'Boshqa amal'}</p>
        <code className="text-xs text-slate-500">{item.action}</code>
      </TD>
      <TD className="min-w-40">
        {item.entityType ? (
          <div className="space-y-0.5">
            <div className="flex items-center gap-1">
              <span>{auditEntityLabel(item.entityType)}</span>
              {item.entityId && (
                <button
                  type="button"
                  onClick={() => onFilter({ entityType: item.entityType, entityId: item.entityId })}
                  className="rounded p-0.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                  aria-label="Shu obyekt bo‘yicha barcha yozuvlar"
                  title="Shu obyekt bo‘yicha barcha yozuvlar"
                >
                  <Filter className="size-3.5" />
                </button>
              )}
            </div>
            {item.entityId &&
              (entityHref ? (
                <Link
                  href={entityHref}
                  className="font-mono text-xs text-brand-700 hover:underline"
                  title={item.entityId}
                >
                  {item.entityId.slice(0, 8)}…
                </Link>
              ) : (
                <span className="font-mono text-xs text-slate-500" title={item.entityId}>
                  {item.entityId.length > 12 ? `${item.entityId.slice(0, 8)}…` : item.entityId}
                </span>
              ))}
          </div>
        ) : (
          <span className="text-slate-400">—</span>
        )}
      </TD>
      <TD className="font-mono text-xs whitespace-nowrap text-slate-600">{item.ip ?? '—'}</TD>
      <TD className="min-w-40">
        {hasData(item.data) ? (
          <details className="group">
            <summary className="cursor-pointer text-sm font-medium text-brand-700 select-none hover:underline">
              Tafsilotlar
            </summary>
            <pre className="mt-2 max-h-72 max-w-md overflow-auto rounded-md bg-slate-900 p-3 text-xs whitespace-pre-wrap break-all text-slate-100">
              {JSON.stringify(item.data, null, 2)}
            </pre>
          </details>
        ) : (
          <span className="text-slate-400">—</span>
        )}
      </TD>
    </TR>
  );
}

function AuditLog() {
  const { data: me } = useMe();
  const { params, update } = useUrlParams();
  const superAdmin = hasRole(me, 'SUPER_ADMIN');
  // Direktor o‘rinbosari ham foydalanuvchi sahifalarini ochadi (o‘qituvchi va o‘quvchi hisoblarini boshqaradi).
  const canOpenUsers = hasRole(me, 'DEPUTY', 'ADMIN', 'SUPER_ADMIN');
  const classPath = hasRole(me, 'ADMIN', 'SUPER_ADMIN') ? '/admin/classes' : '/teacher/classes';

  const page = intParam(params.get('page'), 1);
  const action = params.get('action') ?? '';
  const entityType = params.get('entityType') ?? '';
  const entityId = params.get('entityId') ?? '';
  const actorId = params.get('actorId') ?? '';
  const fromInput = params.get('from') ?? '';
  const toInput = params.get('to') ?? '';
  const from = toIso(fromInput);
  const to = toIso(toInput);
  const prefixes = AUDIT_PREFIXES.filter((prefix) => superAdmin || !prefix.securityOnly);
  const prefix = prefixes.some((item) => item.value === action) ? action : '';
  const filtered = Boolean(action || entityType || entityId || actorId || fromInput || toInput);

  const apiParams = {
    page,
    pageSize: PAGE_SIZE,
    action,
    entityType,
    entityId,
    actorId,
    from: from ?? '',
    to: to ?? '',
  };
  const query = useQuery({
    queryKey: adminKeys.audit(apiParams),
    queryFn: () => api.get<Page<AuditItem>>(`/audit${qs(apiParams)}`),
    placeholderData: keepPreviousData,
  });

  const clearAll = () =>
    update({ action: null, entityType: null, entityId: null, actorId: null, from: null, to: null });
  const actorName = query.data?.items.find((item) => item.actor?.id === actorId)?.actor;

  return (
    <div className="space-y-6">
      <PageHeader title="Audit jurnali" description="Tizimdagi muhim amallar: kim, qachon, nima qildi." />

      <Alert tone="info" title="Jurnal faqat qo‘shiladi">
        Yozuvlarni tahrirlash yoki o‘chirish imkoni yo‘q — bu hech kimga, jumladan super adminga ham berilmaydi.
        {!superAdmin && ' Kirish va xavfsizlik yozuvlari (auth.*) faqat super adminga ko‘rinadi.'}
      </Alert>

      <Card>
        <CardBody className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <Field label="Bo‘lim" className="lg:col-span-2">
              <Select value={prefix} onChange={(event) => update({ action: event.target.value })}>
                <option value="">Barcha amallar</option>
                {prefixes.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label} ({item.value}*)
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Amal kodi (boshlanishi)" className="lg:col-span-2">
              <SearchInput
                value={action}
                onSearch={(value) => update({ action: value })}
                label="Amal kodi"
                placeholder="masalan, user.create"
              />
            </Field>
            <Field label="Obyekt turi" className="lg:col-span-2">
              <Select
                value={entityType}
                onChange={(event) => update({ entityType: event.target.value, entityId: null })}
              >
                <option value="">Barcha obyektlar</option>
                {Object.entries(AUDIT_ENTITY_LABELS).map(([value, text]) => (
                  <option key={value} value={value}>
                    {text}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Dan (Toshkent vaqti)" className="lg:col-span-3">
              <Input
                type="datetime-local"
                value={fromInput}
                max={toInput || undefined}
                onChange={(event) => update({ from: event.target.value })}
              />
            </Field>
            <Field label="Gacha (Toshkent vaqti)" className="lg:col-span-3">
              <Input
                type="datetime-local"
                value={toInput}
                min={fromInput || undefined}
                onChange={(event) => update({ to: event.target.value })}
              />
            </Field>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => update({ from: dateToSchoolInput(new Date(Date.now() - 24 * 3_600_000)), to: null })}
            >
              So‘nggi 24 soat
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => update({ from: dateToSchoolInput(new Date(Date.now() - 7 * 24 * 3_600_000)), to: null })}
            >
              So‘nggi 7 kun
            </Button>
            {actorId && (
              <FilterChip
                label={actorName ? `Kim: ${actorName.lastName} ${actorName.firstName}` : 'Tanlangan foydalanuvchi'}
                onRemove={() => update({ actorId: null })}
              />
            )}
            {entityId && (
              <FilterChip
                label={`Obyekt: ${auditEntityLabel(entityType || null)} ${entityId.slice(0, 8)}…`}
                onRemove={() => update({ entityId: null })}
              />
            )}
            {filtered && (
              <Button variant="ghost" size="sm" onClick={clearAll} icon={<FilterX className="size-4" aria-hidden />}>
                Filtrlarni tozalash
              </Button>
            )}
          </div>
          {from && to && from > to && (
            <Alert tone="warning">“Dan” vaqti “Gacha” vaqtidan keyin — natija bo‘sh bo‘ladi.</Alert>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Yozuvlar"
          description={query.data ? `Topildi: ${query.data.total}` : undefined}
          actions={
            query.isFetching && !query.isPending ? (
              <Spinner className="size-4 text-brand-600" label="Yangilanmoqda…" />
            ) : undefined
          }
        />
        {query.isPending ? (
          <PageLoader />
        ) : query.isError ? (
          <CardBody>
            <ErrorState error={query.error} onRetry={() => query.refetch()} />
          </CardBody>
        ) : query.data.items.length === 0 ? (
          <EmptyState
            icon={ScrollText}
            title={filtered ? 'Filtrga mos yozuv topilmadi' : 'Jurnalda hali yozuv yo‘q'}
            action={
              filtered ? (
                <Button variant="outline" size="sm" onClick={clearAll}>
                  Filtrlarni tozalash
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <Table caption="Audit jurnali yozuvlari">
              <THead>
                <tr>
                  <TH>Vaqt</TH>
                  <TH>Kim</TH>
                  <TH>Amal</TH>
                  <TH>Obyekt</TH>
                  <TH>IP</TH>
                  <TH>Ma’lumot</TH>
                </tr>
              </THead>
              <tbody className={query.isPlaceholderData ? 'opacity-60' : undefined}>
                {query.data.items.map((item) => (
                  <AuditRow
                    key={item.id}
                    item={item}
                    canOpenUsers={canOpenUsers}
                    classPath={classPath}
                    onFilter={(changes) => update(changes)}
                  />
                ))}
              </tbody>
            </Table>
            <div className="border-t border-slate-100 px-5 py-3">
              <Pagination
                page={query.data.page}
                pageSize={query.data.pageSize}
                total={query.data.total}
                onChange={(next) => update({ page: next }, { resetPage: false })}
              />
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

export default function AuditPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <AuditLog />
    </Suspense>
  );
}
