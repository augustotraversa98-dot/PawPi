// Bounded, non-blocking event queue with batched flushing. PURE (clock + timers + sender are injected, so tests
// drive time by hand and no real timer can keep a test process alive).
//
// Rules (contract / step B item 5):
//   - flush when `flushSize` (20) events are waiting, every `flushIntervalMs` (15 s) while events wait, and
//     whenever flush() is called (app going to background);
//   - capped at `maxSize` (200): the OLDEST event is dropped when the cap is exceeded (offline queue);
//   - push() is synchronous, O(1) and never throws; flush() never rejects and never blocks the caller;
//   - a failed send puts the batch back (still bounded) and backs off (interval doubles, capped);
//   - events are batched per session_id (the envelope carries exactly one), at most `maxBatch` (50 = server limit).
//
// send(batch) -> Promise<'ok' | 'drop' | 'retry'>   ('drop' = server refused it for good: discard, do not retry)

export const QUEUE_DEFAULTS = Object.freeze({
  maxSize: 200,
  flushSize: 20,
  flushIntervalMs: 15000,
  maxBatch: 50,
  maxBatchesPerFlush: 4,
  maxBackoffMs: 120000,
});

export function createQueue({
  send,
  canSend = () => true,
  onBlocked = () => {},
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (h) => clearTimeout(h),
  ...overrides
}) {
  const cfg = { ...QUEUE_DEFAULTS, ...overrides };
  let items = [];
  let timer = null;
  let flushing = false;
  let running = false;
  let failures = 0;
  let dropped = 0;
  let epoch = 0; // bumped by clear(): a batch that was in flight when the queue was cleared must NOT come back

  const trim = () => {
    if (items.length > cfg.maxSize) {
      const extra = items.length - cfg.maxSize;
      items.splice(0, extra); // drop OLDEST
      dropped += extra;
    }
  };

  const clearTimerSafe = () => {
    if (timer !== null) {
      try {
        clearTimer(timer);
      } catch {
        // ignore
      }
      timer = null;
    }
  };

  const schedule = () => {
    if (!running || timer !== null || items.length === 0) return;
    const delay = Math.min(cfg.flushIntervalMs * 2 ** Math.min(failures, 8), cfg.maxBackoffMs);
    try {
      timer = setTimer(() => {
        timer = null;
        void flush();
      }, Math.max(delay, cfg.flushIntervalMs));
      // Never keep a process (jest, node) alive just for telemetry.
      if (timer && typeof timer === 'object' && typeof timer.unref === 'function') timer.unref();
    } catch {
      timer = null;
    }
  };

  // The head session's events, up to maxBatch, removed from the queue (re-added on failure).
  const takeBatch = () => {
    const sid = items[0].session_id;
    let n = 0;
    while (n < items.length && n < cfg.maxBatch && items[n].session_id === sid) n += 1;
    return items.splice(0, n);
  };

  async function flush() {
    if (flushing) return;
    flushing = true;
    try {
      clearTimerSafe();
      let batches = 0;
      let blocked = false;
      while (items.length > 0 && batches < cfg.maxBatchesPerFlush) {
        let allowed = false;
        try {
          allowed = !!canSend();
        } catch {
          allowed = false;
        }
        if (!allowed) {
          blocked = true;
          break;
        }
        const batch = takeBatch();
        const batchEpoch = epoch;
        batches += 1;
        let result;
        try {
          result = await send(batch.slice());
        } catch {
          result = 'retry';
        }
        if (result === 'ok') {
          failures = 0;
        } else if (result === 'drop') {
          dropped += batch.length;
          failures = 0;
        } else {
          if (batchEpoch === epoch) {
            items = batch.concat(items);
            trim();
          }
          failures += 1;
          break;
        }
      }
      if (blocked) {
        try {
          onBlocked();
        } catch {
          // ignore
        }
      }
    } catch {
      // never reject
    } finally {
      flushing = false;
      schedule();
    }
  }

  return {
    /** Add one event. Synchronous, never throws. Triggers a flush at `flushSize`, otherwise arms the 15 s timer. */
    push(item) {
      try {
        if (!item || typeof item !== 'object') return; // only well-formed events are ever queued
        items.push(item);
        trim();
        if (!running) return;
        if (items.length >= cfg.flushSize) void flush();
        else schedule();
      } catch {
        // telemetry must never throw
      }
    },
    flush,
    /** Begin timed flushing (events buffered before start() are kept and scheduled now). */
    start() {
      running = true;
      schedule();
    },
    /** Stop timers; buffered events stay in memory. */
    stop() {
      running = false;
      clearTimerSafe();
    },
    /** Drop everything (opt-out, kill switch). */
    clear() {
      epoch += 1;
      items = [];
      clearTimerSafe();
    },
    size: () => items.length,
    droppedCount: () => dropped,
    /** Copy of the waiting events (tests / diagnostics). */
    peek: () => items.slice(),
    isRunning: () => running,
  };
}
