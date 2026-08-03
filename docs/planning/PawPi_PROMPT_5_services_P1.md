# PawPi — PROMPT 5: Services Hub — build Phase 1 (discover API coords) + plan tweaks

Paste into the same `feat/services-hub` Claude Code conversation (it has the plan context).

---

```
Plan approved — start building Phase 1. Accept all your open-question defaults EXCEPT the
two below. Keep working on feat/services-hub (off latest main), additive only, no merge,
no deploy.

TWO CHANGES TO THE PLAN (update SERVICES_HUB_PLAN.md to reflect these):
1. Pet-friendly places — do NOT use the Google Places API. We're not taking a paid Google
   data dependency. Treat pet-friendly places as a later, SELF-SOURCED dataset (seeded by
   area / scraping / manual entry into our own table) — approach TBD, decided later. For
   now: remove Google Places API from the plan and its billing notes, keep places OUT of
   the P1–P4 critical path, and revise open-question #2 accordingly (places become our own
   data, not federated Google). Apple Maps for iOS map tiles is still fine (that's not
   Places). Do not build the places source now — just fix the plan.
2. Delivery vs pickup — leave OPEN. Don't lock pickup-only yet; I'll decide delivery scope
   when we reach P4. Note it as an open decision in the plan.

PHASE 1 — Discover API returns coordinates + capabilities + query params (additive)
- Add to BOTH `/api/providers/discover` queries: lat, lng, location_name, and hours_json
  via LEFT JOIN LATERAL on the provider's primary provider_locations row (lowest id until
  an additive `is_primary` exists), plus the provider's capabilities[].
- Accept and apply optional query params: ?lat=&lng=&radius= (distance filter/sort,
  mirror the adoption listings contract), ?capability=, ?q= (name search), ?openNow=
  (client can also derive from hours_json — server support optional this phase).
- ADDITIVE ONLY: project existing columns / add nullable params. No dropped columns, no
  destructive migration. If you add `is_primary`, make it a separate additive migration.
- Pass the new fields through `hooks/useProviders.js` (useDiscoverProviders) so later
  phases can consume them; don't change any screen UI yet.

RULES
- Do NOT ask questions — pick the best implementation, note decisions in your report.
- Any new user-facing strings go through the existing i18n system (t() + en.json/es.json,
  neutral LatAm Spanish "tú"). P1 is API-only so there likely are none.
- No fake/mock data.

VERIFY
- Web: `bun run test` + `bun run typecheck` + `bun run build`; report NEW errors vs the
  pre-existing baseline (stash-compare if unsure). Add/adjust tests for the new projection
  and each new query param (incl. the integration db test).
- Confirm the discover response now includes coords + capabilities for a provider that has
  a location, and that existing callers still work unchanged.

STOP after P1: commit on feat/services-hub, report what changed + the migration (if any) +
new-vs-baseline test/typecheck results, and confirm P1 is independently mergeable. Do NOT
merge or deploy — I'll review and merge. Then wait for my go-ahead on P2.
```
