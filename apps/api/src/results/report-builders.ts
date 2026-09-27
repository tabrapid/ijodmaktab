import {
  ATTEMPT_POLICY_LABELS,
  CATEGORY_LABELS,
  PARTICIPATION_STATUS_LABELS,
  PARTICIPATION_STATUSES,
  formatDate,
  formatDateTime,
  formatPercent,
  formatPoints,
  formatTime,
  type Category,
  type Ratio,
} from '@ijod/shared';
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import { addTableSheet, newWorkbook, safeText, workbookToBuffer } from '../common/xlsx.js';
import type { SessionResults } from './results.service.js';

export interface ReportMeta {
  schoolName: string;
  generatedBy: string;
  generatedAt: Date;
}

const fraction = (percent: number | null) => (percent === null ? null : percent / 100);
const statusLabel = (status: string) =>
  PARTICIPATION_STATUS_LABELS[status as keyof typeof PARTICIPATION_STATUS_LABELS] ?? status;
const outcomeSymbol: Record<string, string> = {
  CORRECT: '✓',
  WRONG: '✗',
  BLANK: '—',
  EXCLUDED: 'hisobdan chiqarilgan',
  CREDITED: 'to‘liq ball',
};

function filtersText(results: SessionResults) {
  const parts: string[] = [];
  const { filters } = results;
  if (filters.statuses?.length) parts.push(`holat: ${filters.statuses.map(statusLabel).join(', ')}`);
  if (filters.classIds?.length) {
    const names = results.byClass
      .filter((item) => filters.classIds!.includes(item.classId))
      .map((item) => item.className);
    parts.push(`sinf: ${names.join(', ')}`);
  }
  if (filters.minPercent !== undefined) parts.push(`umumiy foiz ≥ ${filters.minPercent}%`);
  if (filters.maxPercent !== undefined) parts.push(`umumiy foiz ≤ ${filters.maxPercent}%`);
  if (filters.category && filters.categoryMinPercent !== undefined) {
    parts.push(`${CATEGORY_LABELS[filters.category]} ≥ ${filters.categoryMinPercent}%`);
  }
  if (filters.category && filters.categoryMaxPercent !== undefined) {
    parts.push(`${CATEGORY_LABELS[filters.category]} ≤ ${filters.categoryMaxPercent}%`);
  }
  if (filters.studentIds?.length) parts.push(`tanlangan o‘quvchilar: ${filters.studentIds.length} nafar`);
  if (filters.q) parts.push(`qidiruv: “${filters.q}”`);
  if (results.limitedToClasses) parts.push('faqat sinf rahbari sinfi');
  return parts.length ? parts.join('; ') : 'Filtr qo‘llanmagan (barcha tayinlanganlar)';
}

const ratioText = (value: Ratio) =>
  `${formatPercent(value.percent)} (${formatPoints(value.numerator)} / ${formatPoints(value.denominator)})`;

// ============================================================ Excel

export async function buildResultsWorkbook(results: SessionResults, meta: ReportMeta): Promise<Buffer> {
  const workbook = newWorkbook();
  const { session, categories, metrics } = results;
  const classNames = results.byClass.map((item) => item.className).join(', ') || '—';

  // 1. Umumiy ma’lumot
  const summary = workbook.addWorksheet('Umumiy ma’lumot');
  summary.columns = [
    { key: 'label', width: 42 },
    { key: 'value', width: 70 },
  ];
  const info: [string, string | number][] = [
    ['Maktab', meta.schoolName],
    ['Sessiya', session.title],
    ['Test', session.testTitle],
    ['Fan', session.subject.name],
    ['Sinf(lar)', classNames],
    ['Boshlanish', formatDateTime(session.startsAt)],
    ['Yopilish', formatDateTime(session.endsAt)],
    ['Davomiylik (daqiqa)', session.durationMinutes],
    ['Mas’ul o‘qituvchi', session.conductor.fullName],
    ['Test versiyasi', `v${session.testVersionNo}`],
    ['Baholash versiyasi', `v${session.gradingVersion}`],
    ['Maksimal ball', session.totalPoints],
    ...categories.map((item): [string, string | number] => [
      `${CATEGORY_LABELS[item.category]}: savollar / maksimal ball`,
      `${item.count} / ${formatPoints(item.max)}`,
    ]),
    ['Urinishni hisoblash siyosati', ATTEMPT_POLICY_LABELS[session.attemptPolicy]],
    ['Kategoriya mezoni (chegara)', `${formatPoints(session.categoryThresholdPercent)}%`],
    ['O‘tish chegarasi', session.passPercent === null ? 'belgilanmagan' : `${formatPoints(session.passPercent)}%`],
    ['Qo‘llangan filtrlar', filtersText(results)],
    ['Jadvaldagi o‘quvchilar', results.rows.length],
    ['Qatnashish (yaroqli topshirganlar / tayinlanganlar)', ratioText(metrics.participation)],
    ['Tayyorlangan vaqt (Toshkent)', formatDateTime(meta.generatedAt)],
    ['Tayyorlagan', meta.generatedBy],
  ];
  for (const [label, value] of info)
    summary.addRow({ label, value: typeof value === 'string' ? safeText(value) : value });
  summary.getColumn('label').font = { bold: true };
  summary.addRow({});
  summary.addRow({ label: 'Ko‘rsatkichlar ta’rifi' }).font = { bold: true };
  for (const line of [
    'Kategoriya foizi = kategoriyadan olingan ball / kategoriya maksimal balli × 100.',
    'Umumiy foiz = barcha olingan ballar / barcha maksimal ballar × 100 (kategoriya foizlarining oddiy o‘rtachasi emas).',
    'Kategoriya o‘zlashtirishi = yakunlangan ishlarning kategoriya ballari yig‘indisi / ularning maksimal ballari yig‘indisi × 100.',
    'Mezonga yetganlar ulushi = chegaraga yetganlar / shu kategoriya bo‘yicha yakuniy bahosi borlar × 100.',
    'Qatnashish = yaroqli topshirganlar / tayinlanganlar × 100.',
    'Boshlamaganlar 0 ball sifatida o‘rtachaga qo‘shilmaydi; 0 olgan yakunlangan ish haqiqiy 0 sifatida qatnashadi.',
    'Ichki hisoblash yaxlitlanmagan qiymatlar bilan bajariladi; foizlar bir kasr xonasi bilan ko‘rsatiladi.',
  ]) {
    summary.addRow({ label: line }).alignment = { wrapText: true };
  }

  // 2. O‘quvchilar natijalari
  const categoryColumns = categories.flatMap((item) => [
    { header: `${CATEGORY_LABELS[item.category]} (ball)`, key: `${item.category}_earned`, width: 14, numFmt: '0.##' },
    { header: `${CATEGORY_LABELS[item.category]} (maks.)`, key: `${item.category}_max`, width: 14, numFmt: '0.##' },
    { header: `${CATEGORY_LABELS[item.category]} %`, key: `${item.category}_percent`, width: 12, numFmt: '0.0%' },
  ]);
  addTableSheet(
    workbook,
    'O‘quvchilar natijalari',
    [
      { header: '№', key: 'n', width: 5 },
      { header: 'Ichki ID', key: 'internalId', width: 10 },
      { header: 'F.I.Sh.', key: 'fullName', width: 34 },
      { header: 'Sinf', key: 'className', width: 8 },
      { header: 'Holat', key: 'status', width: 22 },
      ...categoryColumns,
      { header: 'Jami ball', key: 'score', width: 11, numFmt: '0.##' },
      { header: 'Maks. ball', key: 'maxScore', width: 11, numFmt: '0.##' },
      { header: 'Umumiy %', key: 'percent', width: 11, numFmt: '0.0%' },
      { header: 'O‘tdi', key: 'passed', width: 8 },
      { header: 'Boshlagan', key: 'startedAt', width: 17 },
      { header: 'Topshirgan', key: 'submittedAt', width: 17 },
      { header: 'Sarflangan vaqt (daq.)', key: 'minutes', width: 12, numFmt: '0.0' },
      { header: 'Urinish №', key: 'attemptNo', width: 10 },
    ],
    results.rows.map((row, index) => ({
      n: index + 1,
      internalId: String(row.internalId).padStart(6, '0'),
      fullName: row.fullName,
      className: row.className ?? '',
      status: statusLabel(row.status),
      ...Object.fromEntries(
        categories.flatMap((item) => {
          const value = row.categories[item.category];
          return [
            [`${item.category}_earned`, value?.earned ?? null],
            [`${item.category}_max`, value?.max ?? null],
            [`${item.category}_percent`, fraction(value?.percent ?? null)],
          ];
        }),
      ),
      score: row.score,
      maxScore: row.maxScore,
      percent: fraction(row.percent),
      passed: row.passed === null ? '' : row.passed ? 'ha' : 'yo‘q',
      startedAt: row.startedAt ? formatDateTime(row.startedAt) : '',
      submittedAt: row.submittedAt ? formatDateTime(row.submittedAt) : '',
      minutes: row.durationSeconds === null ? null : Math.round((row.durationSeconds / 60) * 10) / 10,
      attemptNo: row.attemptNo,
    })),
  );

  // 3. Kategoriyalar
  addTableSheet(
    workbook,
    'Kategoriyalar',
    [
      { header: 'Kategoriya', key: 'label', width: 16 },
      { header: 'Savollar soni', key: 'count', width: 10 },
      { header: 'Maks. ball (bir o‘quvchi)', key: 'max', width: 14, numFmt: '0.##' },
      { header: 'Σ olingan ball', key: 'earnedSum', width: 14, numFmt: '0.##' },
      { header: 'Σ maksimal ball', key: 'maxSum', width: 14, numFmt: '0.##' },
      { header: 'O‘zlashtirish %', key: 'mastery', width: 14, numFmt: '0.0%' },
      { header: 'Mezon chegarasi', key: 'threshold', width: 12, numFmt: '0.0"%"' },
      { header: 'Mezonga yetganlar', key: 'reached', width: 12 },
      { header: 'Yakuniy bahosi borlar', key: 'graded', width: 12 },
      { header: 'Ulush % (bahosi borlarga)', key: 'reachShare', width: 14, numFmt: '0.0%' },
      { header: 'Tayinlanganlar', key: 'assigned', width: 12 },
      { header: 'Ulush % (tayinlanganlarga)', key: 'reachShareAll', width: 14, numFmt: '0.0%' },
    ],
    [
      ...categories.map((item) => {
        const mastery = metrics.categoryMastery[item.category];
        const reach = metrics.thresholdReach[item.category];
        return {
          label: CATEGORY_LABELS[item.category],
          count: item.count,
          max: item.max,
          earnedSum: mastery?.numerator ?? null,
          maxSum: mastery?.denominator ?? null,
          mastery: fraction(mastery?.percent ?? null),
          threshold: metrics.thresholdPercent,
          reached: reach?.ofGraded.numerator ?? null,
          graded: reach?.ofGraded.denominator ?? null,
          reachShare: fraction(reach?.ofGraded.percent ?? null),
          assigned: metrics.assigned,
          reachShareAll: fraction(reach?.ofAssigned.percent ?? null),
        };
      }),
      {
        label: 'Umumiy',
        count: results.questions.length,
        max: session.totalPoints,
        earnedSum: metrics.overall.mastery.numerator,
        maxSum: metrics.overall.mastery.denominator,
        mastery: fraction(metrics.overall.mastery.percent),
        threshold: session.passPercent ?? null,
        reached: metrics.pass?.ofGraded.numerator ?? null,
        graded: metrics.graded,
        reachShare: fraction(metrics.pass?.ofGraded.percent ?? null),
        assigned: metrics.assigned,
        reachShareAll: fraction(metrics.pass?.ofAssigned.percent ?? null),
      },
    ],
  );

  // 4. Savollar tahlili
  addTableSheet(
    workbook,
    'Savollar tahlili',
    [
      { header: '№', key: 'n', width: 5 },
      { header: 'Savol', key: 'stem', width: 50 },
      { header: 'Kategoriya', key: 'category', width: 12 },
      { header: 'Maks. ball', key: 'points', width: 9, numFmt: '0.##' },
      { header: 'To‘g‘ri', key: 'correct', width: 8 },
      { header: 'Noto‘g‘ri', key: 'wrong', width: 9 },
      { header: 'Javobsiz', key: 'blank', width: 9 },
      { header: 'Jami ishlar', key: 'responses', width: 9 },
      { header: 'To‘g‘ri javob ulushi', key: 'rate', width: 12, numFmt: '0.0%' },
      { header: 'To‘g‘ri variant', key: 'key', width: 10 },
      { header: 'Variantlar taqsimoti', key: 'distribution', width: 30 },
      { header: 'Belgi', key: 'flag', width: 40 },
      { header: 'Qayta baholash', key: 'override', width: 22 },
    ],
    results.questionStats.map((stats) => {
      const question = results.questions.find((item) => item.testQuestionId === stats.questionId)!;
      return {
        n: stats.number,
        stem: question.stem.length > 300 ? `${question.stem.slice(0, 300)}…` : question.stem,
        category: CATEGORY_LABELS[question.category],
        points: question.points,
        correct: stats.correct,
        wrong: stats.wrong,
        blank: stats.blank,
        responses: stats.responses,
        rate: fraction(stats.correctRate.percent),
        key: question.options.find((option) => option.id === question.correctOptionId)?.letter ?? '',
        distribution: question.options
          .map((option) => `${option.letter}: ${stats.optionCounts[option.id] ?? 0}`)
          .join('; '),
        flag: stats.needsReview ? `Tekshirish tavsiya etiladi: ${stats.reviewReasons.join('; ')}` : '',
        override: question.override
          ? question.override.mode === 'EXCLUDE'
            ? 'Hisobdan chiqarilgan'
            : question.override.mode === 'FULL_CREDIT'
              ? 'Barchaga to‘liq ball'
              : 'Kalit tuzatilgan'
          : '',
      };
    }),
  );

  // 5. Ishtirok holati
  const participation = workbook.addWorksheet('Ishtirok holati');
  participation.columns = [
    { key: 'a', width: 36 },
    { key: 'b', width: 16 },
    { key: 'c', width: 12 },
  ];
  participation.addRow({ a: 'Holat', b: 'Soni' }).font = { bold: true };
  for (const status of PARTICIPATION_STATUSES) {
    participation.addRow({ a: statusLabel(status), b: metrics.statusCounts[status] });
  }
  participation.addRow({ a: 'Tayinlanganlar', b: metrics.assigned }).font = { bold: true };
  participation.addRow({
    a: 'Qatnashish',
    b: fraction(metrics.participation.percent),
    c: `${metrics.participation.numerator} / ${metrics.participation.denominator}`,
  });
  participation.getCell(`B${participation.rowCount}`).numFmt = '0.0%';
  participation.addRow({});
  participation.addRow({ a: 'Yakuniy bahosi yo‘q o‘quvchilar', b: 'Sinf', c: 'Holat' }).font = { bold: true };
  for (const row of results.rows.filter((item) => item.status !== 'SUBMITTED' && item.status !== 'EXPIRED')) {
    participation.addRow({ a: row.fullName, b: row.className ?? '', c: statusLabel(row.status) });
  }

  // 6. Matritsa: o‘quvchilar × savollar (rangdan tashqari belgi va ball bilan)
  const matrix = workbook.addWorksheet('Matritsa', { views: [{ state: 'frozen', xSplit: 2, ySplit: 1 }] });
  matrix.columns = [
    { header: 'F.I.Sh.', key: 'name', width: 32 },
    { header: 'Sinf', key: 'className', width: 8 },
    ...results.questions.map((question) => ({
      header: `${question.number}-savol`,
      key: question.testQuestionId,
      width: 12,
    })),
  ];
  matrix.getRow(1).font = { bold: true };
  for (const row of results.rows) {
    const cells = results.matrix[row.studentId];
    matrix.addRow({
      name: row.fullName,
      className: row.className ?? '',
      ...Object.fromEntries(
        results.questions.map((question) => {
          const cell = cells?.[question.testQuestionId];
          if (!cell) return [question.testQuestionId, statusLabel(row.status)];
          const letter = question.options.find((option) => option.id === cell.selectedOptionId)?.letter;
          return [
            question.testQuestionId,
            `${outcomeSymbol[cell.outcome]} ${formatPoints(cell.earned)}${letter && cell.outcome === 'WRONG' ? ` (${letter})` : ''}`,
          ];
        }),
      ),
    });
  }
  matrix.addRow({});
  matrix.addRow({
    name: 'Belgilar: ✓ — to‘g‘ri, ✗ — noto‘g‘ri (qavsda tanlangan variant), — — javobsiz; son — olingan ball.',
  });

  return workbookToBuffer(workbook);
}

// ============================================================ Word (bayonnoma)

const border = { style: BorderStyle.SINGLE, size: 4, color: '999999' };
const cellBorders = { top: border, bottom: border, left: border, right: border };

function cell(
  text: string,
  options: { bold?: boolean; width?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {},
) {
  return new TableCell({
    borders: cellBorders,
    width: options.width ? { size: options.width, type: WidthType.PERCENTAGE } : undefined,
    children: [
      new Paragraph({
        alignment: options.align,
        children: [new TextRun({ text, bold: options.bold, size: 20 })],
      }),
    ],
  });
}

function table(header: string[], rows: string[][], widths?: number[]) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        tableHeader: true,
        children: header.map((text, index) => cell(text, { bold: true, width: widths?.[index] })),
      }),
      ...rows.map(
        (row) => new TableRow({ children: row.map((text, index) => cell(text, { width: widths?.[index] })) }),
      ),
    ],
  });
}

const para = (
  text: string,
  options: {
    bold?: boolean;
    size?: number;
    align?: (typeof AlignmentType)[keyof typeof AlignmentType];
    spacingAfter?: number;
  } = {},
) =>
  new Paragraph({
    alignment: options.align,
    spacing: { after: options.spacingAfter ?? 120 },
    children: [new TextRun({ text, bold: options.bold, size: options.size ?? 22 })],
  });

export async function buildProtocolDocx(results: SessionResults, meta: ReportMeta): Promise<Buffer> {
  const { session, categories, metrics } = results;
  const classNames = results.byClass.map((item) => item.className).join(', ') || '—';
  const categoryHeaders = categories.map((item) => `${CATEGORY_LABELS[item.category]} (/${formatPoints(item.max)})`);

  const doc = new Document({
    creator: 'Ijod maktabi',
    title: `Nazorat ishi bayonnomasi — ${session.title}`,
    styles: { default: { document: { run: { font: 'Times New Roman' } } } },
    sections: [
      {
        properties: { page: { margin: { top: 1000, bottom: 1000, left: 1100, right: 900 } } },
        children: [
          para(meta.schoolName, { align: AlignmentType.CENTER, bold: true }),
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            spacing: { after: 240 },
            children: [new TextRun({ text: 'NAZORAT ISHI BAYONNOMASI', bold: true, size: 28 })],
          }),
          table(
            ['Ko‘rsatkich', 'Qiymat'],
            [
              ['Fan', session.subject.name],
              ['Sinf(lar)', classNames],
              [
                'Sana',
                `${formatDate(session.startsAt)}, ${formatTime(session.startsAt)}–${formatTime(session.endsAt)}`,
              ],
              ['Mas’ul o‘qituvchi', session.conductor.fullName],
              [
                'Nazorat ishi',
                `${session.testTitle} (test v${session.testVersionNo}, baholash v${session.gradingVersion})`,
              ],
              ['Maksimal ball', formatPoints(session.totalPoints)],
              [
                'Tayinlanganlar / qatnashganlar',
                `${metrics.assigned} / ${metrics.participation.numerator} (${formatPercent(metrics.participation.percent)})`,
              ],
              [
                'O‘rtacha / mediana (umumiy foiz)',
                `${formatPercent(metrics.overall.meanPercent)} / ${formatPercent(metrics.overall.medianPercent)}`,
              ],
            ],
            [35, 65],
          ),
          para(''),
          para('Natijalar jadvali', { bold: true }),
          table(
            ['№', 'F.I.Sh.', 'Sinf', ...categoryHeaders, 'Jami', 'Foiz', 'Holat'],
            results.rows.map((row, index) => [
              String(index + 1),
              row.fullName,
              row.className ?? '',
              ...categories.map((item) => {
                const value = row.categories[item.category as Category];
                return value ? formatPoints(value.earned) : '—';
              }),
              row.score === null ? '—' : `${formatPoints(row.score)}/${formatPoints(row.maxScore)}`,
              formatPercent(row.percent),
              statusLabel(row.status),
            ]),
          ),
          para(''),
          para('Kategoriyalar bo‘yicha xulosa', { bold: true }),
          table(
            [
              'Kategoriya',
              'O‘zlashtirish',
              `Mezonga (${formatPoints(metrics.thresholdPercent)}%) yetganlar`,
              'Tayinlanganlarga nisbatan',
            ],
            categories.map((item) => {
              const mastery = metrics.categoryMastery[item.category];
              const reach = metrics.thresholdReach[item.category];
              return [
                CATEGORY_LABELS[item.category],
                mastery ? ratioText(mastery) : '— / mavjud emas',
                reach ? ratioText(reach.ofGraded) : '— / mavjud emas',
                reach ? ratioText(reach.ofAssigned) : '— / mavjud emas',
              ];
            }),
          ),
          para(''),
          para('Qiyinchilik tug‘dirgan savollar', { bold: true }),
          ...(() => {
            const flagged = results.questionStats.filter((stats) => stats.needsReview);
            if (!flagged.length) return [para('Tekshirish tavsiya etilgan savol yo‘q.')];
            return flagged.map((stats) =>
              para(
                `${stats.number}-savol: to‘g‘ri javob ulushi ${formatPercent(stats.correctRate.percent)}. ${stats.reviewReasons.join('; ')}.`,
              ),
            );
          })(),
          para(''),
          para('Tahlil va izohlar:', { bold: true }),
          ...Array.from({ length: 5 }, () => para('_'.repeat(95))),
          para(''),
          para(`O‘qituvchi: ______________________  ${session.conductor.fullName}`),
          para('Direktor o‘rinbosari: ______________________  ________________________'),
          para(`Hujjat tizimda tayyorlandi: ${formatDateTime(meta.generatedAt)}, ${meta.generatedBy}.`, { size: 18 }),
        ],
      },
    ],
  });
  return Packer.toBuffer(doc);
}
