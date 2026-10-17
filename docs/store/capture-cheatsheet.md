# PawPi — screenshot capture cheat-sheet (run on your Mac)

```bash
# 1. Seed the demo account (Mango, follows, feed, reminders, health)
cd anything/apps/web && npm run seed:demo

# 2. Launch the app in the iOS Simulator on a 6.9" device (iPhone 16 Pro Max)
cd ../mobile && npx expo run:ios

# 3. Set the Simulator to Spanish so the UI is ES:
#    Simulator app → Ajustes → General → Idioma y región → Español (Argentina) → relaunch PawPi
#    (or use PawPi's in-app language toggle)

# 4. Clean the status bar (9:41, full battery/signal)
xcrun simctl status_bar booted override --time 9:41 --batteryLevel 100 --cellularBars 4 --wifiBars 3

# 5. Log in:  augusto+demo@pawpi.info   (password in scripts/demo-seed/spec.mjs)
```

## Capture these 9 (Cmd-S saves the PNG). Name them exactly:
| File | Screen |
|---|---|
| `01-profile.png` | Perfil de Mango + grilla de momentos |
| `02-feed.png` | Feed — momento del día, patitas/ladridos, racha 🔥 |
| `03-birthday.png` | Cumpleaños/hito — cinta + confeti (see note) |
| `04-share.png` | "Compartir una tarjeta" → la tarjeta con foto + marco de marca |
| `05-health.png` | Salud → Hoy (recordatorios del día) |
| `06-vet.png` | Historia clínica (peso, vacunas, medicación) |
| `07-services.png` | Servicios — Northside, pantalla de reservar |
| `08-community.png` | Comunidad — foro / eventos / paseos |
| `09-adoption.png` | Adopción — grilla cercana |

**Screen 3 (birthday):** in the demo account, Dog Profile → set Mango's birthday to **today**,
capture the moment with the ribbon + confetti, then revert the date.

Drop the 9 files in `docs/store/raw/` and rebuild, or send them to me and I'll build + return them.
