import { handleConfig } from "@/lib/telemetry/ingest";

// GET /api/telemetry/config — PUBLIC, NO AUTH. The app's remote kill switch + sample rate:
// { enabled, sampleRate }. enabled = TELEMETRY_INGEST_ENABLED !== 'false'; sampleRate = TELEMETRY_SAMPLE_RATE
// clamped to 0..1 (default 1). Cached 5 min. No DB (allowlisted in rls-rollout-completeness.test.js).
export async function GET() {
  return handleConfig();
}
