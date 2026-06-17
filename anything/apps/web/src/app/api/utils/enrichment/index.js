// enrichment — the provider-agnostic, dormant-safe seam that PROPOSES a draft from a
// provider's links (Phase 2 ticket 2.21). It NEVER writes provider data — the route returns
// the draft and the provider applies it via the existing owner-identity save routes.
//
// Sources (each best-effort + behind its own env key; one failing source never fails the run):
//   - fetchWebsiteSummary(url): fetch the site HTML, strip to readable text, derive a short
//     description; if ENRICHMENT_LLM_KEY is set, structure the text into candidate services.
//   - fetchGooglePlace(mapsUrlOrQuery): Google Places Details (hours/address/phone/photos)
//     behind GOOGLE_PLACES_API_KEY.
//   - IG/FB are NOT scraped (auth-walled / ToS) — the stored links are carried through only.

import { placesConfig, llmConfig } from "./config";

// Strip HTML to readable text (drop script/style, collapse tags + whitespace). Cheap + safe.
function htmlToText(html) {
  return String(html ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Pull a <meta name/property=description> if present (best short description signal).
function metaDescription(html) {
  const m = String(html ?? "").match(
    /<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]*content=["']([^"']+)["']/i,
  );
  return m ? m[1].trim() : null;
}

/**
 * fetchWebsiteSummary(url) → { description, services } | null.
 * Returns null on no url / fetch failure (best-effort — never throws to the caller).
 * Plain parsing needs no key; the LLM structuring step is skipped when ENRICHMENT_LLM_KEY
 * is unset (graceful, mirrors the payments "not configured" pattern).
 */
export async function fetchWebsiteSummary(url, { fetchImpl = fetch } = {}) {
  if (!url || typeof url !== "string") return null;
  try {
    const res = await fetchImpl(url, { redirect: "follow" });
    if (!res?.ok) return null;
    const html = await res.text();
    const text = htmlToText(html);
    const description = (metaDescription(html) || text).slice(0, 400) || null;

    let services = [];
    if (llmConfig()) {
      // LLM structuring point (dormant placeholder): a real adapter would send `text` to the
      // LLM behind ENRICHMENT_LLM_KEY and parse {name,price,duration} candidates. Until one is
      // wired, we propose nothing here rather than invent data (no-fake-data rule).
      services = [];
    }
    return { description, services };
  } catch {
    return null; // best-effort: a failing source doesn't fail the whole enrich call
  }
}

// Extract a Places query from a Google Maps URL (a place name / "q=" param), else use the
// raw string as the query.
function placeQueryFromUrl(mapsUrlOrQuery) {
  if (!mapsUrlOrQuery) return null;
  const s = String(mapsUrlOrQuery);
  const q = s.match(/[?&]q=([^&]+)/);
  if (q) return decodeURIComponent(q[1].replace(/\+/g, " "));
  const place = s.match(/\/place\/([^/]+)/);
  if (place) return decodeURIComponent(place[1].replace(/\+/g, " "));
  return s;
}

/**
 * fetchGooglePlace(mapsUrlOrQuery) → { address, phone, hours, lat, lng, photos } | null.
 * Skips cleanly (returns null) when GOOGLE_PLACES_API_KEY is unset. Best-effort.
 */
export async function fetchGooglePlace(mapsUrlOrQuery, { fetchImpl = fetch } = {}) {
  const cfg = placesConfig();
  if (!cfg) return null;
  const query = placeQueryFromUrl(mapsUrlOrQuery);
  if (!query) return null;
  try {
    // Find Place → then Details. (Endpoints kept minimal; a real impl may cache/normalize.)
    const findUrl =
      `https://maps.googleapis.com/maps/api/place/findplacefromtext/json` +
      `?input=${encodeURIComponent(query)}&inputtype=textquery&fields=place_id&key=${cfg.apiKey}`;
    const found = await (await fetchImpl(findUrl)).json();
    const placeId = found?.candidates?.[0]?.place_id;
    if (!placeId) return null;
    const detailsUrl =
      `https://maps.googleapis.com/maps/api/place/details/json` +
      `?place_id=${placeId}&fields=formatted_address,formatted_phone_number,opening_hours,geometry,photos&key=${cfg.apiKey}`;
    const details = (await (await fetchImpl(detailsUrl)).json())?.result ?? {};
    return {
      address: details.formatted_address ?? null,
      phone: details.formatted_phone_number ?? null,
      hours: details.opening_hours?.weekday_text ?? null,
      lat: details.geometry?.location?.lat ?? null,
      lng: details.geometry?.location?.lng ?? null,
      photos: (details.photos ?? [])
        .slice(0, 5)
        .map((p) => p.photo_reference)
        .filter(Boolean),
    };
  } catch {
    return null;
  }
}

/**
 * buildEnrichmentDraft(provider, opts) → { draft, sources }.
 * Best-effort across the provider's links; merges what each source returned into ONE proposed
 * draft. Reports per-source status so the UI/tests can see what succeeded. NEVER writes.
 */
export async function buildEnrichmentDraft(provider, opts = {}) {
  const website = await fetchWebsiteSummary(provider?.website_url, opts);
  const place = await fetchGooglePlace(
    provider?.google_maps_url || provider?.name,
    opts,
  );

  const draft = {
    description: website?.description ?? null,
    services: website?.services ?? [],
    address: place?.address ?? null,
    phone: place?.phone ?? null,
    hours: place?.hours ?? null,
    lat: place?.lat ?? null,
    lng: place?.lng ?? null,
    photos: place?.photos ?? [],
    // IG/FB are carried through (links-only; never scraped).
    instagram_url: provider?.instagram_url ?? null,
    facebook_url: provider?.facebook_url ?? null,
  };

  const sources = {
    website: website ? "ok" : provider?.website_url ? "failed" : "none",
    google_place: place ? "ok" : provider?.google_maps_url ? "failed" : "none",
  };

  return { draft, sources };
}
