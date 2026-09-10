import { describe, it, expect } from 'vitest';
import { secretEquals } from './secretCompare';

describe('secretEquals', () => {
  it('matches only identical non-empty strings', () => {
    expect(secretEquals('abc', 'abc')).toBe(true);
    expect(secretEquals('abd', 'abc')).toBe(false);
    expect(secretEquals('ab', 'abc')).toBe(false);
    expect(secretEquals('', '')).toBe(false);
    expect(secretEquals(null, 'abc')).toBe(false);
    expect(secretEquals('abc', undefined)).toBe(false);
  });
});
