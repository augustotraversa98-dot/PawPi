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
import { railConfig, PaymentsNotConfiguredError } from './config';
import * as mercadopago from './mercadopago';
import * as binance from './binance';

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
async function loadProviderAccount(providerId, rail) {
  const rows = await sql`
    SELECT * FROM provider_payment_accounts
    WHERE provider_id = ${providerId} AND rail = ${rail}
    LIMIT 1
  `;
  return rows[0] ?? null;
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

  const result = await adapter.createCheckout({ order, account, idempotencyKey });

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
 * @param {string} rail
 * @param {object} payload  { headers, rawBody, body } as parsed by the webhook route
 */
export async function handleWebhook(rail, payload) {
  if (!railConfig(rail)) throw new PaymentsNotConfiguredError(rail);
  const adapter = getAdapter(rail);

  // 1. Signature gate — reject anything we cannot verify.
  const verified =
    rail === 'mercadopago'
      ? adapter.verifyWebhook({
          headers: payload.headers ?? {},
          dataId: payload.body?.data?.id ?? payload.body?.id ?? null,
        })
      : adapter.verifyWebhook({
          headers: payload.headers ?? {},
          rawBody: payload.rawBody ?? '',
        });
  if (!verified) {
    return { ok: false, reason: 'invalid_signature', status: 401 };
  }

  // 2. Resolve external id + raw status from the rail-specific payload shape.
  const { externalReference, rawStatus } = extractWebhookRef(rail, payload.body ?? {});
  const status = adapter.mapStatus(rawStatus);

  // 3. Find the payment by external_id (MP/Binance order id) or order reference.
  const payment = await findPaymentForWebhook(externalReference);
  if (!payment) {
    // Acknowledge (200) so the rail stops retrying, but record nothing — unknown ref.
    return { ok: true, status: 'ignored', reason: 'unknown_reference' };
  }

  // 4. Reconcile: flip the payment + cascade to the order. Idempotent (re-applying the
  //    same terminal status is a no-op write).
  await applyPaymentStatus(payment, status, rawStatus);
  return { ok: true, status };
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

// Find the payment a webhook refers to — by external_id or idempotency_key. Returns null
// when nothing matches (an unknown reference → acknowledged-but-ignored).
async function findPaymentForWebhook(ref) {
  if (ref == null) return null;
  const rows = await sql`
    SELECT * FROM payments
    WHERE external_id = ${String(ref)} OR idempotency_key = ${String(ref)}
    ORDER BY id DESC
    LIMIT 1
  `;
  return rows[0] ?? null;
}

// Flip a payment's status and cascade to its order. Pure status-reconciliation logic:
//   approved → order 'paid'; refunded → order 'refunded'; failed → order 'failed'.
// Idempotent — writing the same status again is harmless.
export async function applyPaymentStatus(payment, status, rawStatus) {
  await sql`
    UPDATE payments
    SET status = ${status}, raw_status = ${rawStatus ?? null}, updated_at = now()
    WHERE id = ${payment.id}
  `;
  const orderStatus =
    status === 'approved'
      ? 'paid'
      : status === 'refunded'
        ? 'refunded'
        : status === 'failed'
          ? 'failed'
          : null;
  if (orderStatus) {
    await sql`
      UPDATE orders SET status = ${orderStatus}, updated_at = now()
      WHERE id = ${payment.order_id}
    `;
  }
}

export { PaymentsNotConfiguredError } from './config';
