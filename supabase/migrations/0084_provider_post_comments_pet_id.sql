-- 0084_provider_post_comments_pet_id.sql
-- Pet-scoped identity for provider STOREFRONT-post comments — mirrors post_barks.pet_id (0013).
-- A comment now carries the commenting PET (name / @handle / avatar), not just the owner account,
-- so a business post reads like the pet feed (Mango, not @demo).
--
-- Additive + NULLABLE: legacy rows (created before this migration) keep pet_id NULL, and the public
-- GET falls back to the account handle for them — no backfill, never a crash. ON DELETE SET NULL
-- mirrors the barks "neutral fallback" for an orphaned pet.
--
-- RLS: provider_post_comments already ships ENABLE + FORCE RLS with a full policy set (0082). pet_id
-- is plain additive data — the INSERT policy still gates author_user_id = current_app_user_id(); the
-- APP layer (the POST route) verifies the caller OWNS the pet, exactly like the bark POST does. No
-- policy change is needed and the completeness guard still classifies the table as RLS-on + policied.
--
-- HARNESS-ONLY THIS PR — proven as pawpi_app in the integration harness; hand-applied to Supabase by
-- Tats BEFORE the consumer code relies on it. The code DEGRADES CLEANLY until then (the POST/GET catch
-- undefined_column 42703 and store/read without pet_id → account attribution). Idempotent.

alter table provider_post_comments
  add column if not exists pet_id integer references pets(id) on delete set null;

create index if not exists idx_provider_post_comments_pet
  on provider_post_comments (pet_id);
