# PawPi — App Store & website screenshot pipeline

Turns 9 raw iPhone captures into the full App Store set **and** a reusable website
asset library, all in the PawPi brand frame. Spanish-primary (Argentina store); English built too.

## One-time
Assets (Nunito fonts + coral paw) live in `assets/`. Deps: `pip install pillow cairosvg`.

## Flow
1. Capture the 9 screens (see `capture-cheatsheet.md`) in the **Spanish** iOS Simulator against
   the seeded demo account. Name them `01-profile.png … 09-adoption.png`.
2. Drop them in `raw/`.
3. `python3 build_shots.py`

## Outputs (`out/`)
- `appstore/es/6.9/` + `appstore/es/6.7/` — store-ready, captioned (ES). Same for `en/`.
- `website/clean/`  — rounded screenshot, no caption (drop into any web layout).
- `website/device/` — screenshot in a device bezel, transparent background (hero mockups).
- `website/framed/es|en/` — the branded caption frame, for feature sections / social.
- `contact-es.png`, `contact-en.png` — the whole set on one sheet for review.

Missing captures fall back to a labelled placeholder, so the layout is always previewable.
The 9 areas (profile, feed, birthday, share, health, vet, services, community, adoption)
double as the website's feature sections — one capture, many reuses.
