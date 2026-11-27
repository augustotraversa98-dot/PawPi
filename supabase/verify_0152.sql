-- Verification for migration 0152 (emergency card: phone and email can both be shown). Run in the Supabase SQL
-- editor AFTER applying 0152. EVERY row should read PASS (11 rows). Read-only (catalog queries and counts only).
-- verify_0146.sql should still read PASS on every row too.
with
fn as (
  select p.oid, p.proname, p.prosecdef, p.prosrc,
         coalesce(array_to_string(p.proconfig, ','), '(none)') as config,
         exists (
           select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
           where a.privilege_type = 'EXECUTE'
             and (a.grantee = 0 or a.grantee in (select oid from pg_roles where rolname in ('anon', 'authenticated')))
         ) as exposed,
         has_function_privilege('pawpi_app', p.oid, 'EXECUTE') as app_can
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and p.proname in ('app_emergency_contact_from_mode', 'app_emergency_contact_to_mode', 'app_emergency_card_json')
),
sync as (select * from fn where proname in ('app_emergency_contact_from_mode', 'app_emergency_contact_to_mode')),
assembler as (select * from fn where proname = 'app_emergency_card_json'),
cols as (
  select column_name, data_type, is_nullable, column_default
  from information_schema.columns
  where table_schema = 'public' and table_name = 'pet_emergency_cards'
    and column_name in ('contact_phone_enabled', 'contact_email_enabled', 'contact_message_enabled',
                        'contact_phone', 'contact_email')
),
trg as (
  select t.tgname, p.proname, t.tgenabled, pg_get_triggerdef(t.oid) as def
  from pg_trigger t join pg_proc p on p.oid = t.tgfoid
  where t.tgrelid = 'public.pet_emergency_cards'::regclass and not t.tgisinternal
),
checks as (
  select 1 as ord, 'the three channel flags exist: boolean, optional, no default (existing cards stay as they were)' as check_name,
         coalesce((select string_agg(column_name || ' ' || data_type || ' nullable=' || is_nullable || ' default=' || coalesce(column_default, '(none)'), ' | ' order by column_name)
                   from cols where column_name like '%_enabled'), '(missing)') as detail,
         case when (select count(*) from cols where column_name like '%_enabled' and data_type = 'boolean'
                      and is_nullable = 'YES' and column_default is null) = 3
              then 'PASS' else 'FAIL' end as status

  union all
  select 2, 'contact_phone and contact_email exist: text, optional, no default',
         coalesce((select string_agg(column_name || ' ' || data_type || ' nullable=' || is_nullable, ' | ' order by column_name)
                   from cols where column_name in ('contact_phone', 'contact_email')), '(missing)'),
         case when (select count(*) from cols where column_name in ('contact_phone', 'contact_email') and data_type = 'text'
                      and is_nullable = 'YES' and column_default is null) = 2
              then 'PASS' else 'FAIL' end

  union all
  select 3, 'a write to contact_mode / contact_value clears the new columns (enabled trigger)',
         coalesce((select def from trg where tgname = 'pet_emergency_cards_contact_1_from_mode'), '(missing)'),
         case when exists (select 1 from trg where tgname = 'pet_emergency_cards_contact_1_from_mode'
                             and proname = 'app_emergency_contact_from_mode' and tgenabled = 'O'
                             and def like '%BEFORE UPDATE OF contact_mode, contact_value ON %FOR EACH ROW%')
              then 'PASS' else 'FAIL' end

  union all
  select 4, 'a write to the new columns rewrites contact_mode / contact_value (enabled trigger)',
         coalesce((select def from trg where tgname = 'pet_emergency_cards_contact_2_to_mode'), '(missing)'),
         case when exists (select 1 from trg where tgname = 'pet_emergency_cards_contact_2_to_mode'
                             and proname = 'app_emergency_contact_to_mode' and tgenabled = 'O'
                             and def like '%BEFORE INSERT OR UPDATE OF contact_phone_enabled, contact_email_enabled, contact_message_enabled, contact_phone, contact_email ON %FOR EACH ROW%')
              then 'PASS' else 'FAIL' end

  union all
  select 5, 'the clearing function empties all five new columns',
         coalesce((select 'length=' || length(prosrc)::text from sync where proname = 'app_emergency_contact_from_mode'), '(missing)'),
         case when exists (select 1 from sync where proname = 'app_emergency_contact_from_mode'
                             and prosrc like '%new.contact_phone_enabled := null%'
                             and prosrc like '%new.contact_email_enabled := null%'
                             and prosrc like '%new.contact_message_enabled := null%'
                             and prosrc like '%new.contact_phone := null%'
                             and prosrc like '%new.contact_email := null%')
              then 'PASS' else 'FAIL' end

  union all
  select 6, 'both trigger functions: not DEFINER, pinned search_path, app-only',
         coalesce((select string_agg(proname || ' secdef=' || prosecdef::text || ' pawpi_app=' || app_can::text || ' exposed=' || exposed::text, ' | ' order by proname) from sync), '(missing)'),
         case when (select count(*) from sync where not prosecdef and config like 'search_path=%' and app_can and not exposed) = 2
              then 'PASS' else 'FAIL' end

  union all
  select 7, 'card assembler: one version, DEFINER, pinned, not exposed to PUBLIC / anon / authenticated',
         coalesce((select string_agg('secdef=' || prosecdef::text || ' config=' || config || ' exposed=' || exposed::text, ' | ') from assembler), '(missing)'),
         case when (select count(*) from assembler) = 1
                and exists (select 1 from assembler where prosecdef and config like 'search_path=%' and not exposed)
              then 'PASS' else 'FAIL' end

  union all
  select 8, 'card assembler publishes each extra channel only when it is on, through the publish rule',
         coalesce((select 'phone=' || (prosrc ~ 'and c\.contact_phone_enabled\s+then app_emergency_published_contact\(''phone'', c\.contact_phone\)')::text
                          || ' email=' || (prosrc ~ 'and c\.contact_email_enabled\s+then app_emergency_published_contact\(''email'', c\.contact_email\)')::text
                   from assembler limit 1), '(missing)'),
         case when exists (select 1 from assembler
                           where prosrc ~ 'and c\.contact_phone_enabled\s+then app_emergency_published_contact\(''phone'', c\.contact_phone\)'
                             and prosrc ~ 'and c\.contact_email_enabled\s+then app_emergency_published_contact\(''email'', c\.contact_email\)'
                             and prosrc not like '%''phone'', c.contact_phone,%'
                             and prosrc not like '%''email'', c.contact_email,%')
              then 'PASS' else 'FAIL' end

  union all
  select 9, 'pet_emergency_cards still has RLS enabled and forced',
         coalesce((select relrowsecurity::text || '/' || relforcerowsecurity::text from pg_class
                   where oid = 'public.pet_emergency_cards'::regclass), '(missing)'),
         case when exists (select 1 from pg_class where oid = 'public.pet_emergency_cards'::regclass
                             and relrowsecurity and relforcerowsecurity) then 'PASS' else 'FAIL' end

  union all
  -- DATA check (counts only): a card saved with the switches has all three flags.
  select 10, 'no card has only some of the three flags',
         (select count(*) from pet_emergency_cards
           where num_nonnulls(contact_phone_enabled, contact_email_enabled, contact_message_enabled) not in (0, 3))::text || ' card(s)',
         case when not exists (select 1 from pet_emergency_cards
                                where num_nonnulls(contact_phone_enabled, contact_email_enabled, contact_message_enabled) not in (0, 3))
              then 'PASS' else 'FAIL' end

  union all
  -- DATA check (counts only): contact_mode agrees with the switches on every card saved with them.
  select 11, 'no card has a contact_mode that disagrees with its switches',
         (select count(*) from pet_emergency_cards
           where contact_phone_enabled is not null
             and not case when contact_phone_enabled or contact_email_enabled
                          then (contact_mode = 'phone' and contact_phone_enabled) or (contact_mode = 'email' and contact_email_enabled)
                          else contact_mode = case when contact_message_enabled then 'relay' else 'none' end
                     end)::text || ' card(s)',
         case when not exists (
                select 1 from pet_emergency_cards
                 where contact_phone_enabled is not null
                   and not case when contact_phone_enabled or contact_email_enabled
                                then (contact_mode = 'phone' and contact_phone_enabled) or (contact_mode = 'email' and contact_email_enabled)
                                else contact_mode = case when contact_message_enabled then 'relay' else 'none' end
                           end)
              then 'PASS' else 'FAIL' end
)
select ord, check_name, detail, status from checks order by ord;
