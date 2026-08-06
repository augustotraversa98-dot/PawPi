import * as Location from "expo-location";
import { isValidCoord } from "@/utils/walkBuddies";

/**
 * Geocoding wrappers for the shared Map component (ticket N1 — address autofill).
 *
 * Thin, defensive wrappers over expo-location's geocode / reverse-geocode calls:
 * they never throw and never return anything other than a plain value or null, so
 * every caller can treat "denied permission" / "offline" / "no match" the same way
 * — as null — instead of needing its own try/catch. That keeps the map's existing
 * manual lat/lng path untouched: geocoding only ever adds a nicety on top, it never
 * blocks or crashes the pin-drop / manual-entry flow.
 */

/**
 * Build a short "street, city" string from one expo-location reverse-geocode
 * result. Returns null when there isn't enough on the result to say anything
 * useful (rather than a string of just commas/undefined).
 */
export function formatReverseGeocodeResult(result) {
  if (!result) return null;
  const street = [result.streetNumber, result.street || result.name]
    .filter(Boolean)
    .join(" ")
    .trim();
  const city = result.city || result.subregion || result.region || null;
  const parts = [street, city].filter(Boolean);
  if (!parts.length) return null;
  return parts.join(", ");
}

/**
 * Reverse-geocode coordinates to a short "street, city" address string.
 * Resolves to null (never throws) for invalid coords, a denied permission,
 * no network, or no match — callers treat null as "couldn't resolve an
 * address" and keep showing the raw coordinates instead.
 */
export async function reverseGeocode(lat, lng) {
  if (!isValidCoord(lat, lng)) return null;
  try {
    const results = await Location.reverseGeocodeAsync({
      latitude: lat,
      longitude: lng,
    });
    return formatReverseGeocodeResult(results?.[0]);
  } catch (err) {
    console.warn("[geocoding] reverseGeocode failed", err?.message);
    return null;
  }
}

/**
 * Forward-geocode a free-text LOCATION (city / neighborhood) to { lat, lng, label } via the FREE
 * OSM Nominatim API — used by the Services Discover area filter ("search a location"). Nominatim
 * asks for a descriptive User-Agent and ≤1 request/second; this is only ever called on an explicit
 * user submit (naturally well under 1/s), so no client-side throttle is needed. Takes the TOP
 * result's coordinates and a short label (the first part of display_name, e.g. "Pilar"). Resolves to
 * null (never throws) for blank input, no match, a non-OK response, or a network error, so the caller
 * can show a "location not found" message and NEVER fabricates coordinates.
 */
const NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search";

export async function geocodeLocation(text) {
  const query = (text || "").trim();
  if (!query) return null;
  try {
    const url = `${NOMINATIM_SEARCH_URL}?format=json&limit=1&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: {
        // Descriptive User-Agent per the Nominatim usage policy.
        "User-Agent": "PawPi/1.0 (pet services discovery; https://pawpi.info)",
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const top = Array.isArray(data) ? data[0] : null;
    if (!top) return null;
    const lat = Number(top.lat);
    const lng = Number(top.lon);
    if (!isValidCoord(lat, lng)) return null;
    const label = String(top.display_name || query).split(",")[0].trim() || query;
    return { lat, lng, label };
  } catch (err) {
    console.warn("[geocoding] geocodeLocation failed", err?.message);
    return null;
  }
}

/**
 * Forward-geocode a typed address to { lat, lng }. Resolves to null (never
 * throws) for blank input, no match, or a geocoding error — callers show a
 * "couldn't find that address" fallback rather than crashing or silently
 * no-opping.
 */
export async function forwardGeocode(text) {
  const query = (text || "").trim();
  if (!query) return null;
  try {
    const results = await Location.geocodeAsync(query);
    const first = results?.[0];
    if (!first || !isValidCoord(first.latitude, first.longitude)) {
      return null;
    }
    return { lat: first.latitude, lng: first.longitude };
  } catch (err) {
    console.warn("[geocoding] forwardGeocode failed", err?.message);
    return null;
  }
}
