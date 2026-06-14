import { describe, it, expect } from 'vitest';
import {
  invalidLocationFields,
  invalidServiceFields,
} from './providerValidation';

// Pins the behavior of the provider location/service validators after they were
// hoisted out of the four route files into one shared module (ticket 4 dedup).
// These are pure functions: each returns the 400-body error string or null.

describe('invalidLocationFields', () => {
  it('allows absent coordinates (undefined/null)', () => {
    expect(invalidLocationFields({})).toBe(null);
    expect(invalidLocationFields({ lat: null, lng: null })).toBe(null);
  });

  it('allows in-range coordinates incl. the boundaries', () => {
    expect(invalidLocationFields({ lat: 0, lng: 0 })).toBe(null);
    expect(invalidLocationFields({ lat: -90, lng: -180 })).toBe(null);
    expect(invalidLocationFields({ lat: 90, lng: 180 })).toBe(null);
  });

  it('rejects out-of-range or non-numeric lat', () => {
    expect(invalidLocationFields({ lat: 91 })).toBe(
      'lat must be a number between -90 and 90',
    );
    expect(invalidLocationFields({ lat: -91 })).toBe(
      'lat must be a number between -90 and 90',
    );
    expect(invalidLocationFields({ lat: '10' })).toBe(
      'lat must be a number between -90 and 90',
    );
  });

  it('rejects out-of-range or non-numeric lng', () => {
    expect(invalidLocationFields({ lng: 181 })).toBe(
      'lng must be a number between -180 and 180',
    );
    expect(invalidLocationFields({ lng: '10' })).toBe(
      'lng must be a number between -180 and 180',
    );
  });
});

describe('invalidServiceFields', () => {
  it('allows absent money/duration fields', () => {
    expect(invalidServiceFields({})).toBe(null);
    expect(
      invalidServiceFields({
        price_cents: null,
        deposit_cents: null,
        duration_min: null,
      }),
    ).toBe(null);
  });

  it('allows valid integers (price/deposit >= 0, duration > 0)', () => {
    expect(
      invalidServiceFields({ price_cents: 0, deposit_cents: 0, duration_min: 1 }),
    ).toBe(null);
  });

  it('rejects negative or non-integer price_cents', () => {
    expect(invalidServiceFields({ price_cents: -1 })).toBe(
      'price_cents must be a non-negative integer',
    );
    expect(invalidServiceFields({ price_cents: 1.5 })).toBe(
      'price_cents must be a non-negative integer',
    );
  });

  it('rejects negative or non-integer deposit_cents', () => {
    expect(invalidServiceFields({ deposit_cents: -1 })).toBe(
      'deposit_cents must be a non-negative integer',
    );
  });

  it('rejects non-positive or non-integer duration_min', () => {
    expect(invalidServiceFields({ duration_min: 0 })).toBe(
      'duration_min must be a positive integer',
    );
    expect(invalidServiceFields({ duration_min: 2.5 })).toBe(
      'duration_min must be a positive integer',
    );
  });
});
