-- Rollback for 0145: only the author can delete a post again.
drop policy if exists posts_pet_owner_delete_moment on posts;
