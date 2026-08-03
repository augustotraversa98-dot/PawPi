# PawPi — PROMPT 7: Services Hub — build Phase 3 (map + list⇄map + web split)

Paste into the same `feat/services-hub` Claude Code conversation.

---

```
P2 merged — start P3. Rebase feat/services-hub on latest main first. Additive, no merge,
no deploy. iOS + web this phase; Android map degrades to list-only (deferred). No
pet-friendly places (deferred), no storefront changes (P4).

PHASE 3 — Map + list⇄map + web split for the unified discovery screen
Add a map to the discover.jsx experience, using the coordinates P1 now returns.

- Reuse `components/Map/MapLocationView.jsx` (already renders multiple markers + auto-fits;
  see app/service/places.jsx for the working list+map reference). Add an ADDITIVE
  `onMarkerPress(index|provider)` prop — existing callers (places/events/transport) must
  be unaffected when the prop is absent.
- MOBILE layout: full-screen map with a draggable BOTTOM-SHEET list over it (use
  @gorhom/bottom-sheet — already a dependency), filter chips pinned on top, and a
  list⇄map TOGGLE. Tapping a map pin highlights/opens that provider's card in the sheet;
  selecting a card highlights its pin (two-way pin↔card).
- WEB layout: true side-by-side split (list left, map right) on wide screens; fall back to
  the mobile toggle pattern on narrow widths.
- Providers WITHOUT coordinates: keep them in the LIST, just omit them from the map (don't
  drop them from results). If some results have no pin, note it subtly (e.g. "N shown on
  map") — no fake coordinates ever.
- iOS map = Apple Maps via react-native-maps PROVIDER_DEFAULT (free, no key), mirroring
  places.jsx. 
- ANDROID: no Google Maps key is configured, so the map must DEGRADE GRACEFULLY — default
  to the list, and either hide the map toggle on Android or show a clean "Map coming soon"
  placeholder. It must NOT crash or render a blank/gray map. Do NOT add an Android key.
- All filters/search/sort from P2 keep working in both list and map modes.

RULES
- Do NOT ask questions — pick the best implementation; note decisions in your report.
- ALL new user-facing strings go through the existing i18n system: t("namespace.key") +
  keys in src/i18n/locales/en.json AND es.json, neutral LatAm Spanish "tú". No hardcoded
  English.
- No fake/mock data; keep the P2 empty/error/denied states working in both modes.

VERIFY
- Mobile: `npm test`. Add/adjust tests for: list⇄map toggle, marker press → card
  highlight/open, card select → pin highlight, providers-without-coords stay in list but
  off map, Android degradation (map hidden/placeholder, no crash), and that P2 filters
  still apply in map mode. Confirm MapLocationView's existing callers (places/events/
  transport) still pass with the new optional prop.
- Confirm new keys exist in both en.json and es.json.

STOP after P3: commit on feat/services-hub, report what changed, new i18n keys, test
results, and confirm iOS map + web split work and Android degrades cleanly. Do NOT merge
or deploy — I'll review. Then wait for my go-ahead on P4 (unified storefront: profile+shop
converge, per-type primary action, product detail, cart/checkout).
```
