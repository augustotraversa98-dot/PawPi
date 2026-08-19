# PawPi mobile — AI agent guide

Brand identity is governed by the repo-root brand kit: **`../../../pawpi-brand-kit/`**
(`BRAND-GUIDELINES.md` + `pawpi-logo-rules.json` + `logo/*.svg`). Read it before any visual work.

## The paw mark in-app
- Render the PawPi mark ONLY via `<PawMark size={…} color={…} />` from `@/components/ui`
  (`src/components/ui/PawMark.jsx`) — it places the verbatim brand SVG. Never use the 🐾 emoji as the
  logo, and never re-inline the paw paths anywhere else.
- Pass only `size` (aspect ratio is fixed: height = 0.947 × width). `color` must be an approved brand
  value — coral #FF6F61, warm brown #3B241B, or cream #FFF7EF (see `COLORS` in `src/constants/theme`).
- App icon / splash / adaptive-icon / favicon in `assets/images/` are generated from the brand kit
  (`pawpi-brand-kit/logo/pawpi-app-icon.svg` + `pawpi-paws-cream.svg`). Regenerate from those SVGs —
  do not hand-edit or trace. `app.json` already references these filenames.

## Copy
All user-facing strings ship EN + ES (`src/i18n/locales/en.json` + `es.json`). Product name is "PawPi".
