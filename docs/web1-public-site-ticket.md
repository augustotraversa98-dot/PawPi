# PawPi — WEB1: public legal/support pages + branded homepage on pawpi.info

**Designed in Cowork:** 2026-08-16 · Build the launch-required public web surface **inside the existing
`apps/web` app** (React Router v7 + Vite, live on Railway at pawpi.info) so the App Store URLs are
`pawpi.info/...`. No separate static site. No migration. Brand + voice come from two in-repo folders.

## Sources of truth (read first)
- **Brand system:** `pawpi-brand-kit/` — `BRAND-GUIDELINES.md` + `pawpi-logo-rules.json` (palette, type,
  logo rules) + `logo/*.svg` (the real paw mark — place these SVGs, NEVER the 🐾 emoji, never redraw).
- **Voice / IA / positioning:** `pawpi-web-handoff/context/PAWPI_WEB_GUIDELINES.md` +
  `PAWPI_LANDING_PAGE_SYSTEM.json`; reference design `html/landing-pages/ar/servicios/paseadores/index.html`
  (V5) — match its direction lightly; do NOT build the full marketing system.
- **Legal copy:** `docs/legal/` — `privacy-policy.md`/`.es.md`, `terms-of-service.md`/`.es.md`,
  `eula.md`/`.es.md`, `support.md`. Publish the content, but **strip the internal "DRAFT — pending legal
  review" / Cowork lines** from the public render; show a clean "Last updated: <date>" instead.

## Design rules (from the brand kit — enforce)
- Palette: cream `#FFF7EF` page bg, card `#FFFCF8`, **warm brown `#3B241B` for all text**, coral
  `#FF6F61` for buttons/CTAs only. **Links = underlined warm brown, NOT coral** (coral text is ~2.5:1,
  fails AA). Min contrast 3:1 for the mark; WCAG AA for text.
- Type: Nunito (400/600/800; ExtraBold headings, wordmark) + JetBrains Mono for small uppercase eyebrow
  labels only. Load via the Google Fonts link in the brand guidelines.
- Logo: place `pawpi-brand-kit/logo/pawpi-paws-*.svg` (copy the needed SVGs into apps/web public assets).
  Wordmark "PawPi" typeset in Nunito ExtraBold beside the mark; respect clear-space + min-size rules.
- es-AR **primary**, en secondary (native Argentine Spanish, not neutral MT). Language toggle + hreflang.

## PR1 — Public legal + support routes + URL wiring
- Add PUBLIC (no-auth, reachable logged-out — must NOT be caught by the `/provider` redirect or any auth
  gate) routes: **`/privacy`, `/terms`, `/eula`, `/support`**, each es-AR default + en (e.g. `?lang=en` or
  `/en/...` — pick one, be consistent, add `hreflang` + `canonical`). Long-form readable layout: branded
  header (logo + wordmark + lang toggle), max-width prose, in-page anchors for sections, footer with
  cross-links + `support@pawpi.info`. Per-page `<title>` + meta description.
- **Re-point the mobile legal URLs** to the new pages: set `EXPO_PUBLIC_PRIVACY_POLICY_URL`,
  `EXPO_PUBLIC_TERMS_URL`, `EXPO_PUBLIC_HELP_URL` (→ `/support`) in `apps/mobile/.env`, `.env.local`, and
  `eas.json` to `https://pawpi.info/{privacy,terms,support}`, and add an EULA URL (`/eula`); wire
  `apps/mobile/src/constants/legal.js` if an EULA constant is needed. (Old value:
  `augustotraversa98-dot.github.io/pawpi-legal/...` — replace.)
- Tests: routes render logged-out; lang toggle switches copy; no auth redirect on these paths.

## PR2 — Branded homepage + SEO
- Replace the logged-out landing at `/` with a proper on-brand homepage (keep the logged-in → `/provider`
  redirect untouched): hero with the positioning line ("Tu perro. Toda su vida, en un solo lugar." /
  "Your dog's whole life. In one place."), a short "what PawPi is" feature strip (from the web
  guidelines), audience entry points (owners · walkers/providers · vets & businesses), an **App Store CTA
  that is honest** ("Próximamente en el App Store / Coming soon" — or a TestFlight link ONLY if provided;
  never a dead App Store link), and a footer linking Privacy · Terms · EULA · Support + `support@pawpi.info`.
- SEO/AIO basics: `<title>`, meta description, Open Graph/Twitter tags, `hreflang` es-AR/en, canonical,
  `sitemap.xml`, `robots.txt`. Fast, accessible, mobile-first.
- Tests: homepage renders logged-out with brand header/footer + legal links; logged-in still redirects.

## Acceptance
`pawpi.info/privacy` (and /terms, /eula, /support) load publicly, on-brand, es-AR default + en, no login,
no DRAFT stamp — usable as the App Store Privacy Policy + Support URLs. `pawpi.info/` shows a branded
homepage (Marketing URL, non-empty for review). Mobile legal links point at the new pages. No migration.

---

```
WEB1 DRIVER — PawPi public legal/support pages + homepage (autonomous, 2 PRs)

MODE: UNATTENDED, AUTONOMOUS run. Build 2 PRs IN ORDER — PR1 legal/support routes + URL wiring →
PR2 homepage + SEO — each its own PR, CI-green → merge → deploy → log. Don't ask; take the
sensible default and log it. NO database migration.

ORIENTATION: PawPi web app is apps/web (React Router v7 + Vite, live at pawpi.info; root `/` already
renders a logged-out landing + redirects logged-in users to /provider). Read ARCHITECTURE.md, then
docs/web1-public-site-ticket.md, then the SOURCES it names: pawpi-brand-kit/ (BRAND-GUIDELINES.md,
pawpi-logo-rules.json, logo/*.svg), pawpi-web-handoff/context/* (+ the paseadores V5 reference), and
docs/legal/*.md. Enforce the brand rules: cream bg, warm-brown text, coral for BUTTONS only, links =
underlined brown (coral text fails AA), Nunito + JetBrains Mono, place the real paw SVGs (never the
emoji, never redraw). es-AR primary + en secondary. Strip the internal "DRAFT/Cowork" lines from the
public render; show "Last updated: <date>".

PR1 — Public legal/support routes: add no-auth routes /privacy /terms /eula /support (es-AR default +
en toggle, hreflang, canonical, per-page title+meta), long-form readable + branded header/footer with
support@pawpi.info; content ported from docs/legal/*.md. MUST be reachable logged-out (not caught by
the /provider redirect / auth gate). Re-point EXPO_PUBLIC_PRIVACY_POLICY_URL / TERMS_URL / HELP_URL
(+ add EULA) in apps/mobile/.env, .env.local, eas.json to https://pawpi.info/{privacy,terms,support,eula}
(replace the old github.io/pawpi-legal values); wire constants/legal.js. Tests: routes render logged-out,
lang toggle works, no auth redirect.

PR2 — Homepage + SEO: replace the logged-out `/` landing with a branded homepage (hero positioning line
es/en, what-PawPi-is strip, audience entry points, HONEST App Store CTA — "coming soon", never a dead
link, footer with legal links). Keep logged-in → /provider. Add OG/Twitter meta, hreflang, sitemap.xml,
robots.txt. Tests: homepage renders logged-out with header/footer + legal links; logged-in still redirects.

PER PR: CI-green → merge (merge commit + delete branch) → confirm Railway deploy healthy → verify
pawpi.info/privacy loads publicly (200, no auth) → append night-run-log.md + update roadmap +
docs/web1-public-site-ticket.md as-built. STOP only if a PR can't go green after real effort (BLOCKED
entry). Flag "NEEDS ON-DEVICE/BROWSER CONFIRMATION" for the visual polish. START A NEW CLAUDE CODE CHAT.
```

## As-built — PR1 (2026-08-17, PR #427, merged `9409b2e9`)

Routes `/privacy /terms /eula /support` shipped in `apps/web` (`src/app/<name>/page.jsx`), reachable
logged-out (no auth import → the `/provider` redirect never applies). Shared building blocks:
- `src/lib/brand/tokens.js` (palette + fonts + `SITE_URL` + `SUPPORT_EMAIL`), `src/components/brand/`
  (`PawMark` = inlined shipped SVG, `BrandLockup`, `LangToggle`, `SiteHeader`, `SiteFooter`).
- `src/components/legal/` (`LegalPage`, `LegalArticle` = react-markdown w/ branded components).
- `src/lib/legal/` (`lang.js` pure meta/hreflang builder + tests, `useLang.js` `?lang=` state,
  `head.js` client-side title/description/canonical/hreflang + brand fonts).
- `src/content/legal/*.{es,en}.md` — cleaned from `docs/legal/*.md` (DRAFT stripped, GFM table →
  list, contact → `augusto@pawpi.info`); es-AR support page authored fresh.
- Tests: `lib/legal/lang.test.js`, `app/legal-routes.test.jsx`. Web vitest 2075→**2094**.

Deviations from the brief (logged): contact email is **`augusto@pawpi.info`** (verified mailbox), not
`support@pawpi.info` (unprovisioned); SEO head is applied **client-side** (this app doesn't wire
route-module `meta`/`links`); `remark-gfm` dropped (incompatible with `react-markdown@6`).

Mobile URL wiring: `eas.json` + `constants/legal.js` (`EULA_URL` added) → `pawpi.info/{privacy,terms,
support,eula}`; `.env`/`.env.local` too (gitignored).

**Verified** on `https://pawpi-production.up.railway.app/{privacy,terms,eula,support}` (200, on-brand,
ES↔EN, correct title/canonical/footer). ⚠️ **Prerequisite before the `pawpi.info` URLs resolve:**
`pawpi.info` DNS points at one.com (`46.30.211.38`), and the Railway `PawPi` service has no custom
domain — add `pawpi.info`/`www` as a Railway custom domain, then repoint one.com DNS to the CNAME
target (apex may require `www` + redirect on one.com). Human infra task.

## As-built — PR2 (2026-08-17, PR #428, merged `7273e7dd`)

Homepage: `src/app/page.jsx` now renders `src/components/home/HomePage.jsx` for logged-out visitors
(logged-in → `/provider` unchanged). Hero positioning line es/en, "what PawPi is" feature strip, three
audience entry points (owners / walkers+providers / vets+businesses), **honest App Store CTA**
("Próximamente en el App Store / Coming soon" — a non-link pill), footer with legal cross-links.
`src/lib/home/meta.js` (`buildHomeMeta`) adds Open Graph + Twitter tags on top of the shared
title/description/canonical/hreflang. `public/robots.txt` + `public/sitemap.xml` served at root
(`/`, `/privacy`, `/terms`, `/eula`, `/support` with es-AR/en/x-default). `usePublicChrome()` paints
`<html>`/`<body>` cream (fixes a dark band when scrolling the transparent-body app) — applied to the
homepage and the PR1 legal pages. Tests in `src/app/page.test.jsx`; web vitest 2094→**2099**.

**Verified live** on `https://pawpi-production.up.railway.app/` (hero, cards, ES↔EN, title/OG/canonical,
`/robots.txt` + `/sitemap.xml` as real files). No `og:image` yet (clean `summary` card) — add a raster
brand asset later. Same `pawpi.info` domain-wiring prerequisite as PR1.

**WEB1 status: COMPLETE (2/2 PRs).** The only thing standing between this and the App Store URLs going
live at `pawpi.info` is the domain-pointing (Railway custom domain + one.com DNS) — a human infra task.

## Deferred (separate track, NOT this ticket)
- The full marketing landing-page system (paseadores V5 scaled to many es-AR/en SEO URLs, hreflang at
  scale, real screenshots) — its own project per `pawpi-web-handoff` (the "move to reusable Next.js/RR
  system" decision). This ticket is only the launch-required legal/support pages + one homepage.
