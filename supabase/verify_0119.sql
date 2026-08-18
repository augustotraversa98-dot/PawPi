-- Verification for migration 0119 (QC-C — general check fills the Care Ring's care segment).
-- Run in the Supabase SQL editor AFTER applying 0119. EVERY row should read PASS.
--
-- Seeds a throwaway owner+pet+general-check in a rolled-back transaction and asserts the
-- shared function now reports care_done=true for a check WITH an observation and false for
-- an all-empty one. Uses high ids to avoid colliding with real data; ROLLBACK at the end.
begin;

insert into auth_users (id, name, email)
  values (990001, 'qc_c_verify', 'qc_c_verify@example.com');
insert into user_profiles (id, auth_user_id, username, onboarding_completed)
  values (990001, 990001, 'qc_c_verify', true);
insert into pets (id, owner_user_id, name, handle)
  values (990001, 990001, 'RingDog', 'qc-c-verify-ringdog');

-- (a) an all-empty general check must NOT fill care.
insert into health_general_checks (pet_id, owner_user_id, logged_at)
  values (990001, 990001, '2026-08-18 12:00:00+00');

with r as (
  select care_done from app_pet_ring_segments(990001, 'America/Buenos_Aires', date '2026-08-18')
)
select 'empty general check does NOT fill care' as check_name,
       care_done::text as detail,
       case when care_done = false then 'PASS' else 'FAIL' end as status
from r;

-- (b) a general check WITH an observation fills care.
update health_general_checks set eyes_status = 'usual'
  where pet_id = 990001;

with r as (
  select care_done from app_pet_ring_segments(990001, 'America/Buenos_Aires', date '2026-08-18')
)
select 'general check with observation fills care' as check_name,
       care_done::text as detail,
       case when care_done = true then 'PASS' else 'FAIL' end as status
from r;

-- (c) notes-only (no status) also counts as an observation.
update health_general_checks set eyes_status = null, notes = 'looked a bit tired'
  where pet_id = 990001;

with r as (
  select care_done from app_pet_ring_segments(990001, 'America/Buenos_Aires', date '2026-08-18')
)
select 'notes-only general check fills care' as check_name,
       care_done::text as detail,
       case when care_done = true then 'PASS' else 'FAIL' end as status
from r;

rollback;
