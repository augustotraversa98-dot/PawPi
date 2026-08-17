# PawPi — Moderation console v2 (MOD2): rich, scannable rows + discoverability

**Designed in Cowork:** 2026-08-16 · Follow-up to MOD1. The console works and is admin-gated (support@pawpi.info
= admin, profile 77), but on-device review surfaced three real gaps:
1. **Rows are too thin.** `app_admin_list_reports` returns `SETOF content_reports` — only target_type,
   target_id, reason, status, created_at. You can't see WHAT was reported (the content), WHO was reported
   (author), by WHOM (reporter), or an exact date/time. Moderation must be clear, intuitive, fast.
2. **The console is undiscoverable.** No nav link — an admin has to type `/admin/moderation` by hand.
3. **A fresh admin gets dumped into provider onboarding.** Web signup/login uses `callbackUrl="/provider"`,
   so the admin account (no provider) is asked to pick a "type of business" instead of reaching moderation.

**Live DB is at migration 0115 — next number 0116.** Standing rules apply (additive migration + verify;
own-row/admin-gated RLS; app runs as pawpi_app; no fake data; never break prod; EN+ES).

> **AS-BUILT — PR1 ✅ SHIPPED 2026-08-17** (PR #425, merge `7c1d6251`). Migration **0116 APPLIED +
> VERIFIED on prod (5/5 PASS)**; prod DB now at **0116**. `app_admin_list_reports_v2(p_status)`
> built exactly as specced — DEFINER + `app_is_admin()`-gated, polymorphic over all 15 reportable
> types, preview text `left(…,280)` + image url, `reporters_count` = distinct reporters on target,
> author/reporter handles = `coalesce(username, full_name)`. Route reads v2; ModerationConsole
> rebuilt as a triage card with absolute + relative timestamps and Remove/Dismiss/Ban intact.
> Decisions logged: (1) **EN+ES via a self-contained label map + toggle** — the web extranet has no
> shared i18n runtime (AdvancedSection.jsx: "the extranet has no i18n"), so a bespoke local map is
> the sensible default; content previews stay as-authored. (2) **"view in context" link omitted** —
> per-type web routes are uncertain and a wrong link is worse than none; deferred. (3) v1
> `app_admin_list_reports` left in place (harmless). Gates: vitest 2065→2067 · integration 1043.

## PR1 — Enrich the report data + the row UI

**Data (migration 0116):** add an enriched admin reader — `app_admin_list_reports_v2(p_status text)` (or
extend the route to join), still `SECURITY DEFINER` + `app_is_admin()`-gated. For each open/actioned/dismissed
report return, in one call:
- **report:** id, status, reason, **details** (the reporter's free-text note), created_at (exact).
- **reporter:** id + display name/handle (who filed it) — and **reporters_count** = distinct reporters on
  the same target (so pile-ons are obvious).
- **target:** type, id, **author** (id + name/handle of who's being reported), a **content preview**
  (text snippet, and image/thumbnail URL where the target has one), and the target's created_at.
- Polymorphic by target_type — join the right source per type (post, bark, forum_thread, forum_comment,
  dm_message, provider_message, review, pet_profile, user_profile, adoption_listing, provider_post,
  provider_post_comment, event, social_walk, lost_report). Where a type has no natural preview, return a
  clean fallback label (never crash, never blank). `verify_0116.sql`.

**UI (ModerationConsole):** make each row scannable at a glance — reads like a triage card:
- A clear **content preview** (snippet + thumbnail if any) so the moderator sees the actual reported thing.
- **Reported author** (handle, linkable) and **reported by** (reporter handle) **×N** if multiple.
- **Reason** + the reporter's **details** note.
- **Exact date + time** (absolute, e.g. "16 Aug 2026, 21:45") alongside the relative "3d ago".
- Keep the existing **Remove / Dismiss / Ban** actions; optionally a "view in context" link.
- Fast + intuitive: dense but readable, newest first, the Open filter default, open-count badge.
- EN + ES for all labels.

## PR2 — Discoverability + admin routing

> **AS-BUILT — PR2 ✅ SHIPPED 2026-08-17** (PR #426, merge `5cee6f9f`, **no migration**). Completes
> MOD2. Added `GET /api/admin/moderation-summary` (capability probe → `{ is_admin, open_count }`;
> non-admin gets `is_admin:false` at 200, never 403; count via the 0116 DEFINER reader) + a
> `useAdminModerationSummary` hook. ProviderShell sidebar shows an admin-only **Moderation** link
> with the open-count badge; `NoProviderState` shows a **prominent card** offering the console above
> the create-provider onboarding. Decision: kept a **prominent offer + visible link**, not a forced
> redirect (ticket allows "route OR prominently offer"; a hard redirect would trap an admin who also
> wants to create a provider) — `callbackUrl="/provider"` left untouched (mobile web-auth bridge
> depends on it), so no normal-user routing changed. Tests: admin sees link+badge+lands, admin with
> no provider offered console alongside onboarding, non-admin sees neither. vitest 2067→2075.
> **Still owed (human):** grant a prod admin account, or the link/card stay hidden (correctly gated).

- **Admin nav link:** surface a visible link to `/admin/moderation` whenever `app_is_admin()` is true
  (e.g. in the provider dashboard nav / a top bar), with the **open-count** badge. Non-admins never see it.
- **Admin landing:** an admin account (esp. one with no provider) must reach the console without typing the
  URL and must NOT be forced through "pick a type of business." On login, if `app_is_admin()`, route (or
  prominently offer) `/admin/moderation` instead of the provider-creation flow. Don't change routing for
  normal users.
- Tests: admin sees the link + lands correctly; non-admin sees neither the link nor the page.

## Acceptance
An admin opens the app on web and reaches Moderation from a visible link (no manual URL, no business-type
prompt). Each row shows the reported content preview, the reported author, the reporter(s) + count, the
reason + note, and an exact timestamp — enough to decide in seconds — with Remove / Dismiss / Ban. Still
strictly admin-gated; no data leaks to non-admins.

---

```
MODERATION CONSOLE v2 DRIVER — PawPi (autonomous, 2 PRs)

MODE: UNATTENDED, AUTONOMOUS run. Build 2 PRs IN ORDER — PR1 rich rows → PR2 discoverability —
each its own PR, CI-green → merge → deploy → log. Don't ask; take the sensible default and log it.

ORIENTATION: PawPi (anything/). Read ARCHITECTURE.md + supabase/SCHEMA_NOTES.md, then
docs/moderation-console-v2-ticket.md. FACTS (verified on prod): app_admin_list_reports returns
SETOF content_reports (raw report row only — no content/author/reporter joins); ModerationConsole
at app/admin/moderation renders GET /api/admin/reports; app_is_admin() gates it; support@pawpi.info
(profile 77) is the admin; web signup/login callbackUrl="/provider" so a fresh admin hits provider
onboarding. Data rules: integer IDs; owner_user_id = user_profiles.id; additive migration +
verify_XXXX.sql; DEFINER stays app_is_admin-gated; no fake data; never break prod; EN+ES. Live DB
at 0115 — use 0116.

PR1 — Rich rows: add app_admin_list_reports_v2(p_status) (SECURITY DEFINER, app_is_admin-gated,
migration 0116 + verify) returning per report: id, status, reason, details, created_at; reporter
{id, handle} + reporters_count (distinct reporters on the target); target {type, id, author
{id, handle}, preview {text snippet, image_url?}, created_at}. Polymorphic joins per target_type
with a clean fallback for preview-less types (never crash/blank). Update ModerationConsole rows to
a scannable triage card: content preview + thumbnail, reported author, reported-by ×N, reason +
details, EXACT date+time (absolute) plus relative, keep Remove/Dismiss/Ban (+ optional view-in-
context). EN+ES. Tests: enriched shape, admin-gate, polymorphic fallback.

PR2 — Discoverability + admin routing: show a visible /admin/moderation nav link (with open-count
badge) whenever app_is_admin(); non-admins never see it. On login, an admin (esp. no provider)
routes to / is offered /admin/moderation instead of the provider "type of business" flow; normal
users unchanged. Tests: admin sees link + lands; non-admin sees neither.

PER PR: CI-green → merge (merge commit + delete branch) → apply migration + verify + Railway
healthy (or log "0116 awaits hand-apply" + degrade) → append night-run-log.md + update roadmap +
update docs/moderation-console-v2-ticket.md as-built. STOP only if a PR can't go green after real
effort (BLOCKED entry). START A NEW CLAUDE CODE CHAT.
```
