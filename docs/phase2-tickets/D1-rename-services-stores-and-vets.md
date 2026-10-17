# Ticket D1 — Rename Services → "Stores & Vets" + scope its discover categories

> **Run-note (AUTONOMOUS).** Read `WAVE-CD-README-requests-and-nav.md` first. Fresh branch off `origin/main`; gates green (mobile jest; web vitest + integration unaffected) → squash-merge → continue to D2. **No migration.** Mobile-only. i18n EN+ES. Keep deep links working.

## Goal
Rename the owner **Services** tab to **"Stores & Vets"** and **narrow its discover categories** to the non-care set, so care providers (walkers/daycare/sitters/trainers) move to the Care hub (D2). DECISION LOCK 6. This is a config + label change over the already-unified discovery hub — do not rebuild discovery.

## Context — what exists
- Tab label: i18n `tabs.services` (owner tab bar `(tabs)/_layout.jsx`). The Services tab shell is `(tabs)/services.jsx` (`[Discover | My Activity]`); Discover = `components/Services/ServicesDiscovery.jsx`, whose **category taxonomy lives inline as `SERVICE_CATEGORIES` / `PLACE_CATEGORIES`** (category key → labelKey + backing capability; multi-select client-side union).
- Deep links use `?category=<key>` (aliases resolve legacy keys) via `service/discover.jsx`.

## Changes
1. **Extract the taxonomy to a shared constant** — move `SERVICE_CATEGORIES` / `PLACE_CATEGORIES` (+ the key→capability / key→labelKey maps) out of `ServicesDiscovery.jsx` into e.g. `constants/serviceCategories.js`, exporting named groups so both hubs read one source: `STORES_VETS_CATEGORIES` (vet [`vet`/`groomer`/`telehealth`], shops [`shop`/`pharmacy`], insurance, adoption, transport) + `PLACE_CATEGORIES`, and `CARE_CATEGORIES` (`walker`/`daycare`/`sitter`/`trainer`) for D2. `ServicesDiscovery` accepts the allowed category set as a prop (default = Stores&Vets ∪ places) so D2 can reuse it with `CARE_CATEGORIES`.
2. **Scope the Services hub** to `STORES_VETS_CATEGORIES` + places — the care category chips no longer appear here.
3. **Rename** `tabs.services` → **"Stores & Vets"** (EN) / **"Tiendas y Veterinarias"** (ES, or a tighter neutral rendering) — plus any header/title strings on the Services shell.
4. **Deep-link safety:** a legacy `?category=walker` (etc.) landing on Stores & Vets should **redirect/alias to the Care hub** once D2 exists; for D1, at minimum it must not crash — resolve unknown/该-removed categories to "All" gracefully. (D2 wires the care deep-links to the Care hub.)

## Acceptance criteria
- The owner tab reads **"Stores & Vets"**; its Discover shows only vet/shops/places/insurance/adoption/transport — **no** walker/daycare/sitter/trainer chips.
- The taxonomy is now a shared constant consumed via a prop (ready for D2).
- Legacy care deep-links don't crash (resolve to All or a safe state).
- **Gates:** mobile jest green (update `services.test.jsx` category expectations); web vitest + integration unaffected. No migration.

## MVP decisions (locked; Tats end review)
- Care categories leave Services entirely (not duplicated). Label "Stores & Vets" / ES rendering is i18n-only and trivially changed at review.
