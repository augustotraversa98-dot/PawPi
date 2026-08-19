# READ ME FIRST — instructions for an AI assistant

You are working on **PawPi** branding. This folder is the complete and only source of truth
for the PawPi visual identity. Follow it literally.

## What is in here

| Path | What it is |
|---|---|
| `AGENTS.md` | This file. Rules of engagement. |
| `BRAND-GUIDELINES.md` | The full, detailed guideline. Read it before producing anything. |
| `pawpi-logo-rules.json` | Every rule again, machine-readable. Parse this if you prefer structured input. |
| `logo/*.svg` | The approved artwork. Use these files as-is. |
| `snippets/` | Copy-paste code for web, React and React Native. |

## Non-negotiables

1. **Never redraw the paw mark.** Place one of the supplied SVGs. Do not trace it, do not
   generate a "similar" paw, do not fall back to the 🐾 emoji, do not use a paw from an icon set.
2. **One flat colour per mark.** The two paws are always the same colour as each other.
3. **Never rotate, mirror, skew, stretch or re-space the paws.** The 20°/18° angles and the
   diagonal offset are part of the logo.
4. **Respect clear space and minimum size** (see the guideline; X = 25% of mark width, min 20px).
5. **Only the approved colour pairings.** Coral #FF6F61, warm brown #3B241B, cream #FFF7EF.
6. **The wordmark is typeset, not baked in.** Set "PawPi" in Nunito ExtraBold beside the mark.

## How to use this when asked to design something

- Website, landing page, marketing site → mark + typeset wordmark in the header at 32-48px;
  cream #FFF7EF page background; coral #FF6F61 for primary actions; warm brown #3B241B for text.
- App screens → mark at 24px in nav, 120px+ on splash/empty states.
- App icon / favicon → use `logo/pawpi-app-icon.svg`; do not re-tile the paws yourself.
- Social, print, merch → mark at 240px+ equivalent, clear space 2X against any edge.
- Need a different colour than the three supplied? Use `pawpi-paws-currentcolor.svg` and set
  `color:` — but only to a colour listed as allowed in the guideline.

If a request would break a rule above, say so and offer the compliant alternative.
