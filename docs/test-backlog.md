# PawPi — Device-test backlog (your queue, test on your own time)

**How this works.** Claude Code develops continuously and merges whenever CI is green — but CI can't
test real-phone behavior (navigation feel, push notifications, camera, layout on a device). Every time
something ships that needs a human check, an entry lands here. **You test when you have time, then tell
Claude Code or Cowork:**
- *"X passed"* → the entry moves to **Passed** below (or is deleted).
- *"X is wrong: <what you saw>"* → it becomes a fix ticket and gets reworked.

Merged + CI-green ≠ device-verified. This list is the gap between the two.

---

## To test

### [ ] 2.5 — Owner ↔ provider chat / messaging  ·  ticket/chat-messaging (2026-06-17)
What shipped: pet owners and service providers (vets, and later walkers/sitters/etc.) can now **message each other** in private 1:1 conversations. On the phone there is a **Messages** screen (your list of conversations) and a **conversation view** (send text + attach a photo); you start a chat from a provider's profile or it can be tied to a booking. The provider's web dashboard gets a **Chats** section (was a "coming soon" stub) with the same list + conversation. Each conversation shows an **unread badge**. The conversation refreshes itself on a short timer (lightweight polling — no heavy realtime infra was built). Privacy is enforced at the database: **only the two parties (the owner and that provider's active staff) can ever see or post in a thread** — nobody else, and you can't post as someone else; removed staff lose access immediately.
- ⚙️ **MIGRATION TO APPLY TO SUPABASE:** `supabase/migrations/0031_chat_messaging.sql` — creates `message_threads` (owner ↔ provider, optional booking link) + `messages` (text + optional image attachment + read stamp), both with ENABLE+FORCE **participant-scoped RLS** (visible/writable only to the owner OR active staff of the provider; the sender must be the caller). Hand-apply AFTER merge; until then chat runs only in the test harness, not on live data.
1. Open **Services → Veterinary** → tap the **Messages** icon (top-right): with no chats yet you see a friendly empty state ("No conversations yet").
2. Open a **vet clinic profile** → tap **Message** → a conversation opens. Type a message and send it → it appears in the thread.
3. From the conversation, tap the **photo button**, pick an image → it uploads and shows as an attachment in the thread.
4. Go back to **Messages** → your conversation is listed with the clinic name + the last message; the most recent chat is on top.
5. **Unread count:** have the clinic side reply (via the provider web dashboard **Chats** section), then re-open the app → the Messages list shows an **unread badge**; opening the conversation clears it.
6. **You only ever see your own threads:** a different account never sees your conversation — each side sees only the chats they're a participant of (this is enforced by the database, proven in the test harness).
7. (Provider web) Sign in to the **provider dashboard → Chats**: the owner's messages appear; reply from there → it shows back on the phone.

### [ ] 2.4 — Generalized booking + calendar (all capabilities)  ·  ticket/generalized-booking (2026-06-17)
What shipped: booking now works for **any** kind of service — grooming, walking, daycare, sitting, training — not just vet, all on one booking model. The existing booking screen was generalized: it shows the right wording/icon for whatever service you're booking and tells the provider which capability it's for. Providers can now mark a booking **completed** (which is what unlocks leaving a review), and the system can hold a weekly availability schedule, generate open time-slots, and **block double-bookings** of the same staff member at the same time. A recurring-booking rule (for repeating walks/daycare) and an optional deposit link (to the payments layer) are carried on the booking. A 2-way external-calendar-sync hook is **stubbed** behind an interface (no real Google/Apple sync yet). **The vet booking flow and its reminders are untouched** — a plain vet booking behaves exactly as before.
- ⚙️ **MIGRATION TO APPLY TO SUPABASE:** `supabase/migrations/0030_generalized_booking.sql` — extends `vet_appointments` (PATH a: it is already the booking table with RLS + reminders, so this is the lowest-risk path) with the generalized columns (capability, slot start/end, recurrence_rule, deposit order_id), widens booking_status to allow `completed`, adds a partial-unique index that prevents double-booking, adds the new `provider_availability` table (ENABLE+FORCE RLS: published provider's windows public-read, writes owner|admin), and adds a `provider_bookings` VIEW that inherits the booking RLS. Hand-apply AFTER merge; until then it runs only in the test harness, not on live data.
1. **Vet still works end-to-end:** Open **Services → Veterinary → pick a clinic → Book appointment**, choose a date/time, Confirm → the request sends and shows in your appointments (your existing vet loop, unchanged). The icon/wording still says "appointment".
2. **A non-vet capability can be requested (once those service modules light up):** when a provider offers e.g. grooming, opening its booking form shows grooming wording/icon and the booking is tagged as that capability. (Until the grooming/walking/etc. screens ship in later tickets, this is exercised in the test harness.)
3. **Double-book is prevented:** two bookings for the **same staff member at the same time slot** cannot both be requested — the second is refused with a "time slot no longer available" message.
4. **Complete unlocks reviews:** a provider marking a confirmed booking **completed** is what lets the owner leave a review (ties into 2.2) — confirm a vet booking, mark it completed, and the Write-a-review button appears.

### [ ] 2.3 — Payments foundation (backend scaffold, key-stubbed)  ·  ticket/payments-foundation (2026-06-17)
What shipped: the money layer for the marketplace — database tables + strict access rules + a provider-agnostic payment engine with two payment rails wired in but DORMANT until accounts/keys exist. Owners pay, the platform keeps a commission, the provider gets paid out (split payments). **There is NO phone UI in this ticket and NO live money flow yet** — it's a scaffold, so there is nothing to tap-test on a device. It is exercised entirely by the test harness (web vitest + real-Postgres RLS).
- **No on-device check applies.** The routes return a clean "payments not configured" message until Tats sets up the accounts/keys below, so nothing crashes and nothing charges.
- ⚙️ **MIGRATION TO APPLY TO SUPABASE:** `supabase/migrations/0029_payments_foundation.sql` — creates the money tables (provider_payment_accounts, orders, order_items, payments, payouts, subscriptions) each with ENABLE+FORCE RLS (money = strictest: owner sees only their own orders/payments; provider staff see their provider's; provider tokens are admin-only and NEVER visible to owners; payouts are provider-only). Hand-apply AFTER merge; until then the money tables run only in the test harness, not on live data.
- ⚙️ **ACTION FOR TATS — accounts + keys (sandbox first, do NOT block the merge):**
  1. **MercadoPago:** create a MercadoPago **marketplace application** (OAuth client) in the developer dashboard. Copy the **Client ID** and **Client Secret**. Generate a **webhook secret**. Register the **redirect URI** `https://<domain>/api/providers/<id>/payment-accounts/mercadopago/callback` and the **webhook URL** `https://<domain>/api/payments/webhooks/mercadopago`.
  2. **Binance Pay:** create a **Binance Pay merchant account**, generate an **API key + secret**, and register the webhook URL `https://<domain>/api/payments/webhooks/binance`.
  3. **Set env keys** in the web app's `.env` (template in `anything/apps/web/.env.example`): `MP_CLIENT_ID`, `MP_CLIENT_SECRET`, `MP_WEBHOOK_SECRET`, `MP_REDIRECT_URI`, `BINANCE_PAY_API_KEY`, `BINANCE_PAY_API_SECRET`, and `PLATFORM_COMMISSION_BPS` (e.g. `500` = 5%). NEVER commit real values — `.env` is gitignored.
  4. **Per-provider connect:** each provider completes the MercadoPago OAuth connect (start link from `GET /api/providers/<id>/payment-accounts/mercadopago/connect`, finished via the callback) and/or records their Binance handle (`POST /api/providers/<id>/payment-accounts/binance`). The token is stored server-side and never shown to owners.
  5. Use **sandbox/test mode** end to end before going live.

### [ ] 2.0 — Pet Services in the main nav  ·  PR #111 (merged 2026-06-17)
What shipped: the bottom bar is now **Feed · Health · Training · Services · More** (Community moved into More).
1. Bottom bar shows Feed, Health, Training, **Services**, More — Community is gone from the bar.
2. Tap **Services** → Pet Services opens; **Veterinary** is the only live/tappable one.
3. Tap **Veterinary** → vet list → pick a clinic → booking flow works (your existing vet loop).
4. Tap **More** → find **Community** → opens and works (search, filters, back button).
5. Nothing else broke — Feed, Health, Training, rest of More all open normally.
6. (2.0 follow-up, PR #113) The Services screen is a full grid: Veterinary live (tappable → vet), and Grooming/Walking/Daycare/Sitting/Training/Shop/Adoption show as dimmed **"Coming soon"** cards that do **nothing** when tapped. More no longer has leftover Adoption/Pet Shop entries.

### [ ] 2.2 — Reviews & ratings surfacing  ·  ticket/reviews-surfacing (2026-06-17)
What shipped: pet parents can leave a star rating + written review **only after a completed appointment** with a provider, and those ratings now show up where you browse vets. Each completed appointment can be reviewed once; providers can never write, edit, or delete a review.
- ⚙️ **ACTION FOR YOU/COWORK — apply migration to Supabase:** `supabase/migrations/0028_rls_provider_reviews_surfacing.sql` (opens the public-read window on a published provider's reviews, keeps writes owner-only, and adds the one-review-per-completed-booking guard column + index). Hand-apply it after merge; until then reviews run only in the test harness, not on live data.
1. Open **Services → Veterinary**: each vet card shows a star rating + count, or a muted **"New"** when a clinic has no reviews yet (no fake numbers).
2. Tap a clinic → its profile shows the same rating up top and a **Reviews** section (real reviews, or a "No reviews yet" empty state).
3. Book a vet, then open that appointment and **Mark as completed**. Re-open the completed appointment → a **Write a review** button now appears.
4. Tap **Write a review**, pick 1–5 stars, optionally add a note, **Submit** → it posts; the new rating shows on the clinic profile + the vet card.
5. Try to review the **same completed appointment twice** → it won't let you (one review per visit).
6. An appointment that is **not** completed (or one you typed in manually with no provider) shows **no** Write-a-review button — you can't review without a real completed booking.

### [ ] 2.1 — Provider capabilities (backend only)  ·  PR #114 (merged 2026-06-17)
No phone UI — backend foundation so one business can offer many services. Nothing to tap-test.
- ⚙️ **ACTION FOR YOU/COWORK — apply migration to Supabase:** `supabase/migrations/0027_provider_capabilities.sql` (creates the `provider_capabilities` table + backfills from each provider's current type). Hand-apply it after merge; until then the new capability features run only in the test harness, not on live data.
- ⚠️ **Heads-up:** the backfill maps each existing provider's `provider_type` to a capability. If any live provider has a non-standard/free-text `provider_type`, it gets **no** capability and won't show in discovery until an admin adds one. Tell me if you have such providers.

---

## Passed (archive)
_Nothing yet._
