// Where the throwaway integration Postgres keeps its data directory.
//
// The integration suite resets the database before EVERY test (`resetDb` = TRUNCATE ... CASCADE over ~130 tables), which is
// dominated by file creation/removal in the data directory (measured on GitHub's ubuntu runners: ~160-235 ms per reset on disk vs
// ~80 ms on tmpfs; whole job ~330-440 s -> ~200 s). The data directory of this throwaway cluster is wiped on teardown anyway, so on
// Linux it goes to RAM (`/dev/shm`, a tmpfs) when there is room for it. Isolation is unchanged (same cluster, same TRUNCATE per
// test). Everywhere else (macOS, Windows, no /dev/shm, too little free space) it falls back to the OS temp dir.
//
// Set PAWPI_INTEGRATION_TMPFS=0 to force the OS temp dir (e.g. when debugging a failed run and keeping the files).

import { existsSync, statfsSync } from 'node:fs';
import os from 'node:os';

export const TMPFS_DIR = '/dev/shm';
/** Free space required before using tmpfs: the migrated cluster is ~100 MB; leave generous headroom. */
export const MIN_FREE_BYTES = 1024 * 1024 * 1024;

export interface DataDirProbe {
  platform: string;
  tmpfsExists: boolean;
  freeBytes: number | null;
  disabled: boolean;
}

/** Pure decision: the directory under which the cluster's data dir is created. */
export function chooseDataDirBase(probe: DataDirProbe, fallback: string): string {
  if (probe.disabled) return fallback;
  if (probe.platform !== 'linux' || !probe.tmpfsExists) return fallback;
  if (probe.freeBytes === null || probe.freeBytes < MIN_FREE_BYTES) return fallback;
  return TMPFS_DIR;
}

export function dataDirBase(): string {
  let freeBytes: number | null = null;
  try {
    const s = statfsSync(TMPFS_DIR);
    freeBytes = Number(s.bavail) * Number(s.bsize);
  } catch {
    freeBytes = null;
  }
  return chooseDataDirBase(
    {
      platform: process.platform,
      tmpfsExists: existsSync(TMPFS_DIR),
      freeBytes,
      disabled: process.env.PAWPI_INTEGRATION_TMPFS === '0',
    },
    os.tmpdir(),
  );
}
