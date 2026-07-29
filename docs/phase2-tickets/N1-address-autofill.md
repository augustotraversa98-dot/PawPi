# N1 — Address autofill on the shared location picker

**Status:** ready · no migration · independent · safe-parallel: yes (touches the Map/ component + i18n only)

## Context
The shared Apple-Maps component from ticket 2.68 (`MapLocationPicker` / `MapLocationView` /
`LocationField`, mobile `src/components/Map/`) lets a user drop or drag a pin, and every location-capturing
surface in the app (walks, transport, places, events, provider onboarding, emergency card, etc.) already
reuses it. It shows a map — it does not yet turn a pin into a readable address, or a typed address into a
pin. Apple Maps itself needs no paid key (`PROVIDER_DEFAULT`); on-device geocoding via `expo-location`
(`reverseGeocodeAsync` / `geocodeAsync`) is also free and requires no new key or account — this is
buildable end to end tonight.

## Current issue
Every screen using `LocationField`/`MapLocationPicker` requires the user to either type a full address
manually or drop a pin with no address confirmation shown back to them — no autofill either direction.

## Expected behavior
1. When a pin is dropped or dragged on `MapLocationPicker`, reverse-geocode the coordinates
   (`Location.reverseGeocodeAsync`) and autofill/display a human-readable address (street, city) near the
   pin — debounced so it doesn't fire on every drag frame, only on drop/settle.
2. Add an optional address text input to `LocationField` that, on submit/blur, forward-geocodes
   (`Location.geocodeAsync`) the typed text to coordinates and moves the pin there — with a clear
   "couldn't find that address" fallback state (never crash, never silently no-op).
3. Both directions must degrade cleanly when location permission is denied or geocoding returns nothing —
   the manual lat/lng / manual pin-drop path (already existing) must keep working exactly as before.
4. Reuse this in-place in the shared component so every consumer (2.51 emergency card, 2.52 transport,
   2.73 places, 2.74 events, 2.81 provider onboarding, 2.68's own walk picker) gets it automatically —
   do not fork per-consumer copies.
5. Add the new address-picker strings to i18n (EN + ES), matching the existing `map.*` key pattern from 2.68.

## Data / API rules
No backend/API change, no migration — this is a pure on-device mobile enhancement to an existing shared
component. No new env keys.

## Acceptance criteria
- `npm test` (mobile jest) green, including new unit tests for the geocode/reverse-geocode wrapper
  functions (mock `expo-location`, don't hit real network in CI).
- Manually confirm in the iOS Simulator (per the updated `docs/dev-pipeline.md` self-verify loop) that
  dropping a pin on at least one real consumer screen (e.g. Places or Emergency Card) shows an address,
  and typing an address moves the pin.
- No change to any screen that doesn't use the shared Map component.
- Update `docs/roadmap.md` + the `PawPi_instructions.md` status block on merge.
