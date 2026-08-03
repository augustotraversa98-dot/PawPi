# PawPi — PROMPT 6: Services Hub — build Phase 2 (unified discovery LIST)

Paste into the same `feat/services-hub` Claude Code conversation.

---

```
P1 looks great — start P2. Keep working on feat/services-hub (rebase on latest main if
P1 was merged). Additive, no merge, no deploy. No map yet (that's P3) and no pet-friendly
places yet (deferred). Providers only.

PHASE 2 — One unified discovery LIST (filters + search + states)
Build a single discovery screen that replaces the 11-card silo model with ONE merged
result stream of providers across capabilities (vet, grooming, telehealth, shops).

- New screen `app/service/discover.jsx` that calls the P1 `useDiscoverProviders({...})`
  and renders ONE merged, deduped list (one row per provider, showing its capabilities[]
  as chips — a provider that does vet+grooming appears once).
- SEARCH: reuse `components/Providers/ProviderListControls.jsx` from the audit for the
  search box + sort; extend as needed. Search by name/type/bio (type-ahead, client-side
  over the fetched list as the audit did).
- FILTERS:
    * Category chips: Veterinary (vet/grooming/telehealth), Shops (+ leave room to add
      "Pet-friendly places" later — just don't wire it yet).
    * Sort: Suggested / Top rated / Most reviewed / Nearest.
    * Distance + "Nearest": request device location (mirror app/service/places.jsx's
      permission pattern) and pass lat/lng to the hook; if permission is denied, disable
      distance/Nearest gracefully and keep the rest working.
    * Open-now: derive client-side from the hours_json P1 now returns (best-effort; if a
      provider's hours are missing/unparseable, don't hide it).
- SCREEN STATES (all required): loading; location-permission-denied (list still works,
  distance off); empty (no providers at all); no-results (filters/search matched nothing —
  distinct copy + a clear-filters action); error (fetch failed → error + Retry). No fake
  data; real empty states only.
- Card tap → the EXISTING `app/service/provider.jsx` profile (unchanged this phase).
- ENTRY POINT: make the Services tab (`app/(tabs)/services.jsx`) open this unified screen
  as the primary path — the Veterinary-related tiles (vet/grooming/telehealth) and the
  Shops tile should open `discover.jsx` with that category pre-applied. LEAVE the old
  per-capability screens (vet/grooming/telehealth.jsx) in place for now; they're retired
  in P6 after parity. Don't delete anything yet.

RULES
- Do NOT ask questions — pick the best implementation; note decisions in your report.
- ALL new user-facing strings go through the existing i18n system: t("namespace.key") +
  add keys to src/i18n/locales/en.json AND es.json, neutral LatAm Spanish "tú". No
  hardcoded English.
- Keep it mobile-list-only this phase (web split + map are P3).

VERIFY
- Mobile: `npm test`. Add tests for discover.jsx: merged/deduped list with capability
  chips, search, each category filter, each sort (incl. Nearest with mocked location),
  and all five screen states (loading / denied / empty / no-results / error + Retry).
- Confirm existing screens/tests still pass (nothing deleted).
- Sanity-check the new keys exist in both en.json and es.json.

STOP after P2: commit on feat/services-hub, report what changed, the new i18n keys added,
test results, and confirm existing flows are intact. Do NOT merge or deploy — I'll review.
Then wait for my go-ahead on P3 (iOS map + marker tap + list⇄map/bottom-sheet + web split).
```
