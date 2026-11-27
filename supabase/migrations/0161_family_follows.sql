-- 0161_family_follows.sql
--
-- A family member may follow and unfollow other pets AS the dog they share (owner decision 2026-11-27).
-- Until now only the dog's owner could write pet_follows (0021), so a family member whose active dog is the shared one saw
-- the Follow button switch back with no explanation.
--
-- Only an ACTIVE, UNEXPIRED FAMILY grant counts (app_user_has_pet_family, 0049, SECURITY DEFINER). A caregiver, a pending,
-- revoked or expired member and an outsider still cannot. Insert and delete only: nothing updates a follow. Blocks are
-- enforced by the API route, as for owners. No new table, function or grant.
--
-- Hand-applied: run supabase/verify_0161.sql afterwards (every row PASS). Safe to run again.
-- Rollback: drop the two policies below.

drop policy if exists pet_follows_family_insert on pet_follows;
create policy pet_follows_family_insert on pet_follows
  for insert
  with check (app_user_has_pet_family(follower_pet_id));

drop policy if exists pet_follows_family_delete on pet_follows;
create policy pet_follows_family_delete on pet_follows
  for delete
  using (app_user_has_pet_family(follower_pet_id));
