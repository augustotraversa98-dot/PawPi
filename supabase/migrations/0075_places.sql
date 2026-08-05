-- 0075_places.sql
-- PawPi-owned pet-friendly PLACES catalog — the free replacement for the paid Google Places proxy
-- (utils/places.js, ticket 2.73). We now persist our OWN directory of pet-welcoming spots, sourced
-- from free OpenStreetMap/Overpass (dog=yes venues + dog parks), a hand-curated seed list, and —
-- later — community submissions. place_reviews (0074) key off THESE ids (place_reviews.place_id is
-- free text, so no FK change is needed; the mobile step reconciles the old Google ids).
--
-- id is a TEXT primary key carrying the source in its prefix, so the same physical spot has ONE
-- stable id across re-imports (idempotent upsert on id):
--   'osm-node-123' / 'osm-way-123' / 'osm-relation-123'  — from Overpass (id = the OSM element)
--   'curated-<slug>'                                       — from data/seed/places_curated.json
--   'community-<uuid>'                                     — future user submissions (own route)
--
-- RLS — a public read-mostly REFERENCE catalog, mirroring food_recalls (0061): RLS ENABLE + FORCE,
-- any-authenticated-user READ of published+non-deleted rows, and NO write policy. The catalog is
-- populated by the service/admin importer + seed scripts (which run as an admin/service connection
-- that bypasses FORCE RLS, like the migration + demo-seed runners); community submissions will land
-- through their OWN route in a later ticket. Keeping a SELECT policy (not RLS-exempt) satisfies the
-- rollout completeness guard.
--
-- ADDITIVE + back-compatible: a brand-new table; no existing table touched.
--
-- ⚠️ HARNESS-ONLY THIS TICKET — proven as pawpi_app in the integration harness, NOT applied to
-- Supabase here. Hand-applied by the operator at cutover (docs/rls-hardening.md), like the R2 set.
-- Read grants ride 0019's blanket grant + ALTER DEFAULT PRIVILEGES. Idempotent.

create table if not exists places (
  id                text primary key,
  name              text not null,
  category          text not null check (category in
    ('restaurant', 'cafe', 'bakery', 'brewery', 'bar', 'park', 'hotel', 'market', 'shop', 'other')),
  neighborhood      text,
  city              text not null default 'Buenos Aires',
  address           text,
  lat               double precision,
  lng               double precision,
  website           text,
  instagram         text,
  phone             text,
  pet_friendly_note text,
  source            text not null check (source in ('osm', 'curated', 'community')),
  source_url        text,
  confidence        text check (confidence in ('high', 'medium')),
  status            text not null default 'published' check (status in ('published', 'pending', 'hidden')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz,
  deleted_at        timestamptz
);

create index if not exists idx_places_neighborhood on places (neighborhood);
create index if not exists idx_places_category on places (category);
create index if not exists idx_places_status on places (status);

-- ── RLS — public reference catalog: any-authed READ, no write policy ──────────
alter table places enable row level security;
alter table places force row level security;

-- READ: any authenticated app user may read the PUBLISHED, non-deleted catalog (public directory).
drop policy if exists places_read on places;
create policy places_read on places
  for select
  using (current_app_user_id() is not null and status = 'published' and deleted_at is null);
-- NO write policy — the catalog is populated ONLY by the admin/service importer + seed scripts
-- (community submissions arrive via their own route later).
