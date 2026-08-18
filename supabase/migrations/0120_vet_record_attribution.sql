-- 0120_vet_record_attribution.sql
-- VR-B (docs/night-run-2026-08-18c.md) — record AUTHORSHIP on the Vet Record tables.
--
-- Until now the vet-record tables tracked `owner_user_id` (the pet's owner — the SHARED
-- storage/read key) + `created_at`, but NOT who actually AUTHORED a row: the owner, or a
-- granted FAMILY member (an "Editor", e.g. a vet the owner shared the pet with as family).
-- The mobile "Add record" picker is being wired to real add flows this ticket, and each
-- record now shows "Added by {name} · {role} · {date}", so we need the author + their role.
--
-- TWO additive changes, no existing policy loosened beyond adding vet_notes to the SAME
-- family write scope the other vet-record tables already have (0049):
--
-- 1. created_by_user_id (int → user_profiles) + created_by_role ('owner'|'editor') on the
--    six record tables the picker writes (pet_allergies, pet_conditions, pet_surgeries,
--    pet_lab_results, vet_notes, vet_documents) PLUS pet_vaccinations + pet_medications for
--    consistency (their owner CRUD stamps 'owner'). Purely additive columns — every table's
--    existing RLS (0022 owner-private / 0023 R2d / 0049 family / 0117 own-row) rides unchanged.
--    Backfill: existing rows are all owner-authored → created_by_user_id = owner_user_id,
--    created_by_role = 'owner'.
--
-- 2. vet_notes_family_all — vet_notes is the ONE record table 0049 did NOT extend with a
--    FAMILY policy (it lives in the R2d provider-readable group, 0023). The other five record
--    tables already carry `<t>_family_all` (0049 §6d), so a family Editor can already write
--    them; add the identical additive FOR ALL family policy to vet_notes so an Editor can add
--    a clinical note too. Owner (vet_notes_owner_all) + provider (vet_notes_provider_*) access
--    is byte-for-byte unchanged — this only OR-widens writes/reads for an active family grantee.
--
-- Idempotent (add column if not exists; drop-if-exists then re-add the CHECK + policy). Verify:
-- supabase/verify_0120.sql. Own-row + editor-attribution proven as pawpi_app in the integration
-- harness (vet-record-attribution.integration.test.ts).

-- ── 1. Attribution columns + backfill ──────────────────────────────────────────
do $$
declare
  t text;
  record_tables text[] := array[
    'pet_allergies',
    'pet_conditions',
    'pet_surgeries',
    'pet_lab_results',
    'vet_notes',
    'vet_documents',
    'pet_vaccinations',
    'pet_medications'
  ];
begin
  foreach t in array record_tables loop
    execute format(
      'alter table %I add column if not exists created_by_user_id integer references user_profiles(id) on delete set null',
      t
    );
    execute format('alter table %I add column if not exists created_by_role text', t);

    -- Backfill: every existing row is owner-authored.
    execute format(
      'update %I set created_by_user_id = owner_user_id where created_by_user_id is null',
      t
    );
    execute format(
      'update %I set created_by_role = ''owner'' where created_by_role is null',
      t
    );

    -- Constrain the role to the two known values (nullable-tolerant).
    execute format('alter table %I drop constraint if exists %I', t, t || '_created_by_role_check');
    execute format(
      'alter table %I add constraint %I check (created_by_role is null or created_by_role in (''owner'', ''editor''))',
      t, t || '_created_by_role_check'
    );
  end loop;
end
$$;

-- ── 2. vet_notes — additive FAMILY write/read policy (mirrors 0049 §6d) ─────────
-- The other five record tables already carry `<t>_family_all`; vet_notes was left out
-- (R2d group). Add the identical policy so a family Editor can add a clinical note.
drop policy if exists vet_notes_family_all on vet_notes;
create policy vet_notes_family_all on vet_notes
  for all
  using (app_user_has_pet_family(pet_id))
  with check (app_user_has_pet_family(pet_id));
