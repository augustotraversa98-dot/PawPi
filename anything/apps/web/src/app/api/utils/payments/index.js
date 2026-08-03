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
//
// SHOP STOCK (ticket 2.11): for a 'product' order, paid DECREMENTS inventory and refunded
// RESTOCKS it. We read the order's PRIOR status first so the move only happens on a real
// TRANSITION (a repeated terminal webhook does not double-move stock). The move runs via
// the SECURITY DEFINER app_adjust_order_stock helper (0037) so the payment actor — the
// owner or a webhook, not a shop admin — can adjust catalog stock without catalog write
// access. Non-product orders have no product_id lines, so the helper is a no-op for them.
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
    // Read the prior order row (kind + status) so the stock move is transition-only.
    const prior = await sql`
      SELECT kind, status FROM orders WHERE id = ${payment.order_id} LIMIT 1
    `;
    const prev = prior[0] ?? null;
    await sql`
      UPDATE orders SET status = ${orderStatus}, updated_at = now()
      WHERE id = ${payment.order_id}
    `;
    if (prev?.kind === 'product') {
      // Decrement on the first transition into paid; restock on the first into refunded.
      if (orderStatus === 'paid' && prev.status !== 'paid') {
        await sql`SELECT app_adjust_order_stock(${payment.order_id}, -1)`;
      } else if (orderStatus === 'refunded' && prev.status !== 'refunded') {
        await sql`SELECT app_adjust_order_stock(${payment.order_id}, 1)`;
      }
    }
  }
}

export { PaymentsNotConfiguredError } from './config';
