-- 0146_emergency_finder_contact.sql
--
-- ⚠️ HAND-APPLY (new SECURITY DEFINER function + replaced DEFINER assembler). Run in the Supabase SQL editor, then
--    run supabase/verify_0146.sql: every row must read PASS. Idempotent (safe to run twice).
--
-- Emergency / finder flow. A stranger who scans the collar tag can now leave a name, phone and/or email with the
-- message, the owner's app shows them as tap-to-call / tap-to-email, and the web server sends a time-sensitive push.
--
-- DEPLOY ORDER: this migration FIRST, then the web deploy. Both directions degrade cleanly:
--   • old web + this migration: the old web code keeps calling app_emergency_relay_contact(text, text), which is
--     NOT touched here (same signature, same body), so the live relay never breaks.
--   • new web + old database: the web code detects the missing function (42883) and falls back to the old relay,
--     putting the finder's contact at the top of the message text (no push, as today).
--
-- THIRD-PARTY PERSONAL DATA: notifications.finder_contact and the notification body hold the finder's name / phone /
-- email / message. Readable only by the recipient (the pet's owner) through the existing notifications RLS
-- (recipient_user_id = current_app_user_id()), and by database administrators. Written only by the DEFINER function
-- below. Removed when the owner's account is deleted (notifications cascade on the recipient). No automatic expiry.

-- ── 1. Structured finder contact on the bell row ─────────────────────────────
alter table notifications add column if not exists finder_contact jsonb;

comment on column notifications.finder_contact is
  'emergency_contact only: {pet_name, name, phone, email, message} left by an anonymous finder (third-party personal data)';

-- ── 2. The finder message writer ─────────────────────────────────────────────
-- A NEW name on purpose (not an overload of app_emergency_relay_contact), so no existing call can become ambiguous.
-- DEFINER: the caller is anonymous, and the card, the pet and the insert are all hidden from it by RLS.
-- Same gate as the old relay: only an ACTIVE card in 'relay' mode. Returns NULL when there is no such target.
-- The result (recipient id, pet name) is for the web SERVER (to send the push); the public API only returns ok.
-- Abuse bound that does not depend on the caller's IP: at most 20 finder messages per pet per hour.
create or replace function app_emergency_finder_message(
  p_tag_token text,
  p_message text,
  p_finder_name text,
  p_finder_phone text,
  p_finder_email text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner    integer;
  v_pet      integer;
  v_pet_name text;
  v_message  text := nullif(btrim(left(coalesce(p_message, ''), 500)), '');
  v_name     text := nullif(btrim(left(coalesce(p_finder_name, ''), 80)), '');
  v_phone    text := nullif(btrim(left(coalesce(p_finder_phone, ''), 40)), '');
  v_email    text := nullif(btrim(left(coalesce(p_finder_email, ''), 254)), '');
  v_recent   integer;
  v_id       integer;
begin
  select c.owner_user_id, c.pet_id, p.name
    into v_owner, v_pet, v_pet_name
  from pet_emergency_cards c
  join pets p on p.id = c.pet_id
  where c.tag_token = p_tag_token and c.active = true and c.contact_mode = 'relay';
  if not found then
    return null;
  end if;

  select count(*)::integer into v_recent
  from notifications n
  where n.recipient_user_id = v_owner
    and n.type = 'emergency_contact'
    and n.subject_ref = v_pet::text
    and n.created_at > now() - interval '1 hour';
  if v_recent >= 20 then
    return jsonb_build_object('delivered', false);
  end if;

  -- The body stays plain readable text (contact first), because app builds already installed show it as it is.
  v_id := app_notify(
    v_owner, null, 'emergency_contact', v_pet::text,
    concat_ws(E'\n', v_name, 'Tel: ' || v_phone, 'Email: ' || v_email, v_message)
  );
  if v_id is null then
    return jsonb_build_object('delivered', false);
  end if;

  update notifications
     set finder_contact = jsonb_strip_nulls(jsonb_build_object(
           'pet_name', v_pet_name,
           'name', v_name,
           'phone', v_phone,
           'email', v_email,
           'message', v_message
         ))
   where id = v_id;

  return jsonb_build_object(
    'delivered', true,
    'recipient_user_id', v_owner,
    'pet_id', v_pet,
    'pet_name', v_pet_name,
    'notification_id', v_id,
    'recent_count', v_recent
  );
end;
$$;

revoke execute on function app_emergency_finder_message(text, text, text, text, text) from public;
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke execute on function app_emergency_finder_message(text, text, text, text, text) from %I', r);
    end if;
  end loop;
end
$$;
grant execute on function app_emergency_finder_message(text, text, text, text, text) to pawpi_app;

-- ── 3. Public card assembler: never show a value that does not match the chosen channel ──
-- Identical to 0122 except contact.value. Phone and email share one column, so after switching "Phone" to "Email"
-- the old phone number would still be published (and the other way round). Now 'phone' shows only a value without
-- '@', 'email' only a value with '@'; 'relay' and 'none' show nothing, as before. Medical least-privilege (0122)
-- is unchanged: the tag branch still excludes vet and emergency-contact details.
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
      'value', case
        when c.contact_mode = 'phone' and position('@' in c.contact_value) = 0 then nullif(btrim(c.contact_value), '')
        when c.contact_mode = 'email' and position('@' in c.contact_value) > 0 then nullif(btrim(c.contact_value), '')
        else null
      end
    ),
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
      -- FULL scope (the vet LINK): the complete block, unchanged from 0051.
      else jsonb_build_object(
        'blood_type', c.blood_type,
        'spayed_neutered_status', mp.spayed_neutered_status,
        'medical_notes', mp.medical_notes,
        'extra_notes', c.extra_notes,
        'primary_vet_name', mp.primary_vet_name,
        'primary_clinic_name', mp.primary_clinic_name,
        'vet_phone', mp.vet_phone,
        'emergency_contact_name', mp.emergency_contact_name,
        'emergency_contact_phone', mp.emergency_contact_phone,
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
