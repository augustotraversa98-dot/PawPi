-- Verification for migration 0129 (index cleanup).
-- Run in the Supabase SQL editor AFTER applying 0129. EVERY row should read PASS.
with dropped(name) as (
  values ('idx_pets_owner'), ('idx_post_barks_post'), ('idx_post_barks_user'),
         ('idx_post_paws_post'), ('idx_post_paws_user'), ('idx_posts_pet'),
         ('idx_posts_user'), ('idx_user_profiles_auth_user')
),
added(name) as (
  values ('idx_pets_owner_user_id'), ('idx_post_barks_post_id'), ('idx_post_paws_post_id'),
         ('idx_posts_pet_id'), ('idx_user_profiles_auth_user_id'),
         ('idx_care_access_grants_pet_id'), ('idx_notifications_actor_user_id'),
         ('idx_vet_appointments_service_id'), ('idx_vet_appointments_staff_user_id'),
         ('idx_vet_notes_appointment_id'), ('idx_rx_fulfillment_orders_pet_id'),
         ('idx_walk_requests_pet_id'), ('idx_event_rsvps_pet_id'),
         ('idx_health_medical_care_logs_routine_id'), ('idx_health_wellness_logs_routine_id'),
         ('idx_reminder_dismissals_routine_id'), ('idx_providers_status_provider_type'),
         ('idx_provider_reviews_provider_id')
)
select 1 as ord,
       'all 8 duplicate indexes dropped' as check_name,
       coalesce((select string_agg(name, ', ') from dropped
                 where name in (select indexname from pg_indexes where schemaname='public')), '(none present)') as detail,
       case when not exists (
         select 1 from dropped where name in (select indexname from pg_indexes where schemaname='public')
       ) then 'PASS' else 'FAIL' end as status
union all
select 2,
       'all expected indexes present (kept + newly added)',
       coalesce((select string_agg(name, ', ') from added
                 where name not in (select indexname from pg_indexes where schemaname='public')), '(all present)'),
       case when not exists (
         select 1 from added where name not in (select indexname from pg_indexes where schemaname='public')
       ) then 'PASS' else 'FAIL' end
order by ord;
