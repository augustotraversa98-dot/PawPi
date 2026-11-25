-- 0145_owner_delete_moment.sql
-- Night run #4, item 8: the OWNER of a dog may delete any DAILY MOMENT of that dog (a household member's included).
--
-- WHAT. One additive RLS policy on posts, for DELETE only. Today `posts_author_all` (0021) lets only the author delete,
-- so the owner of a shared dog cannot remove a moment a family member added to their own dog. Nothing else changes:
-- a member still deletes only their own, nobody but the author can EDIT a post, and non-daily posts are not covered.
-- app_owns_pet() (0049) is the existing DEFINER ownership check.
--
-- IDEMPOTENT. HAND-APPLIED: supabase/verify_0145.sql (every row PASS); rollback: supabase/rollback_0145.sql.
-- Without it the API behaves exactly as before (the owner's delete of someone else's moment answers 404).

drop policy if exists posts_pet_owner_delete_moment on posts;
create policy posts_pet_owner_delete_moment on posts
  for delete
  using (is_daily_update = true and app_owns_pet(pet_id));
