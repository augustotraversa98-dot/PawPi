# DB migration runbook — 0129 index cleanup (AUDIT A-19 + A-14 index)

**FILE-ONLY in the repo. Nothing here has been applied to production.** The
integration harness applies it on a fresh DB so CI stays green; a human applies it
on prod during a quiet window. Index-only DDL — no application data is written, so
rollback is just re-creating / dropping indexes.

Companion: `db-migration-runbook-indexes-0128-0129.md` (0128, the care-grants
unique index, A-26).

## Why
Advisors flagged 8 exact-duplicate indexes (two indexes on the same column, from
historical create-if-not-exists drift) and a set of unindexed foreign keys on hot
paths (per-request joins/filters doing sequential scans).

## What
1. Drop one index of each duplicate pair (keep the `*_id`-suffixed name that
   matches the column).
2. Add 11 hot-path FK indexes + the A-14 discovery index
   `providers(status, provider_type)`. `provider_reviews(provider_id)` already
   exists (0014), so nothing is added there.

Only the highest-traffic unindexed FKs are added; the ~45 low-traffic ones the
advisor also lists are left alone (an index that is never scanned is pure write
overhead).

## Apply (prod — CONCURRENTLY, outside a transaction, one statement at a time)
The repo file `supabase/migrations/0129_index_cleanup.sql` uses the plain,
in-transaction form because the integration runner executes each file as a single
statement batch. On prod prefer CONCURRENTLY to avoid write locks:

```sql
-- Drops (instant):
drop index concurrently if exists idx_pets_owner;
drop index concurrently if exists idx_post_barks_post;
drop index concurrently if exists idx_post_barks_user;
drop index concurrently if exists idx_post_paws_post;
drop index concurrently if exists idx_post_paws_user;
drop index concurrently if exists idx_posts_pet;
drop index concurrently if exists idx_posts_user;
drop index concurrently if exists idx_user_profiles_auth_user;

-- Adds (one CONCURRENTLY statement at a time):
create index concurrently if not exists idx_care_access_grants_pet_id on care_access_grants (pet_id);
create index concurrently if not exists idx_notifications_actor_user_id on notifications (actor_user_id);
create index concurrently if not exists idx_vet_appointments_service_id on vet_appointments (service_id);
create index concurrently if not exists idx_vet_appointments_staff_user_id on vet_appointments (staff_user_id);
create index concurrently if not exists idx_vet_notes_appointment_id on vet_notes (appointment_id);
create index concurrently if not exists idx_rx_fulfillment_orders_pet_id on rx_fulfillment_orders (pet_id);
create index concurrently if not exists idx_walk_requests_pet_id on walk_requests (pet_id);
create index concurrently if not exists idx_event_rsvps_pet_id on event_rsvps (pet_id);
create index concurrently if not exists idx_health_medical_care_logs_routine_id on health_medical_care_logs (routine_id);
create index concurrently if not exists idx_health_wellness_logs_routine_id on health_wellness_logs (routine_id);
create index concurrently if not exists idx_reminder_dismissals_routine_id on reminder_dismissals (routine_id);
create index concurrently if not exists idx_providers_status_provider_type on providers (status, provider_type);
```

## Verify
Run `supabase/verify_0129.sql` — every row **PASS** (duplicates gone; all expected
indexes present).

## Rollback
Re-create the dropped duplicates (harmless) and/or drop the added indexes; nothing
here affects application data or query correctness. Then re-run the Supabase
performance advisor to confirm the duplicate-index + unindexed-FK findings for
these objects are gone.
