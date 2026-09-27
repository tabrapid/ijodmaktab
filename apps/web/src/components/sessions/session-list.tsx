'use client';

import { useQuery } from '@tanstack/react-query';
import { CalendarClock, Plus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import {
  SESSION_STATES,
  SESSION_STATE_LABELS,
  formatDate,
  formatDateTime,
  formatTime,
  schoolInputToDate,
} from '@ijod/shared';
import { SessionStateBadge } from '@/components/status';
import { Badge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { EmptyState, ErrorState, PageLoader } from '@/components/ui/feedback';
import { Field, Input, Select } from '@/components/ui/form';
import { Pagination } from '@/components/ui/pagination';
import { TD, TH, THead, TR, Table } from '@/components/ui/table';
import { api, qs } from '@/lib/api';
import { hasRole, useMe } from '@/lib/auth';
import type { ClassListItem, Page, SessionListItem, Subject } from '@/lib/types';

interface Filters {
  scope: 'mine' | 'all';
  q: string;
  state: string;
  subjectId: string;
  classId: string;
  from: string;
  to: string;
  page: number;
}

/** Bir kunlik oraliq: “2026-09-27” → shu kunning boshi/oxiri (Toshkent vaqti). */
const dayStart = (value: string) => (value ? schoolInputToDate(`${value}T00:00:00`).toISOString() : undefined);
const dayEnd = (value: string) => (value ? schoolInputToDate(`${value}T23:59:59`).toISOString() : undefined);

export function sessionTimeRange(startsAt: string, endsAt: string) {
  const sameDay = formatDate(startsAt) === formatDate(endsAt);
  return sameDay
    ? `${formatDateTime(startsAt)} – ${formatTime(endsAt)}`
    : `${formatDateTime(startsAt)} – ${formatDateTime(endsAt)}`;
}

/**
 * Sessiyalar ro‘yxati: o‘qituvchi — o‘zi yaratgan/o‘tkazadigan (sinf rahbari — sinfidagilar ham),
 * rahbariyat — butun maktab.
 */
export function SessionList({
  defaultScope = 'mine',
  detailBase = '/teacher/sessions',
}: {
  defaultScope?: 'mine' | 'all';
  detailBase?: string;
}) {
  const { data: me } = useMe();
  const leadership = hasRole(me, 'DEPUTY', 'SUPER_ADMIN');
  const homeroom = (me?.homeroomClassIds.length ?? 0) > 0;
  const [filters, setFilters] = useState<Filters>({
    scope: defaultScope,
    q: '',
    state: '',
    subjectId: '',
    classId: '',
    from: '',
    to: '',
    page: 1,
  });
  const set = (patch: Partial<Filters>) => setFilters((current) => ({ ...current, page: 1, ...patch }));

  const subjects = useQuery({
    queryKey: ['subjects'],
    queryFn: () => api.get<Subject[]>('/subjects'),
    staleTime: 5 * 60_000,
  });
  const classes = useQuery({
    queryKey: ['classes', leadership ? 'all' : 'mine'],
    queryFn: () => api.get<ClassListItem[]>(`/classes?scope=${leadership ? 'all' : 'mine'}`),
    enabled: Boolean(me),
    staleTime: 5 * 60_000,
  });
  const query = useQuery({
    queryKey: ['sessions', filters],
    queryFn: () =>
      api.get<Page<SessionListItem>>(
        `/sessions${qs({
          scope: filters.scope,
          q: filters.q.trim(),
          state: filters.state,
          subjectId: filters.subjectId,
          classId: filters.classId,
          from: dayStart(filters.from),
          to: dayEnd(filters.to),
          page: filters.page,
          pageSize: 25,
        })}`,
      ),
    placeholderData: (previous) => previous,
    enabled: Boolean(me),
  });

  const showScope = leadership || homeroom;

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Qidiruv">
            <Input value={filters.q} onChange={(event) => set({ q: event.target.value })} placeholder="Sessiya nomi" />
          </Field>
          {showScope && (
            <Field label="Ko‘rinish">
              <Select
                value={filters.scope}
                onChange={(event) => set({ scope: event.target.value as Filters['scope'] })}
              >
                <option value="mine">Men yaratgan yoki o‘tkazadigan</option>
                <option value="all">{leadership ? 'Butun maktab' : 'Sinfimdagi sessiyalar ham'}</option>
              </Select>
            </Field>
          )}
          <Field label="Holat">
            <Select value={filters.state} onChange={(event) => set({ state: event.target.value })}>
              <option value="">Barchasi</option>
              {SESSION_STATES.map((state) => (
                <option key={state} value={state}>
                  {SESSION_STATE_LABELS[state]}
                </option>
              ))}
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
          <Field label="Sinf">
            <Select value={filters.classId} onChange={(event) => set({ classId: event.target.value })}>
              <option value="">Barchasi</option>
              {(classes.data ?? []).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Sanadan">
            <Input type="date" value={filters.from} onChange={(event) => set({ from: event.target.value })} />
          </Field>
          <Field label="Sanagacha">
            <Input type="date" value={filters.to} onChange={(event) => set({ to: event.target.value })} />
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
            icon={CalendarClock}
            title="Sessiyalar topilmadi"
            description="Yangi sessiya uchun o‘z testingizni yoki maktab test bankidagi tayyor testni tanlang, sinf va vaqtni belgilang."
            action={
              <ButtonLink href="/teacher/sessions/new" icon={<Plus className="size-4" />}>
                Yangi sessiya
              </ButtonLink>
            }
          />
        ) : (
          <>
            <Table caption="Sessiyalar">
              <THead>
                <tr>
                  <TH>Sessiya</TH>
                  <TH>Vaqt</TH>
                  <TH>Holat</TH>
                  <TH className="text-right">Yakunlagan</TH>
                  <TH>O‘tkazuvchi</TH>
                </tr>
              </THead>
              <tbody>
                {query.data.items.map((session) => (
                  <TR key={session.id}>
                    <TD>
                      <Link href={`${detailBase}/${session.id}`} className="font-medium text-slate-900 hover:underline">
                        {session.title}
                      </Link>
                      <p className="text-xs text-slate-500">
                        {session.subject.name} ·{' '}
                        {session.classes.map((item) => item.name).join(', ') || 'alohida o‘quvchilar'} ·{' '}
                        {session.versionNo}-versiya
                      </p>
                    </TD>
                    <TD className="whitespace-nowrap text-slate-600">
                      {sessionTimeRange(session.startsAt, session.endsAt)}
                    </TD>
                    <TD>
                      <span className="inline-flex flex-wrap gap-1">
                        <SessionStateBadge state={session.state} />
                        {session.resultsPublishedAt && <Badge tone="brand">Natijalar e’lon qilingan</Badge>}
                      </span>
                    </TD>
                    <TD className="text-right whitespace-nowrap tabular">
                      {session.finishedCount} / {session.assignedCount}
                      {session.inProgressCount > 0 && (
                        <p className="text-xs text-sky-700">{session.inProgressCount} nafari ishlamoqda</p>
                      )}
                    </TD>
                    <TD className="whitespace-nowrap text-slate-600">{session.conductor.fullName}</TD>
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
    </div>
  );
}
