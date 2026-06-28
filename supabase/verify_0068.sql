-- Verification for migration 0068 (posts video support — additive columns).
-- Run in the Supabase SQL editor AFTER applying 0068. EVERY row should read PASS.
with checks as (
  -- 1. the three new columns exist (media_type, video_url, video_thumbnail_url)
  select 1 as ord,
         'posts video columns present (expect 3)' as check_name,
         count(*)::text||' / 3' as detail,
         case when count(*)=3 then 'PASS' else 'FAIL' end as status
  from information_schema.columns
  where table_schema='public' and table_name='posts'
    and column_name in ('media_type','video_url','video_thumbnail_url')

  union all
  -- 2. media_type is NOT NULL with a 'image' default
  select 2,
         'posts.media_type NOT NULL default image',
         coalesce(is_nullable||' / default='||coalesce(column_default,'(none)'), 'MISSING'),
         case when is_nullable='NO' and column_default like '%''image''%' then 'PASS' else 'FAIL' end
  from information_schema.columns
  where table_schema='public' and table_name='posts' and column_name='media_type'

  union all
  -- 3. the media_type CHECK constraint is present (image/video)
  select 3,
         'CHECK posts_media_type_check present',
         coalesce(string_agg(con.conname, ','),'(none)'),
         case when count(*)=1 then 'PASS' else 'FAIL' end
  from pg_constraint con
  join pg_class c on c.oid=con.conrelid and c.relname='posts'
  where con.contype='c' and con.conname='posts_media_type_check'

  union all
  -- 4. the CHECK actually constrains to image/video (rejects anything else)
  select 4,
         'media_type CHECK allows image,video only',
         pg_get_constraintdef(con.oid),
         case when pg_get_constraintdef(con.oid) like '%image%'
               and pg_get_constraintdef(con.oid) like '%video%' then 'PASS' else 'FAIL' end
  from pg_constraint con
  join pg_class c on c.oid=con.conrelid and c.relname='posts'
  where con.contype='c' and con.conname='posts_media_type_check'

  union all
  -- 5. every existing row defaulted to media_type='image'
  select 5,
         'all posts rows media_type=image',
         count(*) filter (where media_type='image')::text||' / '||count(*)::text,
         case when count(*) = count(*) filter (where media_type='image') then 'PASS' else 'FAIL' end
  from posts

  union all
  -- 6. no existing row carries a stray video_url / video_thumbnail_url (image posts stay NULL)
  select 6,
         'image posts have NULL video columns',
         count(*) filter (where media_type='image'
                            and (video_url is not null or video_thumbnail_url is not null))::text||' stray',
         case when count(*) filter (where media_type='image'
                            and (video_url is not null or video_thumbnail_url is not null))=0
              then 'PASS' else 'FAIL' end
  from posts

  union all
  -- 7. image_url is untouched (still present — not dropped/renamed)
  select 7,
         'posts.image_url still present',
         (count(*))::text,
         case when count(*)=1 then 'PASS' else 'FAIL' end
  from information_schema.columns
  where table_schema='public' and table_name='posts' and column_name='image_url'

  union all
  -- 8. RLS unchanged: posts still ENABLE+FORCE RLS
  select 8,
         'RLS on+forced: posts (unchanged)',
         (c.relrowsecurity and c.relforcerowsecurity)::text,
         case when c.relrowsecurity and c.relforcerowsecurity then 'PASS' else 'FAIL' end
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname='posts'
)
select check_name, detail, status from checks order by ord, check_name;
