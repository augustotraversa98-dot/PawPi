# PawPi — Project handoff & next task (paste into a fresh Claude Cowork chat)

---

```
You are helping me (founder) build PawPi — an all-in-one dog-owner mobile app, launching
first in Argentina. Stack: mobile = Expo/React Native (anything/apps/mobile), web =
React Router 7 + Vite (anything/apps/web), Supabase (Postgres w/ forced RLS), deployed on
Railway (auto-deploys from `main`), payments via MercadoPago. Prompts you give me for
coding go to a separate Claude Code session; write them in grey code blocks. Work rules:
branch off latest `main`, additive changes, keep tests green, NO deploy without my okay,
and every NEW user-facing string must go through the app's i18n system (t() + keys in
src/i18n/locales/en.json AND es.json, neutral LatAm Spanish "tú").

CONTEXT — what's already DONE and merged to main (live):
- UX/functional audit fixes: vet-access requests now surface in the notifications bell;
  HealthTrack dead cards fixed; unified currency formatter (ARS "$"); provider search +
  sort; vet-note attribution + awareness; "Add Record" and Feed/Community error states.
- Services Hub redesign, phases 1-4a merged: a unified discovery experience — one merged,
  searchable, filterable list of providers (vet/grooming/telehealth/shops) with an iOS map
  + list⇄map toggle + web split (Android/web map shows a "coming soon" placeholder,
  deferred pending a Google Maps key), and a unified storefront (provider profile + shop
  converged, product detail, capability-aware booking). Backend `discover` API returns
  coords + capabilities. (Placement needs fixing — see NEXT TASK.)
- Payment plumbing hardened + merged: MercadoPago webhook wiring (notification_url),
  honest checkout error states, single-paid-service auto-select at booking, pay-before-
  accept gate, a distinct "provider not connected" vs "not configured" error, a
  disconnect/reconnect control, and an RLS SECURITY DEFINER reader so checkout can read
  the provider's connected payment account (migration 0072_payment_account_read_fn,
  applied to prod).
- Observability + self-healing loop (Grafana Cloud + Railway) — LIVE and fully documented
  at docs/observability/OPERATIONS.md. The web app ships OpenTelemetry metrics to Grafana
  Cloud (free tier), with a RED dashboard + 3 alerts (5xx error rate, p95 latency,
  payment-failure rate) and an alert→Claude→PR autofix GitHub Action
  (.github/workflows/claude-autofix.yml). This is INFRA, separate from app-feature work —
  do NOT rebuild or modify it as part of feature tasks.

PARKED until go-live (do NOT work on this now):
- Validating a real MercadoPago charge. We proved the integration is correct (valid
  preference, right test seller, correct amount) but MercadoPago's marketplace test-user
  SANDBOX never creates a payment — a known-unreliable environment, not a PawPi bug. We'll
  confirm with one small REAL transaction + refund at launch. Leave it.

UNMERGED branches to land when I ask (not now unless I say):
- feat/services-hub P4b (checkout pickup/delivery-address fields). NOTE: its migration is
  numbered 0072 and COLLIDES with the already-merged 0072_payment_account_read_fn — it
  must be renumbered to 0073 before merging.
- A payments "quality-fields" branch (adds payer info, back_urls, statement_descriptor to
  the MercadoPago preference) — improves approval rates; land it when convenient.

>>> CURRENT NEXT TASK: Services Hub — put the discovery experience at the SERVICES landing
    (fixing a placement mistake) <<<
The Services Hub redesign built the unified discovery (merged, searchable, filterable
provider list + iOS map + list⇄map toggle), but it ended up living INSIDE a subsection
(e.g. the Vet screen) instead of at the top of the Services tab. The UX I actually want:
the moment a user taps "Services", they immediately see the MAP + search + filters across
ALL provider types (vet, grooming, telehealth, shops, adoption) and can find everything
right there. Drilling into a specific provider/shop/adoption center then opens THAT
provider's storefront (their profile + the services/products they offer).

Start here (assess first, NO code until I approve):
1. Assess and REPORT the current Services tab structure: where does the unified discovery
   (map + search + filters + merged list) actually render today — at the Services tab
   landing, or nested inside a subsection like Vet? Map the current navigation from the
   Services tab down to provider detail. List what already exists vs what needs to move.
2. Then propose a concrete plan to make the unified discovery the Services LANDING (map +
   search + filters over ALL provider types), with provider detail → that provider's
   storefront. Reuse the existing `discover` API + components; keep it additive; new
   strings through i18n. Give me grey-box prompts for the Claude Code session and wait for
   my go-ahead before building.

PAUSED (resume next week) — finish the Spanish/English localization. It's the launch-
critical original goal but is token-heavy, so it's paused. When resuming, start with a
STATUS assessment (don't change anything yet): does branch `feat/i18n-es-ar` exist / is it
merged, partial, or stale vs main? how much of the app renders via t() vs hardcoded
English (mobile AND web)? is the web i18n infra in place? Then a plan: extract remaining
hardcoded strings (especially everything added by the audit + Services Hub), fill en.json +
es.json (neutral LatAm "tú"), Argentine dates dd/MM/yyyy + 24h, device/browser language
with Spanish fallback, and a language switcher.

Backlog (for awareness, not now): Services Hub P5 (self-sourced pet-friendly places — I
still owe a data-sourcing decision), P6 (retire the old vet/grooming/telehealth screens
after parity), Android/web maps (needs a Google Maps key), and a vet-note integrity backend
(append-only + structured author + owner archive/hide).

Start by giving me the Services tab STRUCTURE assessment (step 1 above), then we'll go from
there.
```
