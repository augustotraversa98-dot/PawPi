import { describe, it, expect } from 'vitest';

// Smoke test: proves the Vitest wire is live (config, runner, npm script).
// Not a real regression — see api/utils/jsonb.test.js for the first of those.
describe('vitest wiring', () => {
  it('runs and asserts', () => {
    expect(1 + 1).toBe(2);
  });
});
