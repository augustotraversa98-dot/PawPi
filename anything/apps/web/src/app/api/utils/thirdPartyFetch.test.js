import { describe, it, expect } from 'vitest';
import { thirdPartySignal, THIRD_PARTY_TIMEOUT_MS } from './thirdPartyFetch';

describe('thirdPartySignal', () => {
  it('returns a not-yet-aborted AbortSignal with a bounded default', () => {
    const s = thirdPartySignal();
    expect(s).toBeInstanceOf(AbortSignal);
    expect(s.aborted).toBe(false);
    expect(THIRD_PARTY_TIMEOUT_MS).toBe(10_000);
  });
  it('aborts after the deadline', async () => {
    const s = thirdPartySignal(10);
    await new Promise((r) => setTimeout(r, 30));
    expect(s.aborted).toBe(true);
  });
});
