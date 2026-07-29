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
