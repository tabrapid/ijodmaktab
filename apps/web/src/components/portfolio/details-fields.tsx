'use client';

import { Calculator } from 'lucide-react';
import { useId, type ChangeEvent } from 'react';
import {
  CEFR_LEVELS,
  CERTIFICATE_LANGUAGES,
  IELTS_TEST_TYPES,
  IELTS_TEST_TYPE_LABELS,
  NATIONAL_CERTIFICATE_GRADES,
  NATIONAL_CERTIFICATE_SUBJECTS,
  OLYMPIAD_PLACES,
  OLYMPIAD_PLACE_LABELS,
  ieltsOverallFromBands,
  type StructuredPortfolioType,
} from '@ijod/shared';
import { Alert } from '@/components/ui/feedback';
import { Field, Input, Select } from '@/components/ui/form';
import { CEFR_PROVIDERS } from './utils';

export type DetailsValue = Record<string, unknown>;
export type DetailsErrors = Partial<Record<string, string>>;

/** Tur o‘zgarganda details shu qiymatdan boshlanadi. */
export function initialDetails(type: StructuredPortfolioType): DetailsValue {
  return type === 'IELTS' ? { testType: 'ACADEMIC' } : {};
}

const text = (value: unknown) => (typeof value === 'string' ? value : '');
const numberText = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? String(value) : '');

/** Bo‘sh maydon — qiymat yo‘q; vergulli kasr ham qabul qilinadi (7,5). */
function parseNumber(raw: string): number | undefined {
  const value = raw.trim().replace(',', '.');
  if (value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Ro‘yxatda yo‘q eski qiymat ham tanlovda ko‘rinib turadi. */
function withCurrent(options: readonly string[], current: string) {
  return current && !options.includes(current) ? [current, ...options] : options;
}

interface Props {
  type: StructuredPortfolioType;
  value: DetailsValue;
  onChange: (next: DetailsValue) => void;
  errors: DetailsErrors;
  /** Avvalgi shakldagi olimpiada: fan ixtiyoriy (to‘ldirilmasa, natija matni saqlanadi). */
  optional?: boolean;
}

/**
 * Turga xos maydonlar: milliy sertifikat, CEFR, IELTS, SAT va olimpiada. Qiymatlar `details`
 * obyektida saqlanadi va umumiy (@ijod/shared) sxema bilan tekshiriladi.
 */
export function DetailsFields({ type, value, onChange, errors, optional = false }: Props) {
  const set = (key: string, next: unknown) => {
    const copy = { ...value };
    if (next === undefined || next === '') delete copy[key];
    else copy[key] = next;
    onChange(copy);
  };
  const onText = (key: string) => (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    set(key, event.target.value);
  const onNumber = (key: string) => (event: ChangeEvent<HTMLInputElement>) => set(key, parseNumber(event.target.value));

  switch (type) {
    case 'NATIONAL_CERTIFICATE':
      return (
        <>
          <Field label="Fan" required error={errors.subject}>
            <Select value={text(value.subject)} onChange={onText('subject')}>
              <option value="">Fanni tanlang</option>
              {withCurrent(NATIONAL_CERTIFICATE_SUBJECTS, text(value.subject)).map((subject) => (
                <option key={subject} value={subject}>
                  {subject}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Daraja" required error={errors.grade}>
            <Select value={text(value.grade)} onChange={onText('grade')}>
              <option value="">Darajani tanlang</option>
              {NATIONAL_CERTIFICATE_GRADES.map((grade) => (
                <option key={grade} value={grade}>
                  {grade}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Ball" hint="Ixtiyoriy, sertifikatda ko‘rsatilgan bo‘lsa (0–100)." error={errors.score}>
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              max={100}
              step="any"
              defaultValue={numberText(value.score)}
              onChange={onNumber('score')}
            />
          </Field>
          <Field label="Sertifikat raqami" hint="Ixtiyoriy." error={errors.certificateNumber}>
            <Input maxLength={50} defaultValue={text(value.certificateNumber)} onChange={onText('certificateNumber')} />
          </Field>
          <Field label="Amal qilish muddati" hint="Ixtiyoriy." error={errors.validUntil}>
            <Input type="date" defaultValue={text(value.validUntil)} onChange={onText('validUntil')} />
          </Field>
        </>
      );
    case 'CEFR':
      return (
        <>
          <Field label="Til" required error={errors.language}>
            <Select value={text(value.language)} onChange={onText('language')}>
              <option value="">Tilni tanlang</option>
              {withCurrent(CERTIFICATE_LANGUAGES, text(value.language)).map((language) => (
                <option key={language} value={language}>
                  {language}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Daraja" required error={errors.level}>
            <Select value={text(value.level)} onChange={onText('level')}>
              <option value="">Darajani tanlang</option>
              {CEFR_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </Select>
          </Field>
          <ProviderField value={text(value.provider)} onChange={onText('provider')} error={errors.provider} />
          <Field label="Ball" hint="Ixtiyoriy (0–100)." error={errors.score}>
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              max={100}
              step="any"
              defaultValue={numberText(value.score)}
              onChange={onNumber('score')}
            />
          </Field>
          <Field label="Sertifikat raqami" hint="Ixtiyoriy." error={errors.certificateNumber}>
            <Input maxLength={50} defaultValue={text(value.certificateNumber)} onChange={onText('certificateNumber')} />
          </Field>
        </>
      );
    case 'IELTS':
      return <IeltsFields value={value} set={set} onNumber={onNumber} onText={onText} errors={errors} />;
    case 'SAT':
      return <SatFields value={value} onNumber={onNumber} errors={errors} />;
    case 'OLYMPIAD':
      return (
        <>
          <OlympiadSubjectField
            value={text(value.subject)}
            onChange={onText('subject')}
            error={errors.subject}
            optional={optional}
          />
          <Field label="O‘rin" error={errors.place}>
            <Select value={text(value.place)} onChange={onText('place')}>
              <option value="">Ko‘rsatilmagan</option>
              {OLYMPIAD_PLACES.map((place) => (
                <option key={place} value={place}>
                  {OLYMPIAD_PLACE_LABELS[place]}
                </option>
              ))}
            </Select>
          </Field>
        </>
      );
  }
}

function ProviderField({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  error?: string;
}) {
  const listId = useId();
  return (
    <>
      <Field label="Imtihon turi yoki tashkilot" hint="Masalan: Multilevel, Aptis, Linguaskill." error={error}>
        <Input maxLength={100} list={listId} defaultValue={value} onChange={onChange} />
      </Field>
      <datalist id={listId}>
        {CEFR_PROVIDERS.map((provider) => (
          <option key={provider} value={provider} />
        ))}
      </datalist>
    </>
  );
}

function OlympiadSubjectField({
  value,
  onChange,
  error,
  optional,
}: {
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  error?: string;
  optional: boolean;
}) {
  const listId = useId();
  return (
    <>
      <Field
        label="Fan"
        required={!optional}
        hint={optional ? 'Ixtiyoriy: olimpiada qaysi fandan o‘tkazilgan.' : 'Olimpiada qaysi fandan o‘tkazilgan.'}
        error={error}
      >
        <Input maxLength={100} list={listId} defaultValue={value} onChange={onChange} placeholder="Masalan: Fizika" />
      </Field>
      <datalist id={listId}>
        {NATIONAL_CERTIFICATE_SUBJECTS.map((subject) => (
          <option key={subject} value={subject} />
        ))}
      </datalist>
    </>
  );
}

const BANDS = [
  ['listening', 'Listening'],
  ['reading', 'Reading'],
  ['writing', 'Writing'],
  ['speaking', 'Speaking'],
] as const;

function IeltsFields({
  value,
  set,
  onNumber,
  onText,
  errors,
}: {
  value: DetailsValue;
  set: (key: string, next: unknown) => void;
  onNumber: (key: string) => (event: ChangeEvent<HTMLInputElement>) => void;
  onText: (key: string) => (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
  errors: DetailsErrors;
}) {
  const band = (key: string) => (typeof value[key] === 'number' ? (value[key] as number) : undefined);
  const expected = ieltsOverallFromBands(band('listening'), band('reading'), band('writing'), band('speaking'));
  const overall = band('overall');
  const mismatch = expected !== null && overall !== undefined && expected !== overall;
  const bandInput = (key: string) => (
    <Input
      type="number"
      inputMode="decimal"
      min={0}
      max={9}
      step={0.5}
      defaultValue={numberText(value[key])}
      onChange={onNumber(key)}
    />
  );
  return (
    <>
      <Field label="Imtihon turi" required error={errors.testType}>
        <Select value={text(value.testType) || 'ACADEMIC'} onChange={(event) => set('testType', event.target.value)}>
          {IELTS_TEST_TYPES.map((testType) => (
            <option key={testType} value={testType}>
              {IELTS_TEST_TYPE_LABELS[testType]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Umumiy ball (Overall)" required hint="0–9, 0,5 qadam bilan." error={errors.overall}>
        {bandInput('overall')}
      </Field>
      <fieldset className="grid min-w-0 grid-cols-2 gap-3 sm:col-span-2 sm:grid-cols-4">
        <legend className="mb-1.5 text-sm font-medium text-slate-700">
          Bo‘limlar bo‘yicha ball <span className="font-normal text-slate-500">(ixtiyoriy)</span>
        </legend>
        {BANDS.map(([key, label]) => (
          <Field key={key} label={label} error={errors[key]}>
            {bandInput(key)}
          </Field>
        ))}
      </fieldset>
      {mismatch && (
        <Alert tone="info" className="sm:col-span-2">
          To‘rt bo‘lim o‘rtachasi bo‘yicha umumiy ball odatda <strong>{expected}</strong> bo‘ladi. Sertifikatdagi
          qiymatni tekshiring — to‘g‘ri bo‘lsa, shunday qoldiring.
        </Alert>
      )}
      <Field label="TRF raqami" hint="Test Report Form raqami, ixtiyoriy." error={errors.trfNumber}>
        <Input maxLength={30} defaultValue={text(value.trfNumber)} onChange={onText('trfNumber')} />
      </Field>
    </>
  );
}

function SatFields({
  value,
  onNumber,
  errors,
}: {
  value: DetailsValue;
  onNumber: (key: string) => (event: ChangeEvent<HTMLInputElement>) => void;
  errors: DetailsErrors;
}) {
  const section = (key: string) => (typeof value[key] === 'number' ? (value[key] as number) : undefined);
  const readingWriting = section('readingWriting');
  const math = section('math');
  const sum = readingWriting !== undefined && math !== undefined ? readingWriting + math : null;
  const scoreInput = (key: string, min: number, max: number) => (
    <Input
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      step={10}
      defaultValue={numberText(value[key])}
      onChange={onNumber(key)}
    />
  );
  return (
    <>
      <Field
        label="Umumiy ball"
        required
        hint={
          sum !== null ? (
            <span className="inline-flex items-center gap-1">
              <Calculator className="size-3.5" aria-hidden />
              Bo‘limlar yig‘indisi: {sum}
            </span>
          ) : (
            '400–1600, 10 ga karrali.'
          )
        }
        error={errors.total}
      >
        {scoreInput('total', 400, 1600)}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Reading and Writing" hint="200–800" error={errors.readingWriting}>
          {scoreInput('readingWriting', 200, 800)}
        </Field>
        <Field label="Math" hint="200–800" error={errors.math}>
          {scoreInput('math', 200, 800)}
        </Field>
      </div>
    </>
  );
}
