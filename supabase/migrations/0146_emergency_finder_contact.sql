-- 0146_emergency_finder_contact.sql
--
-- ⚠️ HAND-APPLY (new columns + new / replaced SECURITY DEFINER functions). Run in the Supabase SQL editor, then
--    run supabase/verify_0146.sql: every row must read PASS. Idempotent (safe to run twice).
--
-- Emergency / finder flow (docs/emergency-finder.md). A stranger who scans the collar tag can leave a name, phone
-- and/or email with a message. The owner AND the pet's active family / caregivers get it in the app, and the web
-- server sends a push. The owner decides what the public pages show.
--
-- WHAT
--  1. notifications.finder_contact (jsonb) and notifications.finder_urgent (boolean).
--  2. pet_emergency_cards.show_emergency_contact_on_tag (default FALSE): the medical profile's emergency contact
--     appears on the public tag only when the owner turned this on.
--  3. app_emergency_published_contact: the one rule for "which owner phone / email is public".
--  4. app_emergency_finder_message: the finder message writer, with the per-pet limits and the member fan-out.
--  5. app_emergency_card_json (replaced): publish rule from 3, 'accepts_message', the opt-in tag emergency contact,
--     and no emergency contact on a full vet link when the finder setting is Relay or None.
--  6. app_purge_finder_details: deletes finder details after 90 days (called by the hourly cron job).
--
-- DEPLOY ORDER: this migration FIRST, then the web deploy. Both directions degrade cleanly:
--   • old web + this migration: the old web code keeps calling app_emergency_relay_contact(text, text), which is
--     NOT touched here (same signature, same body), so the live relay never breaks.
--   • new web + old database: the web code detects the missing function (42883) and falls back to the old relay,
--     putting the finder's contact at the top of the message text (no push, as today). The new owner setting is
--     reported as unavailable and nothing else changes.
--
-- THIRD-PARTY PERSONAL DATA: notifications.finder_contact and the notification body hold the finder's name / phone /
-- email / message. Readable only by each recipient (the pet's owner and the active family / caregivers at the time
-- of the message) through the existing notifications RLS (recipient_user_id = current_app_user_id()), and by
-- database administrators. Written only by the DEFINER function below. Deleted after 90 days (section 6), or
-- earlier when the recipient's account is deleted (notifications cascade on the recipient).

-- ── 1. Structured finder contact on the bell row ─────────────────────────────
alter table notifications add column if not exists finder_contact jsonb;
alter table notifications add column if not exists finder_urgent boolean;

comment on column notifications.finder_contact is
  'emergency_contact only: {pet_name, name, phone, email, message} left by an anonymous finder (third-party personal data; all but pet_name deleted after 90 days)';
comment on column notifications.finder_urgent is
  'emergency_contact only: true when this message was allowed to send an urgent (time-sensitive) push';

-- ── 2. Owner setting: emergency contact on the public tag (OFF by default) ───
alter table pet_emergency_cards
  add column if not exists show_emergency_contact_on_tag boolean not null default false;

comment on column pet_emergency_cards.show_emergency_contact_on_tag is
  'Owner opt-in: show the medical profile emergency contact name / phone on the public collar tag';

-- ── 3. Which owner phone / email is public ───────────────────────────────────
-- Phone and email share one column, so after switching "Phone" to "Email" the old phone number would still be
-- published (and the other way round). 'phone' publishes only a value without '@', 'email' only a value with '@';
-- 'relay' and 'none' publish nothing. NULL in phone / email mode means "nothing saved": the tag page then offers
-- the message form instead. SECURITY INVOKER: it reads no table.
create or replace function app_emergency_published_contact(p_mode text, p_value text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when p_mode = 'phone' and position('@' in p_value) = 0 then nullif(btrim(p_value), '')
    when p_mode = 'email' and position('@' in p_value) > 0 then nullif(btrim(p_value), '')
    else null
  end
$$;

revoke execute on function app_emergency_published_contact(text, text) from public;
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke execute on function app_emergency_published_contact(text, text) from %I', r);
    end if;
  end loop;
end
$$;
grant execute on function app_emergency_published_contact(text, text) to pawpi_app;

-- ── 4. The finder message writer ─────────────────────────────────────────────
-- A NEW name on purpose (not an overload of app_emergency_relay_contact), so no existing call can become ambiguous.
-- DEFINER: the caller is anonymous, and the card, the pet, the caregivers and the inserts are hidden from it by RLS.
-- Takes a message when the card is ACTIVE and either in 'relay' mode, or in 'phone' / 'email' mode with nothing
-- published. Returns NULL when there is no such target. The result (recipient ids, pet name, urgency) is for the web
-- SERVER (to send the push); the public API only returns ok.
--
-- Limits per pet, counted here so that no header, address or session can get around them (the web server adds a
-- limit per sender on top):
--   messages: 5 per 10 minutes and 30 per 24 hours; more are refused ({delivered:false});
--   urgent:   1 per 10 minutes and  4 per 24 hours; more are delivered as ordinary notifications.
-- The advisory lock makes parallel requests count one after another (otherwise they would all see the same count).
-- p_allow_urgent = false lets the server withhold urgency from a sender that already used it.
create or replace function app_emergency_finder_message(
  p_tag_token text,
  p_message text,
  p_finder_name text,
  p_finder_phone text,
  p_finder_email text,
  p_allow_urgent boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner      integer;
  v_pet        integer;
  v_pet_name   text;
  v_message    text := nullif(btrim(left(coalesce(p_message, ''), 500)), '');
  v_name       text := nullif(btrim(left(coalesce(p_finder_name, ''), 80)), '');
  v_phone      text := nullif(btrim(left(coalesce(p_finder_phone, ''), 40)), '');
  v_email      text := nullif(btrim(left(coalesce(p_finder_email, ''), 254)), '');
  v_recent     integer;
  v_today      integer;
  v_urg_recent integer;
  v_urg_today  integer;
  v_urgent     boolean;
  v_body       text;
  v_contact    jsonb;
  v_id         integer;
  v_note       integer;
  v_member     record;
  v_members    integer[] := '{}';
begin
  select c.owner_user_id, c.pet_id, p.name
    into v_owner, v_pet, v_pet_name
  from pet_emergency_cards c
  join pets p on p.id = c.pet_id
  where c.tag_token = p_tag_token
    and c.active = true
    and (c.contact_mode = 'relay'
         or (c.contact_mode in ('phone', 'email')
             and app_emergency_published_contact(c.contact_mode, c.contact_value) is null));
  if not found then
    return null;
  end if;

  perform pg_advisory_xact_lock(hashtext('pawpi.emergency_finder'), v_pet);

  -- One owner row per message (member copies are not counted).
  select count(*) filter (where n.created_at > now() - interval '10 minutes'),
         count(*),
         count(*) filter (where n.finder_urgent and n.created_at > now() - interval '10 minutes'),
         count(*) filter (where n.finder_urgent)
    into v_recent, v_today, v_urg_recent, v_urg_today
  from notifications n
  where n.recipient_user_id = v_owner
    and n.type = 'emergency_contact'
    and n.subject_ref = v_pet::text
    and n.created_at > now() - interval '24 hours';
  if v_recent >= 5 or v_today >= 30 then
    return jsonb_build_object('delivered', false);
  end if;
  v_urgent := coalesce(p_allow_urgent, false) and v_urg_recent < 1 and v_urg_today < 4;

  -- The body stays plain readable text (contact first), because app builds already installed show it as it is.
  v_body := concat_ws(E'\n', v_name, 'Tel: ' || v_phone, 'Email: ' || v_email, v_message);
  v_contact := jsonb_strip_nulls(jsonb_build_object(
    'pet_name', v_pet_name,
    'name', v_name,
    'phone', v_phone,
    'email', v_email,
    'message', v_message
  ));

  v_id := app_notify(v_owner, null, 'emergency_contact', v_pet::text, v_body);
  if v_id is null then
    return jsonb_build_object('delivered', false);
  end if;
  update notifications set finder_contact = v_contact, finder_urgent = v_urgent where id = v_id;

  -- Every ACTIVE, unexpired family member or caregiver of this pet (the same definition as
  -- app_user_has_pet_access, 0049) gets their own copy.
  for v_member in
    select distinct g.grantee_user_id as user_id
    from pet_caregivers g
    where g.pet_id = v_pet
      and g.status = 'active'
      and (g.expires_at is null or g.expires_at > now())
      and g.grantee_user_id <> v_owner
    order by 1
  loop
    v_note := app_notify(v_member.user_id, null, 'emergency_contact', v_pet::text, v_body);
    if v_note is not null then
      update notifications set finder_contact = v_contact, finder_urgent = v_urgent where id = v_note;
      v_members := v_members || v_member.user_id;
    end if;
  end loop;

  return jsonb_build_object(
    'delivered', true,
    'recipient_user_id', v_owner,
    'member_user_ids', to_jsonb(v_members),
    'pet_id', v_pet,
    'pet_name', v_pet_name,
    'notification_id', v_id,
    'urgent', v_urgent
  );
end;
$$;

revoke execute on function app_emergency_finder_message(text, text, text, text, text, boolean) from public;
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke execute on function app_emergency_finder_message(text, text, text, text, text, boolean) from %I', r);
    end if;
  end loop;
end
$$;
grant execute on function app_emergency_finder_message(text, text, text, text, text, boolean) to pawpi_app;

-- ── 5. Public card assembler ─────────────────────────────────────────────────
-- Changes against 0122:
--   • contact.value follows app_emergency_published_contact; contact.accepts_message says whether the tag page
--     offers the message form (relay, or phone / email with nothing published);
--   • top-level emergency_contact: only on the TAG and only when the owner opted in;
--   • the vet LINK (full) carries the emergency contact only when the finder setting is Phone or Email. With
--     Relay or None the two keys are absent.
-- The TAG's medical block is exactly as in 0122: no vet and no emergency-contact details inside it.
create or replace function app_emergency_card_json(
  p_card_id integer,
  p_include_medical boolean,
  p_medical_scope text
)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'pet', jsonb_build_object(
      'name', p.name,
      'species', p.species,
      'breed', p.breed,
      'age_years', p.age_years,
      'age_months', p.age_months,
      'gender', p.gender,
      'avatar_url', p.avatar_url,
      'has_home', true
    ),
    'microchip_id', mp.microchip_id,
    'contact', jsonb_build_object(
      'mode', c.contact_mode,
      -- raw owner contact is exposed ONLY for the channel the owner chose, and only if the value matches it.
      'value', app_emergency_published_contact(c.contact_mode, c.contact_value),
      'accepts_message', c.contact_mode = 'relay'
        or (c.contact_mode in ('phone', 'email')
            and app_emergency_published_contact(c.contact_mode, c.contact_value) is null)
    ),
    'emergency_contact', case
      when p_medical_scope = 'tag' and c.show_emergency_contact_on_tag
           and coalesce(nullif(btrim(mp.emergency_contact_name), ''), nullif(btrim(mp.emergency_contact_phone), '')) is not null
      then jsonb_build_object(
        'name', nullif(btrim(mp.emergency_contact_name), ''),
        'phone', nullif(btrim(mp.emergency_contact_phone), '')
      )
      else null
    end,
    'lost', (
      select case when lr.id is null then null else jsonb_build_object(
        'active', true,
        'reward', lr.reward,
        'last_seen_area', lr.last_seen_area,
        'report_id', lr.id
      ) end
      from lost_reports lr
      where lr.pet_id = c.pet_id and lr.status = 'active'
      order by lr.created_at desc
      limit 1
    ),
    'non_diagnostic', true,
    'medical', case
      when not p_include_medical then null
      -- TAG scope: only the fields the public tag page renders. NO vet/emergency contact details.
      when p_medical_scope = 'tag' then jsonb_build_object(
        'blood_type', c.blood_type,
        'spayed_neutered_status', mp.spayed_neutered_status,
        'medical_notes', mp.medical_notes,
        'allergies', coalesce((
          select jsonb_agg(jsonb_build_object(
            'allergen', a.allergen, 'severity', a.severity, 'reaction', a.reaction
          ) order by a.id)
          from pet_allergies a where a.pet_id = c.pet_id
        ), '[]'::jsonb),
        'conditions', coalesce((
          select jsonb_agg(jsonb_build_object(
            'condition', cd.condition, 'status', cd.status
          ) order by cd.id)
          from pet_conditions cd where cd.pet_id = c.pet_id
        ), '[]'::jsonb)
      )
      -- FULL scope (the vet LINK); the last two keys depend on the finder setting, see below.
      else jsonb_build_object(
        'blood_type', c.blood_type,
        'spayed_neutered_status', mp.spayed_neutered_status,
        'medical_notes', mp.medical_notes,
        'extra_notes', c.extra_notes,
        'primary_vet_name', mp.primary_vet_name,
        'primary_clinic_name', mp.primary_clinic_name,
        'vet_phone', mp.vet_phone,
        'allergies', coalesce((
          select jsonb_agg(jsonb_build_object(
            'allergen', a.allergen, 'severity', a.severity, 'reaction', a.reaction
          ) order by a.id)
          from pet_allergies a where a.pet_id = c.pet_id
        ), '[]'::jsonb),
        'conditions', coalesce((
          select jsonb_agg(jsonb_build_object(
            'condition', cd.condition, 'status', cd.status
          ) order by cd.id)
          from pet_conditions cd where cd.pet_id = c.pet_id
        ), '[]'::jsonb)
      ) || case
        when c.contact_mode in ('phone', 'email') then jsonb_build_object(
          'emergency_contact_name', mp.emergency_contact_name,
          'emergency_contact_phone', mp.emergency_contact_phone
        )
        else '{}'::jsonb
      end
    end
  )
  from pet_emergency_cards c
  join pets p on p.id = c.pet_id
  left join pet_medical_profiles mp on mp.pet_id = c.pet_id and mp.deleted_at is null
  where c.id = p_card_id;
$$;

-- CREATE OR REPLACE keeps the existing privileges; re-asserted so the result does not depend on history.
revoke execute on function app_emergency_card_json(integer, boolean, text) from public;
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke execute on function app_emergency_card_json(integer, boolean, text) from %I', r);
    end if;
  end loop;
end
$$;
grant execute on function app_emergency_card_json(integer, boolean, text) to pawpi_app;

-- ── 6. Retention: finder details are deleted after 90 days ───────────────────
-- Removes the message text and the finder's name / phone / email from every emergency_contact notification older
-- than 90 days (also rows written by the old relay), keeping only the pet's name so the entry still reads
-- "Someone found <pet>". Also removes the finder rate-limit counters (keyed on a hash of the sender's address) of
-- the same age. The 90 days are fixed here on purpose: no caller can ask for a shorter period. Returns how many
-- notifications were cleared. Called by POST /api/notifications/push-receipts/run (hourly cron).
create or replace function app_purge_finder_details()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cleared integer;
begin
  update notifications
     set body = null,
         finder_contact = case
           when finder_contact ? 'pet_name' then jsonb_build_object('pet_name', finder_contact -> 'pet_name')
         end
   where type = 'emergency_contact'
     and created_at < now() - interval '90 days'
     and (body is not null or (finder_contact - 'pet_name') <> '{}'::jsonb);
  get diagnostics v_cleared = row_count;

  delete from rate_limit_hits
   where bucket like 'emergency\_relay%'
     and window_start < now() - interval '90 days';

  return v_cleared;
end;
$$;

revoke execute on function app_purge_finder_details() from public;
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke execute on function app_purge_finder_details() from %I', r);
    end if;
  end loop;
end
$$;
grant execute on function app_purge_finder_details() to pawpi_app;
