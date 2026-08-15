-- 0115_moderate_provider_post_comment.sql
-- MOD1 PR2 follow-through — make `provider_post_comment` fully ACTIONABLE in the moderation
-- console, not just reportable.
--
-- 0112 widened content_reports.target_type to accept 'provider_post_comment', but never extended
-- the moderation HELPERS — so before this migration, an admin who hit "Remove content" on such a
-- report only got the report flipped to 'actioned' (the else-branch in app_admin_action_report)
-- while the comment stayed visible, and "Ban" resolved no author. That is a Guideline 1.2 hole:
-- the console's Remove was a silent no-op for one reportable surface.
--
-- The ENFORCEMENT was already in place: provider_post_comments has had `hidden_at` since 0082 and
-- its read policy already filters `hidden_at IS NULL` for the public window. So this migration is
-- purely the missing CASE MAPPING — the exact `provider_post` pattern from 0066, applied to
-- `provider_post_comment` → `provider_post_comments` (author = `author_user_id`). No table/column,
-- no RLS/policy change. Idempotent (CREATE OR REPLACE). Verify: supabase/verify_0115.sql.

-- ── app_moderate_hide — add provider_post_comment -> provider_post_comments ──────
create or replace function app_moderate_hide(p_target_type text, p_target_id integer)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_table text;
  v_count integer;
begin
  if not app_is_admin() then
    raise exception 'not authorized';
  end if;

  v_table := case p_target_type
    when 'post'                 then 'posts'
    when 'bark'                 then 'post_barks'
    when 'forum_thread'         then 'forum_threads'
    when 'forum_comment'        then 'forum_comments'
    when 'provider_message'     then 'messages'
    when 'dm_message'           then 'dm_messages'
    when 'review'               then 'provider_reviews'
    when 'adoption_listing'     then 'adoptable_listings'
    when 'event'                then 'events'
    when 'social_walk'          then 'social_walks'
    when 'lost_report'          then 'lost_reports'
    when 'provider_post'        then 'provider_posts'
    when 'provider_post_comment' then 'provider_post_comments'
    else null
  end;
  if v_table is null then
    raise exception 'unsupported target_type for hide: %', p_target_type;
  end if;

  execute format('update %I set hidden_at = now() where id = $1 and hidden_at is null', v_table)
    using p_target_id;
  get diagnostics v_count = row_count;

  update content_reports
  set status = 'actioned', updated_at = now()
  where target_type = p_target_type and target_id = p_target_id and status = 'open';

  return v_count;
end;
$$;
grant execute on function app_moderate_hide(text, integer) to pawpi_app;

-- ── app_moderate_unhide — same case ─────────────────────────────────────────────
create or replace function app_moderate_unhide(p_target_type text, p_target_id integer)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_table text;
  v_count integer;
begin
  if not app_is_admin() then
    raise exception 'not authorized';
  end if;

  v_table := case p_target_type
    when 'post'                 then 'posts'
    when 'bark'                 then 'post_barks'
    when 'forum_thread'         then 'forum_threads'
    when 'forum_comment'        then 'forum_comments'
    when 'provider_message'     then 'messages'
    when 'dm_message'           then 'dm_messages'
    when 'review'               then 'provider_reviews'
    when 'adoption_listing'     then 'adoptable_listings'
    when 'event'                then 'events'
    when 'social_walk'          then 'social_walks'
    when 'lost_report'          then 'lost_reports'
    when 'provider_post'        then 'provider_posts'
    when 'provider_post_comment' then 'provider_post_comments'
    else null
  end;
  if v_table is null then
    raise exception 'unsupported target_type for unhide: %', p_target_type;
  end if;

  execute format('update %I set hidden_at = null where id = $1 and hidden_at is not null', v_table)
    using p_target_id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
grant execute on function app_moderate_unhide(text, integer) to pawpi_app;

-- ── app_admin_action_report — hideable list + ban-author resolution ─────────────
create or replace function app_admin_action_report(
  p_report_id integer,
  p_action text,
  p_ban boolean default false
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_type text;
  v_target integer;
  v_author integer;
  v_table text;
  v_col text;
begin
  if not app_is_admin() then
    raise exception 'not authorized';
  end if;
  if p_action not in ('hide', 'remove', 'dismiss') then
    raise exception 'invalid action: %', p_action;
  end if;

  select target_type, target_id into v_type, v_target
  from content_reports where id = p_report_id;
  if v_type is null then
    raise exception 'report not found';
  end if;

  if p_action = 'dismiss' then
    update content_reports set status = 'dismissed', updated_at = now() where id = p_report_id;
    return;
  end if;

  -- hide / remove → take the content down (or just flip reports for non-hideable types)
  if v_type in ('post','bark','forum_thread','forum_comment','provider_message','dm_message',
                'review','adoption_listing','event','social_walk','lost_report','provider_post',
                'provider_post_comment') then
    perform app_moderate_hide(v_type, v_target);
  else
    update content_reports set status = 'actioned', updated_at = now()
    where target_type = v_type and target_id = v_target and status = 'open';
  end if;

  if p_ban then
    if v_type = 'user_profile' then
      v_author := v_target;
    else
      select case v_type
               when 'post' then 'posts' when 'bark' then 'post_barks'
               when 'forum_thread' then 'forum_threads' when 'forum_comment' then 'forum_comments'
               when 'provider_message' then 'messages' when 'dm_message' then 'dm_messages'
               when 'review' then 'provider_reviews' when 'event' then 'events'
               when 'social_walk' then 'social_walks' when 'lost_report' then 'lost_reports'
               when 'pet_profile' then 'pets' when 'provider_post' then 'provider_posts'
               when 'provider_post_comment' then 'provider_post_comments' else null
             end,
             case v_type
               when 'post' then 'user_id' when 'bark' then 'user_id'
               when 'forum_thread' then 'author_user_id' when 'forum_comment' then 'author_user_id'
               when 'provider_message' then 'sender_user_id' when 'dm_message' then 'sender_user_id'
               when 'review' then 'owner_user_id' when 'event' then 'host_user_id'
               when 'social_walk' then 'owner_user_id' when 'lost_report' then 'owner_user_id'
               when 'pet_profile' then 'owner_user_id' when 'provider_post' then 'author_user_id'
               when 'provider_post_comment' then 'author_user_id' else null
             end
        into v_table, v_col;
      if v_table is not null then
        execute format('select %I from %I where id = $1', v_col, v_table)
          into v_author using v_target;
      end if;
    end if;
    if v_author is not null then
      update user_profiles set banned_at = now() where id = v_author;
    end if;
  end if;
end;
$$;
grant execute on function app_admin_action_report(integer, text, boolean) to pawpi_app;
