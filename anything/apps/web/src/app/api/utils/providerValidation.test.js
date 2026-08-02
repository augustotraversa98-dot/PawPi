import { describe, it, expect } from 'vitest';
import {
  invalidLocationFields,
  invalidServiceFields,
  invalidImageUrls,
  MAX_IMAGE_URLS,
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

  it('allows a valid payment_policy and absent/null', () => {
    expect(invalidServiceFields({ payment_policy: 'none' })).toBe(null);
    expect(invalidServiceFields({ payment_policy: 'deposit' })).toBe(null);
    expect(invalidServiceFields({ payment_policy: 'full' })).toBe(null);
    expect(invalidServiceFields({ payment_policy: null })).toBe(null);
  });

  it('rejects an unknown payment_policy', () => {
    expect(invalidServiceFields({ payment_policy: 'later' })).toBe(
      'payment_policy must be one of none, deposit, full',
    );
  });

  it('allows a valid nightly_rate_cents and rejects a negative/non-integer one', () => {
    expect(invalidServiceFields({ nightly_rate_cents: 4000 })).toBe(null);
    expect(invalidServiceFields({ nightly_rate_cents: null })).toBe(null);
    expect(invalidServiceFields({ nightly_rate_cents: -1 })).toBe(
      'nightly_rate_cents must be a non-negative integer',
    );
    expect(invalidServiceFields({ nightly_rate_cents: 1.5 })).toBe(
      'nightly_rate_cents must be a non-negative integer',
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

describe('invalidImageUrls (ticket 2.23)', () => {
  it('allows absent image_urls (undefined/null) and an empty array', () => {
    expect(invalidImageUrls(undefined)).toBe(null);
    expect(invalidImageUrls(null)).toBe(null);
    expect(invalidImageUrls([])).toBe(null);
  });

  it('allows an array of non-empty URL strings up to the cap', () => {
    expect(invalidImageUrls(['https://x/1.png', 'https://x/2.png'])).toBe(null);
    expect(
      invalidImageUrls(Array.from({ length: MAX_IMAGE_URLS }, (_, i) => `u${i}`)),
    ).toBe(null);
  });

  it('rejects a non-array', () => {
    expect(invalidImageUrls('https://x/1.png')).toBe(
      'image_urls must be an array of URLs',
    );
    expect(invalidImageUrls({ 0: 'x' })).toBe(
      'image_urls must be an array of URLs',
    );
  });

  it('rejects more than the cap', () => {
    expect(
      invalidImageUrls(Array.from({ length: MAX_IMAGE_URLS + 1 }, () => 'u')),
    ).toBe(`image_urls allows at most ${MAX_IMAGE_URLS} images`);
  });

  it('rejects non-string or empty entries', () => {
    expect(invalidImageUrls(['ok', 42])).toBe(
      'image_urls must be non-empty URL strings',
    );
    expect(invalidImageUrls(['ok', '  '])).toBe(
      'image_urls must be non-empty URL strings',
    );
  });
});
