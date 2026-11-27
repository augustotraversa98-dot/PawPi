-- 0157_record_link_note_edit.sql
-- A vet can read back and correct the notes added through a record link (docs/vet-sharing-design.md, "Record links").
--
-- WHY
--  A link may allow adding notes without sharing the "vet notes" part. app_record_link_view answered vet notes only for
--  that part, so such a note was saved and never shown again to whoever wrote it, and nothing could correct it.
--
-- WHAT
--  1. vet_notes.vet_edited_at: when a note was last corrected through sharing. Only the database writes it.
--  2. app_record_link_view also answers `link_notes`: every note added through THIS link, newest first, each with whether
--     the caller may edit it. Only when the link allows notes or shares them. Each entry of `vet_notes` gains
--     `link_note_id` (set for a note of this link, otherwise null).
--  3. app_record_link_update_note: edits the text of one note added through this link, while the link allows notes. A
--     note written by a signed-in person is edited only by that person; an anonymous one by whoever holds the link.
--  4. The "author is gone" trigger now marks every signed-in author's link note, with or without a name, so such a note
--     never turns into an anonymous (editable) one.
--
-- ADDITIVE and IDEMPOTENT. No row is deleted, no policy is changed, and the server deployed before this migration keeps
-- working with it (the new server also works without it: nothing can be edited and no extra notes are listed).
-- HAND-APPLIED after merge; then run supabase/verify_0157.sql (every row PASS). Apply after 0153.

-- ── 1. the column ──────────────────────────────────────────────────────────────────────────────────────────────
alter table vet_notes add column if not exists vet_edited_at timestamptz;

comment on column vet_notes.vet_edited_at is
  'When the note was last corrected by someone it was shared with. Written by the database only.';

-- Same contract as 0153; vet_edited_at joins the columns the application role neither sets nor changes.
create or replace function app_vet_note_link_fields_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user = 'pawpi_app' then
    if tg_op = 'INSERT' then
      if new.via_record_link or new.record_link_id is not null or new.external_author_name is not null then
        raise exception 'vet_notes: the record link columns are written by the database only' using errcode = '42501';
      end if;
      if new.vet_edited_at is not null then
        raise exception 'vet_notes: vet_edited_at is written by the database only' using errcode = '42501';
      end if;
    elsif new.via_record_link is distinct from old.via_record_link
          or new.record_link_id is distinct from old.record_link_id
          or new.external_author_name is distinct from old.external_author_name
          or new.vet_edited_at is distinct from old.vet_edited_at then
      raise exception 'vet_notes: the record link columns are written by the database only' using errcode = '42501';
    end if;
  end if;
  return new;
end
$$;

-- Same contract as 0153; also covers a signed-in author who had no name to show.
create or replace function app_record_link_note_author_gone()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.via_record_link
     and old.created_by_user_id is not null
     and new.created_by_user_id is distinct from old.created_by_user_id then
    new.external_author_name := 'Former member';
    new.vet_name := case when app_recipient_locale(new.owner_user_id) = 'en'
                         then 'Former member (shared link)' else 'Ex integrante (enlace compartido)' end;
  end if;
  return new;
end
$$;

-- ── 2. what a link holder reads ────────────────────────────────────────────────────────────────────────────────
-- Same contract as 0153; adds `link_notes` and `vet_notes[].link_note_id`.
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

-- ── 3. correcting a note ───────────────────────────────────────────────────────────────────────────────────────
-- outcome: 'updated' | 'unchanged' | 'invalid' | 'not_allowed' | 'bad_note' | 'not_found' | 'not_author'.
create or replace function app_record_link_update_note(p_token_hash text, p_note_id integer, p_note text)
returns table (outcome text, edited_at timestamptz)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_link care_record_links%rowtype;
  v_old  vet_notes%rowtype;
  v_note text := btrim(coalesce(p_note, ''), E' \t\r\n');
  v_user integer := current_app_user_id();
  v_at   timestamptz;
begin
  -- The link row is locked, so a revocation lands fully before or after the change.
  select l.* into v_link
  from care_record_links l
  where l.token_hash = p_token_hash
    and l.revoked_at is null
    and l.expires_at > now()
  for update;

  if not found
     or not exists (select 1 from pets p where p.id = v_link.pet_id and p.owner_user_id = v_link.owner_user_id) then
    return query select 'invalid'::text, null::timestamptz;
    return;
  end if;
  if not v_link.allow_notes then
    return query select 'not_allowed'::text, null::timestamptz;
    return;
  end if;
  if length(v_note) < 1 or length(v_note) > 2000 then
    return query select 'bad_note'::text, null::timestamptz;
    return;
  end if;

  select n.* into v_old
  from vet_notes n
  where n.id = p_note_id
    and n.record_link_id = v_link.id
    and n.pet_id = v_link.pet_id
    and n.owner_user_id = v_link.owner_user_id
  for update;
  if not found then
    return query select 'not_found'::text, null::timestamptz;
    return;
  end if;

  if (v_old.created_by_user_id is not null and v_old.created_by_user_id is distinct from v_user)
     or (v_old.created_by_user_id is null and v_old.external_author_name is not distinct from 'Former member') then
    return query select 'not_author'::text, null::timestamptz;
    return;
  end if;

  if v_old.note = v_note then
    return query select 'unchanged'::text, v_old.vet_edited_at;
    return;
  end if;

  update vet_notes n
  set note = v_note, vet_edited_at = now(), updated_at = now()
  where n.id = v_old.id
  returning n.vet_edited_at into v_at;

  return query select 'updated'::text, v_at;
end
$$;

-- ── privileges ─────────────────────────────────────────────────────────────────────────────────────────────────
revoke execute on function app_vet_note_link_fields_guard() from public;
revoke execute on function app_record_link_note_author_gone() from public;
revoke execute on function app_record_link_view(text) from public;
revoke execute on function app_record_link_update_note(text, integer, text) from public;
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke execute on function app_vet_note_link_fields_guard() from %I', r);
      execute format('revoke execute on function app_record_link_note_author_gone() from %I', r);
      execute format('revoke execute on function app_record_link_view(text) from %I', r);
      execute format('revoke execute on function app_record_link_update_note(text, integer, text) from %I', r);
    end if;
  end loop;
end
$$;
grant execute on function app_vet_note_link_fields_guard() to pawpi_app;
grant execute on function app_record_link_note_author_gone() to pawpi_app;
grant execute on function app_record_link_view(text) to pawpi_app;
grant execute on function app_record_link_update_note(text, integer, text) to pawpi_app;
