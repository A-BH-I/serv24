// CSV export utility for admin tables

function escapeCSV(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportToCSV<T extends object>(
  rows: T[],
  columns: { key: keyof T & string; label: string }[],
  filename: string
) {
  if (rows.length === 0) return;

  const header = columns.map(c => escapeCSV(c.label)).join(',');
  const body = rows
    .map(row => columns.map(c => escapeCSV(row[c.key])).join(','))
    .join('\n');

  const csv = `${header}\n${body}`;
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
