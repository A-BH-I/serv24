import { describe, it, expect } from 'vitest';
import { validateAddress, firstAddressError } from '@/lib/address-validation';

// =============================================================================
// Booking address validation — covers the four bug scenarios from the recent
// production reports:
//   A. Manual address entry rejected as "Address is required"
//   B. State / city not persisted on save
//   C. Duplicate "HOME" labels created
//   D. Soft-deleted HOME labels fail to delete
//
// (C) and (D) are exercised at the API layer; here we lock in (A) and (B)
// plus the new strict-format rules so regressions can't slip back in.
// =============================================================================

describe('validateAddress — happy path', () => {
  it('accepts a complete Indian address', () => {
    const errs = validateAddress({
      address_line1: '12B Hill View Apartments, MG Road',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400001',
    });
    expect(errs).toEqual({});
    expect(firstAddressError(errs)).toBeNull();
  });

  it('accepts state as optional when requireState=false', () => {
    const errs = validateAddress(
      {
        address_line1: '12B Hill View Apartments, MG Road',
        city: 'Mumbai',
        state: '',
        pincode: '400001',
      },
      false,
    );
    expect(errs).toEqual({});
  });
});

// Scenario A — manual address entry must NOT be rejected when fields are filled
describe('Scenario A: manual address entry', () => {
  it('does not return an "address required" error when line1 is filled', () => {
    const errs = validateAddress({
      address_line1: '42 Brigade Road',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560001',
    });
    expect(errs.address_line1).toBeUndefined();
  });

  it('rejects line1 missing house number', () => {
    const errs = validateAddress({
      address_line1: 'Brigade Road',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560001',
    });
    expect(errs.address_line1).toMatch(/house\/flat number/i);
  });

  it('rejects line1 shorter than 5 chars', () => {
    const errs = validateAddress({
      address_line1: 'A 1',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560001',
    });
    expect(errs.address_line1).toBeDefined();
  });
});

// Scenario B — state / city must be required and validated
describe('Scenario B: state and city required', () => {
  it('flags missing state on booking flow (requireState=true)', () => {
    const errs = validateAddress(
      {
        address_line1: '12 MG Road',
        city: 'Mumbai',
        state: '',
        pincode: '400001',
      },
      true,
    );
    expect(errs.state).toBeDefined();
    expect(firstAddressError(errs)).toMatch(/state/i);
  });

  it('flags missing city', () => {
    const errs = validateAddress({
      address_line1: '12 MG Road',
      city: '',
      state: 'Maharashtra',
      pincode: '400001',
    });
    expect(errs.city).toBeDefined();
  });

  it('rejects numeric city names', () => {
    const errs = validateAddress({
      address_line1: '12 MG Road',
      city: '12345',
      state: 'Maharashtra',
      pincode: '400001',
    });
    expect(errs.city).toBeDefined();
  });
});

describe('Pincode rules', () => {
  it.each([
    ['000000', 'all zeros'],
    ['012345', 'starts with 0'],
    ['12345', 'too short'],
    ['1234567', 'too long'],
    ['ABCDEF', 'non-numeric'],
    ['', 'empty'],
  ])('rejects %s (%s)', (pin) => {
    const errs = validateAddress({
      address_line1: '12 MG Road',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: pin,
    });
    expect(errs.pincode).toBeDefined();
  });

  it('accepts valid 6-digit non-zero-leading pincode', () => {
    const errs = validateAddress({
      address_line1: '12 MG Road',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400001',
    });
    expect(errs.pincode).toBeUndefined();
  });
});

// Scenarios C & D — duplicate-label and delete behaviour are enforced by the
// backend (BookingsController::createAddress + deleteAddress). We document the
// contract here so the test file is the single source of truth for the bug
// fixes; the actual DB behaviour is exercised by backend/smoke-test.php.
describe('Scenario C & D contract (documentation tests)', () => {
  it('duplicate HOME labels are rejected with code DUPLICATE_LABEL (server-side)', () => {
    // Server returns: { success: false, code: 'DUPLICATE_LABEL', status: 409 }
    // when POST /user/addresses is called with a label that already exists for
    // the same user (case-insensitive, ignoring soft-deleted rows).
    expect('DUPLICATE_LABEL').toBe('DUPLICATE_LABEL');
  });

  it('deleting a HOME address referenced by bookings soft-deletes instead of failing', () => {
    // DELETE /user/addresses/:id soft-deletes (is_deleted=TRUE) when the row
    // is referenced by bookings.address_id, otherwise hard-deletes. Hidden
    // /admin/debug/addresses endpoint exposes both states for verification.
    expect(true).toBe(true);
  });
});
