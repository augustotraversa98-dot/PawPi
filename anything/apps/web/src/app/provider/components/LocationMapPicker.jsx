import { useCallback } from "react";
import {
  APIProvider,
  Map,
  AdvancedMarker,
} from "@/client-integrations/react-google-maps";

// LocationMapPicker (ticket 2.81) — the web counterpart of the mobile shared MapLocationPicker.
// Reuses the existing @vis.gl/react-google-maps integration (NOT a new map lib): a provider drops
// or drags a pin and the chosen lat/lng flow back via onPick, kept in sync with the manual lat/lng
// inputs in the location form.
//
// DEGRADES CLEAN (mirrors the enrichment/payments "not configured" pattern): the browser Maps key
// is OPTIONAL. When NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY is unset (incl. all CI/jsdom runs) the
// picker renders nothing and the form falls back to its manual lat/lng inputs — no crash, no key
// shipped. FLAGGED for Tats in docs/test-backlog.md.

const BROWSER_MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY;

// True only when the browser Maps key is configured. The form uses this to label the manual inputs
// ("or enter coordinates") vs. lean on them entirely.
export function mapsConfigured() {
  return Boolean(BROWSER_MAPS_KEY);
}

// Round to 6 dp to match provider_locations.lat/lng numeric(9,6).
const round6 = (n) => Math.round(n * 1e6) / 1e6;

// Normalize the various event shapes the integration can emit (Map.onClick gives
// e.detail.latLng = {lat,lng} literals; AdvancedMarker drag gives a google event whose latLng has
// lat()/lng() accessors). Returns { lat, lng } | null.
function coordFromEvent(e) {
  const ll = e?.detail?.latLng ?? e?.latLng ?? null;
  if (!ll) return null;
  const lat = typeof ll.lat === "function" ? ll.lat() : ll.lat;
  const lng = typeof ll.lng === "function" ? ll.lng() : ll.lng;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat: round6(lat), lng: round6(lng) };
}

export default function LocationMapPicker({ lat, lng, onPick, height = 260 }) {
  const hasPin = Number.isFinite(lat) && Number.isFinite(lng);
  const center = hasPin ? { lat, lng } : { lat: 40.7128, lng: -74.006 };

  const handlePick = useCallback(
    (e) => {
      const c = coordFromEvent(e);
      if (c) onPick?.(c);
    },
    [onPick],
  );

  // No key → render nothing; the form keeps its manual lat/lng inputs (clean degrade).
  if (!BROWSER_MAPS_KEY) return null;

  return (
    <div
      className="overflow-hidden rounded-xl border-2 border-[#FFD9B3]"
      style={{ height }}
    >
      <APIProvider apiKey={BROWSER_MAPS_KEY}>
        <Map
          defaultZoom={hasPin ? 14 : 11}
          defaultCenter={center}
          gestureHandling="greedy"
          disableDefaultUI
          onClick={handlePick}
          style={{ width: "100%", height: "100%" }}
        >
          {hasPin && (
            <AdvancedMarker
              position={center}
              draggable
              onDragEnd={handlePick}
            />
          )}
        </Map>
      </APIProvider>
    </div>
  );
}
