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
