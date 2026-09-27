'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './button';

export function Pagination({
  page,
  pageSize,
  total,
  onChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return total > 0 ? <p className="px-1 text-xs text-slate-500">Jami: {total}</p> : null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <nav className="flex flex-wrap items-center justify-between gap-3 text-sm" aria-label="Sahifalar">
      <p className="text-slate-500">
        {from}–{to} / {total}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onChange(page - 1)}
          disabled={page <= 1}
          icon={<ChevronLeft className="size-4" />}
        >
          Oldingi
        </Button>
        <span className="text-slate-600 tabular">
          {page} / {pages}
        </span>
        <Button variant="outline" size="sm" onClick={() => onChange(page + 1)} disabled={page >= pages}>
          Keyingi
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </nav>
  );
}
