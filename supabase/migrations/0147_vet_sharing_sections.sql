-- 0147_vet_sharing_sections.sql
-- Sharing the vet record by section, with an expiry (docs/vet-sharing-design.md, part 2).
--
-- WHAT
--  1. care_access_grants.sections (text[], null = the existing "medical_read" style grant). A grant by section carries
--     exactly the scope 'record_sections' and nothing else, and is never 'pending'.
--  2. Only the pet's owner creates or activates a grant by section. Provider staff can only insert a 'pending' request
--     without sections, and a grant can only be 'pending' or 'active' after an update by the pet's current owner.
--  3. app_provider_has_grant and app_pet_has_vet_relationship ignore grants by section: every existing rule that does
--     not know about sections answers as if the grant did not exist.
--  4. app_provider_has_section + one SELECT policy per shared table (vet notes, vaccinations, documents, photo checks,
--     lab results). Read only. Expiry and revocation are checked on every read.
--  5. Medical profile, emergency contact and insurance share one table, so there is NO row policy for them:
--     app_shared_medical_profile returns only the columns of the granted sections.
--  6. app_expire_care_grants marks open grants past their date as 'expired', so they do not block a new one.
--  7. notifications_type_check gains care_access_granted and care_access_revoked.
--
-- ADDITIVE and IDEMPOTENT. No row is changed or deleted. Existing grants keep sections = null and behave as before, and
-- the server deployed before this migration keeps working with it. HAND-APPLIED before the matching server code is
-- deployed; then run supabase/verify_0147.sql (every row PASS).

-- ── 1. the column and what a grant by section may look like ─────────────────────────────────────────────────────
alter table care_access_grants add column if not exists sections text[];

comment on column care_access_grants.sections is
  'Parts of the vet record the owner shared. Null = a grant by scope only. Set only together with scopes = {record_sections}.';

alter table care_access_grants drop constraint if exists care_access_grants_sections_check;
alter table care_access_grants add constraint care_access_grants_sections_check
  check (
    case
      when sections is null then array_position(scopes, 'record_sections') is null
      else scopes = array['record_sections']::text[]
        and status <> 'pending'
        and cardinality(sections) > 0
        and array_position(sections, null) is null
        and sections <@ array['profile','emergency_contact','insurance','vet_notes','vaccines','files','photos','lab_results']::text[]
    end
  );

-- ── 2. who may write a grant ───────────────────────────────────────────────────────────────────────────────────
drop policy if exists care_access_grants_insert on care_access_grants;
create policy care_access_grants_insert on care_access_grants
  for insert
  with check (
    (
      app_is_active_staff_of(provider_id)
      and requested_by = 'provider'
      and status = 'pending'
      and sections is null
    )
    or (
      requested_by = 'owner'
      and owner_user_id = current_app_user_id()
      and pet_id in (select id from pets where owner_user_id = current_app_user_id())
    )
  );

drop policy if exists care_access_grants_update on care_access_grants;
create policy care_access_grants_update on care_access_grants
  for update
  using (owner_user_id = current_app_user_id())
  with check (
    owner_user_id = current_app_user_id()
    and (
      status in ('revoked', 'expired')
      or pet_id in (select id from pets where owner_user_id = current_app_user_id())
    )
  );

-- ── 3. existing helpers: grants by section do not count ────────────────────────────────────────────────────────
-- Same contract as 0019; the only change is "g.sections is null".
create or replace function app_provider_has_grant(p_pet_id integer, p_scope text default null)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from provider_staff ps
    join care_access_grants g
      on g.provider_id = ps.provider_id
    where ps.user_profile_id = current_app_user_id()
      and ps.status = 'active'
      and g.pet_id = p_pet_id
      and g.status = 'active'
      and g.sections is null
      and (g.expires_at is null or g.expires_at > now())
      and (p_scope is null or p_scope = any (g.scopes))
  )
$$;

-- Same contract as 0037; the only change is "g.sections is null".
create or replace function app_pet_has_vet_relationship(p_pet_id integer)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    exists (
      select 1
      from care_access_grants g
      join provider_capabilities pc
        on pc.provider_id = g.provider_id and pc.capability = 'vet'
      where g.pet_id = p_pet_id
        and g.status = 'active'
        and g.sections is null
        and (g.expires_at is null or g.expires_at > now())
    )
    or exists (
      select 1 from vet_notes vn where vn.pet_id = p_pet_id
    )
$$;

-- ── 4. reading a shared section ────────────────────────────────────────────────────────────────────────────────
-- True when the caller is active staff of a provider holding an active, unexpired grant on the pet, given by the pet's
-- current owner, that includes the section. A route acting for one provider must also check that provider's own grant.
create or replace function app_provider_has_section(p_pet_id integer, p_section text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from provider_staff ps
    join care_access_grants g
      on g.provider_id = ps.provider_id
    join pets p
      on p.id = g.pet_id and p.owner_user_id = g.owner_user_id
    where ps.user_profile_id = current_app_user_id()
      and ps.status = 'active'
      and g.pet_id = p_pet_id
      and g.status = 'active'
      and (g.expires_at is null or g.expires_at > now())
      and p_section = any (g.sections)
  )
$$;

drop policy if exists vet_notes_provider_section_read on vet_notes;
create policy vet_notes_provider_section_read on vet_notes
  for select
  using (app_provider_has_section(pet_id, 'vet_notes'));

drop policy if exists pet_vaccinations_provider_section_read on pet_vaccinations;
create policy pet_vaccinations_provider_section_read on pet_vaccinations
  for select
  using (deleted_at is null and app_provider_has_section(pet_id, 'vaccines'));

drop policy if exists vet_documents_provider_section_read on vet_documents;
create policy vet_documents_provider_section_read on vet_documents
  for select
  using (app_provider_has_section(pet_id, 'files'));

drop policy if exists health_photo_checks_provider_section_read on health_photo_checks;
create policy health_photo_checks_provider_section_read on health_photo_checks
  for select
  using (app_provider_has_section(pet_id, 'photos'));

drop policy if exists pet_lab_results_provider_section_read on pet_lab_results;
create policy pet_lab_results_provider_section_read on pet_lab_results
  for select
  using (app_provider_has_section(pet_id, 'lab_results'));

-- ── 5. medical profile / emergency contact / insurance, column by column ───────────────────────────────────────
-- One row when the caller is active staff of p_provider_id, that provider's grant on the pet is active, unexpired, given
-- by the pet's current owner and includes at least one of the three sections, and the pet has a profile. Otherwise no
-- row. Columns of a section that was not granted are null. DEFINER because the caller has no row access to the table.
create or replace function app_shared_medical_profile(p_pet_id integer, p_provider_id integer)
returns table (
  id                      integer,
  pet_id                  integer,
  microchip_id            text,
  spayed_neutered_status  text,
  spayed_neutered_date    date,
  primary_vet_name        text,
  primary_clinic_name     text,
  vet_phone               text,
  vet_email               text,
  medical_notes           text,
  emergency_contact_name  text,
  emergency_contact_phone text,
  insurance_provider      text,
  insurance_policy_number text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    mp.id,
    mp.pet_id,
    case when 'profile' = any (g.sections) then mp.microchip_id end,
    case when 'profile' = any (g.sections) then mp.spayed_neutered_status end,
    case when 'profile' = any (g.sections) then mp.spayed_neutered_date end,
    case when 'profile' = any (g.sections) then mp.primary_vet_name end,
    case when 'profile' = any (g.sections) then mp.primary_clinic_name end,
    case when 'profile' = any (g.sections) then mp.vet_phone end,
    case when 'profile' = any (g.sections) then mp.vet_email end,
    case when 'profile' = any (g.sections) then mp.medical_notes end,
    case when 'emergency_contact' = any (g.sections) then mp.emergency_contact_name end,
    case when 'emergency_contact' = any (g.sections) then mp.emergency_contact_phone end,
    case when 'insurance' = any (g.sections) then mp.insurance_provider end,
    case when 'insurance' = any (g.sections) then mp.insurance_policy_number end
  from care_access_grants g
  join pets p
    on p.id = g.pet_id and p.owner_user_id = g.owner_user_id
  join pet_medical_profiles mp
    on mp.pet_id = g.pet_id and mp.deleted_at is null
  where g.pet_id = p_pet_id
    and g.provider_id = p_provider_id
    and app_is_active_staff_of(p_provider_id)
    and g.status = 'active'
    and (g.expires_at is null or g.expires_at > now())
    and g.sections && array['profile','emergency_contact','insurance']::text[]
  limit 1
$$;

-- ── 6. close open grants that are past their date ──────────────────────────────────────────────────────────────
-- The one-open-grant index (0128) cannot look at the clock. This flips only rows whose expires_at has passed (they
-- already give no access) for one pet and provider, and only for the grant's owner or that provider's active staff.
-- Returns how many rows it closed. DEFINER because staff have no UPDATE policy.
create or replace function app_expire_care_grants(p_pet_id integer, p_provider_id integer)
returns integer
language sql
volatile
security definer
set search_path = public, pg_temp
as $$
  with closed as (
    update care_access_grants g
    set status = 'expired', updated_at = now()
    where g.pet_id = p_pet_id
      and g.provider_id = p_provider_id
      and g.status in ('pending', 'active')
      and g.expires_at <= now()
      and (g.owner_user_id = current_app_user_id() or app_is_active_staff_of(g.provider_id))
    returning 1
  )
  select count(*)::integer from closed
$$;

-- ── function privileges ────────────────────────────────────────────────────────────────────────────────────────
revoke execute on function app_provider_has_grant(integer, text) from public;
revoke execute on function app_pet_has_vet_relationship(integer) from public;
revoke execute on function app_provider_has_section(integer, text) from public;
revoke execute on function app_shared_medical_profile(integer, integer) from public;
revoke execute on function app_expire_care_grants(integer, integer) from public;
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke execute on function app_provider_has_grant(integer, text) from %I', r);
      execute format('revoke execute on function app_pet_has_vet_relationship(integer) from %I', r);
      execute format('revoke execute on function app_provider_has_section(integer, text) from %I', r);
      execute format('revoke execute on function app_shared_medical_profile(integer, integer) from %I', r);
      execute format('revoke execute on function app_expire_care_grants(integer, integer) from %I', r);
    end if;
  end loop;
end
$$;
grant execute on function app_provider_has_grant(integer, text) to pawpi_app;
grant execute on function app_pet_has_vet_relationship(integer) to pawpi_app;
grant execute on function app_provider_has_section(integer, text) to pawpi_app;
grant execute on function app_shared_medical_profile(integer, integer) to pawpi_app;
grant execute on function app_expire_care_grants(integer, integer) to pawpi_app;

-- ── 7. notification types ──────────────────────────────────────────────────────────────────────────────────────
alter table notifications drop constraint if exists notifications_type_check;
alter table notifications add constraint notifications_type_check
  check (type = any (array[
    -- existing (through 0142)
    'paw','bark','follow','lost_alert','emergency_contact','food_recall','report_received',
    'booking_requested','booking_confirmed','booking_declined','booking_cancelled',
    'adoption_under_review','adoption_approved','adoption_declined',
    'walk_request_targeted','walk_request_broadcast','walk_request_accepted','walk_request_taken',
    'welcome','pack_invite','pack_accepted','boop','weekly_digest','winback',
    'biz_booking','biz_booking_change','biz_order','biz_message','biz_adoption_application',
    'biz_review','biz_payout','biz_post_engagement','biz_follow',
    'pet_share_invite','pet_share_accepted','pet_share_declined','pet_share_revoked','pet_share_left','pet_share_owner_deleted',
    -- vet record sharing (this migration)
    'care_access_granted','care_access_revoked'
  ]::text[]));
