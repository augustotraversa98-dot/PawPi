# PawPi anonymous usage telemetry — privacy description

Status: **draft for the owner to review**. Ships to users from app build 26 (v1.0.2, in App Store review; build 25 was never distributed). The server endpoints went live earlier and idled until then.
Technical contract: `docs/observability/night-run/01-TELEMETRY-CONTRACT.md`. Allowlist in code: `anything/apps/web/src/lib/telemetry/registry.js`.
Operations: `docs/observability/OPERATIONS.md` section 3.4 (client telemetry ingest).

> **HUMAN ACTIONS (nothing in this file is applied automatically).** Sections 4 and 5 are drafts for a person to paste into the
> live privacy policy (section 6 records the App Store Connect declaration as published with build 26). The night run did NOT edit the live policy page, `docs/legal/*`, or
> `anything/apps/web/src/lib/legal/*`.

## 1. What is collected

Anonymous product-analytics events, only while "Help improve PawPi" is ON (the default):

- **Identifiers, random and not tied to an account:** `install_id` (random UUID created on first launch, kept in the device secure store,
  deleted when the user turns the setting off) and `session_id` (random UUID per foreground session).
- **App/device context:** app version, build number, platform (iOS/Android/web), OS major version (e.g. `17`), UI language (e.g. `es-AR`).
- **Events** (from a fixed allowlist, see the contract): session start/end (bucketed duration), screen views (screen template such as
  `/health`, never a URL with ids), taps on registered controls (a stable key such as `tab_services`, never the visible label), form
  steps (form + step key + view/complete/abandon/error), API calls (feature area, route template, HTTP status class, bucketed latency),
  errors (kind, screen, short code), unexpected navigation redirects (from, to, reason), startup and screen-ready timings (buckets),
  feature usage (registered feature key), funnel steps (registered funnel + step), sign-in/session diagnostics (`auth_diag`: one fixed
  key such as `session_cleared_code` or `keychain_write_failed`; never a token, id or e-mail), and a single `opt_out` event.
- Each event carries `t` (milliseconds since the session started) and the server receive time.
- Client behaviour (mobile, build 26): events are validated against the allowlist ON THE DEVICE before they are queued (anything the server
  would drop never leaves the phone); `session_end` is sent each time the app goes to the background and carries the length of that
  foreground stretch (a new `session_id` starts after 30 minutes in the background); API calls are recorded as a feature area, a route
  TEMPLATE taken from a fixed list of the server's routes (an unlisted path is reported as `unknown`, never a path with an id/handle),
  the status class and a latency bucket, and calls to the telemetry endpoints themselves are not recorded; errors carry only the error
  CLASS name (e.g. `TypeError`), never the message or stack; the telemetry request carries no account token, no cookies and no
  platform identity headers (it uses the platform's original `fetch`, not the app's authenticated one).
- Nothing is sent until the app has read `GET /api/telemetry/config` successfully and it says `enabled: true` (fail closed: while the
  config cannot be read, events wait in a bounded in-memory queue of at most 200 events, oldest dropped); `sampleRate` is applied once per session.

## 2. What is NOT collected

Never collected, enforced by an allowlist on the server (an unknown event, prop, screen, target or any prop named like
email/name/pet/handle/user/address/phone/text/password/token/lat/lng/location/ip is dropped, not stored):

- account id / auth id, email, name, phone, password, tokens, handle
- pet id / name / photos / health data, post or comment text, messages, search text, reviews, form field contents
- addresses, precise or coarse location, IP address (it is used in memory to rate-limit abuse as a salted hash and is never stored or logged)
- advertising id (IDFA), vendor id (IDFV) or any device identifier; no cross-app or cross-site tracking; no third-party analytics SDK
- raw URLs, query strings, deep-link parameters (only route templates)

Because `install_id` is random and never linked to an account, PawPi cannot tell which person an install belongs to, and the data
cannot be joined to account data.

## 3. Retention and where it lives

- **Metrics** (counters/histograms by low-cardinality labels such as screen template and app version; no `install_id`/`session_id`):
  Grafana Cloud. Grafana's published Free-tier retention for metrics is 14 days (the ~13 months once quoted here is the paid Pro
  tier, not Free). **Not verified for PawPi's actual plan**: confirm in Grafana Cloud before stating any figure anywhere.
- **Event log lines** (one JSON line per event, with `install_id`/`session_id`): Grafana Cloud Loki, only when `GRAFANA_LOKI_*` is
  set on Railway. Grafana's published Free-tier retention for logs is 14 days. **Not verified for PawPi's actual plan.**
- **No retention period is stated in the live privacy policy** on purpose (the existing general retention wording stays); do not
  add one until the plan's retention has been confirmed.
- The server does not keep events anywhere else (no database table).
- **Remote kill switch:** `GET /api/telemetry/config` -> `{ enabled, sampleRate }`; setting `TELEMETRY_INGEST_ENABLED=false` on the
  server stops collection within minutes and discards anything still sent.

## 4. How a user opts out (HUMAN ACTION: make sure the in-app copy and support page say the same)

Settings -> **Help improve PawPi (anonymous)** -> switch OFF. Effect: no further events are sent, the offline queue is cleared, the
`install_id` is deleted from the device, and one final `opt_out` event is sent. Switching it back on creates a fresh random
`install_id` (no link to the old one). The OFF choice is stored in two places (app storage and the device secure store) so that signing
out or deleting the account, which clears app storage, does not silently turn collection back on.
HUMAN NOTE: the `install_id` lives in the iOS Keychain / Android Keystore-backed secure store; on iOS the Keychain can outlive an app
uninstall, so "delete the app" is NOT a guaranteed way to drop the id on iOS: the in-app switch is. Say this accurately in the policy/support copy.

## 5. Drafted privacy-policy paragraph (HUMAN ACTION: legal review, then add to the live policy in both languages)

**English**

> **Anonymous usage and diagnostics data.** To find and fix problems and to understand which parts of PawPi are useful, the app
> sends anonymous usage and diagnostics events (for example which screens are opened, which features are used, how long screens
> take to load, and technical errors) together with the app version, operating-system version, platform and language. These events
> are linked to a random identifier generated on your device that is not connected to your account, name, email, pets, content,
> location or advertising identifier, and we do not use them for advertising or to track you across other companies' apps or
> websites. You can turn this off at any time in Settings -> "Help improve PawPi (anonymous)"; doing so stops collection and
> deletes the random identifier from your device.

**Español**

> **Datos anónimos de uso y diagnóstico.** Para detectar y corregir problemas y entender qué partes de PawPi son útiles, la app
> envía eventos anónimos de uso y diagnóstico (por ejemplo, qué pantallas se abren, qué funciones se usan, cuánto tardan en cargar
> las pantallas y errores técnicos) junto con la versión de la app, la versión del sistema operativo, la plataforma y el idioma.
> Estos eventos se asocian a un identificador aleatorio generado en tu dispositivo que no está vinculado a tu cuenta, nombre,
> correo, mascotas, contenido, ubicación ni identificador publicitario, y no los usamos para publicidad ni para rastrearte en apps
> o sitios web de otras empresas. Puedes desactivarlo en cualquier momento en Ajustes -> "Ayudar a mejorar PawPi (anónimo)"; al
> hacerlo se detiene la recopilación y se elimina el identificador aleatorio de tu dispositivo.

(This draft deliberately states no retention period. The live policy (section 5 of `privacy.en.md` / `privacy.es.md`, PR #621) also
states none; if a figure is ever added, it must come from a verified Grafana Cloud plan and match section 3.)

## 6. App Store Connect "App Privacy" answers (PUBLISHED with build 26)

This is the declaration published in App Store Connect for build 26 (v1.0.2); `docs/app-store-privacy-data-map.md` (#608) mirrors it. It
replaces the earlier "Diagnostics / Usage / Crash Data: None (no analytics SDK)" answer.

Global: **Do you or your third-party partners use data for tracking?** -> **No** (unchanged; `NSPrivacyTracking: false`, no ATT prompt).

Declared data types, each answered the same way:

| Category | Data type | Collected | Linked to the user's identity? | Used for tracking? | Purpose |
|---|---|---|---|---|---|
| Usage Data | **Product Interaction** (screen views, taps, feature and funnel usage) | Yes | **No** | **No** | Analytics |
| Diagnostics | **Performance Data** (startup, screen-ready, API latency buckets) | Yes | **No** | **No** | Analytics |
| Diagnostics | **Other Diagnostic Data** (app/OS version, platform, language, API status classes, navigation anomalies, client error class names) | Yes | **No** | **No** | Analytics |

**Crash Data is NOT declared.** The app reports JS client errors by error *class name* only (e.g. `TypeError`; never the message or the
stack; these fall under Other Diagnostic Data), collects no native crash logs, and ships no crash-reporting SDK (`@sentry/react-native` is a
no-op shim). Do not add a Crash Data row unless that changes.

Rules for the form: for each type choose "Data is NOT linked to the user's identity" and "Data is NOT used to track the user";
leave Advertising/Third-party advertising/Developer's advertising unchecked. Not declared (not collected by telemetry): Crash Data (see above), Identifiers
(the random `install_id` is app-generated, never tied to the account or device identifiers, and not shared with third parties; if
Apple review pushes back, the conservative alternative is to also tick **Identifiers -> Device ID**, not linked, not tracking, purpose Analytics),
Location, Contact Info, User Content, Search History, Browsing History.

Also re-check, when reviewing a future build: the iOS privacy manifest (`PrivacyInfo.xcprivacy`) declared collected data types match the table above,
and the App Store "Privacy Nutrition Label" shows Usage Data + Diagnostics as "Data Not Linked to You".

## 7. Checklist for the human owner
- [ ] Legal review of section 5, then publish in EN + ES on the live privacy policy.
- [x] Update `docs/app-store-privacy-data-map.md` (#608) and App Store Connect (section 6) with build 26. *Done: published declaration = Product Interaction, Performance Data, Other Diagnostic Data (Analytics, not linked, not tracking); no Crash Data.*
- [ ] Confirm Grafana Cloud retention on the current plan (published Free tier: metrics 14 days, logs 14 days); only then consider stating a figure in sections 3 and 5.
- [x] Set `GRAFANA_LOKI_URL/USER/TOKEN` on Railway for event log lines (metrics work without them). *Done: the variables are set in production and event logs reach Grafana (verified in Grafana by the owner, 2026-10-05).*
- **Traces (note, 2026-10-16):** trace spans are scrubbed by `SpanScrubber` (#622) before export — no client IPs, user-agents (coarsened), query strings or raw id paths. A leftover `peer.ipv4` attribute was reported on traces; as of 2026-10-16 the scrubber drops it and every other IP-bearing attribute (`peer.*`, `client.*`, `net.peer.*`, `net.sock.*`, `network.peer.*`, `http.client_ip`, and `x-forwarded-for` / `x-real-ip` header captures) before export. (The earlier note that `peer.ipv4` was only Grafana's own server address was not verified and is withdrawn.)
