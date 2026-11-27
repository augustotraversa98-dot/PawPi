-- 0158_share_edit_permission.sql
-- View or "can add" for each part of a share (docs/vet-sharing-design.md, "View and add").
--
-- WHAT
--  1. edit_sections on care_access_grants, care_record_links and care_share_offers: the parts the owner lets the vet add
--     to. Only vet_notes, vaccines, files and lab_results can ever be added to. Empty (view only) by default.
--       grants and invitations: always a subset of the shared sections.
--       links: the same, except vet_notes, which a link may allow adding without showing the notes (what allow_notes
--       already did). allow_notes and 'vet_notes' = any(edit_sections) are kept equal by the database, so a server that
--       knows only allow_notes keeps working.
--  2. app_respond_share_offer copies the offered edit_sections onto the access it creates, and
--     app_provider_share_offer_edits shows them to the invited business before it answers.
--
-- This migration stores the permission. What a vet may actually write with it is migration 0160.
-- A grant by scope (sections null) never has edit_sections: its own scopes (medical_write, vaccinations_write) keep
-- meaning what they meant.
--
-- ADDITIVE and IDEMPOTENT. Existing shares stay view only, except links that already allow notes (they keep exactly that).
-- The server deployed before this migration keeps working with it, and the new server works without it (view only).
-- HAND-APPLIED after merge; then run supabase/verify_0158.sql (every row PASS). Apply after 0157.

-- ── 1. the columns ─────────────────────────────────────────────────────────────────────────────────────────────
alter table care_access_grants add column if not exists edit_sections text[] not null default '{}';
alter table care_record_links  add column if not exists edit_sections text[] not null default '{}';
alter table care_share_offers  add column if not exists edit_sections text[] not null default '{}';

comment on column care_access_grants.edit_sections is
  'Parts the vet may add to. Subset of sections; empty = view only. Always empty for a grant by scope.';
comment on column care_record_links.edit_sections is
  'Parts a link holder may add to. vet_notes may appear without being viewable; the others are subsets of sections.';

-- Links that already allow notes keep exactly that.
update care_record_links set edit_sections = array['vet_notes']::text[]
where allow_notes and edit_sections = '{}';

-- Keeps allow_notes and edit_sections saying the same thing whichever of the two a writer set.
create or replace function app_record_link_sync_notes()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if new.edit_sections = '{}' and new.allow_notes then
      new.edit_sections := array['vet_notes']::text[];
    end if;
    new.allow_notes := 'vet_notes' = any (new.edit_sections);
  elsif new.edit_sections is distinct from old.edit_sections then
    new.allow_notes := 'vet_notes' = any (new.edit_sections);
  elsif new.allow_notes is distinct from old.allow_notes then
    new.edit_sections := case when new.allow_notes
                              then array_append(array_remove(new.edit_sections, 'vet_notes'), 'vet_notes')
                              else array_remove(new.edit_sections, 'vet_notes') end;
  end if;
  return new;
end
$$;

drop trigger if exists care_record_links_sync_notes on care_record_links;
create trigger care_record_links_sync_notes
  before insert or update on care_record_links
  for each row execute function app_record_link_sync_notes();

alter table care_access_grants drop constraint if exists care_access_grants_edit_sections_check;
alter table care_access_grants add constraint care_access_grants_edit_sections_check
  check (
    case
      when sections is null then edit_sections = '{}'
      else array_position(edit_sections, null) is null
        and edit_sections <@ array['vet_notes','vaccines','files','lab_results']::text[]
        and edit_sections <@ sections
    end
  );

alter table care_record_links drop constraint if exists care_record_links_edit_sections_check;
alter table care_record_links add constraint care_record_links_edit_sections_check
  check (
    array_position(edit_sections, null) is null
    and edit_sections <@ array['vet_notes','vaccines','files','lab_results']::text[]
    and array_remove(edit_sections, 'vet_notes') <@ sections
    and allow_notes = ('vet_notes' = any (edit_sections))
  );

alter table care_share_offers drop constraint if exists care_share_offers_edit_sections_check;
alter table care_share_offers add constraint care_share_offers_edit_sections_check
  check (
    array_position(edit_sections, null) is null
    and edit_sections <@ array['vet_notes','vaccines','files','lab_results']::text[]
    and edit_sections <@ sections
  );

-- ── 2. invitations carry it ────────────────────────────────────────────────────────────────────────────────────
-- What each unanswered invitation of a business would let it add to. A function of its own: app_provider_share_offers
-- (0154) keeps its answer, and which rows exist is still decided there.
create or replace function app_provider_share_offer_edits(p_provider_id integer)
returns table (id integer, edit_sections text[])
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select o.id, o.edit_sections
  from app_provider_share_offers(p_provider_id) f
  join care_share_offers o on o.id = f.id
$$;

-- Same contract as 0154; the only change is that the access gets the offered edit_sections.
create or replace function app_respond_share_offer(p_offer_id integer, p_provider_id integer, p_accept boolean)
returns table (outcome text, pet integer, owner integer, pet_name text, access_expires_at timestamptz)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_offer     care_share_offers%rowtype;
  v_pet_id    integer;
  v_pet_name  text;
  v_pet_owner integer;
  v_length    interval;
  v_grant     integer;
  v_expires   timestamptz;
begin
  if p_accept is null or not app_is_active_staff_of(p_provider_id) then
    return query select 'not_found'::text, null::integer, null::integer, null::text, null::timestamptz;
    return;
  end if;

  select o.pet_id into v_pet_id
  from care_share_offers o
  where o.id = p_offer_id and o.provider_id = p_provider_id;
  if v_pet_id is null then
    return query select 'not_found'::text, null::integer, null::integer, null::text, null::timestamptz;
    return;
  end if;

  -- One change at a time per pet and business: the lock the owner's own share takes, then the invitation.
  perform pg_advisory_xact_lock(hashtext('care_access_grant:' || v_pet_id || ':' || p_provider_id));
  -- The open access first, then the invitation: the same order in which a change to the access reaches them.
  perform 1 from care_access_grants g
  where g.pet_id = v_pet_id and g.provider_id = p_provider_id and g.status in ('pending', 'active')
  for update;
  select o.* into v_offer
  from care_share_offers o
  where o.id = p_offer_id and o.provider_id = p_provider_id
  for update;

  select p.name::text, p.owner_user_id into v_pet_name, v_pet_owner from pets p where p.id = v_offer.pet_id;

  if (v_offer.status = 'accepted' and p_accept) or (v_offer.status = 'declined' and not p_accept) then
    select g.expires_at into v_expires from care_access_grants g where g.id = v_offer.grant_id;
    return query select ('already_' || v_offer.status)::text, v_offer.pet_id, v_offer.owner_user_id, v_pet_name, v_expires;
    return;
  end if;

  if v_offer.status = 'open'
     and (v_offer.lapses_at <= now() or v_pet_owner is distinct from v_offer.owner_user_id) then
    update care_share_offers o set status = 'lapsed' where o.id = v_offer.id;
    v_offer.status := 'lapsed';
  end if;
  if v_offer.status <> 'open'
     or app_user_is_blocked(current_app_user_id(), v_offer.owner_user_id)
     or app_user_is_blocked(
          v_offer.owner_user_id, (select pr.owner_user_profile_id from providers pr where pr.id = p_provider_id)) then
    return query select 'not_open'::text, null::integer, null::integer, null::text, null::timestamptz;
    return;
  end if;

  if not p_accept then
    update care_share_offers o
    set status = 'declined', responded_at = now(), responded_by_user_id = current_app_user_id()
    where o.id = v_offer.id;
    return query select 'declined'::text, v_offer.pet_id, v_offer.owner_user_id, v_pet_name, null::timestamptz;
    return;
  end if;

  if not app_can_accept_vet_invite(p_provider_id) then
    return query select 'not_eligible'::text, null::integer, null::integer, null::text, null::timestamptz;
    return;
  end if;

  v_length := case v_offer.duration
                when '7d' then interval '7 days'
                when '30d' then interval '30 days'
                when '1y' then interval '1 year'
              end; -- null: until the owner revokes
  v_expires := now() + v_length;

  -- Answered first: the grant changes below must not read this invitation as one the owner has since replaced.
  update care_share_offers o
  set status = 'accepted', responded_at = now(), responded_by_user_id = current_app_user_id()
  where o.id = v_offer.id;

  -- The same steps the owner's own share takes: close what is past its date, end the access in place, then answer a
  -- pending request or create the grant, with exactly the offered parts. A previous owner's open row ends too.
  update care_access_grants g
  set status = 'expired', updated_at = now()
  where g.pet_id = v_offer.pet_id and g.provider_id = p_provider_id
    and g.status in ('pending', 'active') and g.expires_at <= now();
  update care_access_grants g
  set status = 'revoked', revoked_at = now(), updated_at = now()
  where g.pet_id = v_offer.pet_id and g.provider_id = p_provider_id
    and (g.status = 'active' or (g.status = 'pending' and g.owner_user_id <> v_offer.owner_user_id));

  for attempt in 1..2 loop
    update care_access_grants g
    set status = 'active', scopes = array['record_sections']::text[], sections = v_offer.sections,
        edit_sections = v_offer.edit_sections, expires_at = v_expires, granted_at = now(), updated_at = now()
    where g.pet_id = v_offer.pet_id and g.provider_id = p_provider_id
      and g.owner_user_id = v_offer.owner_user_id and g.status = 'pending'
    returning g.id into v_grant;
    exit when v_grant is not null;
    begin
      insert into care_access_grants (
        pet_id, owner_user_id, provider_id, scopes, sections, edit_sections, status, requested_by, granted_at, expires_at
      ) values (
        v_offer.pet_id, v_offer.owner_user_id, p_provider_id, array['record_sections']::text[], v_offer.sections,
        v_offer.edit_sections, 'active', 'owner', now(), v_expires
      )
      returning care_access_grants.id into v_grant;
    exception when unique_violation then
      -- The business's own request arrived meanwhile: answer it on the next pass.
      v_grant := null;
    end;
    exit when v_grant is not null;
  end loop;
  if v_grant is null then
    raise exception 'app_respond_share_offer: could not create the access';
  end if;

  update care_share_offers o set grant_id = v_grant where o.id = v_offer.id;

  return query select 'accepted'::text, v_offer.pet_id, v_offer.owner_user_id, v_pet_name, v_expires;
end
$$;

-- ── privileges ─────────────────────────────────────────────────────────────────────────────────────────────────
revoke execute on function app_record_link_sync_notes() from public;
revoke execute on function app_provider_share_offer_edits(integer) from public;
revoke execute on function app_respond_share_offer(integer, integer, boolean) from public;
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke execute on function app_record_link_sync_notes() from %I', r);
      execute format('revoke execute on function app_provider_share_offer_edits(integer) from %I', r);
      execute format('revoke execute on function app_respond_share_offer(integer, integer, boolean) from %I', r);
    end if;
  end loop;
end
$$;
grant execute on function app_record_link_sync_notes() to pawpi_app;
grant execute on function app_provider_share_offer_edits(integer) to pawpi_app;
grant execute on function app_respond_share_offer(integer, integer, boolean) to pawpi_app;
