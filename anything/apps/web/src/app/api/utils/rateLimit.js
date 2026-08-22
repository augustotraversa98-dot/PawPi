// PP3 — write rate limiting (pre-launch polish fix-pack; closes the night run's A4 gap).
//
// PawPi had no application-level throttle on writes: one account could post, comment,
// report, follow or book in a tight loop. This adds a small fixed-window limiter on
// the high-risk write endpoints only.
//
// THE STORE IS POSTGRES, ON PURPOSE. The web app runs as several Railway instances
// behind a load balancer, so an in-process Map is per-instance and a caller just
// spreads the burst across replicas. The counter lives in the one thing every
// instance shares — migration 0113's `rate_limit_hits` + `app_rate_limit_hit()`.
//
// THREE RULES THIS FILE KEEPS:
//   1. READS ARE NEVER LIMITED. Only the POST handlers below are wrapped.
//   2. IT FAILS OPEN. Any error — table missing (pre-migration), function missing,
//      connection trouble — is logged once and the write proceeds. A limiter that
//      500s the app it protects is worse than no limiter.
//   3. IT CANNOT POISON THE REQUEST. The counter call runs inside a SAVEPOINT, so a
//      failed query rolls back to the savepoint instead of aborting the request
//      transaction (which withRequestContext would then turn into a blanket 500 —
//      see the comment on withSavepoint).
//
// KNOWN, ACCEPTED LIMITATION: the increment lives in the request transaction, so a
// request that ends in a rollback (an unhandled 500) does not count. Handled 4xx
// responses still commit and still count. Closing that would mean a second
// connection per limited write; not worth it at launch scale, and the failure mode
// is under-counting, never over-counting.

import { withSavepoint } from './requestContext';
import sql from './sql';

/**
 * Is a real request transaction open?
 *
 * porsager exposes `savepoint` on a TRANSACTION handle and never on the pool, and
 * the `sql` proxy forwards property reads to whichever is active — so this is the
 * same signal withSavepoint keys on. Probing the proxy (rather than importing
 * `getActiveTx`) is deliberate: every route unit test mocks `@/app/api/utils/sql`
 * with just a default export, and a named import would make each of them fail to
 * resolve it.
 */
function inRequestTransaction() {
  try {
    return typeof sql.savepoint === 'function';
  } catch {
    return false;
  }
}

/**
 * The buckets. Deliberately generous — this is abuse and cost protection, not a
 * quota; a real person should never see a 429. Tune with evidence after launch.
 *
 * `windowSeconds` is a FIXED window, so the true worst case across a boundary is
 * 2x `limit` in a short span. That is fine at these numbers and keeps the store a
 * single upsert.
 */
export const RATE_LIMITS = {
  // Content creation — the expensive, most abusable writes.
  post_create: { limit: 12, windowSeconds: 300 },
  bark_create: { limit: 30, windowSeconds: 300 },
  // Reports go to a human moderation queue, so flooding it is the abuse.
  report_create: { limit: 20, windowSeconds: 3600 },
  // Bookings notify a business (and can create a payment intent).
  booking_create: { limit: 15, windowSeconds: 3600 },
  // Taps. Legitimately fast and bursty — a scroll-and-paw session must never trip.
  paw_toggle: { limit: 120, windowSeconds: 60 },
  follow_toggle: { limit: 60, windowSeconds: 300 },

  // #6 (night-run S6) — sensitive routes that had no throttle. All generous: a real user/vet
  // never trips them; they exist to cap abuse (token probing, notification spam, storage/cost
  // flooding, payment attempts). The public-emergency buckets key by IP (no auth there).
  emergency_public_read: { limit: 60, windowSeconds: 300 }, // per-IP: caps blind token probing
  emergency_relay: { limit: 10, windowSeconds: 3600 }, // per-IP: caps owner-notification spam
  upload_create: { limit: 30, windowSeconds: 300 }, // caps storage/cost flooding
  checkout_create: { limit: 15, windowSeconds: 3600 }, // mirrors booking_create
  dm_message_create: { limit: 60, windowSeconds: 60 }, // fast enough for a real back-and-forth
};

const RATE_LIMITED_CODE = 'rate_limited';

// Copy is returned in BOTH languages on every 429, so the client always has the
// right string even when we cannot tell which language the caller wants. `error` is
// the field the mobile client surfaces (it throws `new Error(err.error)`), so that
// one is resolved server-side — best effort, see pickLocale.
const MESSAGES = {
  en: "You're doing that a bit too fast. Take a short break and try again.",
  es: 'Estás haciendo eso demasiado rápido. Esperá un momento y volvé a intentar.',
};

/**
 * Which language to put in `error`. The mobile client sends no locale header, so
 * this reads Accept-Language (React Native does forward the device's) and falls
 * back to English. The caller can also pass an explicit locale — the 429 path uses
 * the caller's stored `preferred_locale` when it has one, which is authoritative.
 */
export function pickLocale(request, preferred) {
  if (preferred === 'es' || preferred === 'en') return preferred;
  const header = request?.headers?.get?.('accept-language') || '';
  return /(^|,|\s)es\b/i.test(header) ? 'es' : 'en';
}

/**
 * The caller's stored language, or null. Only ever called on the (rare) 429 path,
 * so the extra query costs nothing in the normal case. Own-row read — the caller is
 * the owner — and best-effort: a missing column or row just means Accept-Language.
 */
async function storedLocale(userId) {
  if (userId == null) return null;
  try {
    return await withSavepoint(async () => {
      const rows = await sql`
        SELECT preferred_locale FROM user_profiles WHERE id = ${userId} LIMIT 1
      `;
      return rows?.[0]?.preferred_locale ?? null;
    });
  } catch {
    return null;
  }
}

/**
 * The best available client address. Railway sits behind a proxy, so the socket
 * address is the proxy's — x-forwarded-for's FIRST entry is the client. Only used
 * when there is no authenticated user; an unauthenticated caller behind a shared
 * NAT sharing a bucket is an acceptable trade for the routes involved.
 */
function clientIp(request) {
  const forwarded = request?.headers?.get?.('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0].trim();
    if (first) return first;
  }
  return request?.headers?.get?.('x-real-ip')?.trim() || null;
}

/**
 * WHO is being limited. Prefixed so the user-id and IP spaces can never collide.
 * Returns null when neither is knowable, which means "don't limit" — we will not
 * lump every anonymous caller into one shared bucket.
 */
export function rateLimitSubject({ userId, request }) {
  if (userId != null) return `u:${userId}`;
  const ip = clientIp(request);
  return ip ? `ip:${ip}` : null;
}

/** The 429 body + headers. Exported so tests can assert the shape in one place. */
export function rateLimitResponse({ retryAfterSeconds, locale }) {
  const lang = locale === 'es' ? 'es' : 'en';
  return Response.json(
    {
      error: MESSAGES[lang],
      code: RATE_LIMITED_CODE,
      message_en: MESSAGES.en,
      message_es: MESSAGES.es,
      retry_after_seconds: retryAfterSeconds,
    },
    {
      status: 429,
      headers: { 'Retry-After': String(retryAfterSeconds) },
    },
  );
}

/**
 * Count one attempt against `bucket` for this caller.
 *
 * Returns null when the write may proceed (allowed, unknown subject, or ANY
 * failure), or a ready-to-return 429 Response when the caller is over the limit.
 *
 * `userId` is the caller's user_profiles.id. Pass it when the handler has already
 * resolved it; otherwise the transaction's identity GUC is used, so a handler that
 * has not resolved its user yet still gets per-user limiting for free.
 */
export async function enforceRateLimit(bucket, request, { userId = null } = {}) {
  const config = RATE_LIMITS[bucket];
  if (!config) {
    console.error(`[rateLimit] unknown bucket "${bucket}" — not limiting`);
    return null;
  }

  // No request transaction means no shared store to count in and no identity GUC to
  // key on — withRequestContext only skips the transaction when there is no real
  // pool (a route unit test with a mocked `sql`, or an unset DATABASE_URL). Bail out
  // BEFORE issuing any query: a mocked `sql` would otherwise consume a queued result
  // and shift every subsequent assertion in the handler's own test. In production a
  // transaction is always active, so this branch never fires there.
  if (!inRequestTransaction()) return null;

  let subject;
  let result;
  try {
    // One savepoint around BOTH the identity read and the counter call, so neither
    // can abort the request transaction.
    result = await withSavepoint(async () => {
      let id = userId;
      if (id == null) {
        const rows = await sql`SELECT current_app_user_id() AS id`;
        id = rows?.[0]?.id ?? null;
      }
      subject = rateLimitSubject({ userId: id, request });
      if (!subject) return { skip: true, id };

      const rows = await sql`
        SELECT allowed, hits, retry_after_seconds
        FROM app_rate_limit_hit(
          ${bucket}, ${subject}, ${config.windowSeconds}, ${config.limit}
        )
      `;
      return { row: rows?.[0] ?? null, id };
    });
  } catch (error) {
    // Fail open: pre-migration (42P01 / 42883), a mocked `sql` in unit tests, or a
    // transient DB problem must never block a legitimate write.
    console.error(`[rateLimit] "${bucket}" check failed — allowing the write:`, error?.message || error);
    return null;
  }

  if (!result || result.skip || !result.row || result.row.allowed !== false) return null;

  const retryAfterSeconds = Number(result.row.retry_after_seconds) || config.windowSeconds;
  console.warn(
    `[rateLimit] 429 ${bucket} for ${subject} (${result.row.hits} > ${config.limit} per ${config.windowSeconds}s)`,
  );
  const locale = pickLocale(request, await storedLocale(result.id));
  return rateLimitResponse({ retryAfterSeconds, locale });
}

/**
 * Wrap a WRITE handler so it is rate limited. Compose INSIDE withRequestContext —
 * the limiter needs the request transaction (for the savepoint) and its identity
 * GUC, both of which that wrapper establishes:
 *
 *   const wrappedPOST = withRequestContext(withRateLimit('post_create', POST));
 *
 * Never wrap a GET.
 */
export function withRateLimit(bucket, handler) {
  return async (request, ctx) => {
    const limited = await enforceRateLimit(bucket, request);
    if (limited) return limited;
    return handler(request, ctx);
  };
}
