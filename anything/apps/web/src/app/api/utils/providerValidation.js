// providerValidation — shared optional-field validators for the provider
// locations & services routes (ticket 4b, docs/provider-design.md §4). Each
// returns an error message string (the 400 body) or null when valid. Extracted
// verbatim from the four route files (ticket 4 dedup); no logic change.

// Validate optional geo coordinates. Returns an error message or null. Absent
// (undefined/null) coordinates are allowed; present ones must be in range.
export function invalidLocationFields(body) {
  const { lat, lng } = body;
  if (
    lat !== undefined &&
    lat !== null &&
    (typeof lat !== "number" || lat < -90 || lat > 90)
  ) {
    return "lat must be a number between -90 and 90";
  }
  if (
    lng !== undefined &&
    lng !== null &&
    (typeof lng !== "number" || lng < -180 || lng > 180)
  ) {
    return "lng must be a number between -180 and 180";
  }
  return null;
}

// Validate optional money/duration fields. Returns an error message or null.
// price_cents/deposit_cents: non-negative integers; duration_min: positive
// integer. Absent (undefined/null) values are allowed.
export function invalidServiceFields(body) {
  const { duration_min, price_cents, deposit_cents } = body;
  if (
    price_cents !== undefined &&
    price_cents !== null &&
    (!Number.isInteger(price_cents) || price_cents < 0)
  ) {
    return "price_cents must be a non-negative integer";
  }
  if (
    deposit_cents !== undefined &&
    deposit_cents !== null &&
    (!Number.isInteger(deposit_cents) || deposit_cents < 0)
  ) {
    return "deposit_cents must be a non-negative integer";
  }
  if (
    duration_min !== undefined &&
    duration_min !== null &&
    (!Number.isInteger(duration_min) || duration_min <= 0)
  ) {
    return "duration_min must be a positive integer";
  }
  return null;
}

// Max images a single service/product may carry (ticket 2.23). A sane cap so a
// runaway client can't store an unbounded array.
export const MAX_IMAGE_URLS = 8;

// Validate an optional image_urls field (ticket 2.23 — service & product images).
// Returns an error message or null. Absent (undefined/null) is allowed; when
// present it MUST be an array of non-empty string URLs, capped at MAX_IMAGE_URLS.
// Shared by the provider_services and shop_products write routes.
export function invalidImageUrls(image_urls) {
  if (image_urls === undefined || image_urls === null) return null;
  if (!Array.isArray(image_urls)) {
    return "image_urls must be an array of URLs";
  }
  if (image_urls.length > MAX_IMAGE_URLS) {
    return `image_urls allows at most ${MAX_IMAGE_URLS} images`;
  }
  if (image_urls.some((u) => typeof u !== "string" || u.trim().length === 0)) {
    return "image_urls must be non-empty URL strings";
  }
  return null;
}
