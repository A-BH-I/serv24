// Shared date/time formatting for Serv24.
// Backend returns MySQL datetimes ("YYYY-MM-DD HH:MM:SS") in IST (Asia/Kolkata).
// Safari/iOS cannot parse the space-separated form, so normalise it first.

export function parseBackendDate(value?: string | null): Date | null {
  if (!value) return null;
  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  let d = new Date(normalized);
  if (Number.isNaN(d.getTime())) d = new Date(`${normalized}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** e.g. "6 Jun 2026, 6:50 pm" — always rendered in Indian Standard Time. */
export function formatDateTime(value?: string | null): string {
  const d = parseBackendDate(value);
  if (!d) return '—';
  return d.toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
    timeZone: 'Asia/Kolkata',
  });
}

/** e.g. "6 Jun 2026" */
export function formatDate(value?: string | null): string {
  const d = parseBackendDate(value);
  if (!d) return '—';
  return d.toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata',
  });
}

/** e.g. "6:50 pm" */
export function formatTime(value?: string | null): string {
  const d = parseBackendDate(value);
  if (!d) return '—';
  return d.toLocaleTimeString('en-IN', {
    hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata',
  });
}

/** Relative time such as "Just now", "5m ago", falling back to a date. */
export function formatRelative(value?: string | null): string {
  const d = parseBackendDate(value);
  if (!d) return '';
  const diffMs = Date.now() - d.getTime();
  if (diffMs < 60_000) return 'Just now';
  const min = Math.floor(diffMs / 60_000);
  if (min < 60) return `${min}m ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(value);
}
