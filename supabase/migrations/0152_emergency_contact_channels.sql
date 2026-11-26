-- 0152_emergency_contact_channels.sql
--
-- ⚠️ HAND-APPLY (new columns, triggers and a replaced SECURITY DEFINER function). Run in the Supabase SQL editor,
--    then run supabase/verify_0152.sql: every row must read PASS. Idempotent (safe to run twice). Needs 0146.
--    If 0146 is ever run again afterwards, run this file again too.
--
-- Emergency / finder flow (docs/emergency-finder.md). The owner can show a finder a phone number, an email address,
-- both, or neither; with neither, the owner chooses between the private message form and no contact at all.
--
-- WHAT
--  1. pet_emergency_cards: contact_phone_enabled, contact_email_enabled, contact_message_enabled, contact_phone,
--     contact_email. All NULL until the owner uses the switches: such a card is described by contact_mode /
--     contact_value exactly as before. No existing row is changed by this migration.
--  2. Two triggers keep one truth between the old and the new columns, whichever app or web version writes:
--       • a write that names contact_mode / contact_value (older app builds) replaces the whole choice: the five new
--         columns are cleared;
--       • a write that names the new columns starts from the card's current choice and then rewrites contact_mode /
--         contact_value to match, so older app builds keep showing a true state:
--             a channel is on  → mode = the channel with a publishable value (phone first), value = its value;
--             both are off     → mode = 'relay' (private message) or 'none'.
--     A statement that names both kinds of column is treated as the first case.
--  3. app_emergency_card_json (replaced): for a card saved with the switches, 'contact' also carries 'phone' and
--     'email' (each NULL unless that channel is on and its value is publishable). Nothing else differs from 0146.
--
-- NOT CHANGED: app_emergency_published_contact, app_emergency_finder_message (who gets a message and every limit),
-- app_emergency_relay_contact and the retention purge. Because contact_mode / contact_value are kept in step, they
-- already give the right answer: the message form is offered for 'relay', or when a channel is on and nothing
-- publishable is saved; a full vet link carries the emergency contact when at least one channel is on.
--
-- DEPLOY ORDER: either one first.
--   • new web + old database: the owner route reports the two switches as unavailable (the app keeps the single
--     choice) and the public pages are unchanged;
--   • old web + this migration: the old web code only knows contact_mode / contact_value; a save from it replaces the
--     choice with what those two columns say.

-- ── 1. One flag and one value per channel (NULL = the card still uses contact_mode / contact_value) ──────────
alter table pet_emergency_cards add column if not exists contact_phone_enabled boolean;
alter table pet_emergency_cards add column if not exists contact_email_enabled boolean;
alter table pet_emergency_cards add column if not exists contact_message_enabled boolean;
alter table pet_emergency_cards add column if not exists contact_phone text;
alter table pet_emergency_cards add column if not exists contact_email text;

comment on column pet_emergency_cards.contact_phone_enabled is
  'Owner shows a phone number to finders; NULL = not chosen with the switches, see contact_mode';
comment on column pet_emergency_cards.contact_email_enabled is
  'Owner shows an email address to finders; NULL = not chosen with the switches, see contact_mode';
comment on column pet_emergency_cards.contact_message_enabled is
  'With both channels off: true = finders may send a private message, false = no contact at all';
comment on column pet_emergency_cards.contact_phone is 'Phone number for the phone channel';
comment on column pet_emergency_cards.contact_email is 'Email address for the email channel';

-- ── 2a. A write to contact_mode / contact_value replaces the whole choice ───────────────────────────────────
create or replace function app_emergency_contact_from_mode()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.contact_phone_enabled := null;
  new.contact_email_enabled := null;
  new.contact_message_enabled := null;
  new.contact_phone := null;
  new.contact_email := null;
  return new;
end;
$$;

revoke execute on function app_emergency_contact_from_mode() from public;
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke execute on function app_emergency_contact_from_mode() from %I', r);
    end if;
  end loop;
end
$$;
grant execute on function app_emergency_contact_from_mode() to pawpi_app;

-- ── 2b. A write to the new columns also rewrites contact_mode / contact_value ───────────────────────────────
-- SECURITY INVOKER: it only changes the row being written (row security has already decided who may write it).
create or replace function app_emergency_contact_to_mode()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_first    boolean := true;
  v_phone_ok boolean;
  v_email_ok boolean;
begin
  if num_nonnulls(new.contact_phone_enabled, new.contact_email_enabled, new.contact_message_enabled,
                  new.contact_phone, new.contact_email) = 0 then
    return new; -- no choice made with the switches: contact_mode / contact_value stand
  end if;

  -- The first save with the switches starts from what contact_mode / contact_value say today; only what this
  -- statement set differs from it. (The web owner route applies the same rule when it reads such a card.)
  if tg_op = 'UPDATE' then
    v_first := old.contact_phone_enabled is null;
  end if;
  if v_first then
    new.contact_phone_enabled := coalesce(new.contact_phone_enabled, new.contact_mode = 'phone');
    new.contact_email_enabled := coalesce(new.contact_email_enabled, new.contact_mode = 'email');
    new.contact_message_enabled := coalesce(new.contact_message_enabled, new.contact_mode <> 'none');
    new.contact_phone := coalesce(new.contact_phone,
      case when new.contact_mode = 'phone' or position('@' in new.contact_value) = 0 then new.contact_value end);
    new.contact_email := coalesce(new.contact_email,
      case when new.contact_mode = 'email' or position('@' in new.contact_value) > 0 then new.contact_value end);
  end if;
  new.contact_phone_enabled := coalesce(new.contact_phone_enabled, false);
  new.contact_email_enabled := coalesce(new.contact_email_enabled, false);
  new.contact_message_enabled := coalesce(new.contact_message_enabled, false);

  v_phone_ok := new.contact_phone_enabled
    and app_emergency_published_contact('phone', new.contact_phone) is not null;
  v_email_ok := new.contact_email_enabled
    and app_emergency_published_contact('email', new.contact_email) is not null;

  if new.contact_phone_enabled or new.contact_email_enabled then
    -- A publishable channel comes first, so "nothing published in contact_mode / contact_value" means nothing at all.
    if v_phone_ok is true or (v_email_ok is not true and new.contact_phone_enabled) then
      new.contact_mode := 'phone';
      new.contact_value := new.contact_phone;
    else
      new.contact_mode := 'email';
      new.contact_value := new.contact_email;
    end if;
  else
    new.contact_mode := case when new.contact_message_enabled then 'relay' else 'none' end;
    new.contact_value := coalesce(nullif(btrim(new.contact_phone), ''), nullif(btrim(new.contact_email), ''));
  end if;
  return new;
end;
$$;

revoke execute on function app_emergency_contact_to_mode() from public;
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke execute on function app_emergency_contact_to_mode() from %I', r);
    end if;
  end loop;
end
$$;
grant execute on function app_emergency_contact_to_mode() to pawpi_app;

-- "UPDATE OF" fires on the columns a statement names, not on changes made by another trigger. Same-event triggers
-- run in name order: _1_ before _2_.
drop trigger if exists pet_emergency_cards_contact_1_from_mode on pet_emergency_cards;
create trigger pet_emergency_cards_contact_1_from_mode
  before update of contact_mode, contact_value on pet_emergency_cards
  for each row execute function app_emergency_contact_from_mode();

drop trigger if exists pet_emergency_cards_contact_2_to_mode on pet_emergency_cards;
create trigger pet_emergency_cards_contact_2_to_mode
  before insert or update of contact_phone_enabled, contact_email_enabled, contact_message_enabled,
    contact_phone, contact_email on pet_emergency_cards
  for each row execute function app_emergency_contact_to_mode();

-- ── 3. Public card assembler ─────────────────────────────────────────────────
-- The 0146 function with one addition: 'phone' and 'email' inside 'contact' for a card saved with the switches.
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
    )
    -- Only for a card saved with the two switches: each channel on its own. Other cards: the same object as before.
    || case when c.contact_phone_enabled is null then '{}'::jsonb else jsonb_build_object(
      'phone', case when c.contact_mode in ('phone', 'email') and c.contact_phone_enabled
                    then app_emergency_published_contact('phone', c.contact_phone) end,
      'email', case when c.contact_mode in ('phone', 'email') and c.contact_email_enabled
                    then app_emergency_published_contact('email', c.contact_email) end
    ) end,
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
