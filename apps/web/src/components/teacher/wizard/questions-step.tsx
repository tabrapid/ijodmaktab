'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Copy, Library, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { CATEGORIES, CATEGORY_LABELS, formatPoints } from '@ijod/shared';
import { CategoryBadge, DifficultyBadge } from '@/components/status';
import { QuestionEditor, type QuestionEditorValue } from '@/components/teacher/question-editor';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { EmptyState, ErrorState, PageLoader } from '@/components/ui/feedback';
import { Checkbox, Field, Input, Select } from '@/components/ui/form';
import { api, qs } from '@/lib/api';
import type { Page, QuestionItem, TestDetail, TestListItem, TestQuestionView } from '@/lib/types';
import { testApi, useTestMutation } from './use-test';

const LETTERS = 'ABCDEFGHIJ';

function BankPicker({ test, open, onClose }: { test: TestDetail; open: boolean; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const add = useTestMutation(test.id, testApi.fromBank(test.id), 'Savollar qo‘shildi.');
  const present = new Set(test.version?.questions.map((question) => question.questionId));
  const query = useQuery({
    queryKey: ['questions', 'picker', test.subject.id, q, category],
    queryFn: () =>
      api.get<Page<QuestionItem>>(
        `/questions${qs({ scope: 'available', subjectId: test.subject.id, q, category, pageSize: 50 })}`,
      ),
    enabled: open,
  });
  const toggle = (id: string) =>
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Savollar bankidan qo‘shish"
      description={`${test.subject.name} fani bo‘yicha sizning va maktab bankidagi savollar`}
      size="xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button
            disabled={selected.length === 0}
            loading={add.isPending}
            onClick={async () => {
              await add.mutateAsync(selected);
              setSelected([]);
              onClose();
            }}
          >
            {selected.length} ta savolni qo‘shish
          </Button>
        </>
      }
    >
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Field label="Qidiruv" className="sm:col-span-2">
          <Input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Savol matni yoki mavzu" />
        </Field>
        <Field label="Kategoriya">
          <Select value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="">Barchasi</option>
            {CATEGORIES.map((item) => (
              <option key={item} value={item}>
                {CATEGORY_LABELS[item]}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {query.isPending ? (
        <PageLoader />
      ) : query.isError ? (
        <ErrorState error={query.error} />
      ) : query.data.items.length === 0 ? (
        <EmptyState icon={Library} title="Savollar topilmadi" />
      ) : (
        <ul className="space-y-2">
          {query.data.items.map((question) => {
            const already = present.has(question.id);
            const latest = question.latest!;
            return (
              <li key={question.id} className="rounded-lg border border-slate-200 p-3">
                <Checkbox
                  checked={selected.includes(question.id) || already}
                  disabled={already}
                  onChange={() => toggle(question.id)}
                  label={
                    <span className="block">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <CategoryBadge category={latest.category} />
                        <DifficultyBadge difficulty={latest.difficulty} />
                        <Badge tone="gray">{formatPoints(latest.points)} ball</Badge>
                        {question.visibility === 'SCHOOL' && <Badge tone="brand">Maktab banki</Badge>}
                        {already && <Badge tone="green">Testda bor</Badge>}
                      </span>
                      <span className="mt-1.5 block whitespace-pre-wrap text-slate-900">{latest.stem}</span>
                      {question.topic && (
                        <span className="mt-1 block text-xs text-slate-500">Mavzu: {question.topic}</span>
                      )}
                    </span>
                  }
                />
              </li>
            );
          })}
        </ul>
      )}
    </Dialog>
  );
}

function CopyFromTest({ test, open, onClose }: { test: TestDetail; open: boolean; onClose: () => void }) {
  const [sourceId, setSourceId] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const copy = useTestMutation(test.id, testApi.fromTest(test.id), 'Savollar nusxalandi.');
  // O‘zimniki, ulashilgan va maktab bankidagi testlar (boshqalarniki — tayyor versiyasi bilan).
  const tests = useQuery({
    queryKey: ['tests', 'copy-source', search.trim()],
    queryFn: () => api.get<Page<TestListItem>>(`/tests${qs({ scope: 'available', q: search.trim(), pageSize: 100 })}`),
    enabled: open,
    placeholderData: (previous) => previous,
  });
  const source = useQuery({
    queryKey: ['test', sourceId],
    queryFn: () => api.get<TestDetail>(`/tests/${sourceId}`),
    enabled: open && Boolean(sourceId),
  });
  const candidates = (tests.data?.items ?? []).filter(
    (item) => item.id !== test.id && item.permission !== 'VIEW' && item.questionCount > 0,
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Oldingi testdan nusxa olish"
      size="xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button
            disabled={!sourceId}
            loading={copy.isPending}
            onClick={async () => {
              await copy.mutateAsync({
                sourceTestId: sourceId,
                testQuestionIds: selected.length ? selected : undefined,
              });
              setSelected([]);
              onClose();
            }}
          >
            {selected.length ? `${selected.length} ta savolni nusxalash` : 'Barcha savollarni nusxalash'}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
        <Field label="Qidiruv">
          <Input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Nom, mavzu yoki muallif"
          />
        </Field>
        <Field label="Manba test" hint="Sizning, siz bilan ulashilgan va maktab bankidagi testlar.">
          <Select
            value={sourceId}
            onChange={(event) => {
              setSourceId(event.target.value);
              setSelected([]);
            }}
          >
            <option value="">{tests.isPending ? 'Yuklanmoqda…' : '— tanlang —'}</option>
            {candidates.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title} ({item.subject.name}, {item.questionCount} ta savol
                {item.permission === 'OWNER' ? '' : `, ${item.owner.fullName}`})
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {sourceId && (
        <div className="mt-4">
          {source.isPending ? (
            <PageLoader />
          ) : source.data?.version?.questions.length ? (
            <ul className="space-y-2">
              {source.data.version.questions.map((question) => (
                <li key={question.testQuestionId} className="rounded-lg border border-slate-200 p-3">
                  <Checkbox
                    checked={selected.includes(question.testQuestionId)}
                    onChange={() =>
                      setSelected((current) =>
                        current.includes(question.testQuestionId)
                          ? current.filter((item) => item !== question.testQuestionId)
                          : [...current, question.testQuestionId],
                      )
                    }
                    label={
                      <span>
                        <span className="font-medium">{question.number}.</span> {question.stem}
                      </span>
                    }
                  />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Bu testda savollar yo‘q" />
          )}
        </div>
      )}
    </Dialog>
  );
}

function QuestionRow({
  question,
  index,
  total,
  readOnly,
  onEdit,
  onRemove,
  onMove,
}: {
  question: TestQuestionView;
  index: number;
  total: number;
  readOnly: boolean;
  onEdit: () => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
}) {
  return (
    <li id={`question-${question.number}`} className="rounded-xl border border-slate-200 bg-surface p-4">
      <div className="flex flex-wrap items-start gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand-700 tabular">
          {question.number}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <CategoryBadge category={question.category} />
            <DifficultyBadge difficulty={question.difficulty} />
            <Badge tone="gray">{formatPoints(question.points)} ball</Badge>
            {!question.isMyQuestion && <Badge tone="violet">Boshqa muallif</Badge>}
            {question.locked && <Badge tone="gray">Ishlatilgan (v{question.versionNo})</Badge>}
          </div>
          <p className="mt-2 whitespace-pre-wrap text-slate-900">{question.stem}</p>
          <ul className="mt-2 grid gap-1 sm:grid-cols-2">
            {question.options.map((option, optionIndex) => (
              <li
                key={option.id}
                className={
                  option.id === question.correctOptionId
                    ? 'rounded bg-emerald-50 px-2 py-0.5 text-sm text-emerald-900'
                    : 'px-2 py-0.5 text-sm text-slate-600'
                }
              >
                <span className="font-semibold">{LETTERS[optionIndex]})</span> {option.text}
                {option.id === question.correctOptionId && <span className="ml-1 text-xs font-medium">✓ to‘g‘ri</span>}
              </li>
            ))}
          </ul>
        </div>
        {!readOnly && (
          <div className="flex shrink-0 gap-1">
            <Button size="sm" variant="ghost" onClick={() => onMove(-1)} disabled={index === 0} aria-label="Yuqoriga">
              <ArrowUp className="size-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onMove(1)}
              disabled={index === total - 1}
              aria-label="Pastga"
            >
              <ArrowDown className="size-4" />
            </Button>
            <Button size="sm" variant="ghost" onClick={onEdit} aria-label="Tahrirlash">
              <Pencil className="size-4" />
            </Button>
            <Button size="sm" variant="ghost" onClick={onRemove} aria-label="Testdan olib tashlash">
              <Trash2 className="size-4 text-red-600" />
            </Button>
          </div>
        )}
      </div>
    </li>
  );
}

/** 3-bosqich: savollar — yangi savol, bankdan tanlash yoki oldingi testdan nusxa olish. */
export function QuestionsStep({ test, readOnly }: { test: TestDetail; readOnly: boolean }) {
  const [adding, setAdding] = useState(false);
  const [picking, setPicking] = useState(false);
  const [copying, setCopying] = useState(false);
  const [editing, setEditing] = useState<TestQuestionView | null>(null);
  const [removing, setRemoving] = useState<TestQuestionView | null>(null);
  const addNew = useTestMutation(test.id, testApi.addQuestion(test.id), 'Savol qo‘shildi.');
  const update = useTestMutation(test.id, testApi.updateQuestion(test.id), 'Savol saqlandi.');
  const remove = useTestMutation(test.id, testApi.removeQuestion(test.id), 'Savol testdan olib tashlandi.');
  const reorder = useTestMutation(test.id, testApi.reorder(test.id));
  const questions = test.version?.questions ?? [];

  const move = (index: number, direction: -1 | 1) => {
    const ids = questions.map((question) => question.testQuestionId);
    const target = index + direction;
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    reorder.mutate(ids);
  };

  return (
    <div className="space-y-4">
      {!readOnly && (
        <div className="flex flex-wrap gap-2">
          <Button icon={<Plus className="size-4" />} onClick={() => setAdding(true)}>
            Yangi savol
          </Button>
          <Button variant="outline" icon={<Library className="size-4" />} onClick={() => setPicking(true)}>
            Bankdan tanlash
          </Button>
          <Button variant="outline" icon={<Copy className="size-4" />} onClick={() => setCopying(true)}>
            Oldingi testdan
          </Button>
        </div>
      )}

      {questions.length === 0 ? (
        <EmptyState title="Testda hali savol yo‘q" description="Yangi savol yarating yoki savollar bankidan tanlang." />
      ) : (
        <ol className="space-y-3">
          {questions.map((question, index) => (
            <QuestionRow
              key={question.testQuestionId}
              question={question}
              index={index}
              total={questions.length}
              readOnly={readOnly}
              onEdit={() => setEditing(question)}
              onRemove={() => setRemoving(question)}
              onMove={(direction) => move(index, direction)}
            />
          ))}
        </ol>
      )}

      <Dialog
        open={adding}
        onClose={() => setAdding(false)}
        title="Yangi savol"
        description="Savol sizning bankingizga ham qo‘shiladi."
        size="lg"
      >
        {adding && (
          <QuestionEditor
            defaults={{ topic: test.topic }}
            submitLabel="Testga qo‘shish"
            onCancel={() => setAdding(false)}
            onSubmit={async (value: QuestionEditorValue) => {
              await addNew.mutateAsync(value);
              setAdding(false);
            }}
          />
        )}
      </Dialog>

      <Dialog
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={`${editing?.number ?? ''}-savolni tahrirlash`}
        size="lg"
      >
        {editing && (
          <div className="space-y-3">
            {!editing.isMyQuestion && (
              <p className="rounded-md bg-violet-50 p-3 text-sm text-violet-900">
                Bu savol boshqa muallifga tegishli. O‘zgartirsangiz, sizning shaxsiy nusxangiz yaratiladi — asl savol
                o‘zgarmaydi.
              </p>
            )}
            <QuestionEditor
              key={editing.testQuestionId}
              showMeta={false}
              lockedNotice={editing.locked}
              defaults={{
                stem: editing.stem,
                options: editing.options,
                correctOptionId: editing.correctOptionId,
                explanation: editing.explanation,
                category: editing.category,
                difficulty: editing.difficulty,
                points: editing.points,
              }}
              onCancel={() => setEditing(null)}
              onSubmit={async (value: QuestionEditorValue) => {
                await update.mutateAsync({
                  testQuestionId: editing.testQuestionId,
                  content: value.content,
                  points: value.content.points,
                });
                setEditing(null);
              }}
            />
          </div>
        )}
      </Dialog>

      <BankPicker test={test} open={picking} onClose={() => setPicking(false)} />
      <CopyFromTest test={test} open={copying} onClose={() => setCopying(false)} />

      <ConfirmDialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          if (!removing) return;
          await remove.mutateAsync(removing.testQuestionId);
          setRemoving(null);
        }}
        loading={remove.isPending}
        title="Savolni testdan olib tashlaysizmi?"
        confirmLabel="Olib tashlash"
        tone="danger"
      >
        Savol savollar bankida qoladi. O‘tkazilgan sessiyalar o‘zgarmaydi.
      </ConfirmDialog>
    </div>
  );
}
