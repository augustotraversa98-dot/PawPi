// enrichment/config — env-key reading for AI-assisted business enrichment (Phase 2 ticket
// 2.21). Mirrors payments/video: the enrichment sources are DORMANT behind env keys. When no
// key is configured the /enrich route returns a clean 503 ("enrichment not configured") and
// NOTHING crashes. NO real keys are ever committed (see anything/apps/web/.env.example).

// 503-shaped error the route maps to a clean 503 — a server-config state, not a client error.
export class EnrichmentNotConfiguredError extends Error {
  constructor() {
    super("Enrichment isn't set up yet");
    this.name = "EnrichmentNotConfiguredError";
    this.status = 503;
  }
}

// The Google Places key (hours/address/phone/photos). Null when unset → that source is skipped.
export function placesConfig() {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  return key ? { apiKey: key } : null;
}

// The LLM key used to STRUCTURE messy website text. Null when unset → the website source still
// returns plain-parsed text, just without LLM structuring.
export function llmConfig() {
  const key = process.env.ENRICHMENT_LLM_KEY;
  return key ? { apiKey: key } : null;
}

// Enrichment is "configured" if AT LEAST ONE source key is present. With none, /enrich 503s
// (we don't server-fetch arbitrary URLs with nothing to enrich).
export function isEnrichmentConfigured() {
  return placesConfig() != null || llmConfig() != null;
}
