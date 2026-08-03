// payments/mercadopago — the MercadoPago adapter (ticket 2.3). Fiat rail, primary.
//
// Model: SPLIT PAYMENTS. The platform is a MercadoPago "marketplace" app; each provider
// connects via OAuth (we store their user access token in provider_payment_accounts). A
// checkout is created on the provider's account with the platform's commission
// (marketplace_fee), so MercadoPago splits the money automatically. Webhooks are
// signature-verified before we trust them.
//
// KEY-STUBBED: this adapter reads env keys (MP_CLIENT_ID/SECRET/WEBHOOK_SECRET, redirect
// URI) via payments/config. When unset, callers get PaymentsNotConfiguredError and the
// route returns a clean 503 — the adapter NEVER crashes on missing keys. The actual
// MercadoPago HTTP calls are isolated behind small, individually-mockable functions so
// the real API integration (Tats's account/keys) drops in without touching the layer.

import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  mercadopagoConfig,
  commissionCents,
  PaymentsNotConfiguredError,
  ProviderPaymentAccountError,
} from './config';

export const RAIL = 'mercadopago';

// ── OAuth connect (provider onboarding) ──────────────────────────────────────
// Build the URL a provider is sent to in order to authorize the platform marketplace
// app on their MercadoPago account. `state` is an opaque value we generate + verify on
// callback (CSRF + provider binding). Returns null-config → caller surfaces 503.
export function buildOAuthUrl({ state }) {
  const cfg = mercadopagoConfig();
  if (!cfg) throw new PaymentsNotConfiguredError(RAIL);
  if (!cfg.redirectUri) {
    // Redirect URI is required specifically for the OAuth flow.
    throw new PaymentsNotConfiguredError(RAIL);
  }
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    response_type: 'code',
    platform_id: 'mp',
    redirect_uri: cfg.redirectUri,
    state,
  });
  return `https://auth.mercadopago.com/authorization?${params.toString()}`;
}

// Exchange the OAuth `code` for the provider's access/refresh token. Isolated so tests
// mock it; the real call POSTs to https://api.mercadopago.com/oauth/token.
export async function exchangeOAuthCode(code) {
  const cfg = mercadopagoConfig();
  if (!cfg) throw new PaymentsNotConfiguredError(RAIL);
  const res = await fetch('https://api.mercadopago.com/oauth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      code,
      redirect_uri: cfg.redirectUri,
    }),
  });
  if (!res.ok) {
    throw new Error(`MercadoPago OAuth exchange failed (${res.status})`);
  }
  const data = await res.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    accountRef: data.user_id != null ? String(data.user_id) : null,
    meta: { scope: data.scope ?? null, expires_in: data.expires_in ?? null },
  };
}

// ── Checkout ─────────────────────────────────────────────────────────────────
// Create a split-payment Checkout preference on the provider's connected account.
// `account` is the provider_payment_accounts row (carries the provider's access_token).
// Returns { externalId, checkoutUrl, commissionCents } — the layer persists these.
export async function createCheckout({ order, account, idempotencyKey }) {
  const cfg = mercadopagoConfig();
  if (!cfg) throw new PaymentsNotConfiguredError(RAIL);
  if (!account?.access_token) {
    // DISTINCT from platform-keys-missing: the provider has not completed OAuth connect
    // (no account row / null token). Surfaced as a clear "hasn't connected" 409, not the
    // ambiguous "rail is missing env keys" 503.
    throw new ProviderPaymentAccountError(RAIL, 'not_connected');
  }
  const fee = commissionCents(order.amount_cents);
  const preference = {
    items: [
      {
        title: `PawPi ${order.kind} #${order.id}`,
        quantity: 1,
        unit_price: order.amount_cents / 100,
        currency_id: order.currency,
      },
    ],
    marketplace_fee: fee / 100,
    external_reference: String(order.id),
  };
  // Wire the IPN/webhook per-preference so MercadoPago POSTs the payment status back to
  // OUR endpoint — the ONLY signal that flips an order to 'paid' (there is no return
  // deep-link). Without this, reconciliation depends solely on a webhook URL registered
  // by hand in the MP dashboard; a real payment can succeed while the order stays
  // 'pending' forever. Only set when a PUBLIC https base URL is configured (prod): a
  // localhost/unset URL is omitted so preference creation never fails on a bad
  // notification_url (tests/local keep today's behaviour).
  const notificationUrl = webhookUrl();
  if (notificationUrl) preference.notification_url = notificationUrl;

  const res = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${account.access_token}`,
      'X-Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(preference),
  });
  if (!res.ok) {
    throw new Error(`MercadoPago checkout failed (${res.status})`);
  }
  const data = await res.json();
  return {
    externalId: data.id != null ? String(data.id) : null,
    checkoutUrl: data.init_point ?? data.sandbox_init_point ?? null,
    commissionCents: fee,
  };
}

// ── Webhook ──────────────────────────────────────────────────────────────────
// Verify the webhook signature. MercadoPago sends `x-signature: ts=<t>,v1=<hmac>` and
// `x-request-id`; the signed manifest is `id:<data.id>;request-id:<rid>;ts:<t>;` HMAC'd
// with the app's webhook secret. We recompute and timing-safe compare.
export function verifyWebhook({ headers, dataId }) {
  const cfg = mercadopagoConfig();
  if (!cfg) throw new PaymentsNotConfiguredError(RAIL);
  const sigHeader = headers['x-signature'] || headers['X-Signature'];
  const requestId = headers['x-request-id'] || headers['X-Request-Id'];
  if (!sigHeader) return false;
  const parts = Object.fromEntries(
    String(sigHeader)
      .split(',')
      .map((kv) => kv.split('=').map((s) => s.trim())),
  );
  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1) return false;
  const manifest = `id:${dataId};request-id:${requestId ?? ''};ts:${ts};`;
  const expected = createHmac('sha256', cfg.webhookSecret)
    .update(manifest)
    .digest('hex');
  return safeEqualHex(expected, v1);
}

// Map MercadoPago's payment status to our ledger status. Pure — no keys needed.
export function mapStatus(rawStatus) {
  switch (rawStatus) {
    case 'approved':
      return 'approved';
    case 'refunded':
    case 'charged_back':
      return 'refunded';
    case 'rejected':
    case 'cancelled':
      return 'failed';
    default:
      return 'pending';
  }
}

// Fetch the authoritative payment status from MercadoPago (reconciliation after a
// webhook tells us only an id). Isolated for mocking.
export async function getPaymentStatus({ externalId, account }) {
  const cfg = mercadopagoConfig();
  if (!cfg) throw new PaymentsNotConfiguredError(RAIL);
  const token = account?.access_token ?? cfg.clientSecret;
  const res = await fetch(
    `https://api.mercadopago.com/v1/payments/${externalId}`,
    { headers: { authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`MercadoPago status fetch failed (${res.status})`);
  const data = await res.json();
  return { rawStatus: data.status, status: mapStatus(data.status) };
}

// ── Refund ───────────────────────────────────────────────────────────────────
export async function refund({ payment, account }) {
  const cfg = mercadopagoConfig();
  if (!cfg) throw new PaymentsNotConfiguredError(RAIL);
  if (!account?.access_token) throw new PaymentsNotConfiguredError(RAIL);
  const res = await fetch(
    `https://api.mercadopago.com/v1/payments/${payment.external_id}/refunds`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${account.access_token}`,
      },
      body: JSON.stringify({}),
    },
  );
  if (!res.ok) throw new Error(`MercadoPago refund failed (${res.status})`);
  return { status: 'refunded' };
}

// ── Payout ───────────────────────────────────────────────────────────────────
// With split payments the provider's share settles automatically to their MP account,
// so an explicit payout is a no-op confirmation for this rail (documented). We still
// return a status so the layer records a payouts row uniformly across rails.
export async function payout() {
  const cfg = mercadopagoConfig();
  if (!cfg) throw new PaymentsNotConfiguredError(RAIL);
  return { status: 'paid', externalId: null };
}

// Resolve the public MercadoPago webhook URL from APP_BASE_URL. Returns null unless a
// PUBLIC https base is configured — MercadoPago rejects a non-public notification_url, so
// we omit it rather than risk failing preference creation in tests/local.
export function webhookUrl() {
  const base = process.env.APP_BASE_URL;
  if (!base || !/^https:\/\//i.test(base)) return null;
  return `${base.replace(/\/+$/, '')}/api/payments/webhooks/mercadopago`;
}

// timing-safe hex comparison that never throws on length mismatch.
function safeEqualHex(a, b) {
  const ab = Buffer.from(String(a), 'hex');
  const bb = Buffer.from(String(b), 'hex');
  if (ab.length !== bb.length || ab.length === 0) return false;
  return timingSafeEqual(ab, bb);
}
