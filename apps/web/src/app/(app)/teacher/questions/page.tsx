'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, Library, Pencil, Plus, Send } from 'lucide-react';
import { useState } from 'react';
import { CATEGORIES, CATEGORY_LABELS, DIFFICULTIES, DIFFICULTY_LABELS } from '@ijod/shared';
import { QuestionCard } from '@/components/teacher/question-card';
import { QuestionEditor, type QuestionEditorValue } from '@/components/teacher/question-editor';
import { Button } from '@/components/ui/button';
import { Card, CardBody, PageHeader } from '@/components/ui/card';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { EmptyState, ErrorState, PageLoader } from '@/components/ui/feedback';
import { Field, Input, Select } from '@/components/ui/form';
import { Pagination } from '@/components/ui/pagination';
import { useToast } from '@/components/ui/toast';
import { api, errorMessage, qs } from '@/lib/api';
import { GRADE_LEVELS, useMySubjects } from '@/lib/teaching';
import type { Page, QuestionItem } from '@/lib/types';

interface Filters {
  scope: 'available' | 'mine' | 'school';
  q: string;
  subjectId: string;
  gradeLevel: string;
  category: string;
  difficulty: string;
  page: number;
}

function NewQuestionDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const subjects = useMySubjects();
  const [subjectId, setSubjectId] = useState('');
  const [gradeLevel, setGradeLevel] = useState('');
  const effectiveSubject = subjectId || subjects.data?.[0]?.id || '';

  const save = async (value: QuestionEditorValue) => {
    await api.post('/questions', {
      subjectId: effectiveSubject,
      gradeLevel: gradeLevel ? Number(gradeLevel) : null,
      topic: value.topic,
      tags: value.tags,
      content: value.content,
    });
    toast.success('Savol bankka qo‘shildi.');
    await queryClient.invalidateQueries({ queryKey: ['questions'] });
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} title="Yangi savol" size="lg">
      {subjects.data && subjects.data.length === 0 ? (
        <EmptyState
          title="Sizga fan biriktirilmagan"
          description="Savol yaratish uchun administrator sizni fan va sinfga biriktirishi kerak."
        />
      ) : (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Fan" required>
              <Select value={effectiveSubject} onChange={(event) => setSubjectId(event.target.value)}>
                {(subjects.data ?? []).map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Sinf darajasi">
              <Select value={gradeLevel} onChange={(event) => setGradeLevel(event.target.value)}>
                <option value="">— ko‘rsatilmagan —</option>
                {GRADE_LEVELS.map((grade) => (
                  <option key={grade} value={grade}>
                    {grade}-sinf
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          {open && <QuestionEditor onSubmit={save} onCancel={onClose} submitLabel="Bankka qo‘shish" />}
        </div>
      )}
    </Dialog>
  );
}

export default function QuestionBankPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const subjects = useMySubjects();
  const [filters, setFilters] = useState<Filters>({
    scope: 'available',
    q: '',
    subjectId: '',
    gradeLevel: '',
    category: '',
    difficulty: '',
    page: 1,
  });
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<QuestionItem | null>(null);
  const [archiving, setArchiving] = useState<QuestionItem | null>(null);

  const query = useQuery({
    queryKey: ['questions', filters],
    queryFn: () =>
      api.get<Page<QuestionItem>>(
        `/questions${qs({
          scope: filters.scope,
          q: filters.q,
          subjectId: filters.subjectId,
          gradeLevel: filters.gradeLevel,
          category: filters.category,
          difficulty: filters.difficulty,
          page: filters.page,
          pageSize: 20,
        })}`,
      ),
    placeholderData: (previous) => previous,
  });

  const set = (patch: Partial<Filters>) => setFilters((current) => ({ ...current, page: 1, ...patch }));
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['questions'] });

  const requestSchool = useMutation({
    mutationFn: (id: string) => api.post(`/questions/${id}/request-school`),
    onSuccess: () => {
      toast.success('So‘rov yuborildi. Metodik tekshiruvdan so‘ng savol maktab bankiga chiqadi.');
      void refresh();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const archive = useMutation({
    mutationFn: (id: string) => api.delete(`/questions/${id}`),
    onSuccess: () => {
      toast.success('Savol arxivlandi.');
      setArchiving(null);
      void refresh();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const saveEdit = async (value: QuestionEditorValue) => {
    if (!editing) return;
    await api.patch(`/questions/${editing.id}`, { topic: value.topic, tags: value.tags, content: value.content });
    toast.success('Savol saqlandi.');
    setEditing(null);
    await refresh();
  };

  return (
    <div>
      <PageHeader
        title="Savollar banki"
        description="Qayta ishlatiladigan savollar. Xususiy savollaringizni faqat siz ko‘rasiz; maktab banki savollari barcha o‘qituvchilarga ochiq."
        actions={
          <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
            Yangi savol
          </Button>
        }
      />

      <Card className="mb-4">
        <CardBody className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <Field label="Qidiruv" className="lg:col-span-2">
            <Input
              value={filters.q}
              onChange={(event) => set({ q: event.target.value })}
              placeholder="Savol matni, mavzu yoki teg"
            />
          </Field>
          <Field label="Manba">
            <Select value={filters.scope} onChange={(event) => set({ scope: event.target.value as Filters['scope'] })}>
              <option value="available">Mening va maktab savollari</option>
              <option value="mine">Faqat mening savollarim</option>
              <option value="school">Maktab banki</option>
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
          <Field label="Kategoriya">
            <Select value={filters.category} onChange={(event) => set({ category: event.target.value })}>
              <option value="">Barchasi</option>
              {CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {CATEGORY_LABELS[category]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Qiyinlik">
            <Select value={filters.difficulty} onChange={(event) => set({ difficulty: event.target.value })}>
              <option value="">Barchasi</option>
              {DIFFICULTIES.map((difficulty) => (
                <option key={difficulty} value={difficulty}>
                  {DIFFICULTY_LABELS[difficulty]}
                </option>
              ))}
            </Select>
          </Field>
        </CardBody>
      </Card>

      {query.isPending ? (
        <PageLoader />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : query.data.items.length === 0 ? (
        <Card>
          <EmptyState
            icon={Library}
            title="Savollar topilmadi"
            description="Filtrlarni o‘zgartiring yoki yangi savol qo‘shing."
            action={
              <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
                Yangi savol
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {query.data.items.map((question) => (
            <QuestionCard
              key={question.id}
              question={question}
              actions={
                question.isMine ? (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Pencil className="size-3.5" />}
                      onClick={() => setEditing(question)}
                    >
                      Tahrirlash
                    </Button>
                    {question.visibility === 'PRIVATE' && !question.schoolRequestedAt && (
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Send className="size-3.5" />}
                        onClick={() => requestSchool.mutate(question.id)}
                        loading={requestSchool.isPending && requestSchool.variables === question.id}
                      >
                        Maktab bankiga
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Archive className="size-3.5" />}
                      onClick={() => setArchiving(question)}
                    >
                      Arxivlash
                    </Button>
                  </>
                ) : null
              }
            />
          ))}
          <Pagination
            page={query.data.page}
            pageSize={query.data.pageSize}
            total={query.data.total}
            onChange={(page) => setFilters((current) => ({ ...current, page }))}
          />
        </div>
      )}

      <NewQuestionDialog open={creating} onClose={() => setCreating(false)} />

      <Dialog open={Boolean(editing)} onClose={() => setEditing(null)} title="Savolni tahrirlash" size="lg">
        {editing?.latest && (
          <QuestionEditor
            key={editing.id}
            lockedNotice={editing.latest.locked}
            defaults={{
              topic: editing.topic,
              tags: editing.tags,
              stem: editing.latest.stem,
              options: editing.latest.options,
              correctOptionId: editing.latest.correctOptionId,
              explanation: editing.latest.explanation,
              category: editing.latest.category,
              difficulty: editing.latest.difficulty,
              points: editing.latest.points,
            }}
            onSubmit={saveEdit}
            onCancel={() => setEditing(null)}
          />
        )}
      </Dialog>

      <ConfirmDialog
        open={Boolean(archiving)}
        onClose={() => setArchiving(null)}
        onConfirm={() => archiving && archive.mutate(archiving.id)}
        loading={archive.isPending}
        title="Savolni arxivlaysizmi?"
        confirmLabel="Arxivlash"
        tone="danger"
      >
        Savol bankdan yashiriladi. U ishlatilgan testlar va o‘tkazilgan sessiyalar o‘zgarmaydi.
      </ConfirmDialog>
    </div>
  );
}
