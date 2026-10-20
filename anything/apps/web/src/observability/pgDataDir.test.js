// @vitest-environment node
// Where the integration Postgres keeps its data directory: tmpfs on Linux when there is room, the OS temp dir otherwise.
import { describe, expect, it } from 'vitest';
import { MIN_FREE_BYTES, TMPFS_DIR, chooseDataDirBase } from '../../test/integration/pgDataDir.ts';

const FALLBACK = '/tmp';
const base = { platform: 'linux', tmpfsExists: true, freeBytes: 8 * 1024 ** 3, disabled: false };

describe('chooseDataDirBase', () => {
  it('Linux with a tmpfs and enough free space: /dev/shm', () => {
    expect(chooseDataDirBase(base, FALLBACK)).toBe(TMPFS_DIR);
    expect(chooseDataDirBase({ ...base, freeBytes: MIN_FREE_BYTES }, FALLBACK)).toBe(TMPFS_DIR);
  });

  it.each([
    ['macOS', { platform: 'darwin' }],
    ['Windows', { platform: 'win32' }],
    ['no /dev/shm', { tmpfsExists: false }],
    ['free space unknown', { freeBytes: null }],
    ['not enough free space', { freeBytes: MIN_FREE_BYTES - 1 }],
    ['explicitly disabled', { disabled: true }],
  ])('falls back to the OS temp dir: %s', (_n, over) => {
    expect(chooseDataDirBase({ ...base, ...over }, FALLBACK)).toBe(FALLBACK);
  });
});
