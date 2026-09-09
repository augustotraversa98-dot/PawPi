import { describe, it, expect } from 'vitest';
import { toDayStr, ownerTodayFrom, utcTodayStr, DAY_RE } from './ownerLocalDay';

describe('ownerLocalDay', () => {
  it('normalises porsager date values (string or Date) to YYYY-MM-DD', () => {
    expect(toDayStr('2026-09-10')).toBe('2026-09-10');
    expect(toDayStr('2026-09-10T00:00:00.000Z')).toBe('2026-09-10');
    expect(toDayStr(new Date('2026-09-10T00:00:00Z'))).toBe('2026-09-10');
    expect(toDayStr(null)).toBeNull();
    expect(toDayStr('nope')).toBeNull();
    expect(toDayStr(new Date('x'))).toBeNull();
  });

  it('prefers the owner-local day from the identity row and falls back to UTC today', () => {
    expect(ownerTodayFrom({ id: 1, local_today: '2026-09-10' })).toBe('2026-09-10');
    expect(ownerTodayFrom({ id: 1 })).toBe(utcTodayStr());
    expect(ownerTodayFrom(undefined)).toBe(utcTodayStr());
    expect(DAY_RE.test('2026-09-10')).toBe(true);
    expect(DAY_RE.test('2026-9-1')).toBe(false);
  });
});
