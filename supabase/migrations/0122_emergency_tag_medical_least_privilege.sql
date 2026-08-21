-- 0122_emergency_tag_medical_least_privilege.sql
--
-- #5 (night-run) — LEAST-PRIVILEGE the PUBLIC emergency TAG.
--
-- PREPARE-ONLY / HAND-APPLY: this migration is written and reviewed but NOT auto-applied to
-- Supabase (matches the "0051–0055 PENDING hand-apply" process). Apply it manually.
--
-- Background: the permanent collar TAG (scanned by anyone, medical shown only if the owner opted
-- in via show_medical_on_tag) and the revocable vet LINK (scope=full, deliberately shared with a
-- vet) both go through the SAME internal assembler app_emergency_card_json (0051), which returns
-- the FULL medical block whenever medical is included. So a tag with show_medical_on_tag=true hands
-- out the owner's vet phone, primary clinic, and emergency-contact name+phone in the raw API JSON —
-- even though the public tag PAGE (src/app/p/tag/[token]/page.jsx) only renders blood type,
-- spay/neuter, allergies, conditions and medical notes. The LINK legitimately shows the full block
-- (the vet card page renders vet/emergency contacts); the TAG should not.
--
-- FIELDS REMOVED FROM THE TAG BRANCH (still returned for the vet LINK):
--   extra_notes, primary_vet_name, primary_clinic_name, vet_phone,
--   emergency_contact_name, emergency_contact_phone
-- FIELDS KEPT ON THE TAG (exactly what the tag page renders):
--   blood_type, spayed_neutered_status, medical_notes, allergies, conditions
--
-- Mechanism: give the internal assembler a p_medical_scope argument ('full' | 'tag') and route the
-- TAG reader through 'tag'. The LINK reader passes 'full' → its behaviour is byte-identical to today.

-- 1. New 3-arg assembler (coexists with the old 2-arg one until step 3 drops it). NOT granted to
--    pawpi_app — only the two SECURITY DEFINER readers below call it, as the function owner.
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
      -- raw owner contact is exposed ONLY for the direct phone/email modes; relay/none hide it.
      'value', case when c.contact_mode in ('phone','email') then c.contact_value else null end
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

-- 2. Point the public readers at the new assembler. TAG → 'tag' (least privilege); LINK → 'full'.
create or replace function app_emergency_card_by_tag(p_tag_token text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select app_emergency_card_json(c.id, c.show_medical_on_tag, 'tag')
  from pet_emergency_cards c
  where c.tag_token = p_tag_token and c.active = true;
$$;

create or replace function app_emergency_card_by_link(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select app_emergency_card_json(c.id, (l.scope = 'full'), 'full')
  from pet_emergency_share_links l
  join pet_emergency_cards c on c.pet_id = l.pet_id
  where l.token = p_token
    and l.revoked_at is null
    and (l.expires_at is null or l.expires_at > now())
    and c.active = true;
$$;

-- 3. Drop the old 2-arg assembler now that nothing references it (readers use the 3-arg form).
drop function if exists app_emergency_card_json(integer, boolean);

-- 4. Re-assert the reader grants (CREATE OR REPLACE preserves privileges; explicit + idempotent).
grant execute on function app_emergency_card_by_tag(text) to pawpi_app;
grant execute on function app_emergency_card_by_link(text) to pawpi_app;
