-- Verification for migration 0087 (provider_posts video support — business "daily moments" + video).
-- Run in the Supabase SQL editor AFTER applying 0087. EVERY row should read PASS.
with checks as (
  select 1 as ord,
         'provider_posts.media_type present, NOT NULL, default image' as check_name,
         coalesce(string_agg(column_name||' null='||is_nullable||' default='||coalesce(column_default,'(none)'), ','),'(missing)') as detail,
         case when count(*)=1
                   and bool_and(is_nullable='NO')
                   and bool_and(column_default like '%image%')
              then 'PASS' else 'FAIL' end as status
  from information_schema.columns
  where table_schema='public' and table_name='provider_posts' and column_name='media_type'

  union all
  select 2,
         'video_url + video_thumbnail_url columns present (nullable text)',
         coalesce(string_agg(column_name||' '||data_type, ','),'(missing)'),
         case when count(*)=2 and bool_and(data_type='text') and bool_and(is_nullable='YES')
              then 'PASS' else 'FAIL' end
  from information_schema.columns
  where table_schema='public' and table_name='provider_posts'
    and column_name in ('video_url','video_thumbnail_url')

  union all
  select 3,
         'CHECK constraint provider_posts_media_type_check present',
         coalesce(string_agg(conname, ','),'(none)'),
         case when count(*)=1 then 'PASS' else 'FAIL' end
  from pg_constraint
  where conrelid='public.provider_posts'::regclass
    and contype='c' and conname='provider_posts_media_type_check'

  union all
  -- The CHECK actually rejects a bad media_type (and accepts image/video).
  select 4,
         'CHECK rejects an invalid media_type',
         'expected a violation',
         case when (
           select count(*) from (
             select 1
             where exists (
               select 1 from pg_constraint
               where conrelid='public.provider_posts'::regclass
                 and conname='provider_posts_media_type_check'
                 and pg_get_constraintdef(oid) ilike '%image%'
                 and pg_get_constraintdef(oid) ilike '%video%'
             )
           ) t
         )=1 then 'PASS' else 'FAIL' end

  union all
  -- No RLS policy change: provider_posts still ENABLE + FORCE with its 0042/0066 policies.
  select 5,
         'provider_posts RLS still ENABLE + FORCE',
         'enabled='||coalesce(relrowsecurity::text,'?')||' forced='||coalesce(relforcerowsecurity::text,'?'),
         case when relrowsecurity and relforcerowsecurity then 'PASS' else 'FAIL' end
  from pg_class
  where oid='public.provider_posts'::regclass
)
select ord, check_name, detail, status from checks order by ord;
