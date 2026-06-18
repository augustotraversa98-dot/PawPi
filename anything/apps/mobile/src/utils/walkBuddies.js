// Pure helpers for "walks with buddies" (ticket 2.43). No React / native imports so they
// unit-test cleanly. The map UI and the discovery API consume these.

// PUBLIC walks map onto the existing 'nearby_pets' visibility (area-discoverable); PRIVATE
// onto 'private' (invite-only). Keeps the create UI's public/private toggle decoupled from
// the stored value (which reuses social_walks' existing visibility CHECK — no migration widen).
export const VISIBILITY = {
  PUBLIC: "nearby_pets",
  PRIVATE: "private",
};

export function visibilityForToggle(isPublic) {
  return isPublic ? VISIBILITY.PUBLIC : VISIBILITY.PRIVATE;
}

export function isPublicVisibility(visibility) {
  return visibility === VISIBILITY.PUBLIC;
}

// A latitude/longitude is valid when both are finite and within range.
export function isValidCoord(lat, lng) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

// Simple bounding box around a center point (no PostGIS): returns the lat/lng range the
// discovery query filters on. 1° latitude ≈ 111 km; longitude shrinks by cos(lat).
export function boundingBox(lat, lng, radiusKm = 25) {
  const latDelta = radiusKm / 111;
  const lngDelta =
    radiusKm / (111 * Math.max(0.01, Math.cos((lat * Math.PI) / 180)));
  return {
    latMin: lat - latDelta,
    latMax: lat + latDelta,
    lngMin: lng - lngDelta,
    lngMax: lng + lngDelta,
  };
}

// Is a walk's pin inside the box? Used to label "near you" client-side too.
export function isWithinBox(walk, box) {
  if (!box || walk?.lat == null || walk?.lng == null) return false;
  const lat = Number(walk.lat);
  const lng = Number(walk.lng);
  return (
    lat >= box.latMin &&
    lat <= box.latMax &&
    lng >= box.lngMin &&
    lng <= box.lngMax
  );
}

// Build the discovery query string from an optional device location.
export function discoverQuery({ location, radiusKm = 25 } = {}) {
  const params = new URLSearchParams({ visibility: VISIBILITY.PUBLIC });
  if (location && isValidCoord(location.lat, location.lng)) {
    params.set("lat", String(location.lat));
    params.set("lng", String(location.lng));
    params.set("radiusKm", String(radiusKm));
  }
  return params.toString();
}
