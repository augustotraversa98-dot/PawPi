# Notifications v2 — design

Follows `docs/notifications-audit.md` (read it first: findings 3, 4, 5, 6, 7, 8, 9, 10 are what this fixes).
Written in PR 3a; PR 3b and 3c update the "status" lines as they land.

## Principles

1. **One server-side flag, default OFF: `NOTIF_V2_ENABLED`.** Absent / empty / anything but `1|true|on|yes|enabled`
   = off. Read on every call (`utils/notifV2.js`), so it is a Railway variable + restart, nothing else.
2. **Merging changes nothing in production.** The migrations (`0131`, `0132`) are applied by hand *after* the code
   merges. With the flag OFF no v2 code path queries a v2 table, column or function, and the existing endpoints,
   senders and push behaviour are byte-for-byte what ran before. With the flag ON but a migration not yet applied,
   every v2 query runs through `softV2` (a SAVEPOINT + try/catch): on `42P01 / 42883 / 42703` it returns a fallback
   (= today's behaviour) and remembers for 60 s not to ask again. A v2 query can never poison the actor's request
   transaction or turn a working action into a 500.
3. **No push without consent / outside the owner's rules.** With the flag ON, no push goes to a user who disabled
   that category, is in quiet hours, is over their daily cap, or has an invalid token. Promotional messages
   (App Store guideline 4.5.4) are opt-in: OFF until the owner turns them on.
4. **Friendly copy, no guilt, no diagnostic health wording**, EN + ES (es-AR voseo). New tables: `ENABLE` +
   `FORCE` RLS, `owner_user_id = user_profiles.id`, own-row policies (see `CLAUDE.md` migration rules).

## What each PR does

### PR 3a — design + foundation (this doc; migration `0131`) — status: built

| Piece | What | Flag-OFF behaviour |
|---|---|---|
| Timezone writer | `PUT /api/user-profile/timezone {timezone}`: validated (IANA shape + JS runtime + `pg_timezone_names`), owner-scoped. Mobile `i18n/timezoneSync.js` sends the device zone on app entry and when it changes. Consumers keep `COALESCE(timezone,'America/Buenos_Aires')`, so users who never sync are unchanged | 200 `{skipped:"disabled"}`, **no query** (writing the column would move every owner's day boundary) |
| Invalid-token handling | `device_push_tokens.invalid_since / last_seen`; `app_recipient_valid_push_tokens` skips dead tokens; `app_mark_push_token_invalid`; a ticket that already says `DeviceNotRegistered` invalidates at once; `POST /api/push-tokens` stamps `last_seen` and clears `invalid_since` | legacy reader `app_recipient_push_tokens` (untouched) |
| Receipts | every ok ticket is stored (`push_tickets`); `POST /api/notifications/push-receipts/run` (cron secret) fetches Expo receipts ≥ 15 min later, invalidates `DeviceNotRegistered` tokens, expires tickets > 24 h, sweeps the send log > 90 d | does nothing (`{skipped:"disabled"}`) |
| Send log + daily cap | `notification_send_log`; DEFINER `app_reserve_notification_send` (atomic per-user advisory lock, owner-local day from `user_profiles.timezone`) and `app_notification_sends_today`; `sendPush(..., {type, category, subjectRef, cap})`. 3a logs business pushes (no cap); 3c enforces the cap for owner pushes | not called |
| Win-back email consent | consent = `notification_prefs` row `winback_email` (**absent = OFF**); signed unsubscribe link (`/api/notification-prefs/email-unsubscribe?t=…`, HMAC of `{profile id, category}`, GET page + POST one-click, DEFINER `app_set_email_consent`); `List-Unsubscribe` headers; **no email without consent AND a working link** (no signing key ⇒ no email) | win-back emails go out exactly as before |
| Settings toggles | `social` and `milestone` have no scheduler → **hidden** (no fake controls); `streak` and `care` are real (read by `shouldSendStreakSave` / the reminder-setup nudge). A server-backed "Occasional emails from PawPi" row (default OFF) appears only when the server returns `owner_prefs` (flag ON) | row absent |

### PR 3b — schedule what exists — status: built

- `.github/workflows/cron-jobs.yml`: hourly weekly-digest, daily win-back and hourly push-receipts calls, all with the
  existing `x-cron-secret` pattern against the production host.
- Both engagement endpoints (`/api/engagement/weekly-digest/run`, `/api/engagement/reengagement/run`) **do nothing
  unless `NOTIF_V2_ENABLED` is on** (secret check first, then the flag; no query when off).
- Digest / win-back become a real **push** only for owners who opted in (`weekly_digest_push` / `winback_push`
  categories, default OFF); everyone else keeps the in-app bell row only.
- Needs no setting to merge. Secrets/variables to set later are listed under "Human steps".

### PR 3c — owner events reach the phone (migration `0132`) — status: built

- Push for pet-owner transactional events: booking confirmed / declined / cancelled, adoption decisions, walk request
  accepted, lost-pet alerts nearby.
- Owner push preferences per category in `notification_prefs` (transactional default **ON**, promotional **OFF**).
- Quiet hours stored per owner (`notification_settings`, default 22:00–08:00 **owner-local**, using the 3a timezone)
  and **enforced server-side**; the daily cap (default 3, `NOTIF_V2_DAILY_CAP`) is enforced for owner pushes.
- EN/ES push copy keyed on `user_profiles.preferred_locale`.
- The in-app unread badge counts DB notifications (`unread_count` on `GET /api/notifications`, present only with the
  flag on; mobile `useUnreadNotificationCount` + `bellBadgeCount`).
- Mobile Settings (flag ON only): per-category rows (bookings, adoption, walker confirmations, lost-pet alerts —
  default ON; weekly summary push, occasional friendly push, occasional email — default OFF) and a quiet-hours
  control (switch + from/until in 24-hour steps, saved to `PUT /api/notification-prefs/quiet-hours`).
- Pipeline order in `pushForOwnerNotification`: flag → category preference (promotional = opt-in) → quiet hours
  (owner-local, DST-correct) → valid token → atomic daily cap → send. The in-app bell row is always written first.
- **Lost-pet alerts**: today's audience is the *followers of the pet* (what `lost-reports` already notifies), not a
  geographic radius. At most 100 followers get the phone push per activation (everyone still gets the in-app alert).
  A true "nearby" radius needs owner locations, which PawPi deliberately does not store — flagged, not built.
- Promotional pushes count toward the same daily cap as transactional ones (default 3); raise `NOTIF_V2_DAILY_CAP` if
  that ever starves a booking update (it will not at the default: digest is weekly, win-back every 14 days).

## Decisions worth knowing

- **Business pushes** (bookings *for providers*, orders…) keep their own `notification_prefs` rules. v2 gives them
  invalid-token handling, receipts and send-log rows, but **not** the owner quiet-hours or the daily cap (a clinic
  must not miss a booking at 23:00 because a consumer rule exists). Change in `pushForNotification` if you disagree.
- **Suppressed pushes are not lost**: the bell row is always written first; quiet hours / cap / opt-out only gate the
  phone ring.
- **Lost-pet alerts respect quiet hours** (default on) — an owner can narrow or switch off quiet hours in Settings.
- The cap counts **pushes sent** (not suppressions) in the owner's local day; the reservation runs only after
  tokens/prefs/quiet-hours passed, so a slot is spent only on a push that is really attempted.
- Win-back/digest *email* is separate from *push*: email needs `winback_email` consent + link; push needs
  `winback_push`/`weekly_digest_push` (3b).

## Migrations (apply by hand, in order, after the code is merged)

| # | File | Adds | Verify |
|---|---|---|---|
| 1 | `0131_notifications_v2_foundation.sql` (3a) | `device_push_tokens.invalid_since/last_seen`, `push_tickets`, `notification_send_log`, 11 DEFINER helpers | `supabase/verify_0131.sql` — every row `PASS` |
| 2 | `0132_notification_settings.sql` (3c) | `notification_settings` (quiet hours), DEFINER reader | `supabase/verify_0132.sql` — every row `PASS` |

Both are idempotent and harness-proven (`notifications-v2-foundation.integration.test.ts` incl. a re-apply test).
Applying them does **not** change behaviour while `NOTIF_V2_ENABLED` is off.

## Risks

| Risk | Mitigation |
|---|---|
| Flag ON before a migration is applied | `softV2` fallbacks; unit + integration tests cover the "schema missing" path |
| A v2 query aborts the actor's request transaction | every v2 query is inside a savepoint (`withSavepoint`) |
| Over-notifying | cap (3/day default), quiet hours, promotional opt-in, once-per-(pet, week) digest and 14-day win-back guards already exist |
| A user cannot unsubscribe | link is signed from `AUTH_SECRET` (or `NOTIF_UNSUBSCRIBE_SECRET`); without a key the email is **not sent** |
| Email scanners prefetching the unsubscribe link | fail-safe direction (they can only unsubscribe) |
| Expo receipts job double-processing | tickets are marked `checked_at`; resolve is idempotent |
| Timezone value Postgres rejects breaking `AT TIME ZONE` consumers | route checks `pg_timezone_names`; DB helpers fall back to Buenos Aires on any bad stored zone |
| Mobile changes need a new build | the server side is inert until the flag is on; the mobile toggles/timezone sync ship with build 26 (submitted for review) |

## Human steps (summary; the night-run report repeats them in order)

1. Merge PR 3a/3b/3c (already merged by the night run if CI was green).
2. Apply `0131`, run `verify_0131.sql`; later `0132`, run `verify_0132.sql`.
3. Railway: set `NOTIF_V2_ENABLED=true` **after** both migrations are applied (optional: `NOTIF_V2_DAILY_CAP`,
   `NOTIF_UNSUBSCRIBE_SECRET`; otherwise `AUTH_SECRET` signs the unsubscribe links).
4. GitHub → Settings → Secrets: `CRON_SECRET` must exist (it already drives the two existing cron jobs).
5. Ship a mobile build (the new Settings rows, timezone sync, the badge fix and owner push controls are app code).
6. Watch `notification_send_log` and the receipts job output for a day before telling anyone.
