-- 0121_vet_document_category.sql
-- VR-C (docs/night-run-2026-08-18c.md) — a tidy CATEGORY on each Vet Record document.
--
-- Documents phase 1: the owner uploads a file, stores it, opens/downloads it later, deletes
-- it — and now TAGS what it is so it lands tidily in history. `vet_documents` already has a
-- free-form `document_type text` (0005), but nothing constrains it to the small, filterable
-- set the history view groups by. Add a dedicated `category` column with a CHECK for the five
-- canonical buckets (vaccine / lab / visit / invoice / other). Keeping it separate from the
-- descriptive `document_type` avoids overloading a column the summary counts read.
--
-- ONE purely additive column, no RLS/policy change: vet_documents is already ENABLE+FORCE RLS
-- (0022 owner-private + 0049 family + the 0120 attribution columns) and this column rides it.
-- Nullable (existing rows stay untagged — honest; the app shows them under "other"). Idempotent
-- (add column if not exists; drop-if-exists then re-add the CHECK). Verify: verify_0121.sql.

alter table vet_documents add column if not exists category text;

alter table vet_documents drop constraint if exists vet_documents_category_check;
alter table vet_documents
  add constraint vet_documents_category_check
  check (category is null or category in ('vaccine', 'lab', 'visit', 'invoice', 'other'));
