/**
 * Global phone number validation utility.
 * Enforces 10-digit numeric-only phone numbers (India format).
 */

/** Only allow digits, max 10 characters */
export function sanitizePhone(value: string): string {
  return value.replace(/[^0-9]/g, '').slice(0, 10);
}

/** Validate that phone is exactly 10 digits */
export function isValidPhone(phone: string): boolean {
  return /^[0-9]{10}$/.test(phone);
}

/** Error message for invalid phone */
export function phoneErrorMessage(phone: string): string | null {
  if (!phone) return null;
  if (phone.length < 10) return `Phone must be 10 digits (${phone.length}/10)`;
  if (!isValidPhone(phone)) return 'Phone must be exactly 10 digits';
  return null;
}
