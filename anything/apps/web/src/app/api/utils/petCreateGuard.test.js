import { describe, it, expect } from 'vitest';
import {
  parseIdempotencyKey,
  sameNormalisedName,
  PET_CREATE_RETRY_WINDOW_SECONDS,
} from './petCreateGuard';

describe('parseIdempotencyKey', () => {
  it('absent / blank header -> no key', () => {
    expect(parseIdempotencyKey(null)).toEqual({ key: null });
    expect(parseIdempotencyKey(undefined)).toEqual({ key: null });
    expect(parseIdempotencyKey('')).toEqual({ key: null });
    expect(parseIdempotencyKey('   ')).toEqual({ key: null });
  });
  it('accepts uuids, ulids, base64url and client:uuid keys (trimmed)', () => {
    for (const k of [
      '3f2b8c1e-9d4a-4e7b-8a11-0c6d5e7f9a12',
      '01HZX3Y8K2M9N4P6Q7R8S9T0VW',
      'abc_DEF-ghi.jkl:123',
      'ios:3f2b8c1e-9d4a-4e7b-8a11-0c6d5e7f9a12',
    ]) {
      expect(parseIdempotencyKey(`  ${k} `)).toEqual({ key: k });
    }
  });
  it('rejects too short, too long, spaces, symbols and non-ascii', () => {
    for (const k of ['short', 'x'.repeat(129), 'has space here', 'semi;colon-key', 'emoji-🐕-key-1234', 'a/b/c/d/e/f/g/h']) {
      expect(parseIdempotencyKey(k), k).toHaveProperty('error');
    }
  });
});

describe('sameNormalisedName', () => {
  it('is case- and whitespace-insensitive', () => {
    expect(sameNormalisedName('Rex', ' rex ')).toBe(true);
    expect(sameNormalisedName('Bella  Rose', 'bella rose')).toBe(true);
    expect(sameNormalisedName('Rex', 'Rexy')).toBe(false);
    expect(sameNormalisedName(null, '')).toBe(true);
  });
});

describe('retry window', () => {
  it('is a few minutes: long enough for a retry, short enough that a later same-named dog is a new dog', () => {
    expect(PET_CREATE_RETRY_WINDOW_SECONDS).toBeGreaterThanOrEqual(60);
    expect(PET_CREATE_RETRY_WINDOW_SECONDS).toBeLessThanOrEqual(600);
  });
});
