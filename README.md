# PawPi

Monorepo-style layout (not a true monorepo — two independent apps):

- `anything/apps/web` — React Router v7 + Vite app that also serves the `/api/*` backend (Hono). Uses **bun**.
- `anything/apps/mobile` — Expo / React Native app. Uses **npm**.

See [ARCHITECTURE.md](ARCHITECTURE.md) for a full inventory and [supabase/SCHEMA_NOTES.md](supabase/SCHEMA_NOTES.md) for the database.

## Running locally on a physical iPhone

The mobile app (Expo Go on a real iPhone) talks to the backend running on your Mac.
On a phone, `localhost` means *the phone itself*, so the app must point at your Mac's
**LAN IP**, not `localhost`. Symptoms when this is wrong: the EntryPoint pet check fails
with "Could not connect to the server" and photo uploads fail with "Network request failed."

**Prerequisite:** the iPhone and the Mac must be on the **same Wi-Fi network.**

### Quick start (one command)

The mobile `.env` must point at your Mac's LAN IP (not `localhost`), and that IP
changes whenever you switch Wi-Fi networks. **You no longer edit `.env` by hand** —
the scripts auto-detect the current IP and rewrite it for you.

**Easiest:** double-click **`Start PawPi.command`** in Finder (first run: approve the
one-time macOS "Automation" prompt). It stops any old servers and opens the backend +
Metro in their own windows. Equivalent from a terminal at the repo root:

```bash
./scripts/dev.sh
```

Then open the project in **Expo Go** on your iPhone using the `exp://…` URL shown in
the Metro window. **Run this same command after every Wi-Fi / network change.**

#### Or start the two sides manually

**Terminal 1 — backend** (web app + `/api`, binds `0.0.0.0:4000`):
```bash
./scripts/dev-backend.sh
```

**Terminal 2 — mobile** (syncs the IP, then starts Metro with a cleared cache):
```bash
./scripts/dev-mobile.sh
```

> Why the cache clear? `EXPO_PUBLIC_*` values are inlined at build time, so Metro
> must restart with `-c` after the IP changes — `dev-mobile.sh` does this for you.

### What the scripts do

- **`Start PawPi.command`** / **`scripts/dev.sh`** — stops old servers and opens both
  `dev-backend.sh` and `dev-mobile.sh` in their own Terminal windows. The one-command launcher.
- **`scripts/sync-mobile-ip.sh`** — detects your LAN IP (`en0`/`en1`) and rewrites the four
  IP-dependent keys in `anything/apps/mobile/.env` (`EXPO_PUBLIC_BASE_URL`,
  `_PROXY_BASE_URL`, `_HOST`, `_API_URL`). Idempotent; leaves the rest of the file untouched.
- **`scripts/dev-backend.sh`** — runs the IP sync, frees port 4000 if it's in use, and starts
  the web backend. (Manual equivalent: `cd anything/apps/web && bun run dev` — the
  `0.0.0.0:4000` bind lives in `apps/web/vite.config.ts`.)
- **`scripts/dev-mobile.sh`** — runs the IP sync, then `cd anything/apps/mobile && npx expo start -c`.

`.env` is gitignored, so these edits stay local to your machine.

### Troubleshooting

If the EntryPoint pet check fails with "Could not connect to the server" or photo uploads
fail with "Network request failed", the phone can't reach the backend:

1. **Same Wi-Fi?** The iPhone and Mac must be on the same network.
2. **Confirm reachability** — in Safari **on the iPhone**, open `http://<YOUR_MAC_IP>:4000`
   (the scripts print the detected IP). If it loads, the network path works.
3. If it times out: check the macOS firewall isn't blocking incoming connections, and that
   `./scripts/dev-mobile.sh` was restarted after the network change (stale Metro cache = old IP).
4. **Manual IP lookup**, if ever needed: `ipconfig getifaddr en0` (or `en1`).
