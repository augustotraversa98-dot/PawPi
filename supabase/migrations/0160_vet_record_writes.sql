-- 0160_vet_record_writes.sql
-- A vet adds to the owner's vet record, in exactly the parts the owner allows (docs/vet-sharing-design.md,
-- "What a vet can add").
--
-- WHAT
--  1. Provenance on vet_notes, pet_vaccinations, pet_lab_results and vet_documents: which business added the row, or
--     that it came through a record link (and the signed-in author's name, or none). created_at says when. Only the
--     database writes these columns.
--  2. app_provider_add_record / app_provider_update_vet_note: the way a business writes. Allowed by a grant by section
--     whose edit_sections names the part (0158); for notes and vaccinations also by the older write scopes, which keep
--     meaning what they meant. A note can be corrected only by the business that added it, while it may still add notes.
--  3. app_record_link_check_edit / app_record_link_add_record: the way a record link holder adds a vaccination, a lab
--     result or a document, only for the parts in the link's edit_sections, at most 20 per link in 24 hours. Notes keep
--     their own functions (0153, 0157).
--  4. app_record_link_view also answers `edit_sections`.
--  5. A note added under a grant by section unlocks nothing (app_pet_has_vet_relationship), like the grant itself.
-- Nothing here deletes anything: only the owner (and their family, as before) removes a record.
--
-- ADDITIVE and IDEMPOTENT. No row is changed or deleted and no existing policy is changed: a grant by section still has
-- no insert policy, so these functions are its only way to write. The server deployed before this migration keeps
-- working with it, and the new server works without it (older write scopes only; nothing new can be added).
-- HAND-APPLIED after merge; then run supabase/verify_0160.sql (every row PASS). Apply after 0159.

-- ── 1. provenance ──────────────────────────────────────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['pet_vaccinations', 'pet_lab_results', 'vet_documents'] loop
    execute format('alter table %I add column if not exists via_record_link boolean not null default false', t);
    execute format('alter table %I add column if not exists record_link_id integer references care_record_links(id) on delete set null', t);
    execute format('alter table %I add column if not exists external_author_name text', t);
    execute format('alter table %I drop constraint if exists %I', t, t || '_record_link_check');
    execute format(
      'alter table %I add constraint %I check (via_record_link or (record_link_id is null and external_author_name is null))',
      t, t || '_record_link_check');
    execute format('create index if not exists %I on %I (record_link_id)', 'idx_' || t || '_record_link_id', t);
  end loop;
  foreach t in array array['vet_notes', 'pet_vaccinations', 'pet_lab_results', 'vet_documents'] loop
    execute format('alter table %I add column if not exists added_by_provider_id integer references providers(id) on delete set null', t);
    execute format('create index if not exists %I on %I (added_by_provider_id)', 'idx_' || t || '_added_by_provider', t);
  end loop;
end
$$;
alter table vet_notes add column if not exists via_vet_share boolean not null default false;

comment on column vet_notes.via_vet_share is
  'True for a note added by a business under a grant by section. Like that grant, it counts for no other permission.';

-- The application role neither sets nor changes provenance: the functions below, which run as their owner, do.
create or replace function app_record_provenance_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user = 'pawpi_app' then
    if tg_op = 'INSERT' then
      if new.added_by_provider_id is not null then
        raise exception '%: added_by_provider_id is written by the database only', tg_table_name using errcode = '42501';
      end if;
    elsif new.added_by_provider_id is distinct from old.added_by_provider_id then
      raise exception '%: added_by_provider_id is written by the database only', tg_table_name using errcode = '42501';
    end if;
  end if;
  return new;
end
$$;

create or replace function app_record_link_row_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user = 'pawpi_app' then
    if tg_op = 'INSERT' then
      if new.via_record_link or new.record_link_id is not null or new.external_author_name is not null then
        raise exception '%: the record link columns are written by the database only', tg_table_name using errcode = '42501';
      end if;
    elsif new.via_record_link is distinct from old.via_record_link
          or new.record_link_id is distinct from old.record_link_id
          or new.external_author_name is distinct from old.external_author_name then
      raise exception '%: the record link columns are written by the database only', tg_table_name using errcode = '42501';
    end if;
  end if;
  return new;
end
$$;

create or replace function app_vet_note_share_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user = 'pawpi_app' then
    if tg_op = 'INSERT' then
      if new.via_vet_share then
        raise exception 'vet_notes: via_vet_share is written by the database only' using errcode = '42501';
      end if;
    elsif new.via_vet_share is distinct from old.via_vet_share then
      raise exception 'vet_notes: via_vet_share is written by the database only' using errcode = '42501';
    end if;
  end if;
  return new;
end
$$;

-- When the person who added a row through a link deletes their account, their name leaves the row.
create or replace function app_record_link_row_author_gone()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.via_record_link
     and old.created_by_user_id is not null
     and new.created_by_user_id is distinct from old.created_by_user_id then
    new.external_author_name := 'Former member';
  end if;
  return new;
end
$$;

do $$
declare t text;
begin
  foreach t in array array['pet_vaccinations', 'pet_lab_results', 'vet_documents'] loop
    -- Triggers run in name order: the author trigger first, so the guard sees the row as it will be stored.
    execute format('drop trigger if exists %I on %I', t || '_link_author_gone', t);
    execute format(
      'create trigger %I before update of created_by_user_id on %I for each row execute function app_record_link_row_author_gone()',
      t || '_link_author_gone', t);
    execute format('drop trigger if exists %I on %I', t || '_link_guard', t);
    execute format(
      'create trigger %I before insert or update on %I for each row execute function app_record_link_row_guard()',
      t || '_link_guard', t);
  end loop;
  foreach t in array array['vet_notes', 'pet_vaccinations', 'pet_lab_results', 'vet_documents'] loop
    execute format('drop trigger if exists %I on %I', t || '_provenance_guard', t);
    execute format(
      'create trigger %I before insert or update on %I for each row execute function app_record_provenance_guard()',
      t || '_provenance_guard', t);
  end loop;
end
$$;
drop trigger if exists vet_notes_share_guard on vet_notes;
create trigger vet_notes_share_guard
  before insert or update on vet_notes
  for each row execute function app_vet_note_share_guard();

-- ── 2. what a business may add ─────────────────────────────────────────────────────────────────────────────────
-- One row when the caller is active staff of the business and its grant on the pet, from the pet's current owner, is
-- active, unexpired and allows adding to this part. Otherwise no row.
create or replace function app_provider_may_add(p_pet_id integer, p_provider_id integer, p_section text)
returns table (owner_user_id integer, grant_id integer, by_section boolean)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select g.owner_user_id, g.id, g.sections is not null
  from care_access_grants g
  join pets p on p.id = g.pet_id and p.owner_user_id = g.owner_user_id
  where g.pet_id = p_pet_id
    and g.provider_id = p_provider_id
    and app_is_active_staff_of(p_provider_id)
    and g.status = 'active'
    and (g.expires_at is null or g.expires_at > now())
    and (
      p_section = any (g.edit_sections)
      -- The older write scopes (a request approved as asked), for the two parts they always covered.
      or (g.sections is null and (
            (p_section = 'vet_notes' and 'medical_write' = any (g.scopes))
            or (p_section = 'vaccines' and 'vaccinations_write' = any (g.scopes))))
    )
  order by (g.sections is not null) desc, g.id desc
  limit 1
$$;

-- A calendar date written YYYY-MM-DD, null for nothing, or an error the callers answer as bad data.
create or replace function app_record_date(p_value text)
returns date
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare v_text text := nullif(btrim(coalesce(p_value, '')), '');
begin
  if v_text is null then
    return null;
  end if;
  if v_text !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'not a date' using errcode = '22007';
  end if;
  return v_text::date;
end
$$;

-- Trimmed text of at most p_max characters, null for nothing, or an error the callers answer as bad data.
create or replace function app_record_text(p_value text, p_max integer)
returns text
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare v_text text := nullif(btrim(coalesce(p_value, ''), E' \t\r\n'), '');
begin
  if length(v_text) > p_max then
    raise exception 'text too long' using errcode = '22001';
  end if;
  return v_text;
end
$$;

-- Adds one row to a part of the record. p_owner and the provenance come from the callers, never from p_data.
-- A private file reference must be a file of that pet.
-- It checks no permission and needs none: it runs with its caller's rights (SECURITY INVOKER), so only inside the two
-- functions below does it write past row security. Called by the application role itself, row security and the
-- provenance guards apply as to any insert.
create or replace function app_insert_shared_record(
  p_section text, p_pet integer, p_owner integer, p_data jsonb, p_user integer, p_role text,
  p_provider integer, p_link integer, p_author text, p_provider_name text
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = public, pg_temp
as $$
declare
  v_row      jsonb;
  v_name     text;
  v_date     date;
  v_key      text;
  v_category text;
begin
  if p_section = 'vaccines' then
    v_name := app_record_text(p_data ->> 'name', 200);
    if v_name is null then
      raise exception 'name is required' using errcode = '23502';
    end if;
    insert into pet_vaccinations (
      pet_id, owner_user_id, name, date_given, expires_on, lot, clinic_name, notes, administered_by_provider_id,
      created_by_user_id, created_by_role, added_by_provider_id, via_record_link, record_link_id, external_author_name
    ) values (
      p_pet, p_owner, v_name, app_record_date(p_data ->> 'date_given'), app_record_date(p_data ->> 'expires_on'),
      app_record_text(p_data ->> 'lot', 100), coalesce(app_record_text(p_data ->> 'clinic_name', 200), p_provider_name),
      app_record_text(p_data ->> 'notes', 2000), p_provider,
      p_user, p_role, p_provider, p_link is not null, p_link, p_author
    )
    returning to_jsonb(pet_vaccinations.*) into v_row;
  elsif p_section = 'lab_results' then
    v_name := app_record_text(p_data ->> 'test_name', 200);
    v_date := app_record_date(p_data ->> 'test_date');
    if v_name is null or v_date is null then
      raise exception 'test_name and test_date are required' using errcode = '23502';
    end if;
    insert into pet_lab_results (
      pet_id, owner_user_id, test_name, test_date, results, ordered_by, notes,
      created_by_user_id, created_by_role, added_by_provider_id, via_record_link, record_link_id, external_author_name
    ) values (
      p_pet, p_owner, v_name, v_date, app_record_text(p_data ->> 'results', 5000),
      app_record_text(p_data ->> 'ordered_by', 200), app_record_text(p_data ->> 'notes', 2000),
      p_user, p_role, p_provider, p_link is not null, p_link, p_author
    )
    returning to_jsonb(pet_lab_results.*) into v_row;
  elsif p_section = 'files' then
    v_name := app_record_text(p_data ->> 'name', 200);
    v_key := p_data ->> 'file_key';
    v_category := nullif(p_data ->> 'category', '');
    if v_name is null
       or v_key is null
       or v_key !~ ('^pets/' || p_pet::text || '/[A-Za-z0-9._-]+$')
       or strpos(v_key, '..') > 0 then
      raise exception 'name and a file of this pet are required' using errcode = '23502';
    end if;
    insert into vet_documents (
      pet_id, owner_user_id, name, document_type, file_url, document_date, notes, category,
      created_by_user_id, created_by_role, added_by_provider_id, via_record_link, record_link_id, external_author_name
    ) values (
      p_pet, p_owner, v_name, coalesce(app_record_text(p_data ->> 'document_type', 50), v_category, 'other'), v_key,
      app_record_date(p_data ->> 'document_date'), app_record_text(p_data ->> 'notes', 2000), v_category,
      p_user, p_role, p_provider, p_link is not null, p_link, p_author
    )
    returning to_jsonb(vet_documents.*) into v_row;
  else
    raise exception 'unknown part' using errcode = '22023';
  end if;
  return v_row;
end
$$;

-- outcome: 'added' | 'not_allowed' | 'bad_data'. `record` is the stored row.
create or replace function app_provider_add_record(p_pet_id integer, p_provider_id integer, p_section text, p_data jsonb)
returns table (outcome text, grant_id integer, record jsonb)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_access      record;
  v_user        integer := current_app_user_id();
  v_provider    text;
  v_staff       text;
  v_zone        text;
  v_note        text;
  v_date        date;
  v_appointment integer;
  v_row         jsonb;
begin
  -- One change at a time per pet and business: a removal or an edit lands fully before or after the row.
  perform pg_advisory_xact_lock(hashtext('care_access_grant:' || p_pet_id || ':' || p_provider_id));
  select * into v_access from app_provider_may_add(p_pet_id, p_provider_id, p_section);
  if v_user is null or v_access.grant_id is null then
    return query select 'not_allowed'::text, null::integer, null::jsonb;
    return;
  end if;

  select pr.name into v_provider from providers pr where pr.id = p_provider_id;

  begin
    if p_section = 'vet_notes' then
      v_note := app_record_text(p_data ->> 'note', 10000);
      if v_note is null then
        raise exception 'note is required' using errcode = '23502';
      end if;
      v_date := app_record_date(p_data ->> 'note_date');
      if v_date is null then
        select o.timezone into v_zone from user_profiles o where o.id = v_access.owner_user_id;
        begin
          v_date := (now() at time zone coalesce(nullif(btrim(v_zone), ''), 'America/Buenos_Aires'))::date;
        exception when others then
          v_date := (now() at time zone 'America/Buenos_Aires')::date;
        end;
      end if;
      -- Only this business's own booking of this pet is linked.
      if p_data ->> 'appointment_id' ~ '^\d{1,9}$' then
        select a.id into v_appointment from vet_appointments a
        where a.id = (p_data ->> 'appointment_id')::integer and a.pet_id = p_pet_id and a.provider_id = p_provider_id;
      end if;
      -- A note always names who wrote it, never by e-mail address or username.
      select case when position('@' in u.full_name) = 0 then nullif(btrim(u.full_name), '') end
        into v_staff from user_profiles u where u.id = v_user;
      insert into vet_notes (
        pet_id, owner_user_id, vet_name, note_date, note, appointment_id,
        created_by_user_id, created_by_role, added_by_provider_id, via_vet_share
      ) values (
        p_pet_id, v_access.owner_user_id,
        coalesce(app_record_text(p_data ->> 'vet_name', 200), v_staff, v_provider, 'Veterinario'),
        v_date, v_note, v_appointment,
        v_user, 'editor', p_provider_id, v_access.by_section
      )
      returning to_jsonb(vet_notes.*) into v_row;
    else
      v_row := app_insert_shared_record(
        p_section, p_pet_id, v_access.owner_user_id, p_data, v_user, 'editor', p_provider_id, null, null, v_provider);
    end if;
  exception
    when invalid_datetime_format or datetime_field_overflow or string_data_right_truncation
      or not_null_violation or invalid_parameter_value or check_violation then
      return query select 'bad_data'::text, v_access.grant_id, null::jsonb;
      return;
  end;

  return query select 'added'::text, v_access.grant_id, v_row;
end
$$;

-- outcome: 'updated' | 'unchanged' | 'not_found' (not a note this business added to this pet) | 'not_allowed' |
-- 'bad_note'.
create or replace function app_provider_update_vet_note(
  p_pet_id integer, p_provider_id integer, p_note_id integer, p_note text
)
returns table (outcome text, grant_id integer, record jsonb)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_access record;
  v_old    vet_notes%rowtype;
  v_note   text := btrim(coalesce(p_note, ''), E' \t\r\n');
  v_row    jsonb;
begin
  perform pg_advisory_xact_lock(hashtext('care_access_grant:' || p_pet_id || ':' || p_provider_id));
  select * into v_access from app_provider_may_add(p_pet_id, p_provider_id, 'vet_notes');
  if v_access.grant_id is null then
    return query select 'not_allowed'::text, null::integer, null::jsonb;
    return;
  end if;
  if length(v_note) < 1 or length(v_note) > 10000 then
    return query select 'bad_note'::text, v_access.grant_id, null::jsonb;
    return;
  end if;
  select n.* into v_old
  from vet_notes n
  where n.id = p_note_id and n.pet_id = p_pet_id and n.owner_user_id = v_access.owner_user_id
    and n.added_by_provider_id = p_provider_id
  for update;
  if not found then
    return query select 'not_found'::text, v_access.grant_id, null::jsonb;
    return;
  end if;
  if v_old.note = v_note then
    return query select 'unchanged'::text, v_access.grant_id, to_jsonb(v_old);
    return;
  end if;
  update vet_notes n
  set note = v_note, vet_edited_at = now(), updated_at = now()
  where n.id = v_old.id
  returning to_jsonb(n.*) into v_row;
  return query select 'updated'::text, v_access.grant_id, v_row;
end
$$;

-- ── 3. what a link holder may add ──────────────────────────────────────────────────────────────────────────────
-- outcome: 'ok' | 'invalid' | 'not_allowed' | 'limit', for one of 'vaccines', 'lab_results', 'files'. Asked before a
-- file is stored; app_record_link_add_record asks it again under the link's lock.
create or replace function app_record_link_check_edit(p_token_hash text, p_section text)
returns table (outcome text, pet_id integer)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with link as (
    select l.*
    from care_record_links l
    join pets p on p.id = l.pet_id and p.owner_user_id = l.owner_user_id
    where l.token_hash = p_token_hash and l.revoked_at is null and l.expires_at > now()
  ),
  used as (
    select (select count(*) from pet_vaccinations v, link where v.record_link_id = link.id and v.created_at > now() - interval '24 hours')
         + (select count(*) from pet_lab_results r, link where r.record_link_id = link.id and r.created_at > now() - interval '24 hours')
         + (select count(*) from vet_documents d, link where d.record_link_id = link.id and d.created_at > now() - interval '24 hours') as n
  )
  select case
           when link.id is null then 'invalid'
           when p_section is null or p_section not in ('vaccines', 'lab_results', 'files')
             or not (p_section = any (link.edit_sections)) then 'not_allowed'
           when used.n >= 20 then 'limit'
           else 'ok'
         end,
         case when link.id is not null and p_section = any (link.edit_sections) then link.pet_id end
  from used
  left join link on true
$$;

-- outcome: 'added' | 'invalid' | 'not_allowed' | 'limit' | 'bad_data'. The author is the identity of the request,
-- never an argument: their display name, or no name at all.
create or replace function app_record_link_add_record(p_token_hash text, p_section text, p_data jsonb)
returns table (outcome text, record_id integer, author text)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_link   care_record_links%rowtype;
  v_check  text;
  v_user   integer := current_app_user_id();
  v_name   text;
  v_row    jsonb;
begin
  -- Locked, so a revocation or an edit lands fully before or after the row, and the daily count holds.
  select l.* into v_link
  from care_record_links l
  where l.token_hash = p_token_hash and l.revoked_at is null and l.expires_at > now()
  for update;
  if not found then
    return query select 'invalid'::text, null::integer, null::text;
    return;
  end if;
  select c.outcome into v_check from app_record_link_check_edit(p_token_hash, p_section) c;
  if v_check <> 'ok' then
    return query select v_check, null::integer, null::text;
    return;
  end if;

  if v_user is not null then
    select coalesce(nullif(btrim(u.full_name), ''), nullif(btrim(a.name), '')) into v_name
    from user_profiles u
    left join auth_users a on a.id = u.auth_user_id
    where u.id = v_user;
    v_name := nullif(btrim(left(regexp_replace(coalesce(v_name, ''), '[[:space:][:cntrl:]]+', ' ', 'g'), 80)), '');
    -- An e-mail address is never shown as a name.
    if position('@' in v_name) > 0 then
      v_name := null;
    end if;
  end if;

  begin
    v_row := app_insert_shared_record(
      p_section, v_link.pet_id, v_link.owner_user_id, p_data, v_user, 'editor', null, v_link.id, v_name, null);
  exception
    when invalid_datetime_format or datetime_field_overflow or string_data_right_truncation
      or not_null_violation or invalid_parameter_value or check_violation then
      return query select 'bad_data'::text, null::integer, null::text;
      return;
  end;

  return query select 'added'::text, (v_row ->> 'id')::integer, v_name;
end
$$;

-- ── 4. what a link holder reads ────────────────────────────────────────────────────────────────────────────────
-- Same contract as 0157; adds `edit_sections`.
create or replace function app_record_link_view(p_token_hash text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'pet_name', p.name,
    -- An e-mail address is never shown as a name.
    'owner_name', case when position('@' in o.full_name) = 0 then nullif(btrim(o.full_name), '') end,
    'expires_at', l.expires_at,
    'allow_notes', l.allow_notes,
    'sections', to_jsonb(l.sections),
    'edit_sections', to_jsonb(l.edit_sections),
    'profile', (
      select jsonb_build_object(
        'microchip_id', mp.microchip_id,
        'spayed_neutered_status', mp.spayed_neutered_status,
        'spayed_neutered_date', mp.spayed_neutered_date,
        'primary_vet_name', mp.primary_vet_name,
        'primary_clinic_name', mp.primary_clinic_name,
        'vet_phone', mp.vet_phone,
        'vet_email', mp.vet_email,
        'medical_notes', mp.medical_notes)
      from pet_medical_profiles mp
      where 'profile' = any (l.sections)
        and mp.pet_id = l.pet_id and mp.owner_user_id = l.owner_user_id and mp.deleted_at is null
    ),
    'emergency_contact', (
      select jsonb_build_object(
        'emergency_contact_name', mp.emergency_contact_name,
        'emergency_contact_phone', mp.emergency_contact_phone)
      from pet_medical_profiles mp
      where 'emergency_contact' = any (l.sections)
        and mp.pet_id = l.pet_id and mp.owner_user_id = l.owner_user_id and mp.deleted_at is null
    ),
    'insurance', (
      select jsonb_build_object(
        'insurance_provider', mp.insurance_provider,
        'insurance_policy_number', mp.insurance_policy_number)
      from pet_medical_profiles mp
      where 'insurance' = any (l.sections)
        and mp.pet_id = l.pet_id and mp.owner_user_id = l.owner_user_id and mp.deleted_at is null
    ),
    'vet_notes', case when 'vet_notes' = any (l.sections) then coalesce((
      select jsonb_agg(jsonb_build_object(
        'note_date', n.note_date,
        'note', n.note,
        'vet_name', n.vet_name,
        'via_link', n.via_record_link,
        'external_author_name', n.external_author_name,
        'edited_at', n.vet_edited_at,
        'link_note_id', case when n.record_link_id = l.id then n.id end
      ) order by n.note_date desc, n.created_at desc, n.id desc)
      from vet_notes n
      where n.pet_id = l.pet_id and n.owner_user_id = l.owner_user_id
    ), '[]'::jsonb) end,
    -- The notes added through this link, so whoever wrote one finds it again even when the notes part is not shared.
    'link_notes', case when l.allow_notes or 'vet_notes' = any (l.sections) then coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', n.id,
        'note_date', n.note_date,
        'note', n.note,
        'external_author_name', n.external_author_name,
        'edited_at', n.vet_edited_at,
        'editable', l.allow_notes and (
          (n.created_by_user_id is null and n.external_author_name is distinct from 'Former member')
          or n.created_by_user_id is not distinct from current_app_user_id() and n.created_by_user_id is not null
        ),
        'needs_sign_in', l.allow_notes and n.created_by_user_id is not null and current_app_user_id() is null
      ) order by n.created_at desc, n.id desc)
      from vet_notes n
      where n.record_link_id = l.id and n.pet_id = l.pet_id and n.owner_user_id = l.owner_user_id
    ), '[]'::jsonb) end,
    'vaccines', case when 'vaccines' = any (l.sections) then coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', v.name,
        'date_given', v.date_given,
        'expires_on', v.expires_on,
        'lot', v.lot,
        'clinic_name', v.clinic_name,
        'notes', v.notes
      ) order by v.date_given desc nulls last, v.created_at desc, v.id desc)
      from pet_vaccinations v
      where v.pet_id = l.pet_id and v.owner_user_id = l.owner_user_id and v.deleted_at is null
    ), '[]'::jsonb) end,
    'files', case when 'files' = any (l.sections) then coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id,
        'name', d.name,
        'document_type', d.document_type,
        'document_date', d.document_date,
        'notes', d.notes,
        'file_available', d.file_url ~ ('^pets/' || l.pet_id::text || '/[A-Za-z0-9._-]+$') and strpos(d.file_url, '..') = 0
      ) order by d.document_date desc nulls last, d.created_at desc, d.id desc)
      from vet_documents d
      where d.pet_id = l.pet_id and d.owner_user_id = l.owner_user_id
    ), '[]'::jsonb) end,
    'photos', case when 'photos' = any (l.sections) then coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', h.id,
        'created_at', h.created_at,
        'body_area', h.body_area,
        'notes', h.notes,
        'file_available', h.image_url ~ ('^pets/' || l.pet_id::text || '/[A-Za-z0-9._-]+$') and strpos(h.image_url, '..') = 0
      ) order by h.created_at desc, h.id desc)
      from health_photo_checks h
      where h.pet_id = l.pet_id and h.owner_user_id = l.owner_user_id
    ), '[]'::jsonb) end,
    'lab_results', case when 'lab_results' = any (l.sections) then coalesce((
      select jsonb_agg(jsonb_build_object(
        'test_name', r.test_name,
        'test_date', r.test_date,
        'results', r.results,
        'ordered_by', r.ordered_by,
        'notes', r.notes
      ) order by r.test_date desc, r.created_at desc, r.id desc)
      from pet_lab_results r
      where r.pet_id = l.pet_id and r.owner_user_id = l.owner_user_id
    ), '[]'::jsonb) end
  )
  from care_record_links l
  join pets p
    on p.id = l.pet_id and p.owner_user_id = l.owner_user_id
  join user_profiles o
    on o.id = l.owner_user_id
  where l.token_hash = p_token_hash
    and l.revoked_at is null
    and l.expires_at > now()
$$;

-- ── 5. a note added under a grant by section unlocks nothing ───────────────────────────────────────────────────
-- Same contract as 0153; the only change is "not vn.via_vet_share".
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
      select 1 from vet_notes vn where vn.pet_id = p_pet_id and not vn.via_record_link and not vn.via_vet_share
    )
$$;

-- ── privileges ─────────────────────────────────────────────────────────────────────────────────────────────────
do $$
declare
  f text;
  r text;
  app_functions text[] := array[
    'app_record_provenance_guard()',
    'app_record_link_row_guard()',
    'app_vet_note_share_guard()',
    'app_record_link_row_author_gone()',
    'app_provider_may_add(integer, integer, text)',
    'app_insert_shared_record(text, integer, integer, jsonb, integer, text, integer, integer, text, text)',
    'app_record_date(text)',
    'app_record_text(text, integer)',
    'app_provider_add_record(integer, integer, text, jsonb)',
    'app_provider_update_vet_note(integer, integer, integer, text)',
    'app_record_link_check_edit(text, text)',
    'app_record_link_add_record(text, text, jsonb)',
    'app_record_link_view(text)',
    'app_pet_has_vet_relationship(integer)'
  ];
begin
  foreach f in array app_functions loop
    execute format('revoke execute on function %s from public', f);
    foreach r in array array['anon', 'authenticated'] loop
      if exists (select 1 from pg_roles where rolname = r) then
        execute format('revoke execute on function %s from %I', f, r);
      end if;
    end loop;
    execute format('grant execute on function %s to pawpi_app', f);
  end loop;
end
$$;
