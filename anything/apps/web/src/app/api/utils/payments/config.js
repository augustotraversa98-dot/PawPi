// payments/config — env-key reading for the payment rails (ticket 2.3).
//
// CRITICAL (DO-NOT from the ticket): adapters read keys from env. If the keys for a rail
// are unset, the route must return a clear "payments not configured" error and NEVER
// crash. This module centralizes that check so every adapter + route reasons about
// configuration the same way. NO real keys are ever committed — see the commented .env
// block in anything/apps/web/.env.example.

// A small typed error the routes convert to a clean 503 ("Service Unavailable" — the
// rail is not configured yet, which is a server-config state, not a client error).
export class PaymentsNotConfiguredError extends Error {
  constructor(rail) {
    super(
      rail
        ? `Payments not configured: the '${rail}' rail is missing required env keys`
        : 'Payments not configured',
    );
    this.name = 'PaymentsNotConfiguredError';
    this.status = 503;
    this.rail = rail ?? null;
  }
}

// Platform commission in basis points (1% = 100 bps). Defaults to 0 when unset so a
// missing value never crashes — it just means no commission is taken until configured.
export function platformCommissionBps() {
  const raw = process.env.PLATFORM_COMMISSION_BPS;
  const n = raw == null ? 0 : Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

// commission for an amount, in cents, from the configured bps. Floor so the platform
// never over-charges by a rounding cent.
export function commissionCents(amountCents) {
  return Math.floor((amountCents * platformCommissionBps()) / 10000);
}

// Per-rail config readers. Each returns the resolved config object when fully set, or
// null when any required key is missing (the "not configured" signal). Routes/adapters
// call isRailConfigured(rail) (or read the config and branch on null) and surface
// PaymentsNotConfiguredError rather than throwing a raw env error.

export function mercadopagoConfig() {
  const {
    MP_CLIENT_ID,
    MP_CLIENT_SECRET,
    MP_WEBHOOK_SECRET,
    MP_REDIRECT_URI,
  } = process.env;
  if (!MP_CLIENT_ID || !MP_CLIENT_SECRET || !MP_WEBHOOK_SECRET) {
    return null;
  }
  return {
    clientId: MP_CLIENT_ID,
    clientSecret: MP_CLIENT_SECRET,
    webhookSecret: MP_WEBHOOK_SECRET,
    // Redirect/webhook URLs are optional at config-time (OAuth connect needs the redirect;
    // checkout needs none) — included when present.
    redirectUri: MP_REDIRECT_URI ?? null,
  };
}

export function binanceConfig() {
  const { BINANCE_PAY_API_KEY, BINANCE_PAY_API_SECRET } = process.env;
  if (!BINANCE_PAY_API_KEY || !BINANCE_PAY_API_SECRET) {
    return null;
  }
  return {
    apiKey: BINANCE_PAY_API_KEY,
    apiSecret: BINANCE_PAY_API_SECRET,
  };
}

// Resolve a rail's config or null. Single switch so callers don't hardcode a rail.
export function railConfig(rail) {
  switch (rail) {
    case 'mercadopago':
      return mercadopagoConfig();
    case 'binance':
      return binanceConfig();
    default:
      return null;
  }
}

export function isRailConfigured(rail) {
  return railConfig(rail) != null;
}

// The set of rails this layer knows about (do NOT hardcode a single rail anywhere else).
export const SUPPORTED_RAILS = ['mercadopago', 'binance'];
