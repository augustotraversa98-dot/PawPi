-- 0041_provider_links.sql
-- Phase 2 ticket 2.20: capture a provider's public LINKS (website, Instagram, Facebook,
-- Google Maps) at onboarding/profile. ADDITIVE nullable text columns on providers — NO new
-- table, so the RLS completeness guard is unaffected, and NO policy change: providers is
-- already any-authed-read / owner|admin-write (0024), and these columns ride that same policy.
--
-- These are PUBLIC profile data and the INPUT that ticket 2.21 (AI enrichment) reads. Idempotent.
--
-- HARNESS-ONLY THIS TICKET — proven as pawpi_app in the integration harness; hand-applied to
-- Supabase AFTER merge (see the PR body).

alter table providers add column if not exists website_url text;
alter table providers add column if not exists instagram_url text;
alter table providers add column if not exists facebook_url text;
alter table providers add column if not exists google_maps_url text;
