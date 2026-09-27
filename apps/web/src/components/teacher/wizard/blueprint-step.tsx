'use client';

import { useState } from 'react';
import {
  CATEGORIES,
  CATEGORY_LABELS,
  blueprintTotals,
  draftTotals,
  formatPoints,
  type Blueprint,
  type Category,
} from '@ijod/shared';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/feedback';
import { Input } from '@/components/ui/form';
import { TD, TH, THead, TR, Table } from '@/components/ui/table';
import type { TestDetail } from '@/lib/types';
import { testApi, useTestMutation } from './use-test';

/** 2-bosqich: tuzilma — bilish, qo‘llash va mulohaza uchun savollar soni va rejalashtirilgan ballar. */
export function BlueprintStep({
  test,
  onSaved,
  readOnly,
}: {
  test: TestDetail;
  onSaved: () => void;
  readOnly: boolean;
}) {
  const initial = test.version?.blueprint ?? {};
  const [rows, setRows] = useState<Record<Category, { count: string; pointsEach: string }>>(
    () =>
      Object.fromEntries(
        CATEGORIES.map((category) => [
          category,
          { count: String(initial[category]?.count ?? 0), pointsEach: String(initial[category]?.pointsEach ?? 0) },
        ]),
      ) as Record<Category, { count: string; pointsEach: string }>,
  );
  const save = useTestMutation(test.id, testApi.blueprint(test.id), 'Tuzilma saqlandi.');

  const blueprint: Blueprint = {};
  for (const category of CATEGORIES) {
    const count = Number.parseInt(rows[category].count, 10) || 0;
    const pointsEach = Number(rows[category].pointsEach.replace(',', '.')) || 0;
    if (count > 0) blueprint[category] = { count, pointsEach };
  }
  const planned = blueprintTotals(blueprint);
  const actual = draftTotals(test.version?.questions ?? []);

  const update = (category: Category, field: 'count' | 'pointsEach', value: string) =>
    setRows((current) => ({ ...current, [category]: { ...current[category], [field]: value } }));

  return (
    <div className="space-y-4">
      <Alert tone="info">
        Masalan: 5 ta bilish × 2 ball + 5 ta qo‘llash × 4 ball + 5 ta mulohaza × 6 ball = 60 ball. Bu namuna, majburiy
        standart emas. Bitta savol bitta asosiy kategoriyaga tegishli bo‘ladi.
      </Alert>
      <Table caption="Test tuzilmasi">
        <THead>
          <tr>
            <TH>Kategoriya</TH>
            <TH>Savollar soni</TH>
            <TH>Har savol balli</TH>
            <TH className="text-right">Rejada</TH>
            <TH className="text-right">Testda hozir</TH>
          </tr>
        </THead>
        <tbody>
          {CATEGORIES.map((category) => {
            const plan = planned.perCategory[category];
            const fact = actual.perCategory[category];
            return (
              <TR key={category}>
                <TD className="font-medium">{CATEGORY_LABELS[category]}</TD>
                <TD>
                  <Input
                    type="number"
                    min={0}
                    className="w-24"
                    value={rows[category].count}
                    onChange={(event) => update(category, 'count', event.target.value)}
                    disabled={readOnly}
                    aria-label={`${CATEGORY_LABELS[category]}: savollar soni`}
                  />
                </TD>
                <TD>
                  <Input
                    type="number"
                    min={0}
                    step="0.5"
                    className="w-24"
                    value={rows[category].pointsEach}
                    onChange={(event) => update(category, 'pointsEach', event.target.value)}
                    disabled={readOnly}
                    aria-label={`${CATEGORY_LABELS[category]}: har savol balli`}
                  />
                </TD>
                <TD className="text-right tabular">
                  {plan ? `${plan.count} ta · ${formatPoints(plan.points)} ball` : '—'}
                </TD>
                <TD className="text-right tabular text-slate-600">
                  {fact ? `${fact.count} ta · ${formatPoints(fact.points)} ball` : '—'}
                </TD>
              </TR>
            );
          })}
          <TR className="bg-slate-50 font-semibold">
            <TD>Jami</TD>
            <TD />
            <TD />
            <TD className="text-right tabular">
              {planned.count} ta · {formatPoints(planned.points)} ball
            </TD>
            <TD className="text-right tabular">
              {actual.count} ta · {formatPoints(actual.points)} ball
            </TD>
          </TR>
        </tbody>
      </Table>
      {!readOnly && (
        <div className="flex justify-end">
          <Button
            loading={save.isPending}
            onClick={async () => {
              await save.mutateAsync({ blueprint });
              onSaved();
            }}
          >
            Saqlash va davom etish
          </Button>
        </div>
      )}
    </div>
  );
}
