import ExcelJS from 'exceljs';

export { ExcelJS };

export interface SheetColumn {
  header: string;
  key: string;
  width?: number;
  /** Excel son formati, masalan '0.0' yoki '0.00'. */
  numFmt?: string;
}

/**
 * Standart ko‘rinishdagi varaq: qalin sarlavha, mahkamlangan birinchi qator, filtrlar.
 * Qiymatlar turi saqlanadi: sonlar haqiqiy raqam, matnlar esa matn sifatida yoziladi
 * (foydalanuvchi matni formula sifatida bajarilmaydi).
 */
export function addTableSheet(
  workbook: ExcelJS.Workbook,
  name: string,
  columns: SheetColumn[],
  rows: Record<string, string | number | Date | null | undefined>[],
) {
  const sheet = workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = columns.map((column) => ({
    header: column.header,
    key: column.key,
    width: column.width ?? Math.max(12, column.header.length + 2),
    style: column.numFmt ? { numFmt: column.numFmt } : undefined,
  }));
  for (const row of rows) {
    const values: Record<string, string | number | Date | null> = {};
    for (const column of columns) {
      const value = row[column.key];
      values[column.key] = value === undefined ? null : typeof value === 'string' ? safeText(value) : value;
    }
    sheet.addRow(values);
  }
  const header = sheet.getRow(1);
  header.font = { bold: true };
  header.alignment = { vertical: 'middle', wrapText: true };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF7' } };
  if (rows.length > 0) {
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  }
  return sheet;
}

/**
 * Matn sifatida yoziladigan qiymat. ExcelJS oddiy satrni formula deb talqin qilmaydi,
 * lekin ehtiyot uchun boshqaruv belgilarini olib tashlaymiz.
 */
export function safeText(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

export async function workbookToBuffer(workbook: ExcelJS.Workbook): Promise<Buffer> {
  const data = await workbook.xlsx.writeBuffer();
  return Buffer.from(data as ArrayBuffer);
}

export function newWorkbook() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Ijod maktabi';
  workbook.created = new Date();
  return workbook;
}

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
