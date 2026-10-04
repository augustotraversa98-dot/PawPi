import { handleIngest } from "@/lib/telemetry/ingest";

// POST /api/telemetry/events — anonymous client telemetry ingest (night-run Step B). PUBLIC, NO AUTH: the app
// batches allowlisted events here (install_id/session_id are random UUIDs, never an account). Body <= 32 KB,
// <= 50 events, strict registry validation, per-install + per-IP in-memory rate limit, 204 on success, never 5xx.
// Accepted events become pawpi_client_* metrics + one Loki line each (job="pawpi-client"). Kill switch:
// TELEMETRY_INGEST_ENABLED=false. See docs/observability/OPERATIONS.md "Client telemetry ingest".
//
// DELIBERATELY not wrapped in withRequestContext (allowlisted in rls-rollout-completeness.test.js): it touches
// NO database at all, and an identity transaction on an anonymous telemetry beacon would only add load and a way
// for a DB outage to break it. All logic lives in lib/telemetry/ingest.js.
export async function POST(request) {
  return handleIngest(request);
}
