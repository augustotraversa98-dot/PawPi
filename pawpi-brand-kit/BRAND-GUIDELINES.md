# PawPi — Brand Guidelines
**Version 1.0 · Paw mark, colour, type, spacing**

---

## 1. The mark

Two paw prints stepping to the right. Triangular pad, four teardrop toes, no outline.
They are one locked piece of artwork: the 20° / 18° rotations, the scale and the diagonal
offset between the two paws never change.

- Canvas: `viewBox="0 0 190 180"`
- Aspect ratio: 1.056 : 1 → **height = 0.947 × width**
- Spacing unit: **X = 0.25 × mark width**

Always place the supplied SVG. Never redraw, retrace, auto-trace, or substitute the system 🐾 emoji.

### Files
| File | Use |
|---|---|
| `logo/pawpi-paws-brown.svg` | Default. Warm brown #3B241B on light surfaces. |
| `logo/pawpi-paws-coral.svg` | Expressive / marketing. Coral #FF6F61 on light surfaces. |
| `logo/pawpi-paws-cream.svg` | Reversed. Cream #FFF7EF on coral or brown. |
| `logo/pawpi-paws-currentcolor.svg` | Inherits CSS `color`. For themed UI only. |
| `logo/pawpi-app-icon.svg` | Coral tile, cream mark, 512 canvas, radius 114. |
| `logo/pawpi-lockup-mark.svg` | Coral mark for composing the lockup. |

---

## 2. Clear space

Reserve **1X on all four sides**, where **X = 25% of the mark's width**.
Against a page edge, fold, screen bezel or another logo, reserve **2X**.

Nothing enters that box — no text, no rule, no image, no container edge, no button padding.

| Mark width | 1X | 2X |
|---|---|---|
| 20px | 5px | 10px |
| 24px | 6px | 12px |
| 32px | 8px | 16px |
| 48px | 12px | 24px |
| 72px | 18px | 36px |
| 120px | 30px | 60px |
| 240px | 60px | 120px |

---

## 3. Size

**Minimum 20px wide on screen. Minimum 8mm wide in print.** Below that the toes merge.

Use these steps rather than arbitrary values:

| Width | Context |
|---|---|
| 20px | Inline with body text, list bullets, dense tables |
| 24px | Tab bar, top nav, toolbar |
| 32px | Favicon, avatar chip, small badge |
| 48px | Button, notification badge, list-row leading icon |
| 72px | Card header, section marker, modal header |
| 120px | Splash screen, empty state, onboarding — or 34% of container width, whichever is larger |
| 240px+ | Hero, poster, packaging, print |

**Scale proportionally only.** Never set `width` and `height` independently; set one and let
the other follow, or use `height:auto`.

### Behaviour when small
- **Under 32px** — one flat colour, no wordmark beside it, no container ring, no shadow.
- **Under 20px** — do not use the mark at all. Set the word "PawPi" in Nunito ExtraBold,
  or use a plain coral 8px dot.

### Behaviour when large
- **Over 240px** the mark may bleed off one edge of a layout, provided at least one full paw
  and 60% of the second remain visible, and the clear space holds on the remaining sides.
- Never add texture, photo fill, or a repeating pattern inside the paws at any size.

---

## 4. Colour

```
coral        #FF6F61   primary, actions, expressive mark
warm brown   #3B241B   default mark, all body and heading text
cream        #FFF7EF   page background, reversed mark
card         #FFFCF8   raised surfaces
sand         #F8EBDD   quiet fills, code/label chips
peach        #FFD9B3   accents, progress, highlights
muted brown  #7A6254   secondary text, captions
border       #F0E0D0   hairlines and card borders
```

### Approved pairings (nothing else)
| Mark | On background |
|---|---|
| #3B241B | #FFF7EF · #FFFCF8 · #F8EBDD · #FFD9B3 |
| #FF6F61 | #FFF7EF · #FFFCF8 · #F8EBDD |
| #FFF7EF | #FF6F61 · #3B241B |

- **One flat fill.** The two paws are never different colours from each other.
- Minimum contrast between mark and background: **3:1**.
- Over photography: cream mark over a #3B241B scrim at 40% opacity. Never place the mark
  directly on an unmanaged photo.
- No gradient, no stroke, no drop shadow, no glow, no bevel, no outline version.

---

## 5. Typography

- **Nunito** — the whole identity. ExtraBold 800 for the wordmark and headings
  (letter-spacing −0.02em), 400/600 for body at line-height 1.55.
- **JetBrains Mono** — optional, for small uppercase eyebrow labels only:
  10–12px, letter-spacing 0.18em, colour #7A6254.

```html
<link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
```

---

## 6. Lockup

Mark to the left, wordmark "PawPi" to the right.

- Wordmark: Nunito ExtraBold 800, letter-spacing −0.02em, colour #3B241B (or cream when reversed).
- **Gap between mark and wordmark = 0.35 × mark width.**
- **Wordmark cap height = 0.55 × mark height.**
- The wordmark's optical centre aligns to the vertical centre of the mark's bounding box.
- **Stacked variant:** mark above, wordmark below, gap 0.4 × mark width, both centred.
- The lockup is never used below 32px mark width — use the mark alone.

The shipped SVG is **mark-only**; the wordmark is typeset live so it always renders in the real
font. If you need a font-independent file, convert the text to outlines yourself.

---

## 7. App icon

- Canvas 512 × 512, corner radius 114 (22.3%).
- Background coral #FF6F61, mark cream #FFF7EF at 62% of canvas width, optically centred.
- Export sizes: 1024, 512, 192, 180, 120, 60.
- Never put the brown mark on the icon tile, and never use a cream tile with a coral mark.

---

## 8. Radii and surfaces

Chip 8px · card 14px · panel 20px · pill button 999px · app icon 22.3%.
Cards: #FFFCF8 on #FFF7EF with a 1px #F0E0D0 border. No shadows.

---

## 9. Never

- Rotate, mirror, skew or re-angle either paw.
- Change the offset, gap or relative scale of the two paws.
- Colour the two paws differently from each other.
- Add stroke, outline, shadow, gradient, glow or bevel.
- Crop or intrude on the clear-space box.
- Substitute the system 🐾 emoji or any third-party paw icon.
- Stretch, condense or distort the proportions.
- Tile the mark as a repeating pattern below 48px.
- Place the mark inside a circle, ring, or badge that touches the clear-space box.
- Animate the paws independently of one another (fade or scale the pair as one group only).
