// =============================================
// EXCEL EXPORT UTILITY (Serv24-branded reports)
// Produces a real .xlsx file with a branded header
// block, styled column headers, banded rows, frozen
// header row, and auto-sized columns.
// =============================================
import ExcelJS from 'exceljs';

export interface ExcelColumn<T> {
  key: keyof T & string;
  label: string;
  /** Optional value transformer (e.g. format date / currency). */
  format?: (value: unknown, row: T) => string | number | null | undefined;
  /** Force "currency" / "date" / "number" rendering. */
  type?: 'currency' | 'date' | 'number' | 'text';
  /** Override auto width (in characters). */
  width?: number;
}

interface ExcelExportOptions<T> {
  rows: T[];
  columns: ExcelColumn<T>[];
  /** Sheet name (defaults to "Report"). */
  sheetName?: string;
  /** Report title shown in the branded header. */
  reportTitle: string;
  /** Optional subtitle (shown beneath the title). */
  subtitle?: string;
  /** File basename — date will be appended automatically. */
  filename: string;
  /** Brand name (defaults to "Serv24"). */
  brand?: string;
  /** Brand tagline / domain (defaults to "serv24.in"). */
  brandTagline?: string;
}

const TEAL = 'FF0F766E';      // Serv24 teal
const TEAL_LIGHT = 'FFCCFBF1';
const AMBER = 'FFF59E0B';     // Serv24 amber
const TEXT_DARK = 'FF0F172A';
const TEXT_MUTED = 'FF64748B';
const ROW_BAND = 'FFF8FAFC';

function inferType(label: string, sample: unknown): ExcelColumn<unknown>['type'] {
  const l = label.toLowerCase();
  if (l.includes('date') || l.includes('joined') || l.includes('created') || l.includes('at')) return 'date';
  if (l.includes('price') || l.includes('amount') || l.includes('commission') || l.includes('total') || l.includes('earning') || l.includes('balance')) return 'currency';
  if (typeof sample === 'number') return 'number';
  return 'text';
}

function formatCellValue(raw: unknown, type: ExcelColumn<unknown>['type']) {
  if (raw === null || raw === undefined || raw === '') return null;
  if (type === 'date') {
    const d = new Date(String(raw));
    if (!Number.isNaN(d.getTime())) return d;
    return String(raw);
  }
  if (type === 'currency' || type === 'number') {
    const n = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isNaN(n)) return n;
    return String(raw);
  }
  if (typeof raw === 'boolean') return raw ? 'Yes' : 'No';
  if (typeof raw === 'object') return JSON.stringify(raw);
  return String(raw);
}

export async function exportToExcel<T extends object>(opts: ExcelExportOptions<T>): Promise<void> {
  const {
    rows,
    columns,
    reportTitle,
    subtitle,
    filename,
    sheetName = 'Report',
    brand = 'Serv24',
    brandTagline = 'serv24.in',
  } = opts;

  const wb = new ExcelJS.Workbook();
  wb.creator = brand;
  wb.company = brand;
  wb.created = new Date();
  wb.title = reportTitle;
  const ws = wb.addWorksheet(sheetName, {
    views: [{ state: 'frozen', ySplit: 5 }],
  });

  const colCount = Math.max(columns.length, 4);
  const lastColLetter = ws.getColumn(colCount).letter;

  // ───── ROW 1 — Brand band ─────
  ws.mergeCells(`A1:${lastColLetter}1`);
  const brandCell = ws.getCell('A1');
  brandCell.value = `${brand}  ·  ${brandTagline}`;
  brandCell.font = { name: 'Calibri', bold: true, size: 18, color: { argb: 'FFFFFFFF' } };
  brandCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
  brandCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TEAL } };
  ws.getRow(1).height = 32;

  // ───── ROW 2 — Report title ─────
  ws.mergeCells(`A2:${lastColLetter}2`);
  const titleCell = ws.getCell('A2');
  titleCell.value = reportTitle;
  titleCell.font = { name: 'Calibri', bold: true, size: 14, color: { argb: TEXT_DARK } };
  titleCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TEAL_LIGHT } };
  ws.getRow(2).height = 24;

  // ───── ROW 3 — Subtitle / metadata ─────
  ws.mergeCells(`A3:${lastColLetter}3`);
  const metaCell = ws.getCell('A3');
  const metaParts = [
    subtitle,
    `Generated ${new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}`,
    `Total records: ${rows.length}`,
  ].filter(Boolean);
  metaCell.value = metaParts.join('   ·   ');
  metaCell.font = { name: 'Calibri', italic: true, size: 10, color: { argb: TEXT_MUTED } };
  metaCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
  metaCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TEAL_LIGHT } };
  ws.getRow(3).height = 18;

  // ───── ROW 4 — spacer / amber rule ─────
  ws.mergeCells(`A4:${lastColLetter}4`);
  ws.getRow(4).height = 4;
  ws.getCell('A4').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AMBER } };

  // ───── ROW 5 — Column headers ─────
  const headerRow = ws.getRow(5);
  columns.forEach((col, idx) => {
    const c = headerRow.getCell(idx + 1);
    c.value = col.label;
    c.font = { name: 'Calibri', bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
    c.alignment = { horizontal: 'left', vertical: 'middle', indent: 1, wrapText: true };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TEAL } };
    c.border = {
      top: { style: 'thin', color: { argb: TEAL } },
      bottom: { style: 'medium', color: { argb: AMBER } },
      left: { style: 'thin', color: { argb: 'FFFFFFFF' } },
      right: { style: 'thin', color: { argb: 'FFFFFFFF' } },
    };
  });
  headerRow.height = 26;

  // ───── DATA ROWS ─────
  if (rows.length === 0) {
    ws.mergeCells(`A6:${lastColLetter}6`);
    const empty = ws.getCell('A6');
    empty.value = 'No records to display.';
    empty.alignment = { horizontal: 'center', vertical: 'middle' };
    empty.font = { italic: true, color: { argb: TEXT_MUTED } };
    ws.getRow(6).height = 32;
  } else {
    rows.forEach((row, rIdx) => {
      const xRow = ws.getRow(6 + rIdx);
      columns.forEach((col, cIdx) => {
        const sample = row[col.key];
        const type = col.type || inferType(col.label, sample);
        const raw = col.format ? col.format(sample, row) : sample;
        const cell = xRow.getCell(cIdx + 1);
        cell.value = formatCellValue(raw, type);
        if (type === 'currency') cell.numFmt = '₹#,##0.00;[Red](₹#,##0.00);"-"';
        else if (type === 'date') cell.numFmt = 'dd-mmm-yyyy hh:mm';
        else if (type === 'number') cell.numFmt = '#,##0';
        cell.font = { name: 'Calibri', size: 10, color: { argb: TEXT_DARK } };
        cell.alignment = { vertical: 'middle', indent: 1, wrapText: false };
        if (rIdx % 2 === 1) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ROW_BAND } };
        }
        cell.border = {
          bottom: { style: 'hair', color: { argb: 'FFE2E8F0' } },
        };
      });
      xRow.height = 20;
    });
  }

  // ───── Auto column width ─────
  columns.forEach((col, idx) => {
    if (col.width) {
      ws.getColumn(idx + 1).width = col.width;
      return;
    }
    let maxLen = col.label.length;
    rows.forEach(r => {
      const v = r[col.key];
      const s = v === null || v === undefined ? '' : String(v);
      if (s.length > maxLen) maxLen = s.length;
    });
    ws.getColumn(idx + 1).width = Math.min(Math.max(maxLen + 4, 12), 36);
  });

  // ───── Footer ─────
  const footerRowIdx = 6 + Math.max(rows.length, 1) + 1;
  ws.mergeCells(`A${footerRowIdx}:${lastColLetter}${footerRowIdx}`);
  const footer = ws.getCell(`A${footerRowIdx}`);
  footer.value = `© ${new Date().getFullYear()} ${brand} — Confidential business report. ${brandTagline}`;
  footer.font = { name: 'Calibri', italic: true, size: 9, color: { argb: TEXT_MUTED } };
  footer.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(footerRowIdx).height = 20;

  // ───── Download ─────
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().split('T')[0];
  a.href = url;
  a.download = `Serv24_${filename}_${stamp}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
