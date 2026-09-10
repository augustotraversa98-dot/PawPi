# PawPi — repo guide for AI agents (Claude Code, Cowork, etc.)

## Branding & visual identity — READ BEFORE ANY VISUAL WORK
The single source of truth for PawPi's visual identity is **`pawpi-brand-kit/`** (committed here, so
it is always available from GitHub and the repo):
- `pawpi-brand-kit/BRAND-GUIDELINES.md` — full guideline (mark, colour, type, spacing, app icon)
- `pawpi-brand-kit/pawpi-logo-rules.json` — the same rules, machine-readable
- `pawpi-brand-kit/logo/*.svg` — the approved artwork (use as-is)
- `pawpi-brand-kit/AGENTS.md` — rules of engagement

Before producing ANY logo, icon, splash, colour, typography, marketing/landing page, screenshot
frame, or share card, READ `pawpi-brand-kit/BRAND-GUIDELINES.md` and follow it literally.

Non-negotiables (full list in the brand kit):
1. Never redraw, retrace, auto-trace, or substitute the 🐾 emoji for the paw mark — place a supplied
   SVG. In the mobile app, render the mark via `PawMark` (anything/apps/mobile/src/components/ui/PawMark.jsx),
   which embeds the verbatim brand SVG; never re-inline the paw paths anywhere else.
2. One flat colour per mark; the two paws are always the same colour.
3. Never rotate, mirror, skew, stretch, or re-space the paws.
4. Only approved colours: coral #FF6F61, warm brown #3B241B, cream #FFF7EF (+ sand/peach/card/border per the kit).
5. Respect clear space (X = 25% of mark width) and min size (20px). Lockup never below 32px mark width.
6. The "PawPi" wordmark is typeset in Nunito ExtraBold 800 (letter-spacing −0.02em), never baked into the SVG.

App icon / splash / favicon assets in `anything/apps/mobile/assets/images/` are generated from the
brand kit (`logo/pawpi-app-icon.svg` + `logo/pawpi-paws-cream.svg`) — regenerate from those, never hand-draw.
If a request would break a brand rule, say so and offer the compliant alternative.

## Product & build conventions
Strategy + priorities: `PawPi_instructions.md` and `docs/`. Mobile app: `anything/apps/mobile`.
All user-facing copy ships EN + ES (`anything/apps/mobile/src/i18n/locales/en.json` + `es.json`).
Product name is "PawPi". No fake/mock data — empty states only.

## Database migration conventions — READ BEFORE WRITING ANY MIGRATION
Full model: `docs/rls-hardening.md`. Copy `supabase/migrations/TEMPLATE.sql` to
`supabase/migrations/NNNN_short_name.sql` (next free number) and follow it. The rules
below are CI-enforced against the real migrations in the integration harness
(`cd anything/apps/web && npm run test:integration`) — a violation fails the build, naming
the offender.

1. **Every `CREATE TABLE` in `public`** must `ENABLE` **and** `FORCE ROW LEVEL SECURITY`
   and add explicit owner-scoped policies (`owner_user_id = current_app_user_id()`;
   `current_app_user_id()` is NULL when no identity is in scope → deny by default). A new
   public table with RLS off, or forced-with-no-policy, fails
   `test/integration/rls-gap-closure.integration.test.ts`. The only exceptions are the 5
   auth/identity tables in that test's documented `RLS_EXEMPT` allowlist — do not add to it
   without a written reason.
2. **Every `SECURITY DEFINER` function** must pin its search path
   (`set search_path = public, pg_temp`) and `grant execute … to pawpi_app` explicitly. An
   unpinned DEFINER function fails
   `test/integration/security-hardening.integration.test.ts`. Prefer `SECURITY INVOKER`
   (the default) unless the function must read rows the caller's RLS would hide.
3. **Never `GRANT … TO anon`, `authenticated`, or `PUBLIC`** on app tables/sequences/
   functions. The app connects only as `pawpi_app` (never the Supabase Data API/PostgREST);
   `pawpi_app` already holds DML on all objects and future ones (`0019` + its
   `ALTER DEFAULT PRIVILEGES`), and `0126` revokes the Supabase-default anon/authenticated
   grants. See `docs/db-data-api-safety-evidence.md`.
4. **Anything hand-applied** (role/grant/RLS/auth/storage changes, or any migration that
   REVOKEs) ships a `supabase/verify_NNNN.sql` shaped so every row reads PASS, and a note in
   the PR body that it is human-applied — see `supabase/verify_0126.sql` / `verify_0127.sql`
   and `docs/db-migration-runbook-0126-0127.md`.
5. **Before each release**, run the Supabase **Security & Performance advisors** and triage
   anything new — see `docs/LAUNCH-CHECKLIST.md`.
