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
- Services Hub redesign, phases 1-4a merged: the Services tab is now a unified discovery
  experience — one merged, searchable, filterable list of providers (vet/grooming/
  telehealth/shops) with an iOS map + list⇄map toggle + web split (Android/web map shows
  a "coming soon" placeholder, deferred pending a Google Maps key), and a unified
  storefront (provider profile + shop converged, product detail, capability-aware
  booking). Backend `discover` API returns coords + capabilities.
- Payment plumbing hardened + merged: MercadoPago webhook wiring (notification_url),
  honest checkout error states, single-paid-service auto-select at booking, pay-before-
  accept gate, a distinct "provider not connected" vs "not configured" error, a
  disconnect/reconnect control, and an RLS SECURITY DEFINER reader so checkout can read
  the provider's connected payment account (migration 0072_payment_account_read_fn,
  applied to prod).

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

HOUSEKEEPING: delete the leftover `DIAG_TOKEN` variable in the Railway dashboard (it's an
inert gate from a temporary diagnostic).

>>> THE NEXT TASK I want to resume: finish the Spanish/English localization <<<
This is the launch-critical original goal and has been open since before all the audit +
Services Hub work merged — so a lot of NEW English strings have landed that aren't
translated yet. Start here:
1. First, assess and REPORT the current state (don't change anything yet): does a branch
   `feat/i18n-es-ar` exist? Is it merged, partial, or stale vs current `main`? How much of
   the app currently renders via t() vs hardcoded English, in BOTH mobile and web? Is the
   web i18n infrastructure in place? List what's translated vs still hardcoded.
2. Then propose a concrete plan to finish it: reconcile/rebase onto latest main, extract
   remaining hardcoded strings (especially everything added by the audit + Services Hub),
   fill en.json + es.json (neutral LatAm "tú"), Argentine dates dd/MM/yyyy + 24h, device/
   browser language with Spanish fallback, and a language switcher. Wait for my go-ahead
   before building; give me grey-box prompts for the Claude Code session.

Backlog after localization (for awareness, not now): Services Hub P5 (self-sourced pet-
friendly places — I still owe a data-sourcing decision), P6 (retire the old
vet/grooming/telehealth screens after parity), Android/web maps (needs a Google Maps key),
and a vet-note integrity backend (append-only + structured author + owner archive/hide).

Start by giving me the localization STATUS assessment (step 1 above), then we'll go from
there.
```
