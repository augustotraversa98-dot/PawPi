# N5 — Payments go-live hardening + exact setup checklist (no new accounts needed)

**Status:** ready · no migration expected · independent · safe-parallel: caution — read carefully before
touching live payment code paths

## Context
The payments foundation (migration 0029, ticket 2.3) already has a provider-agnostic payment layer with
MercadoPago and Binance adapters, key-stubbed and dormant until `ACTION 2` in `docs/test-backlog.md` is
done — which requires Tats to create a real MercadoPago marketplace OAuth app and a Binance Pay merchant
account on their own sites. **That account-creation step cannot be done by Code tonight.** Everything else
can.

## Current issue
1. Nobody has recently audited whether the dormant/degrade-clean path is actually clean in every checkout
   surface (not just the ones originally tested) now that many more paid capabilities have shipped since
   2.3 (transport, Rx fulfillment, insurance, subscriptions, shop).
2. `docs/test-backlog.md` ACTION 2 is a two-sentence pointer, not an exact runbook — when Tats finally
   does have 20 minutes to set this up, they shouldn't have to go spelunking through the adapter code to
   figure out exactly which env vars, webhook URLs, and redirect URLs to register.

## Expected behavior
1. **Audit pass:** walk every paid flow shipped since 2.3 (grep provider capability checks +
   `provider_bookings`/orders that lead to a payment) and confirm each one shows the clean "payments not
   configured" message with no crash when the keys are unset — write a test for any surface that doesn't
   already have one covering this path.
2. **Test coverage:** ensure the MercadoPago and Binance adapter modules themselves have unit tests for
   their key-stubbed/dormant behavior (webhook signature check, checkout create, refund, payout) using
   mocked responses — do not attempt to call the real MercadoPago/Binance sandbox APIs (no live
   credentials exist).
3. **Setup runbook (docs only):** rewrite `docs/test-backlog.md` ACTION 2 into a precise, ordered,
   paste-ready checklist: exact env var names this codebase expects (from the actual adapter source, not
   guessed), the exact webhook/redirect URL patterns to register with each provider (derive from the
   actual route files), and what to verify after setting them (e.g. "book one real low-value service and
   confirm the webhook lands"). This is the single most useful thing tonight can produce for this track —
   it turns "go figure out payments" into "follow these 8 steps."

## Data / API rules
No migration expected. If the audit finds a genuine unsafe-crash path (not just a UX polish gap), fix it
— that's a real bug, not scope creep. Do not touch `PAYMENTS_TOKEN_KEY` encryption logic (2.16) unless a
real bug is found there; this is a hardening/docs pass, not a rewrite.

## Acceptance criteria
- `npm test` + `npm run test:integration` green, with new coverage for any previously-untested
  dormant/degrade paths.
- `docs/test-backlog.md` ACTION 2 reads as a checklist Tats can literally follow top to bottom with no
  further research.
- No behavior change for any account that already has real payment keys set (if any do — check env
  handling doesn't regress existing installs).
- Update `docs/roadmap.md` + `PawPi_instructions.md` status block on merge.
