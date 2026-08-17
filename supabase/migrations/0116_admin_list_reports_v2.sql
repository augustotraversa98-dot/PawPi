-- 0116_admin_list_reports_v2.sql
-- MOD2 PR1 — enrich the moderation queue reader so each report row is a scannable triage card.
--
-- 0065's app_admin_list_reports() returns `SETOF content_reports` — only target_type/target_id/
-- reason/status/created_at. A moderator can't see WHAT was reported (content), WHO (author), by
-- WHOM (reporter), how many piled on, or an exact target timestamp. This adds a second, richer
-- reader — app_admin_list_reports_v2(p_status) — that resolves all of that in ONE call.
--
-- SAME security posture as v1: SECURITY DEFINER + guarded by app_is_admin() in the WHERE (a
-- non-admin caller simply gets zero rows; the route additionally 403s before calling). ADDITIVE —
-- no table/column/RLS change, CREATE OR REPLACE (idempotent). v1 is left in place (still used by
-- nothing after PR1 flips the route, but harmless / other callers safe).
--
-- Polymorphic by target_type over all 15 reportable types (0112's CHECK list). Author, preview
-- text, preview image and the target's own created_at are each a COALESCE over per-type PK
-- lookups — a type that has no natural image returns NULL (the UI shows a type label), and a
-- target row that was already hard-deleted resolves to NULLs (never crashes, never blanks the row;
-- the report itself still renders). Free-text previews are left(…, 280) so a runaway body can't
-- bloat the payload. verify_0116.sql.
--
-- Author-column mapping mirrors app_admin_action_report's ban resolution (0115) so "who gets
-- banned" and "who is shown as the author" never disagree. adoption_listing has no user author
-- (it belongs to a provider) — resolved to the provider's owner_user_profile_id for display, and
-- (as before) is simply not ban-resolved server-side.

create or replace function app_admin_list_reports_v2(p_status text default 'open')
returns table (
  id                integer,
  status            text,
  reason            text,
  details           text,
  created_at        timestamptz,
  reporter_id       integer,
  reporter_handle   text,
  reporters_count   integer,
  target_type       text,
  target_id         integer,
  target_created_at timestamptz,
  author_id         integer,
  author_handle     text,
  preview_text      text,
  preview_image_url text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    r.id,
    r.status,
    r.reason,
    r.details,
    r.created_at,
    r.reporter_user_id as reporter_id,
    coalesce(nullif(rep.username, ''), nullif(rep.full_name, '')) as reporter_handle,
    -- distinct reporters on the SAME target (pile-on signal), across all non-deleted reports
    (
      select count(distinct x.reporter_user_id)::integer
      from content_reports x
      where x.target_type = r.target_type
        and x.target_id   = r.target_id
        and x.deleted_at is null
    ) as reporters_count,
    r.target_type,
    r.target_id,
    tgt.target_created_at,
    tgt.author_id,
    coalesce(nullif(au.username, ''), nullif(au.full_name, '')) as author_handle,
    left(tgt.preview_text, 280) as preview_text,
    tgt.preview_image_url
  from content_reports r
  left join user_profiles rep on rep.id = r.reporter_user_id
  cross join lateral (
    select
      -- author id (who's being reported), per target_type
      coalesce(
        case when r.target_type = 'user_profile'          then r.target_id end,
        case when r.target_type = 'post'                  then (select user_id          from posts                  where id = r.target_id) end,
        case when r.target_type = 'bark'                  then (select user_id          from post_barks             where id = r.target_id) end,
        case when r.target_type = 'forum_thread'          then (select author_user_id   from forum_threads          where id = r.target_id) end,
        case when r.target_type = 'forum_comment'         then (select author_user_id   from forum_comments         where id = r.target_id) end,
        case when r.target_type = 'dm_message'            then (select sender_user_id   from dm_messages            where id = r.target_id) end,
        case when r.target_type = 'provider_message'      then (select sender_user_id   from messages               where id = r.target_id) end,
        case when r.target_type = 'review'                then (select owner_user_id    from provider_reviews       where id = r.target_id) end,
        case when r.target_type = 'pet_profile'           then (select owner_user_id    from pets                   where id = r.target_id) end,
        case when r.target_type = 'event'                 then (select host_user_id     from events                 where id = r.target_id) end,
        case when r.target_type = 'social_walk'           then (select owner_user_id    from social_walks           where id = r.target_id) end,
        case when r.target_type = 'lost_report'           then (select owner_user_id    from lost_reports           where id = r.target_id) end,
        case when r.target_type = 'provider_post'         then (select author_user_id   from provider_posts         where id = r.target_id) end,
        case when r.target_type = 'provider_post_comment' then (select author_user_id   from provider_post_comments where id = r.target_id) end,
        case when r.target_type = 'adoption_listing'      then (
          select p.owner_user_profile_id
          from adoptable_listings al
          join providers p on p.id = al.provider_id
          where al.id = r.target_id
        ) end
      ) as author_id,
      -- content preview text (short snippet), per target_type
      coalesce(
        case when r.target_type = 'post'                  then (select caption                              from posts                  where id = r.target_id) end,
        case when r.target_type = 'bark'                  then (select text                                 from post_barks             where id = r.target_id) end,
        case when r.target_type = 'forum_thread'          then (select concat_ws(' — ', nullif(title,''), nullif(body,'')) from forum_threads where id = r.target_id) end,
        case when r.target_type = 'forum_comment'         then (select body                                 from forum_comments         where id = r.target_id) end,
        case when r.target_type = 'dm_message'            then (select body                                 from dm_messages            where id = r.target_id) end,
        case when r.target_type = 'provider_message'      then (select body                                 from messages               where id = r.target_id) end,
        case when r.target_type = 'review'                then (select body                                 from provider_reviews       where id = r.target_id) end,
        case when r.target_type = 'pet_profile'           then (select name                                 from pets                   where id = r.target_id) end,
        case when r.target_type = 'user_profile'          then (select coalesce(nullif(full_name,''), username) from user_profiles      where id = r.target_id) end,
        case when r.target_type = 'adoption_listing'      then (select concat_ws(' — ', nullif(name,''), nullif(urgent_reason,'')) from adoptable_listings where id = r.target_id) end,
        case when r.target_type = 'event'                 then (select concat_ws(' — ', nullif(title,''), nullif(description,''))  from events            where id = r.target_id) end,
        case when r.target_type = 'social_walk'           then (select concat_ws(' — ', nullif(walk_name,''), nullif(notes_for_guests,'')) from social_walks where id = r.target_id) end,
        case when r.target_type = 'lost_report'           then (select notes                                from lost_reports           where id = r.target_id) end,
        case when r.target_type = 'provider_post'         then (select body                                 from provider_posts         where id = r.target_id) end,
        case when r.target_type = 'provider_post_comment' then (select body                                 from provider_post_comments where id = r.target_id) end
      ) as preview_text,
      -- preview image / thumbnail where the target has one, else NULL
      coalesce(
        case when r.target_type = 'post'             then (select coalesce(image_url, video_thumbnail_url) from posts             where id = r.target_id) end,
        case when r.target_type = 'forum_thread'     then (select image_urls[1]                            from forum_threads     where id = r.target_id) end,
        case when r.target_type = 'dm_message'       then (select image_url                                from dm_messages       where id = r.target_id) end,
        case when r.target_type = 'provider_message' then (select attachment_url                           from messages          where id = r.target_id) end,
        case when r.target_type = 'pet_profile'      then (select avatar_url                               from pets              where id = r.target_id) end,
        case when r.target_type = 'user_profile'     then (select avatar_url                               from user_profiles     where id = r.target_id) end,
        case when r.target_type = 'adoption_listing' then (select photo_urls[1]                            from adoptable_listings where id = r.target_id) end,
        case when r.target_type = 'event'            then (select cover_image_url                          from events            where id = r.target_id) end,
        case when r.target_type = 'provider_post'    then (select coalesce(image_urls[1], video_thumbnail_url) from provider_posts where id = r.target_id) end
      ) as preview_image_url,
      -- the target's own created_at (when the reported content was made)
      coalesce(
        case when r.target_type = 'post'                  then (select created_at from posts                  where id = r.target_id) end,
        case when r.target_type = 'bark'                  then (select created_at from post_barks             where id = r.target_id) end,
        case when r.target_type = 'forum_thread'          then (select created_at from forum_threads          where id = r.target_id) end,
        case when r.target_type = 'forum_comment'         then (select created_at from forum_comments         where id = r.target_id) end,
        case when r.target_type = 'dm_message'            then (select created_at from dm_messages            where id = r.target_id) end,
        case when r.target_type = 'provider_message'      then (select created_at from messages               where id = r.target_id) end,
        case when r.target_type = 'review'                then (select created_at from provider_reviews       where id = r.target_id) end,
        case when r.target_type = 'pet_profile'           then (select created_at from pets                   where id = r.target_id) end,
        case when r.target_type = 'user_profile'          then (select created_at from user_profiles          where id = r.target_id) end,
        case when r.target_type = 'adoption_listing'      then (select created_at from adoptable_listings     where id = r.target_id) end,
        case when r.target_type = 'event'                 then (select created_at from events                 where id = r.target_id) end,
        case when r.target_type = 'social_walk'           then (select created_at from social_walks           where id = r.target_id) end,
        case when r.target_type = 'lost_report'           then (select created_at from lost_reports           where id = r.target_id) end,
        case when r.target_type = 'provider_post'         then (select created_at from provider_posts         where id = r.target_id) end,
        case when r.target_type = 'provider_post_comment' then (select created_at from provider_post_comments where id = r.target_id) end
      ) as target_created_at
  ) tgt
  left join user_profiles au on au.id = tgt.author_id
  where app_is_admin()
    and r.deleted_at is null
    and (p_status is null or r.status = p_status)
  order by r.created_at desc
$$;

grant execute on function app_admin_list_reports_v2(text) to pawpi_app;
