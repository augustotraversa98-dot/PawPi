// payments — the PROVIDER-AGNOSTIC payment layer (ticket 2.3). The single seam every
// monetized service calls; it never hardcodes a rail (DO-NOT). It dispatches to a
// rail adapter (MercadoPago / Binance Pay), persists to the money tables (orders /
// payments / payouts), and reconciles status from signature-verified webhooks.
//
// Public surface (the ticket's required API):
//   createCheckout(order)            → create the rail checkout + a pending payment row
//   handleWebhook(rail, payload)     → verify signature, flip payment + order status
//   getStatus(payment)               → reconcile a payment's status from the rail
//   refund(payment)                  → refund via the rail + flip status
//   payout(provider, amount)         → settle a provider + record a payouts row
//
// All DB access uses porsager's tagged-template `sql` (SCHEMA_NOTES "neon→porsager"
// gotcha). Adapters are imported as namespaces so tests can mock individual functions.
// Missing keys surface as PaymentsNotConfiguredError (the adapters throw it) — the layer
// lets it propagate so the ROUTE returns a clean 503 and NEVER crashes.

import sql from '../sql';
import {
  railConfig,
  PaymentsNotConfiguredError,
  ProviderPaymentAccountError,
} from './config';
import { decryptToken, TokenCryptoConfigError } from './tokenCrypto';
import * as mercadopago from './mercadopago';
import * as binance from './binance';
import { paymentSuccess, paymentFailure } from '@/lib/metrics';

// Adapter registry — keyed by rail. Adding a rail = adding one entry here (no rail is
// special-cased anywhere else in the layer).
const ADAPTERS = {
  mercadopago,
  binance,
};

export function getAdapter(rail) {
  const adapter = ADAPTERS[rail];
  if (!adapter) {
    const err = new Error(`Unknown payment rail: ${rail}`);
    err.status = 400;
    throw err;
  }
  return adapter;
}

// Load the provider's connected payment account for a rail (carries the token). Returns
// the row or null. Runs under the caller's RLS identity — provider-admin only.
//
// This is the SINGLE decrypt-on-read seam (ticket 2.16): the access/refresh tokens are
// stored encrypted, so we decrypt them here in-process before handing the row to an adapter.
// Every consumer (createCheckout/getStatus/refund/payout) goes through this function, so the
// adapter always receives PLAINTEXT tokens and stays unchanged. A legacy/plaintext value (no
// "enc:v1:" prefix) passes through decryptToken unchanged; a null/absent token is left as-is.
async function loadProviderAccount(providerId, rail) {
  // Read via the SECURITY DEFINER reader (0072), NOT a direct SELECT: this runs under the
  // PAYING CUSTOMER's identity, and provider_payment_accounts is provider-admin-only RLS
  // (0024), so a direct SELECT returns ZERO rows and checkout would wrongly report the
  // provider as "not connected". The definer function returns the provider's account for the
  // trusted payment layer without weakening the admin-only policy for direct table reads.
  const rows = await sql`
    SELECT * FROM app_get_provider_payment_account(${providerId}::int, ${rail})
  `;
  const account = rows[0] ?? null;
  if (account) {
    try {
      if (account.access_token != null) {
        account.access_token = decryptToken(account.access_token);
      }
      if (account.refresh_token != null) {
        account.refresh_token = decryptToken(account.refresh_token);
      }
    } catch (err) {
      // A MISSING/malformed PAYMENTS_TOKEN_KEY is a PLATFORM config problem — let it stay a
      // clean 503 (TokenCryptoConfigError). But a token that won't decrypt with the present
      // key (e.g. the key was rotated after the provider connected) is a PROVIDER-side
      // problem: the stored token is unusable and they must reconnect. Surface that as a
      // distinct, actionable error instead of a raw 500. We never log the token or the error
      // detail (it could echo ciphertext) — only that decryption failed.
      if (err instanceof TokenCryptoConfigError) throw err;
      throw new ProviderPaymentAccountError(rail, 'token_invalid');
    }
  }
  return account;
}

/**
 * createCheckout(order) — given a persisted `orders` row + a chosen rail, create the
 * rail checkout and INSERT a pending `payments` ledger row (idempotent on
 * idempotency_key). Returns { payment, checkoutUrl, ...railExtras }.
 *
 * @param {object} order            a persisted orders row (id, provider_id, amount_cents, …)
 * @param {object} opts
 * @param {string} opts.rail        'mercadopago' | 'binance'
 * @param {string} opts.idempotencyKey  caller-supplied key (safe retries)
 */
export async function createCheckout(order, { rail, idempotencyKey }) {
  if (!railConfig(rail)) throw new PaymentsNotConfiguredError(rail);
  const adapter = getAdapter(rail);

  // MercadoPago needs the provider's OAuth token; Binance uses the platform merchant.
  const account =
    rail === 'mercadopago'
      ? await loadProviderAccount(order.provider_id, rail)
      : null;

  // MercadoPago raises its integration-quality score (and avoids the generic PXB01 error)
  // when the preference carries the paying owner's identity. We resolve it here — the only
  // place with DB access — and hand it to the adapter, which sends ONLY the fields present.
  // Best-effort + ADDITIVE: a missing profile never blocks checkout.
  const payer =
    rail === 'mercadopago' ? await loadOwnerPayer(order.owner_user_id) : null;

  const result = await adapter.createCheckout({
    order,
    account,
    idempotencyKey,
    payer,
  });

  // Persist the attempt as a pending payment. ON CONFLICT (idempotency_key) keeps a
  // retried checkout from creating a duplicate ledger row.
  const inserted = await sql`
    INSERT INTO payments
      (order_id, rail, external_id, idempotency_key, status, amount_cents, commission_cents, raw_status)
    VALUES (
      ${order.id}, ${rail}, ${result.externalId ?? null}, ${idempotencyKey ?? null},
      'pending', ${order.amount_cents}, ${result.commissionCents ?? 0}, ${'created'}
    )
    ON CONFLICT (idempotency_key) DO UPDATE SET external_id = EXCLUDED.external_id
    RETURNING *
  `;

  return {
    payment: inserted[0],
    checkoutUrl: result.checkoutUrl ?? null,
    deeplink: result.deeplink ?? null,
    qrContent: result.qrContent ?? null,
  };
}

/**
 * handleWebhook(rail, payload) — verify the signature, resolve the affected payment,
 * map the rail status, and flip both the payment ledger row and its order. Returns
 * { ok, status } or { ok:false, reason }. NEVER trusts an unverified payload.
 *
 * The webhook is called by the RAIL, not a logged-in user, so it has NO RLS identity and payments/orders
 * (FORCE RLS) read as empty. Every DB touch here therefore goes through the SECURITY DEFINER functions of
 * migration 0135 (app_payment_for_webhook / app_apply_payment_status) — the signature gate comes FIRST and
 * nothing touches the DB before it passes (flow matrix F3-01).
 *
 * @param {string} rail
 * @param {object} payload  { headers, rawBody, body, query } as parsed by the webhook route
 */
export async function handleWebhook(rail, payload) {
  if (!railConfig(rail)) throw new PaymentsNotConfiguredError(rail);
  const adapter = getAdapter(rail);
  const body = payload.body ?? {};

  if (rail === 'mercadopago') {
    return handleMercadoPagoWebhook(adapter, payload, body);
  }

  // 1. Signature gate — reject anything we cannot verify.
  const verified = adapter.verifyWebhook({
    headers: payload.headers ?? {},
    rawBody: payload.rawBody ?? '',
  });
  if (!verified) {
    return { ok: false, reason: 'invalid_signature', status: 401 };
  }

  // 2. Resolve external id + raw status from the rail-specific payload shape.
  const { externalReference, rawStatus } = extractWebhookRef(rail, body);
  const status = adapter.mapStatus(rawStatus);

  // 3. Find the payment by external_id (Binance order id) or order reference.
  const payment = await findPaymentForWebhook(externalReference);
  if (!payment || payment.rail !== rail) {
    // Acknowledge (200) so the rail stops retrying, but record nothing — unknown ref.
    return { ok: true, status: 'ignored', reason: 'unknown_reference' };
  }

  // 4. Reconcile atomically + monotonically (the DB function owns the guard and the once-only side effects).
  const result = await applyPaymentStatus(payment, status, rawStatus);
  return { ok: true, status, applied: result.applied };
}

// MercadoPago. The notification is a POINTER, not a verdict: it is unauthenticated apart from the signed
// data.id, so we never read a status out of it (flow matrix F3-02). Instead:
//   signature (HMAC over data.id)  →  locate our ledger row from the order reference  →  fetch the payment from
//   MercadoPago with the SELLER's token  →  require its external_reference to be that same order  →  apply the
//   status MercadoPago reports. A replayed/forged/misrouted notification can therefore never settle anything.
async function handleMercadoPagoWebhook(adapter, payload, body) {
  const note = adapter.extractNotification({ query: payload.query, body });

  // 1. Signature gate FIRST — no DB, no outbound call before this passes.
  const verified = adapter.verifyWebhook({
    headers: payload.headers ?? {},
    dataId: note.dataId,
  });
  if (!verified) {
    return { ok: false, reason: 'invalid_signature', status: 401 };
  }

  // 2. Only payment notifications settle anything (merchant_order, plan, … are acknowledged and dropped).
  if (note.kind !== 'payment') {
    return { ok: true, status: 'ignored', reason: 'unsupported_topic' };
  }
  if (!note.dataId || !note.orderRef) {
    // A signed payment notification we cannot tie to an order (no order_ref on the URL). Acknowledge — a retry
    // would be identical — but make it loud: this is a payment that will need a manual look.
    console.error('[mercadopago webhook] payment notification without a locatable order reference');
    return { ok: true, status: 'ignored', reason: 'unknown_reference' };
  }

  // 3. Locate the ledger row (DEFINER; no identity needed).
  const payment = await findPaymentForWebhook(note.orderRef);
  if (!payment || payment.rail !== 'mercadopago') {
    return { ok: true, status: 'ignored', reason: 'unknown_reference' };
  }

  // 4. Ask MercadoPago for the real status, with the seller's token. A missing/undecryptable account or a
  //    failed fetch THROWS → the route answers 5xx and MercadoPago redelivers (the money is taken: never drop it).
  const account = await loadProviderAccount(payment.provider_id, 'mercadopago');
  if (!account?.access_token) throw new ProviderPaymentAccountError('mercadopago', 'not_connected');
  const remote = await adapter.getPaymentStatus({ externalId: note.dataId, account });

  // 5. The fetched payment must belong to the order we located (we set external_reference = order id).
  if (remote.externalReference !== String(payment.order_id)) {
    console.error('[mercadopago webhook] payment/order reference mismatch — ignored');
    return { ok: true, status: 'ignored', reason: 'reference_mismatch' };
  }

  // 6. Reconcile atomically + monotonically.
  const result = await applyPaymentStatus(payment, remote.status, remote.rawStatus);
  return { ok: true, status: remote.status, applied: result.applied };
}

/**
 * getStatus(payment) — reconcile a payment's status by asking the rail (used when a
 * webhook is missed). Returns { status, rawStatus } and persists the flip.
 */
export async function getStatus(payment) {
  if (!railConfig(payment.rail)) throw new PaymentsNotConfiguredError(payment.rail);
  const adapter = getAdapter(payment.rail);
  if (typeof adapter.getPaymentStatus !== 'function') {
    return { status: payment.status, rawStatus: payment.raw_status };
  }
  const order = await loadOrder(payment.order_id);
  const account =
    payment.rail === 'mercadopago' && order
      ? await loadProviderAccount(order.provider_id, payment.rail)
      : null;
  const { status, rawStatus } = await adapter.getPaymentStatus({
    externalId: payment.external_id,
    account,
  });
  await applyPaymentStatus(payment, status, rawStatus);
  return { status, rawStatus };
}

/**
 * refund(payment) — refund via the rail then flip the payment + order to refunded.
 */
export async function refund(payment) {
  if (!railConfig(payment.rail)) throw new PaymentsNotConfiguredError(payment.rail);
  const adapter = getAdapter(payment.rail);
  const order = await loadOrder(payment.order_id);
  const account =
    payment.rail === 'mercadopago' && order
      ? await loadProviderAccount(order.provider_id, payment.rail)
      : null;
  await adapter.refund({ payment, account });
  await applyPaymentStatus(payment, 'refunded', 'refunded');
  return { status: 'refunded' };
}

/**
 * payout(provider, amount) — settle a provider for `amountCents` via a rail and record a
 * payouts row. `provider` is the providers row; rail chosen per the provider's account.
 */
export async function payout(provider, amountCents, { rail }) {
  if (!railConfig(rail)) throw new PaymentsNotConfiguredError(rail);
  const adapter = getAdapter(rail);
  const account = await loadProviderAccount(provider.id, rail);
  const result = await adapter.payout({ provider, account, amountCents });
  const inserted = await sql`
    INSERT INTO payouts (provider_id, rail, amount_cents, status, external_id)
    VALUES (${provider.id}, ${rail}, ${amountCents}, ${result.status ?? 'pending'}, ${result.externalId ?? null})
    RETURNING *
  `;
  return { payout: inserted[0] };
}

// ── internal helpers ──────────────────────────────────────────────────────────

async function loadOrder(orderId) {
  const rows = await sql`SELECT * FROM orders WHERE id = ${orderId} LIMIT 1`;
  return rows[0] ?? null;
}

// Resolve the paying owner's { name, surname, email } for the MercadoPago payer block.
// The display name lives on user_profiles.full_name (fallback auth_users.name) and the
// email on auth_users.email; we split the full name into first token = name, remainder =
// surname. Runs under the paying owner's identity reading their OWN row. Best-effort: any
// error or missing data returns null so checkout proceeds WITHOUT the payer block (the
// field is additive — never a checkout blocker).
async function loadOwnerPayer(ownerUserId) {
  if (ownerUserId == null) return null;
  try {
    const rows = await sql`
      SELECT up.full_name, au.name AS auth_name, au.email
      FROM user_profiles up
      LEFT JOIN auth_users au ON au.id = up.auth_user_id
      WHERE up.id = ${ownerUserId}
      LIMIT 1
    `;
    const row = rows[0];
    if (!row) return null;
    const payer = {};
    const fullName = String(row.full_name || row.auth_name || '').trim();
    if (fullName) {
      const parts = fullName.split(/\s+/);
      payer.name = parts[0];
      if (parts.length > 1) payer.surname = parts.slice(1).join(' ');
    }
    const email = String(row.email || '').trim();
    if (email) payer.email = email;
    return Object.keys(payer).length ? payer : null;
  } catch {
    // Never let payer enrichment break a checkout — the field is purely additive.
    return null;
  }
}

// Pull (externalReference, rawStatus) out of a rail's webhook body. Kept tiny + per-rail
// so the shapes stay explicit; both fall back gracefully on partial payloads.
function extractWebhookRef(rail, body) {
  if (rail === 'mercadopago') {
    return {
      externalReference:
        body?.external_reference ?? body?.data?.external_reference ?? body?.data?.id ?? null,
      rawStatus: body?.status ?? body?.data?.status ?? body?.action ?? null,
    };
  }
  // binance
  return {
    externalReference: body?.merchantTradeNo ?? body?.prepayId ?? null,
    rawStatus: body?.bizStatus ?? body?.status ?? null,
  };
}

// Find the payment a webhook refers to — by external_id, idempotency_key or ORDER id. Returns null
// when nothing matches (an unknown reference → acknowledged-but-ignored). Goes through the SECURITY DEFINER
// app_payment_for_webhook (0135): a webhook has no RLS identity, so a direct SELECT on payments sees nothing.
// Returns { id, order_id, provider_id, rail, status, external_id, amount_cents }.
async function findPaymentForWebhook(ref) {
  if (ref == null) return null;
  const rows = await sql`
    SELECT * FROM app_payment_for_webhook(${String(ref)}::text)
  `;
  return rows[0] ?? null;
}

// Flip a payment's status and cascade to its order — ATOMICALLY and MONOTONICALLY, in the database.
//   approved → order 'paid'; refunded → order 'refunded'; failed → order 'failed'.
// All of it lives in the SECURITY DEFINER app_apply_payment_status (0135), the single implementation of the
// status machine, callable with or without a request identity (webhook, provider refund, status reconcile):
//   - refunded is terminal; approved only moves to refunded; a repeated status is a no-op (flow audit F3-03),
//     decided on a row-locked read, not on the possibly-stale `payment` object passed in here;
//   - on a REAL order transition it runs the once-only side effects: product stock (paid −1, refunded +1 only if
//     it had been paid — ticket 2.11), walk-package credits (ticket B2), and auto-confirm of the linked booking.
// Returns { applied } — false when the guard/idempotency skipped it or the payment does not exist.
export async function applyPaymentStatus(payment, status, rawStatus) {
  const rows = await sql`
    SELECT * FROM app_apply_payment_status(${payment.id}::int, ${status}::text, ${rawStatus ?? null}::text)
  `;
  const r = rows[0];
  if (!r) return { applied: false, reason: 'payment_not_found' };
  try {
    if (r.applied) {
      if (r.new_payment_status === 'approved') paymentSuccess.add(1, { rail: payment.rail ?? 'unknown' });
      else if (r.new_payment_status === 'failed') paymentFailure.add(1, { rail: payment.rail ?? 'unknown' });
    }
  } catch {}
  return {
    applied: r.applied === true,
    orderId: r.out_order_id ?? null,
    prevPaymentStatus: r.prev_payment_status ?? null,
    newPaymentStatus: r.new_payment_status ?? null,
    prevOrderStatus: r.prev_order_status ?? null,
    newOrderStatus: r.new_order_status ?? null,
    confirmedBookingIds: r.confirmed_booking_ids ?? [],
  };
}

export { PaymentsNotConfiguredError } from './config';
