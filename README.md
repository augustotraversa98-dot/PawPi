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

1. **Find your Mac's LAN IP.** In a terminal:
   ```bash
   ipconfig getifaddr en0
   ```
   (If that prints nothing, try `en1`, or read it from  System Settings → Wi-Fi → Details → IP address.)
   It looks like `192.168.x.x`. Example used below: `192.168.178.80`.

2. **Point the mobile app at that IP.** Edit `anything/apps/mobile/.env` and set all three
   to `http://<YOUR_MAC_IP>:4000` (host without the scheme):
   ```
   EXPO_PUBLIC_BASE_URL=http://192.168.178.80:4000
   EXPO_PUBLIC_PROXY_BASE_URL=http://192.168.178.80:4000
   EXPO_PUBLIC_HOST=192.168.178.80:4000
   ```
   `EXPO_PUBLIC_API_URL` in that file is just a reminder of the canonical IP — keep it in sync.
   > These are device/network-specific, and `.env` is gitignored — update them whenever your
   > Wi-Fi network (and thus your IP) changes.

3. **Start the backend** (binds `0.0.0.0:4000` so the phone can reach it). One command from the repo root:
   ```bash
   ./scripts/dev-backend.sh
   ```
   It prints your LAN IP, frees port 4000 if it's already in use, and starts the web app.
   (Equivalent manual steps: `cd anything/apps/web && bun run dev` — the bind is configured in
   `apps/web/vite.config.ts` → `server.host: '0.0.0.0'`, `server.port: 4000`.)

4. **Confirm the backend is reachable from the phone.** In Safari **on the iPhone**, open:
   ```
   http://192.168.178.80:4000
   ```
   If the app loads, the network path works. (If it times out: same Wi-Fi? macOS firewall
   blocking incoming connections? Correct IP?)

5. **Start Metro and reload the app.** Because `EXPO_PUBLIC_*` values are inlined at build
   time, restart Expo with a cleared cache after editing `.env`:
   ```bash
   cd anything/apps/mobile && npx expo start -c
   ```
   Then reload the app in Expo Go. The EntryPoint pet check and photo uploads should now work.
