# PawPi — App Store screenshot storyboard

Eight hero screens, in order, with the marketing caption to overlay on each. Shoot against the seeded
demo account (`demo@pawpi.app`, see `docs/demo-seed-plan.md`). Apple shows the **first 2–3** in search
results, so screens 1–3 carry the most weight — lead with emotion + the core value.

## How to capture (no Apple Developer account needed)

- Run in the **iOS Simulator** via Expo (`npx expo run:ios` or the dev client) — simulator builds don't
  require enrollment. Use a **6.9"/6.7"** device (e.g. iPhone 16 Pro Max) for the required 1290×2796 set.
- Clean the status bar: `xcrun simctl status_bar booted override --time 9:41 --batteryLevel 100 --cellularBars 4 --wifiBars 3`.
- Add the caption text as an overlay band above the screenshot (Figma, the macOS Screenshot/Preview
  tools, or `fastlane frameit`). Keep a consistent PawPi-warm background + font across all eight.
- Re-shoot the same eight in Spanish (the app supports ES) if you publish a localized listing.

## The eight screens

| # | Screen | What's on it (seeded) | Caption (EN) | Caption (ES) |
|---|---|---|---|---|
| 1 | **Dog profile + moments** | Mango's profile photo, bio, stats, the 6-photo moments grid | **Your dog's whole world, in one app** | **El mundo de tu perro, en una sola app** |
| 2 | **Feed / daily moment** | A single moment post (e.g. lake photo), paws + barks, 🔥 streak | **Share every wag** | **Comparte cada momento** |
| 3 | **Health → Today** | Today's reminders: breakfast, dinner, walk, paws check, vet exam | **Never miss a meal, walk, or med** | **Comida, paseo y medicación, sin olvidos** |
| 4 | **Vet Record** | Weight chart, vaccinations, current meds, medical profile | **Every vet record, organized** | **Todo el historial veterinario, ordenado** |
| 5 | **Services / booking** | Northside Veterinary Clinic — cover, services, prices, rating, map | **Book trusted vets, groomers & more** | **Reserva veterinarios, peluqueros y más** |
| 6 | **Community** | Forum / events / walks-with-buddies | **Find your local dog community** | **Encuentra tu comunidad canina** |
| 7 | **Adoption browse** | The nearest-first listing grid | **Find a new best friend** | **Encuentra un nuevo mejor amigo** |
| 8 | **Emergency card** | The printable/shareable medical card | **Ready for anything** | **Preparado para cualquier cosa** |

## Notes

- If you only ship 5 screenshots, use **1, 3, 4, 5, 2** (profile → health → records → services → social).
- Health screens must keep the non-diagnostic disclaimer visible in-frame (it already renders).
- Optional 9th / app-preview video: a 15–20s capture walking profile → today → booking is a strong
  conversion lift, but not required for v1.
- Subtitles under each headline are optional; the table keeps them short so they read on a phone.
