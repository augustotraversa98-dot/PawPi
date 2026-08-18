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

// AI-1 (night-run 2026-08-18d): the Anthropic vision key that powers pet-document ingestion
// (photo/PDF → proposed Vet Record). Null when unset → the /extract route 503s cleanly and the
// feature stays dormant (uploads still store + download; manual record-add still works). The model
// is overridable via ANTHROPIC_MODEL; the default is a current vision-capable Claude that reads
// both images AND PDFs. NOTE: we default to claude-sonnet-5 rather than the opus tier — this is a
// per-document extraction that runs on every upload, so a cost/latency-bounded vision model is the
// right call (the night-run brief explicitly asks to bound cost/latency); override for higher
// accuracy by setting ANTHROPIC_MODEL. NO real key is ever committed (see .env.example).
export function anthropicConfig() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  return { apiKey: key, model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5" };
}

// Pet-document extraction is "configured" only when the Anthropic key is present. With it unset the
// /extract route returns a clean 503 ("not set up yet") — the whole pipeline is dormant.
export function isPetExtractionConfigured() {
  return anthropicConfig() != null;
}
