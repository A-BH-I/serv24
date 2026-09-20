// Day / Month / Year dropdown date-of-birth picker.
// Replaces <input type="date">, which renders as an unusable blank field in
// several in-app webviews and mobile browsers.

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

interface DobPickerProps {
  /** YYYY-MM-DD (or empty) */
  value: string;
  onChange: (value: string) => void;
  /** Minimum age allowed, defaults to 0 (today) */
  className?: string;
}

const selectCls =
  'flex-1 min-w-0 px-2.5 py-2 bg-muted rounded-lg text-sm border-2 border-transparent focus:border-primary focus:outline-none text-foreground';

export function DobPicker({ value, onChange, className = '' }: DobPickerProps) {
  const [y = '', m = '', d = ''] = (value || '').split('-');
  const year = y;
  const month = m;
  const day = d;

  const thisYear = new Date().getFullYear();
  const years: number[] = [];
  for (let i = thisYear; i >= thisYear - 100; i--) years.push(i);

  const daysInMonth = year && month
    ? new Date(Number(year), Number(month), 0).getDate()
    : 31;

  const emit = (yy: string, mm: string, dd: string) => {
    if (!yy || !mm || !dd) {
      onChange('');
      return;
    }
    const maxDay = new Date(Number(yy), Number(mm), 0).getDate();
    const safeDay = Math.min(Number(dd), maxDay);
    onChange(`${yy}-${mm.padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`);
  };

  return (
    <div className={`flex gap-2 ${className}`}>
      <select
        aria-label="Day"
        value={day}
        onChange={e => emit(year, month, e.target.value)}
        className={selectCls}
      >
        <option value="">Day</option>
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(dd => (
          <option key={dd} value={String(dd).padStart(2, '0')}>{dd}</option>
        ))}
      </select>
      <select
        aria-label="Month"
        value={month}
        onChange={e => emit(year, e.target.value, day)}
        className={selectCls}
      >
        <option value="">Month</option>
        {MONTHS.map((name, i) => (
          <option key={name} value={String(i + 1).padStart(2, '0')}>{name}</option>
        ))}
      </select>
      <select
        aria-label="Year"
        value={year}
        onChange={e => emit(e.target.value, month, day)}
        className={selectCls}
      >
        <option value="">Year</option>
        {years.map(yy => (
          <option key={yy} value={String(yy)}>{yy}</option>
        ))}
      </select>
    </div>
  );
}
