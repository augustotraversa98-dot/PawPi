// payments/binance — the Binance Pay adapter (ticket 2.3). Crypto rail.
//
// Model: merchant order → QR/deeplink the owner pays in USDT; a signed webhook confirms;
// settlement is USDT to the platform merchant, with provider payouts via the Payout API.
// Webhooks are signature-verified (Binance's HMAC over timestamp+nonce+body) before we
// trust them.
//
// KEY-STUBBED: reads BINANCE_PAY_API_KEY/SECRET via payments/config. Unset → callers get
// PaymentsNotConfiguredError → route returns 503; the adapter NEVER crashes on missing
// keys. The HTTP calls are isolated behind mockable functions.

import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { binanceConfig, PaymentsNotConfiguredError } from './config';

export const RAIL = 'binance';

const BASE = 'https://bpay.binanceapi.com';

// Sign a Binance Pay request body. Binance signs `${timestamp}\n${nonce}\n${body}\n`
// with HMAC-SHA512 (uppercased hex). Returned headers go on the outbound request.
function signRequest(cfg, body) {
  const timestamp = String(Date.now());
  const nonce = randomUUID().replace(/-/g, '').slice(0, 32);
  const payload = `${timestamp}\n${nonce}\n${body}\n`;
  const signature = createHmac('sha512', cfg.apiSecret)
    .update(payload)
    .digest('hex')
    .toUpperCase();
  return {
    'content-type': 'application/json',
    'BinancePay-Timestamp': timestamp,
    'BinancePay-Nonce': nonce,
    'BinancePay-Certificate-SN': cfg.apiKey,
    'BinancePay-Signature': signature,
  };
}

// ── Checkout ─────────────────────────────────────────────────────────────────
// Create a Binance Pay merchant order → returns a QR/deeplink the owner scans/taps.
export async function createCheckout({ order, idempotencyKey }) {
  const cfg = binanceConfig();
  if (!cfg) throw new PaymentsNotConfiguredError(RAIL);
  const body = JSON.stringify({
    merchantTradeNo: idempotencyKey || `pawpi-${order.id}`,
    orderAmount: (order.amount_cents / 100).toFixed(2),
    currency: 'USDT',
    description: `PawPi ${order.kind} #${order.id}`,
    goods: { goodsType: '02', goodsName: `PawPi ${order.kind}` },
  });
  const res = await fetch(`${BASE}/binancepay/openapi/v3/order`, {
    method: 'POST',
    headers: signRequest(cfg, body),
    body,
  });
  if (!res.ok) throw new Error(`Binance Pay checkout failed (${res.status})`);
  const data = await res.json();
  const d = data.data ?? {};
  return {
    externalId: d.prepayId != null ? String(d.prepayId) : null,
    checkoutUrl: d.checkoutUrl ?? d.universalUrl ?? null,
    deeplink: d.deeplink ?? null,
    qrContent: d.qrContent ?? null,
    // Binance commission is handled at settlement/payout, not as a per-checkout fee.
    commissionCents: 0,
  };
}

// ── Webhook ──────────────────────────────────────────────────────────────────
// Verify the webhook signature: HMAC-SHA512 over `${timestamp}\n${nonce}\n${body}\n`,
// compared (uppercased hex) to the BinancePay-Signature header. Timing-safe.
export function verifyWebhook({ headers, rawBody }) {
  const cfg = binanceConfig();
  if (!cfg) throw new PaymentsNotConfiguredError(RAIL);
  const ts = headers['binancepay-timestamp'] || headers['BinancePay-Timestamp'];
  const nonce = headers['binancepay-nonce'] || headers['BinancePay-Nonce'];
  const sig = headers['binancepay-signature'] || headers['BinancePay-Signature'];
  if (!ts || !nonce || !sig) return false;
  const payload = `${ts}\n${nonce}\n${rawBody}\n`;
  const expected = createHmac('sha512', cfg.apiSecret)
    .update(payload)
    .digest('hex')
    .toUpperCase();
  return safeEqualHex(expected, String(sig).toUpperCase());
}

// Map Binance Pay's bizStatus to our ledger status. Pure.
export function mapStatus(bizStatus) {
  switch (bizStatus) {
    case 'PAY_SUCCESS':
      return 'approved';
    case 'PAY_CLOSED':
    case 'PAY_EXPIRED':
      return 'failed';
    case 'REFUNDED':
      return 'refunded';
    default:
      return 'pending';
  }
}

// ── Refund ───────────────────────────────────────────────────────────────────
export async function refund({ payment }) {
  const cfg = binanceConfig();
  if (!cfg) throw new PaymentsNotConfiguredError(RAIL);
  const body = JSON.stringify({
    refundRequestId: `refund-${payment.id}-${Date.now()}`,
    prepayId: payment.external_id,
    refundAmount: (payment.amount_cents / 100).toFixed(2),
  });
  const res = await fetch(`${BASE}/binancepay/openapi/order/refund`, {
    method: 'POST',
    headers: signRequest(cfg, body),
    body,
  });
  if (!res.ok) throw new Error(`Binance Pay refund failed (${res.status})`);
  return { status: 'refunded' };
}

// ── Payout ───────────────────────────────────────────────────────────────────
// Settle a provider's USDT share via the Binance Pay Payout API.
export async function payout({ provider, account, amountCents }) {
  const cfg = binanceConfig();
  if (!cfg) throw new PaymentsNotConfiguredError(RAIL);
  const body = JSON.stringify({
    requestId: `payout-${provider.id}-${Date.now()}`,
    batchName: `pawpi-payout-${provider.id}`,
    currency: 'USDT',
    totalAmount: (amountCents / 100).toFixed(2),
    transferDetailList: [
      {
        merchantSendId: `pawpi-${provider.id}-${Date.now()}`,
        receiveType: 'BINANCE_ID',
        receiver: account?.account_ref ?? '',
        transferAmount: (amountCents / 100).toFixed(2),
      },
    ],
  });
  const res = await fetch(`${BASE}/binancepay/openapi/payout/transfer`, {
    method: 'POST',
    headers: signRequest(cfg, body),
    body,
  });
  if (!res.ok) throw new Error(`Binance Pay payout failed (${res.status})`);
  const data = await res.json();
  return { status: 'paid', externalId: data?.data?.requestId ?? null };
}

function safeEqualHex(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length || ab.length === 0) return false;
  return timingSafeEqual(ab, bb);
}
