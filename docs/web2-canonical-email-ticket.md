# PawPi — WEB2: canonical www.pawpi.info + support@ contact (small)

**Designed in Cowork:** 2026-08-16 · One small PR. No migration. Follows WEB1. The apex `pawpi.info` has MX
(email) so it can't point at Railway; **`www.pawpi.info` is the canonical web address**, and DNS is now
live (www → Railway). Two changes: (1) make www canonical everywhere, (2) unify the public contact email
on `support@pawpi.info` (a confirmed working alias of `augusto@pawpi.info`).

## Change 1 — Canonical `https://www.pawpi.info` (replace `https://pawpi.info`)
- **Mobile config:** `apps/mobile/eas.json` (EXPO_PUBLIC_PRIVACY_POLICY_URL, EXPO_PUBLIC_TERMS_URL,
  EXPO_PUBLIC_HELP_URL, + the EULA URL) and `apps/mobile/src/constants/legal.js` — `pawpi.info` →
  `www.pawpi.info`. Also update `apps/mobile/.env` + `.env.local` locally (gitignored — not in the PR, but
  fix them so local/dev matches).
- **Web meta:** in `apps/web` legal + homepage — the `canonical` link, `hreflang` alternates, OG/Twitter
  `url`, plus `public/sitemap.xml` and the `Sitemap:` line in `public/robots.txt` — all `pawpi.info` →
  `www.pawpi.info`.
- **Docs:** `docs/app-store-connect-content.md`, `docs/app-store-submission-runbook.md`,
  `docs/LAUNCH-CHECKLIST.md` — Privacy/Support/Marketing URLs → `www.pawpi.info`.

## Change 2 — One published contact = `support@pawpi.info`
- The public legal/support pages currently render `augusto@pawpi.info` (WEB1's cautious choice). Change the
  published contact to **`support@pawpi.info`** across the web-rendered pages (footer + any in-copy contact)
  and in the `docs/legal/*.md` source if it prints `augusto@`. Leave EULA + moderation as-is (already
  `support@`). End state: `support@pawpi.info` is the single public contact across web · EULA · App Store ·
  moderation alerts. (It's an alias that lands in the augusto@ inbox — verified.)

## Acceptance
`www.pawpi.info/privacy` (and /terms, /eula, /support, /) show `support@pawpi.info` and canonical/OG/hreflang
= `www.pawpi.info`; `sitemap.xml`/`robots.txt` reference www; mobile legal links + eas.json point at
`www.pawpi.info`; App Store URL references in docs are www. Tests updated. No migration.

---

## AS-BUILT — ✅ SHIPPED 2026-08-17 (PR #429, merge `b758dd9a`, branch deleted)

One PR, no migration. CI-green: web vitest **2099**, web integration, mobile jest **1905**.

**Change 1 (canonical www):** web `SITE_URL` token (`src/lib/brand/tokens.js`) drives canonical/OG/
hreflang via `buildPageMeta`/`buildHomeMeta`; `public/sitemap.xml` (20 URLs) + `robots.txt` Sitemap
line; mobile `eas.json` legal URLs + `constants/legal.js` comment (+ local `.env`/`.env.local`,
gitignored); `docs/app-store-connect-content.md` Marketing URL.

**Change 2 (one contact = support@):** web `SUPPORT_EMAIL` token (footer) + rendered legal content
(privacy/terms/support/**eula**, EN+ES); mobile `SUPPORT_EMAIL` default; `docs/legal/*` source
(privacy/terms/support `.md` + `support.html`); `docs/app-store-connect-content.md` +
`docs/app-store-submission-runbook.md` contact. Tests updated: `lib/legal/lang.test.js` (hreflang→www),
`app/legal-routes.test.jsx` + `app/page.test.jsx` (footer email→support@).

**Deviation (logged):** the ticket assumed EULA already used `support@`, but the shipped EULA content
rendered `augusto@` — updated it too so acceptance ("`/eula` shows `support@`") and the "one contact
everywhere" end-state hold.

**Out of scope (logged):** `email/config.js` `EMAIL_REPLY_TO` default (backend reply-to, same inbox),
`shareLinks.js`/`geocoding.js` (internal, env-governed), API-test `APP_BASE_URL` fixtures, untracked
WIP (`docs/legal/eula.{md,es.md}`, `docs/LAUNCH-CHECKLIST.md`), and the legal-entity-naming note in
`docs/legal/LEGAL-REVIEW-CHECKLIST.md`.

**Verified** on the Railway origin `pawpi-production.up.railway.app` after a SUCCESS deploy:
`/privacy`, `/eula`, `/?lang=en` all show `canonical`/`og:url`/`hreflang` = `www.pawpi.info` and footer
`mailto:support@pawpi.info` (no `augusto@` in body); `/sitemap.xml` + `/robots.txt` reference www.

⚠️ **Remaining ops wait (NOT code / not a blocker for this PR):** `www.pawpi.info` is attached as a
Railway custom domain (both `pawpi.info` + `www` are on the `PawPi` service; the plan's 2-domain limit
is reached) and its one.com CNAME points at Railway, **but at cutover `https://www.pawpi.info` still
served Railway's `*.up.railway.app` wildcard cert and 404'd** — Let's Encrypt issuance / edge
propagation pending on Railway's side. Recheck `https://www.pawpi.info/privacy` until it serves the app
with a valid `www.pawpi.info` cert; until then the canonical URLs are verifiable on the Railway origin.

---

```
WEB2 DRIVER — PawPi canonical www + support@ contact (autonomous, 1 PR)

MODE: UNATTENDED, AUTONOMOUS. One PR, CI-green → merge → deploy → log. Don't ask; take the
sensible default and log it. NO migration.

ORIENTATION: PawPi web = apps/web (React Router v7 + Vite, live at pawpi.info / now www.pawpi.info on
Railway). Read docs/web2-canonical-email-ticket.md. WEB1 shipped /privacy /terms /eula /support + a
homepage; the apex can't point at Railway (MX present) so www.pawpi.info is canonical (DNS live).

DO:
1) Replace https://pawpi.info → https://www.pawpi.info everywhere it's a web/app URL:
   apps/mobile/eas.json (EXPO_PUBLIC_PRIVACY_POLICY_URL / TERMS_URL / HELP_URL / EULA url) +
   apps/mobile/src/constants/legal.js (+ .env/.env.local locally, gitignored); apps/web legal+home
   canonical/hreflang/OG url + public/sitemap.xml + robots.txt Sitemap line; and the App Store URL
   references in docs/app-store-connect-content.md, docs/app-store-submission-runbook.md,
   docs/LAUNCH-CHECKLIST.md.
2) Change the public contact email on the legal/support pages (and docs/legal/*.md source if present)
   from augusto@pawpi.info → support@pawpi.info. Leave EULA + moderation (already support@) unchanged.
   End state: support@pawpi.info is the one published contact everywhere.
Update any test asserting the old URL/email. Web vitest + mobile green.

PER PR: CI-green → merge (merge commit + delete branch) → confirm Railway deploy healthy → verify
www.pawpi.info/privacy shows support@ + canonical www → append night-run-log.md + update roadmap +
docs/web2-canonical-email-ticket.md as-built. STOP only if it can't go green after real effort (BLOCKED).
START A NEW CLAUDE CODE CHAT.
```
