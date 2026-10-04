// perf_startup from the existing boot trace (__create/boot-trace.ts, markBootComplete). Emitted once per process,
// right after markBootComplete(): the ms from the first boot milestone to "boot:complete". Never throws.

import { track } from './track';
import { msBucket } from './bucket';

let sent = false;

export function reportStartup() {
  try {
    if (sent) return;
    // eslint-disable-next-line global-require
    const mod = require('../../__create/boot-trace');
    const fn = mod && mod.getBootElapsedMs;
    if (typeof fn !== 'function') return; // trace unavailable (or mocked): report nothing rather than guess
    const ms = fn();
    const bucket = typeof ms === 'number' ? msBucket(ms) : null;
    if (!bucket) return;
    sent = true;
    track('perf_startup', { ms_bucket: bucket });
  } catch {
    // never throws
  }
}

/** Test helper. */
export function __resetStartupForTests() {
  sent = false;
}
