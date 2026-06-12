-- 0013_post_barks_pet_id.sql
-- Pet-scoped identity for barks (comments). Additive: pet_id is NULLABLE so legacy
-- rows keep pet_id NULL (no backfill). A bark now carries the commenting PET, not
-- just the owner account. ON DELETE SET NULL mirrors the "neutral fallback" client
-- behaviour for orphaned pets.

alter table post_barks add column if not exists pet_id integer references pets(id) on delete set null;

create index if not exists idx_post_barks_pet on post_barks (pet_id);
