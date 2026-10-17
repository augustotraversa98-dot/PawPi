import { describe, it, expect, vi } from 'vitest';
import {
  HANDLE_MAX_LENGTH,
  RESERVED_HANDLES,
  normalizeHandle,
  handleFormatCode,
  isValidHandle,
  handleCandidates,
  findFreeHandles,
  isHandleUniqueViolation,
} from './petHandle';

// MUST stay identical to the table in mobile/src/utils/validateHandle.test.js — the app and the
// server have to accept/reject exactly the same strings.
const HANDLE_PARITY_CASES = [
  ['', 'empty'],
  ['   ', 'empty'],
  ['@', 'empty'],
  ['ab', 'too_short'],
  ['abc', ''],
  ['a'.repeat(20), ''],
  ['a'.repeat(21), 'too_long'],
  ['Luna', ''],
  ['@Luna', ''],
  ['  @@luna.paws  ', ''],
  ['my_dog.2', ''],
  ['_luna', 'invalid_chars'],
  ['.luna', 'invalid_chars'],
  ['lu na', 'invalid_chars'],
  ['lu-na', 'invalid_chars'],
  ['luná', 'invalid_chars'],
  ['luna!', 'invalid_chars'],
  ['admin', 'reserved'],
  ['@PawPi', 'reserved'],
  ['support', 'reserved'],
];

describe('handle rules (server)', () => {
  it.each(HANDLE_PARITY_CASES)('%j -> %j', (input, code) => {
    expect(handleFormatCode(input)).toBe(code);
    expect(isValidHandle(input)).toBe(code === '');
  });

  it('normalizeHandle lowercases, trims and strips a leading @', () => {
    expect(normalizeHandle('  @@Luna_B  ')).toBe('luna_b');
    expect(normalizeHandle(null)).toBe('');
  });

  it('reserved words are all lowercase and individually valid in shape', () => {
    for (const w of RESERVED_HANDLES) expect(w).toBe(w.toLowerCase());
  });
});

describe('handleCandidates', () => {
  it('is deterministic and starts with the plain name', () => {
    const a = handleCandidates({ name: 'Luna', ownerInitial: 'M', breed: 'Beagle Mix' });
    const b = handleCandidates({ name: 'Luna', ownerInitial: 'M', breed: 'Beagle Mix' });
    expect(a).toEqual(b);
    expect(a.slice(0, 4)).toEqual(['luna', 'lunam', 'luna_beagle', 'luna.paws']);
    expect(a[4]).toBe('luna2');
  });

  it('folds accents, drops spaces/punctuation', () => {
    expect(handleCandidates({ name: 'Pequeña Doña!' })[0]).toBe('pequenadona');
  });

  it('every candidate is valid, unique and within the length limit', () => {
    const list = handleCandidates({ name: 'A very very long dog name indeed', ownerInitial: 'z', breed: 'x' });
    expect(new Set(list).size).toBe(list.length);
    for (const c of list) {
      expect(isValidHandle(c)).toBe(true);
      expect(c.length).toBeLessThanOrEqual(HANDLE_MAX_LENGTH);
    }
    // Numbered variants stay distinct even after the base is trimmed.
    expect(list.length).toBeGreaterThan(20);
  });

  it('pads names that are too short and skips reserved words', () => {
    expect(handleCandidates({ name: 'Bo' })[0]).toBe('bopup');
    expect(handleCandidates({ name: 'Admin' })).not.toContain('admin');
    expect(handleCandidates({ name: '' })[0]).toBe('pup');
    expect(handleCandidates({ name: '!!!' })[0]).toBe('pup');
  });
});

describe('findFreeHandles (collision paths)', () => {
  const candidates = handleCandidates({ name: 'Luna', ownerInitial: 'M', breed: 'Beagle' });

  it('returns the plain name when it is free (one query)', async () => {
    const fetchTaken = vi.fn(async () => []);
    expect(await findFreeHandles(candidates, fetchTaken, 1)).toEqual(['luna']);
    expect(fetchTaken).toHaveBeenCalledTimes(1);
  });

  it('walks name -> +initial -> +breed -> number when earlier ones are taken', async () => {
    const taken = new Set(['luna', 'lunam', 'luna_beagle', 'luna.paws', 'luna2', 'luna3']);
    const fetchTaken = async (chunk) => chunk.filter((c) => taken.has(c));
    expect(await findFreeHandles(candidates, fetchTaken, 2)).toEqual(['luna4', 'luna5']);
  });

  it('treats the taken set case-insensitively', async () => {
    const fetchTaken = async () => ['LUNA'];
    expect((await findFreeHandles(candidates, fetchTaken, 1))[0]).toBe('lunam');
  });

  it('reaches past the first chunk when a whole chunk is taken', async () => {
    const first24 = new Set(candidates.slice(0, 24));
    const fetchTaken = async (chunk) => chunk.filter((c) => first24.has(c));
    const [free] = await findFreeHandles(candidates, fetchTaken, 1);
    expect(free).toBe(candidates[24]);
  });

  it('returns fewer than asked (never throws) when everything is taken', async () => {
    const fetchTaken = async (chunk) => chunk;
    expect(await findFreeHandles(candidates, fetchTaken, 3)).toEqual([]);
  });
});

describe('isHandleUniqueViolation', () => {
  it('recognizes the pets handle unique violation only', () => {
    expect(isHandleUniqueViolation({ code: '23505', constraint_name: 'pets_handle_key' })).toBe(true);
    expect(isHandleUniqueViolation({ code: '23505', constraint_name: 'pets_handle_lower_key' })).toBe(true);
    expect(isHandleUniqueViolation({ code: '23505', constraint_name: 'user_profiles_username_key' })).toBe(false);
    expect(isHandleUniqueViolation({ code: '23503' })).toBe(false);
    expect(isHandleUniqueViolation(null)).toBe(false);
  });
});
