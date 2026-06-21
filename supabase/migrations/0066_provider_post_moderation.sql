-- 0066_provider_post_moderation.sql
-- Guideline 1.2 follow-up — make PROVIDER STOREFRONT POSTS (provider_posts, ticket 2.22) a
-- first-class reportable/hideable UGC surface, exactly like the 9 surfaces 0065 already covered.
-- The 1.2 build missed provider_posts: it had no 'provider_post' report target, no hidden_at
-- column, and the hide/unhide helpers had no case for it.
--
-- Adds (all additive + idempotent, no data loss):
--   1. 'provider_post' to the content_reports_target_type_check CHECK (drop + recreate — the
--      only way to widen a CHECK).
--   2. hidden_at timestamptz on provider_posts ("removed by us"; distinct from the author's
--      deleted_at). Written ONLY by the admin DEFINER helpers under FORCE RLS, mirroring 0065.
--   3. the 'provider_post' -> 'provider_posts' branch in app_moderate_hide / app_moderate_unhide
--      (CREATE OR REPLACE — full body restated with the new case).
--   4. the same branch in app_admin_action_report so the T2 admin queue route can hide a
--      provider_post end-to-end (hideable list + the ban-author table/column resolution:
--      provider_posts.author_user_id is the staff author).
--
-- provider_posts is already ENABLE+FORCE RLS (0042) with a staff-write / published-read shape;
-- this migration touches no provider_posts policy, so the public storefront read keeps filtering
-- the new hidden_at IS NULL in the app layer (providers/public/[slug] + the single-post view).
--
-- HARNESS-ONLY THIS TICKET — proven as pawpi_app in ugc-moderation.integration.test.ts; verified
-- by the DO block at the end + hand-applied to Supabase AFTER merge via supabase/verify_0066.sql
-- (test-backlog ACTION 1). Idempotent (drop-if-exists CHECK widen; ADD COLUMN IF NOT EXISTS;
-- CREATE OR REPLACE on every function).

-- ── 1. widen the report target_type CHECK ──────────────────────────────────────
alter table content_reports drop constraint if exists content_reports_target_type_check;
alter table content_reports add constraint content_reports_target_type_check check (
  target_type = any (array[
    'post','bark','forum_thread','forum_comment','dm_message','provider_message',
    'review','pet_profile','user_profile','adoption_listing','event','social_walk',
    'lost_report','provider_post'
  ]::text[])
);

-- ── 2. hidden_at on provider_posts ("removed by us") ───────────────────────────
alter table provider_posts add column if not exists hidden_at timestamptz;

-- ── 3. app_moderate_hide — add the provider_post -> provider_posts case ─────────
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
    when 'post'             then 'posts'
    when 'bark'             then 'post_barks'
    when 'forum_thread'     then 'forum_threads'
    when 'forum_comment'    then 'forum_comments'
    when 'provider_message' then 'messages'
    when 'dm_message'       then 'dm_messages'
    when 'review'           then 'provider_reviews'
    when 'adoption_listing' then 'adoptable_listings'
    when 'event'            then 'events'
    when 'social_walk'      then 'social_walks'
    when 'lost_report'      then 'lost_reports'
    when 'provider_post'    then 'provider_posts'
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

-- ── 4. app_moderate_unhide — add the provider_post -> provider_posts case ───────
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
    when 'post'             then 'posts'
    when 'bark'             then 'post_barks'
    when 'forum_thread'     then 'forum_threads'
    when 'forum_comment'    then 'forum_comments'
    when 'provider_message' then 'messages'
    when 'dm_message'       then 'dm_messages'
    when 'review'           then 'provider_reviews'
    when 'adoption_listing' then 'adoptable_listings'
    when 'event'            then 'events'
    when 'social_walk'      then 'social_walks'
    when 'lost_report'      then 'lost_reports'
    when 'provider_post'    then 'provider_posts'
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

-- ── 5. app_admin_action_report — let the admin queue hide/ban a provider_post ───
-- Same body as 0065, with 'provider_post' added to (a) the hideable target list and (b) the
-- ban-author resolution (provider_posts.author_user_id is the staff member who composed it).
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
                'review','adoption_listing','event','social_walk','lost_report','provider_post') then
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
               when 'pet_profile' then 'pets' when 'provider_post' then 'provider_posts' else null
             end,
             case v_type
               when 'post' then 'user_id' when 'bark' then 'user_id'
               when 'forum_thread' then 'author_user_id' when 'forum_comment' then 'author_user_id'
               when 'provider_message' then 'sender_user_id' when 'dm_message' then 'sender_user_id'
               when 'review' then 'owner_user_id' when 'event' then 'host_user_id'
               when 'social_walk' then 'owner_user_id' when 'lost_report' then 'owner_user_id'
               when 'pet_profile' then 'owner_user_id' when 'provider_post' then 'author_user_id' else null
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

-- ── 6. inline verify checks (raise on any miss; re-runnable) ────────────────────
do $$
declare
  v_check  text;
  v_hide   text;
  v_unhide text;
  v_action text;
begin
  select pg_get_constraintdef(oid) into v_check
  from pg_constraint where conname = 'content_reports_target_type_check';
  if v_check is null or v_check not like '%provider_post%' then
    raise exception 'verify 0066 FAILED: content_reports_target_type_check missing provider_post (got %)', v_check;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'provider_posts' and column_name = 'hidden_at'
  ) then
    raise exception 'verify 0066 FAILED: provider_posts.hidden_at missing';
  end if;

  select pg_get_functiondef(p.oid) into v_hide
  from pg_proc p where p.proname = 'app_moderate_hide'
    and p.pronamespace = (select oid from pg_namespace where nspname = 'public');
  select pg_get_functiondef(p.oid) into v_unhide
  from pg_proc p where p.proname = 'app_moderate_unhide'
    and p.pronamespace = (select oid from pg_namespace where nspname = 'public');
  select pg_get_functiondef(p.oid) into v_action
  from pg_proc p where p.proname = 'app_admin_action_report'
    and p.pronamespace = (select oid from pg_namespace where nspname = 'public');
  if v_hide not like '%provider_posts%'
     or v_unhide not like '%provider_posts%'
     or v_action not like '%provider_post%' then
    raise exception 'verify 0066 FAILED: a moderation helper is missing the provider_post case';
  end if;

  raise notice 'verify 0066: all checks passed';
end
$$;
