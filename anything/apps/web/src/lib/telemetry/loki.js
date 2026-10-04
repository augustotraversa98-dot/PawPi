// Generic, batched, fire-and-forget Loki shipper (Grafana Cloud Loki HTTP push API).
// Used by the client-telemetry ingest (job="pawpi-client") and reusable for server logs (job="pawpi-web").
//
// Contract with the rest of the app (01-TELEMETRY-CONTRACT.md principle 4): telemetry can NEVER break or slow a
// request. So: no-op unless GRAFANA_LOKI_URL + GRAFANA_LOKI_USER + GRAFANA_LOKI_TOKEN are all set; push() only
// appends to a bounded in-memory queue (oldest dropped on overflow); the network send happens off the request path
// with a timeout, on unref'd timers; every error is swallowed (a failed batch is dropped, never retried forever).
// The fetch implementation is injectable for tests.
//
// Labels are the Loki index: callers pass LOW-CARDINALITY labels only (the client forwarder uses exactly job,
// event, app_version, platform). Label names/values are sanitised here as a second line of defence.

const PUSH_PATH = '/loki/api/v1/push';
const LABEL_NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_]{0,31}$/;
const LABEL_VALUE_RE = /^[A-Za-z0-9_.:\/-]{1,64}$/;
const MAX_LINE_BYTES = 8 * 1024;

/** Loki settings from env, or null when any of the three is unset (=> shipper is a no-op). */
export function lokiConfigFromEnv(env = process.env) {
  const url = env.GRAFANA_LOKI_URL?.trim();
  const user = env.GRAFANA_LOKI_USER?.trim();
  const token = env.GRAFANA_LOKI_TOKEN?.trim();
  if (!url || !user || !token) return null;
  return { url: lokiPushUrl(url), user, token };
}

/** Accept the base URL with or without the /loki/api/v1/push suffix (and trailing slashes). */
export function lokiPushUrl(url) {
  const base = String(url).trim().replace(/\/+$/, '');
  return base.endsWith(PUSH_PATH) ? base : base + PUSH_PATH;
}

/**
 * @param {object} [opts]
 * @param {() => ({url: string, user: string, token: string} | null)} [opts.getConfig] default: read GRAFANA_LOKI_* env
 * @param {typeof fetch} [opts.fetchImpl]
 * @param {number} [opts.flushMs=5000]     flush at least this often
 * @param {number} [opts.maxBatch=100]     flush as soon as this many lines are queued
 * @param {number} [opts.maxQueue=2000]    hard cap on queued lines; the OLDEST are dropped beyond it
 * @param {number} [opts.timeoutMs=5000]   per-request timeout
 * @param {() => number} [opts.now]
 */
export function createLokiShipper({
  getConfig = () => lokiConfigFromEnv(),
  fetchImpl = (...a) => globalThis.fetch(...a),
  flushMs = 5000,
  maxBatch = 100,
  maxQueue = 2000,
  timeoutMs = 5000,
  now = Date.now,
} = {}) {
  let queue = []; // { key, labels, ts (ns string), line }
  let timer = null;
  let inflight = false;
  const stats = { queued: 0, sent: 0, failed: 0, dropped: 0 };
  let lastNs = 0n;

  function nextTimestampNs() {
    // strictly increasing, so lines in one stream never tie or go backwards
    let ns = BigInt(now()) * 1_000_000n;
    if (ns <= lastNs) ns = lastNs + 1n;
    lastNs = ns;
    return ns.toString();
  }

  function sanitizeLabels(labels) {
    if (!labels || typeof labels !== 'object') return null;
    const out = {};
    for (const k of Object.keys(labels).sort()) {
      const v = labels[k];
      if (!LABEL_NAME_RE.test(k) || typeof v !== 'string' || !LABEL_VALUE_RE.test(v)) return null; // refuse the whole line
      out[k] = v;
    }
    return Object.keys(out).length ? out : null;
  }

  function schedule() {
    if (timer) return;
    try {
      timer = setTimeout(() => {
        timer = null;
        void flush();
      }, flushMs);
      timer.unref?.();
    } catch {
      timer = null;
    }
  }

  async function send(batch, config) {
    const streams = new Map();
    for (const item of batch) {
      let s = streams.get(item.key);
      if (!s) streams.set(item.key, (s = { stream: item.labels, values: [] }));
      s.values.push([item.ts, item.line]);
    }
    const ctrl = new AbortController();
    let abort;
    // Promise.race: even a fetch that ignores the abort signal can not wedge the shipper.
    const deadline = new Promise((_, reject) => {
      abort = setTimeout(() => {
        ctrl.abort();
        reject(new Error('loki push timeout'));
      }, timeoutMs);
      abort.unref?.();
    });
    try {
      const res = await Promise.race([
        fetchImpl(config.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Basic ' + Buffer.from(`${config.user}:${config.token}`).toString('base64'),
          },
          body: JSON.stringify({ streams: [...streams.values()] }),
          signal: ctrl.signal,
        }),
        deadline,
      ]);
      if (res && res.ok === false) throw new Error('loki push rejected');
      stats.sent += batch.length;
    } finally {
      clearTimeout(abort);
    }
  }

  /** Send what is queued (one batch). Never throws, never rejects. */
  async function flush() {
    try {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (inflight || queue.length === 0) return;
      const config = getConfig();
      if (!config) {
        stats.dropped += queue.length;
        queue = [];
        return;
      }
      inflight = true;
      const batch = queue.slice(0, maxBatch);
      queue = queue.slice(batch.length);
      try {
        await send(batch, config);
      } catch {
        stats.failed += batch.length; // dropped on purpose: no retry storm, bounded memory
      } finally {
        inflight = false;
      }
      if (queue.length >= maxBatch) void flush();
      else if (queue.length) schedule();
    } catch {
      inflight = false;
    }
  }

  /**
   * Queue one log line. `labels` = low-cardinality Loki labels, `line` = a string (or an object, JSON-encoded).
   * @returns {boolean} whether it was queued (false: shipper unconfigured, bad labels, or oversize line)
   */
  function push(labels, line) {
    try {
      if (!getConfig()) return false; // no-op without GRAFANA_LOKI_*
      const clean = sanitizeLabels(labels);
      if (!clean) return false;
      const text = typeof line === 'string' ? line : JSON.stringify(line);
      if (typeof text !== 'string' || text.length === 0 || Buffer.byteLength(text) > MAX_LINE_BYTES) return false;
      queue.push({ key: JSON.stringify(clean), labels: clean, ts: nextTimestampNs(), line: text });
      stats.queued += 1;
      if (queue.length > maxQueue) {
        const over = queue.length - maxQueue;
        queue = queue.slice(over); // drop the oldest
        stats.dropped += over;
      }
      if (queue.length >= maxBatch) void flush();
      else schedule();
      return true;
    } catch {
      return false;
    }
  }

  return {
    push,
    flush,
    stats: () => ({ ...stats, pending: queue.length }),
    /** test helper: forget everything queued and stop the timer */
    reset() {
      queue = [];
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}

/** Process-wide shipper (reads GRAFANA_LOKI_* from env on use). Step E reuses it with job="pawpi-web". */
export const loki = createLokiShipper();
