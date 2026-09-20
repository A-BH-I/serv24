// =============================================
// ADDRESS VALIDATION (client-side mirror of backend rules)
// Keep in sync with BookingsController::validateAddressFields
// =============================================

export interface AddressInput {
  address_line1?: string;
  city?: string;
  state?: string;
  pincode?: string;
}

export type AddressErrors = Partial<Record<keyof AddressInput, string>>;

// Letters, spaces, hyphens, dots; must start with a letter; 2–60 chars total.
const NAME_RE = /^[A-Za-z][A-Za-z\s.\-]{1,59}$/;

// 6 digits, must NOT start with 0.
const PIN_RE = /^[1-9][0-9]{5}$/;

/**
 * Validates Indian address fields. Pass `requireState=true` when booking with
 * a brand-new address (we want all 4 components captured at booking time).
 */
export function validateAddress(input: AddressInput, requireState = true): AddressErrors {
  const errors: AddressErrors = {};
  const line1 = (input.address_line1 || '').trim();
  if (line1.length < 5 || line1.length > 200) {
    errors.address_line1 = 'Address must be 5–200 characters';
  } else if (!/[A-Za-z]/.test(line1) || !/\d/.test(line1)) {
    errors.address_line1 = 'Address must include both street name and house/flat number';
  }

  const city = (input.city || '').trim();
  if (!city || !NAME_RE.test(city)) {
    errors.city = 'City must be 2–60 letters';
  }

  const state = (input.state || '').trim();
  if (requireState || state) {
    if (!state || !NAME_RE.test(state)) {
      errors.state = 'State must be 2–60 letters';
    }
  }

  const pin = (input.pincode || '').trim();
  if (!PIN_RE.test(pin)) {
    errors.pincode = 'Pincode must be exactly 6 digits and cannot start with 0';
  }

  return errors;
}

export function firstAddressError(errs: AddressErrors): string | null {
  const order: (keyof AddressInput)[] = ['address_line1', 'city', 'state', 'pincode'];
  for (const k of order) if (errs[k]) return errs[k]!;
  return null;
}
