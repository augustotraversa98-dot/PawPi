# Emergency / finder flow

What a stranger can see and send after scanning a dog's tag, who hears about it, and how long it is kept.
Schema and functions: `supabase/migrations/0146_emergency_finder_contact.sql` (verify: `supabase/verify_0146.sql`,
19 rows, all PASS).
Status: 0146 was applied to production on 2026-11-26; the verify script returned 19 of 19 PASS.

## What the public pages show (the owner decides)

| Owner setting | Tag page `/p/tag` | Full vet link `/p/card` |
|---|---|---|
| Finder contact = **Relay** | message form; no owner phone / email | no owner phone / email, **no emergency contact** |
| Finder contact = **None** | no form, no contact | no owner phone / email, **no emergency contact** |
| **Phone** / **Email**, value saved | that value, tappable; no form | that value + the emergency contact |
| **Phone** / **Email**, nothing saved (or a value of the other kind) | message form (same as Relay) | emergency contact; no owner value |
| **Show my emergency contact on the pet tag** (default **OFF**) | ON: the medical profile's emergency contact name and phone | no effect |
| Show medical info on the public tag (default OFF) | blood type, spay/neuter, allergies, conditions, notes. Never vet or emergency-contact details | no effect |

A basic vet link never carries medical details or the emergency contact.

## Who is notified

The owner, plus every **active, unexpired** family member and caregiver of that pet (same definition as
`app_user_has_pet_access`). Each gets their own in-app notification with the finder's name, phone, email and message,
and a push.

| | Owner | Family / caregiver |
|---|---|---|
| In-app notification | always | always |
| Push | always (ignores quiet hours, caps and category switches) | not if "Lost pet alerts" (`owner_lost_alerts`) is off, or during their quiet hours (quiet hours exist only while `NOTIF_V2_ENABLED` is on; default 22:00-08:00) |
| Urgent (time-sensitive) | when the message is urgent | same, subject to the settings above |

## Limits

Per **sender** (web server, `utils/rateLimit.js`; fixed windows):

| Bucket | Limit | Over it |
|---|---|---|
| `emergency_relay` | 3 per 10 minutes | 429 |
| `emergency_relay_daily` | 10 per 24 hours | 429 |
| `emergency_relay_urgent` (per sender and tag) | 1 per 24 hours | delivered, not urgent |

Per **pet** (inside the database function, sliding windows, whoever sends; parallel requests are serialised):

| Kind | Limit | Over it |
|---|---|---|
| Messages | 5 per 10 minutes, 30 per 24 hours | refused (`ok:false`) |
| Urgent pushes | 1 per 10 minutes, 4 per 24 hours | delivered, not urgent |

**Who is the sender** (`utils/senderAddress.js`): the address the hosting proxies vouch for; an IPv6 /64 counts as
one sender; signing in does not change it; the stored key is a hash. The per-pet limits are enforced in the database:
at most 4 urgent pushes per pet per day, whoever sends.

Over the per-pet message limit the form shows "couldn't send" until the window opens again. Maintenance: the
Cloudflare ranges are a fixed list; a new range that is missing makes senders behind that address share a limit.

## Retention: 90 days

The finder's name, phone, email and message are deleted 90 days after the message, from every copy (owner and
members). The pet's name stays, so the entry still reads "Someone found <pet>". Old sender counters are removed too.

- **Delete:** `app_purge_finder_details()` runs at the start of `POST /api/notifications/push-receipts/run`, called
  hourly by the Railway service `cron-push-receipts` (`docs/ops/railway-cron.md`). It runs whether or not
  `NOTIF_V2_ENABLED` is on. No new service or variable is needed.
- **Check:** the response has `finderDetailsCleared` (a number; `null` means 0146 is not applied or the purge failed,
  and a failure is logged as `[purgeFinderDetails] FAILED`). The cron log only shows the HTTP status, so a failing
  purge does not mark the run as failed. To check the data, this must return 0:
  ```sql
  select count(*) from notifications
  where type = 'emergency_contact' and created_at < now() - interval '91 days' and body is not null;
  ```
- **Read filter:** `GET /api/notifications` never returns details older than 90 days, even if the job is late.
- The period is fixed twice and must stay equal: in the SQL function and in `utils/finderRetention.js`.

Not covered: the push already delivered to a phone (it passes through Expo and Apple and stays on the device until
dismissed), and database backups, which expire on the database provider's own schedule.
