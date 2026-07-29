# N6 — Automate Sign in with Apple's expiring client-secret JWT

**Status:** ready · no migration expected · independent · safe-parallel: caution — auth code, additive
only, must not touch the existing email/password path

## Context
Sign in with Apple is already built and merged (ticket 2.46) — additive, env-gated (`AUTH_APPLE_ID` +
`AUTH_APPLE_SECRET`), buttons hidden until both keys are set, email/password login untouched either way.
Turning it on still needs Tats to register an Apple Services ID + Sign-in-with-Apple key in their Apple
Developer account and download a `.p8` private key — that account/credential step cannot be done tonight.

## Current issue
Apple's Sign in with Apple does **not** accept a static client secret like Google does — `AUTH_APPLE_SECRET`
has to be a JWT that Apple's own docs say must be regenerated at most every 6 months (signed with the
downloaded `.p8` key, team ID, and key ID). If this codebase currently expects Tats to hand-generate that
JWT once and paste it in as a static env value, it will silently break in ~6 months with no obvious cause
(login for Apple users just stops working) — a bad trap to leave in a production app.

## Expected behavior
1. Check how `socialProviders(env)` (the existing Apple/Google provider wiring from 2.46) currently
   consumes `AUTH_APPLE_SECRET` — confirm whether it expects a pre-generated JWT string or could instead
   accept the raw key material and generate/sign the JWT itself at request time (or on server boot, cached
   until near-expiry).
2. If it's currently the static-string pattern, change it to generate the client-secret JWT on-the-fly
   from three new env inputs instead (e.g. `AUTH_APPLE_TEAM_ID`, `AUTH_APPLE_KEY_ID`, and the `.p8` private
   key contents via `AUTH_APPLE_PRIVATE_KEY`), so Tats sets it once and it never expires silently. Keep the
   whole thing additive and env-gated exactly like today — an install without these keys must behave
   byte-for-byte identically to now (buttons hidden, email/password unaffected).
3. Document the new exact env vars needed in `docs/test-backlog.md`'s go-live list, replacing the vaguer
   "AUTH_APPLE_ID/SECRET" mention, so when Tats does the one-time Apple Developer setup they know precisely
   what to copy from Apple's portal into which env var.

## Data / API rules
No migration. No behavior change for Google sign-in or email/password. This only changes how the Apple
client secret is derived, not the auth flow itself.

## Acceptance criteria
- `npm test` green, with a new unit test proving the JWT is generated correctly from known test key
  material (use a throwaway test keypair, not anything real).
- An install with none of the new Apple env vars set behaves identically to before (buttons stay hidden,
  no crash on boot).
- `docs/test-backlog.md` go-live list updated with the exact new var names + a one-line note on where to
  get each from Apple's portal.
- Update `docs/roadmap.md` + `PawPi_instructions.md` status block on merge.
