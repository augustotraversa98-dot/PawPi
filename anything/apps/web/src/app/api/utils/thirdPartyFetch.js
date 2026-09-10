// Deadline for outbound third-party calls (AUDIT_2026-09 A-18).
//
// Every API request holds one pooled Postgres connection for its whole duration
// (withRequestContext), and several routes call MercadoPago / Binance / Resend / Daily from
// inside that transaction. A third party that stops answering therefore pins a connection —
// ten of them and every other request queues. Each outbound call now carries an AbortSignal
// so it fails within a bounded time and the route's own error handling takes over.
export const THIRD_PARTY_TIMEOUT_MS = 10_000;

export function thirdPartySignal(ms = THIRD_PARTY_TIMEOUT_MS) {
  return AbortSignal.timeout(ms);
}
