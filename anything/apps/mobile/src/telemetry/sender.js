// Network side of telemetry. PURE apart from the injected fetch.
//
// PRIVACY: telemetry is anonymous. `getFetch` must return the ORIGINAL platform fetch, NOT the patched global
// fetch from src/__create/fetch.ts (which attaches the user's Bearer token and project/host headers). The only
// request header is Content-Type; cookies are not sent (credentials: "omit").
//
// post(envelope) -> 'ok' (2xx) | 'drop' (400/413/other 4xx: the server will never accept this batch)
//                   | 'retry' (network error, timeout, 429, 5xx)

export const SEND_TIMEOUT_MS = 8000;

export function createSender({
  getFetch,
  getBaseUrl,
  timeoutMs = SEND_TIMEOUT_MS,
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (h) => clearTimeout(h),
}) {
  async function request(path, init) {
    const base = getBaseUrl();
    if (!base || typeof base !== 'string') return { skipped: true };
    const f = getFetch();
    if (typeof f !== 'function') return { skipped: true };
    let controller = null;
    let handle = null;
    try {
      controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      if (controller) handle = setTimer(() => controller.abort(), timeoutMs);
      const res = await f(`${base}${path}`, {
        ...init,
        credentials: 'omit',
        ...(controller ? { signal: controller.signal } : {}),
      });
      return { res };
    } catch {
      return { failed: true };
    } finally {
      if (handle !== null) {
        try {
          clearTimer(handle);
        } catch {
          // ignore
        }
      }
    }
  }

  return {
    /** POST one batch. Never throws. */
    async post(envelope) {
      try {
        const out = await request('/api/telemetry/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(envelope),
        });
        if (out.skipped) return 'drop'; // not configured: nothing will ever send, do not hold events
        if (out.failed || !out.res) return 'retry';
        const status = Number(out.res.status);
        if (status >= 200 && status < 300) return 'ok';
        if (status === 429 || status >= 500) return 'retry';
        return 'drop';
      } catch {
        return 'retry';
      }
    },

    /** GET the kill switch. Resolves { enabled, sampleRate } or null when it could not be read (fail closed). */
    async getConfig() {
      try {
        const out = await request('/api/telemetry/config', { method: 'GET' });
        if (!out.res || !(Number(out.res.status) >= 200 && Number(out.res.status) < 300)) return null;
        const body = await out.res.json();
        if (!body || typeof body.enabled !== 'boolean') return null;
        let sampleRate = Number(body.sampleRate);
        if (!Number.isFinite(sampleRate)) sampleRate = 1;
        sampleRate = Math.min(1, Math.max(0, sampleRate));
        return { enabled: body.enabled, sampleRate };
      } catch {
        return null;
      }
    },
  };
}
