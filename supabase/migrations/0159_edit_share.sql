-- 0159_edit_share.sql
-- Changing what an existing share opens, on the same share (docs/vet-sharing-design.md, "Editing a share").
--
-- WHY
--  An owner could only create or remove a share: adding one part meant ending the access and starting another. Access
--  by grant is edited through the owner's existing update right (0147), so no change is needed for it. A record link's
--  owner may only remove it (0153), so editing one needs the function below.
--
-- WHAT
--  1. care_record_links.terms_changed_at and a widened end-date rule: a link ends within a year of when its terms were
--     last set (creation, or the last edit that chose a new end date), no longer only of its creation.
--  2. app_update_record_link: the pet's owner changes the parts, what may be added and, optionally, the end date of a
--     link that is still in use. The address does not change.
--
-- ADDITIVE and IDEMPOTENT. No row is changed or deleted and no policy is changed. The server deployed before this
-- migration keeps working with it, and the new server works without it (editing a link reports "not available").
-- HAND-APPLIED after merge; then run supabase/verify_0159.sql (every row PASS). Apply after 0158.

alter table care_record_links add column if not exists terms_changed_at timestamptz;

comment on column care_record_links.terms_changed_at is
  'When the owner last chose a new end date. Null: the end date set at creation.';

alter table care_record_links drop constraint if exists care_record_links_expiry_check;
alter table care_record_links add constraint care_record_links_expiry_check
  check (expires_at > created_at and expires_at <= coalesce(terms_changed_at, created_at) + interval '366 days');

-- outcome: 'updated' | 'not_found' (not the caller's link, or the pet is no longer theirs) | 'not_active' (removed or
-- past its date: an ended link never opens again). p_expiry: '7d' | '30d' | '1y', counted from now; null keeps the date.
create or replace function app_update_record_link(
  p_link_id integer, p_sections text[], p_edit_sections text[], p_expiry text
)
returns table (
  outcome text, id integer, pet_id integer, sections text[], allow_notes boolean, edit_sections text[],
  created_at timestamptz, expires_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_link   care_record_links%rowtype;
  v_length interval;
begin
  if p_expiry is not null then
    v_length := case p_expiry
                  when '7d' then interval '7 days'
                  when '30d' then interval '30 days'
                  when '1y' then interval '1 year'
                end;
    if v_length is null then
      raise exception 'app_update_record_link: unknown expiry' using errcode = '22023';
    end if;
  end if;
  if p_sections is null or p_edit_sections is null then
    raise exception 'app_update_record_link: sections are required' using errcode = '22023';
  end if;

  -- Locked, so an edit lands fully before or after a removal or anything done through the link.
  select l.* into v_link
  from care_record_links l
  where l.id = p_link_id
    and l.owner_user_id = current_app_user_id()
    and exists (select 1 from pets p where p.id = l.pet_id and p.owner_user_id = l.owner_user_id)
  for update;

  if not found then
    return query select 'not_found'::text, null::integer, null::integer, null::text[], null::boolean, null::text[],
                        null::timestamptz, null::timestamptz;
    return;
  end if;
  if v_link.revoked_at is not null or v_link.expires_at <= now() then
    return query select 'not_active'::text, null::integer, null::integer, null::text[], null::boolean, null::text[],
                        null::timestamptz, null::timestamptz;
    return;
  end if;

  -- The table's own rules check the parts, and that nothing unshared can be added to.
  return query
  update care_record_links l
  set sections = p_sections,
      edit_sections = p_edit_sections,
      expires_at = case when v_length is null then l.expires_at else now() + v_length end,
      terms_changed_at = case when v_length is null then l.terms_changed_at else now() end
  where l.id = v_link.id
  returning 'updated'::text, l.id, l.pet_id, l.sections, l.allow_notes, l.edit_sections, l.created_at, l.expires_at;
end
$$;

revoke execute on function app_update_record_link(integer, text[], text[], text) from public;
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke execute on function app_update_record_link(integer, text[], text[], text) from %I', r);
    end if;
  end loop;
end
$$;
grant execute on function app_update_record_link(integer, text[], text[], text) to pawpi_app;
