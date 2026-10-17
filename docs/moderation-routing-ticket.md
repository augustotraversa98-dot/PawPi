# PawPi — Report routing & moderation console (MOD1) — CC ticket

**Designed in Cowork:** 2026-08-15 · **Launch-blocking (Apple Guideline 1.2).** Reports are filed into
`content_reports` (migration 0065) and there's an admin queue API (`GET /api/admin/reports`,
`POST /api/admin/reports/[id]/action` → `app_admin_action_report(reportId, action, ban)`), **but**:
1. **No account is an admin.** `app_is_admin()` = `user_profiles.role = 'admin'`, and a prod check shows
   **0 admins** — so the queue API returns 403 for everyone.
2. **Nothing alerts anyone** when a report is filed (no email / notification in `POST /api/reports`).
3. **There's no admin UI** — the queue is a raw JSON endpoint with no page to review/act on it.
Net effect: reports go into a drawer nobody can open. Apple 1.2 requires you can *act* on reports.

**Live DB is at migration 0113 — next number 0114.** Standing rules apply (additive migration + verify;
own-row RLS; app runs as pawpi_app; no fake data; never break prod).

## Fix (2 PRs, one CC chat — CI-green → merge → deploy → log)

**PR1 — Admin identity + alerting.**
- Don't overload `user_profiles.role` (Tats is a real pet_owner/business and must stay one). Add
  **`user_profiles.is_admin boolean default false`** (migration 0114, additive) and update
  `app_is_admin()` to `role = 'admin' OR is_admin = true` (backward compatible) + `verify_0114.sql`.
- Flag **Tats' account** (`augustotraversa98@gmail.com`) as `is_admin = true` (via a documented
  one-line SQL in the migration notes / a guarded seed — never a hardcoded secret).
- **Alert on new report:** in `POST /api/reports`, after a report is created, notify every admin —
  (a) an **email** via the existing `apps/web/src/app/api/utils/email` sender (subject e.g. "New PawPi
  report: {target_type} — {reason}", body with target, reason, reporter-less summary, and a link to the
  moderation console), and (b) an in-app `app_notify` to each admin. Fire-and-forget (never block/500 the
  report); dedupe/rate-limit so a burst can't spam (e.g. coalesce or cap per hour). Respect the idempotent
  "one open report per (reporter,target)" — only alert on a genuinely new report.

**PR2 — Moderation console (the "act within 24h" surface).**
- A web page **`/admin/moderation`** (Next.js, gated by `app_is_admin()` — non-admins get 404/redirect,
  never a data leak). Lists the queue from `GET /api/admin/reports?status=open|actioned|dismissed|all`
  with: the reported target (type + a content preview where feasible), reason, reporter count, age, and
  action buttons wired to `POST /api/admin/reports/[id]/action` — **Remove content**, **Dismiss**, and a
  **Ban user** toggle (the `ban` flag). Show open-count. Keep it simple + functional (internal tool; EN is
  acceptable, but reuse existing patterns).
- Confirm `app_admin_action_report` actually removes/soft-deletes the target content and, with `ban=true`,
  blocks the offending user (verify against 0065's helper; if a target type isn't handled, note it).
- Tests: admin-gate (non-admin 403/404), list renders, an action calls the endpoint + updates status;
  RLS/authz proven (only admins reach any of it).

## Acceptance
A filed report → Tats gets an email + in-app alert → opens `/admin/moderation` → sees it → can Remove /
Dismiss / Ban, and the content actually disappears. Non-admins can't reach the console or the admin API.
This closes the Apple 1.2 "act on reports" requirement end-to-end.

---

```
MODERATION ROUTING DRIVER — PawPi report routing + admin console (autonomous, 2 PRs)

MODE: UNATTENDED, AUTONOMOUS run. Build 2 PRs IN ORDER — PR1 admin identity + alerting → PR2
moderation console — each its own PR, CI-green → merge → deploy → log. Don't ask; take the
sensible default and log it. This is Apple Guideline 1.2 launch-blocking.

ORIENTATION: PawPi (anything/). Read ARCHITECTURE.md + supabase/SCHEMA_NOTES.md, then
docs/moderation-routing-ticket.md. FACTS (verified on prod): reports land in content_reports
(0065); GET /api/admin/reports + POST /api/admin/reports/[id]/action exist and call
app_admin_action_report(reportId, action, ban); app_is_admin() = user_profiles.role='admin';
there are currently ZERO admins; POST /api/reports sends no alert; there is no admin UI. Email
sender: apps/web/src/app/api/utils/email. Data rules: integer IDs; owner_user_id =
user_profiles.id; additive migration + verify_XXXX.sql; app runs as pawpi_app; no fake data;
never break prod. Live DB at 0113 — use 0114.

PR1 — Admin identity + alerting: add user_profiles.is_admin boolean default false (migration
0114); update app_is_admin() to (role='admin' OR is_admin=true), backward-compatible + verify;
flag augustotraversa98@gmail.com as is_admin=true (documented SQL, not a hardcoded secret). In
POST /api/reports, after a NEW report is created, alert every admin via the email util + an
app_notify each — fire-and-forget (never block/500), deduped/rate-limited against bursts. Tests:
alert fires once per new report, never on the idempotent repeat; app_is_admin honors the new flag.

PR2 — Moderation console: web page /admin/moderation gated by app_is_admin (non-admin → 404/redirect,
no data leak). List GET /api/admin/reports (open/actioned/dismissed/all) with target + preview,
reason, reporter count, age; action buttons → POST action route (Remove / Dismiss / Ban toggle).
Confirm app_admin_action_report actually removes/soft-deletes content and ban blocks the user;
note any unhandled target type. Tests: admin gate, list render, action call + status update.

PER PR: CI-green → merge (merge commit + delete branch) → apply migration + verify + Railway
healthy (or log "0114 awaits hand-apply" + degrade) → append night-run-log.md + update roadmap.
STOP only if a PR can't go green after real effort (BLOCKED entry). START A NEW CLAUDE CODE CHAT.
```

---

## AS-BUILT + DECISION (2026-08-15)

- **Shipped:** PR #423 (admin identity + alerting, migration 0114) + PR #424 (moderation console,
  migration 0115) — both merged, CI-green, applied + verified on prod. 0115 also closed an unhandled
  reportable type (`provider_post_comment`) whose "Remove" was a silent no-op.
- **Admin account — DECIDED + ACTIVE:** the launch admin + published support/abuse contact is
  **`support@pawpi.info`** (role-based, not a personal account; also satisfies Apple 1.2 "published
  contact"). ✅ **ACTIVATED 2026-08-16** — account created in-app (profile id **77**, name "Soporte") and
  flagged `is_admin = true` on prod via Supabase; `app_is_admin()` now returns 1 admin
  (`support@pawpi.info`). Reports alert this account and it can open `/admin/moderation`.
- **Durable-seed follow-up (minor, non-blocking):** migration 0114's guarded seed still keys
  `augustotraversa98@gmail.com` (a no-op). If the DB is ever rebuilt from migrations the admin flag won't
  re-apply, so a tiny follow-up should re-point that seed to `support@pawpi.info`. Prod is already set, so
  this is only for rebuild durability.
