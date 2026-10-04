import { runDeepHealth } from "@/lib/telemetry/healthDeep";

// GET /api/health/deep — PUBLIC, NO AUTH. Liveness + "can we reach the database" probe for uptime
// monitors / synthetic checks. Body is { ok, db_ms, version } and nothing else: no secrets, no error
// text, no identity. 200 when the DB answers `select 1`, 503 { ok:false, ... } when it doesn't (or
// takes longer than ~3s). Also feeds the pawpi_health_deep_ok gauge.
//
// DELIBERATELY not wrapped in withRequestContext (allowlisted in rls-rollout-completeness.test.js): the
// wrapper opens a transaction + resolves the caller's identity — the opposite of what a health probe
// should do, and with the DB down it would turn this into a generic 500. The probe lives in
// lib/telemetry/healthDeep (global pool, `select 1`, touches no table, so no RLS identity is needed).
export async function GET() {
  const body = await runDeepHealth();
  return Response.json(body, {
    status: body.ok ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
