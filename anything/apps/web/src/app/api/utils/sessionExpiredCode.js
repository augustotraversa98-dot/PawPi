// A stable machine code on every REAL session 401 (missing / invalid / revoked token).
//
// Why: the mobile app used to sign the user out on ANY 401 from a first-party /api route. A 401 can
// also come from a business rule (it did, in walk-pickup/redeem) and from machine credentials
// (cron secrets, webhook signatures), so a plain 401 cannot mean "your session is dead". The
// client now only treats a 401 as a dead session when it carries this code (or after one re-check
// against GET /api/session). Builds already in the wild still log out on any 401, which is why the
// business 401s were also moved to the right status.
//
// ~380 route handlers return `{ error: "Unauthorized" }, 401` straight from their `auth()` guard.
// Rather than touch every route, this middleware stamps those responses once, centrally:
//   - header   X-Pawpi-Error-Code: session_expired   (cheap for the client to read, body untouched)
//   - body     `code: "session_expired"` merged into a JSON-object body (the message is unchanged,
//              so whatever text a client already shows keeps working)
//
// NOT stamped (a 401 there is not about the caller's session):
//   - /api/auth/*               the sign-in bridge 401s as part of its normal protocol
//   - /api/internal/*           Grafana alert webhook (shared secret)
//   - /api/payments/webhooks/*  provider webhook signatures
//   - any request carrying x-cron-secret   (Railway cron callers)
// The mobile app never calls those, so leaving them as plain 401 changes nothing for it.

export const SESSION_EXPIRED_CODE = 'session_expired';
export const ERROR_CODE_HEADER = 'X-Pawpi-Error-Code';

const MACHINE_PATH_PREFIXES = ['/api/auth/', '/api/internal/', '/api/payments/webhooks/'];

export function isMachineAuthRequest(path, headers) {
  if (MACHINE_PATH_PREFIXES.some((p) => path.startsWith(p))) return true;
  return Boolean(headers?.get?.('x-cron-secret'));
}

/** Hono middleware: stamp the session_expired code on a 401 produced downstream. Never throws. */
export function stampSessionExpired() {
  return async (c, next) => {
    await next();
    try {
      const res = c.res;
      if (!res || res.status !== 401) return;
      if (isMachineAuthRequest(c.req.path, c.req.raw.headers)) return;
      if (res.headers.get(ERROR_CODE_HEADER)) return;

      const headers = new Headers(res.headers);
      headers.set(ERROR_CODE_HEADER, SESSION_EXPIRED_CODE);

      let body = null;
      if ((res.headers.get('content-type') ?? '').includes('application/json')) {
        const text = await res.clone().text();
        try {
          const parsed = JSON.parse(text);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            body = JSON.stringify({ ...parsed, code: parsed.code ?? SESSION_EXPIRED_CODE });
          }
        } catch {
          // not JSON after all: keep the body as is, the header still carries the code
        }
        if (body === null) body = text;
        headers.delete('content-length');
      } else {
        body = await res.clone().text();
        headers.delete('content-length');
      }
      c.res = new Response(body, { status: 401, statusText: res.statusText, headers });
    } catch {
      // stamping must never turn a 401 into anything else
    }
  };
}
