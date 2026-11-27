-- 0164_distances_in_km.sql
--
-- Walk distances are kilometres everywhere (owner decision 2026-11-27). health_walk_logs defaulted to miles, and builds up
-- to 37 sent "miles" for a hand-typed walk although their Spanish form asked for kilometres. For rows saved as miles:
--   * tracked by a walker (the server converted metres into miles)      -> converted to km
--   * typed by someone whose app language is English (the form said miles) -> converted to km
--   * every other typed row (the form said kilometres)                  -> the number is kept, only the unit is corrected
-- No new table, column, rule or grant. Hand-applied: run supabase/verify_0164.sql afterwards (every row PASS).
-- Safe to run again (after the first run no row says miles).

alter table health_walk_logs alter column distance_unit set default 'km';

update health_walk_logs w
set distance = round(w.distance * 1.609344, 2)
where w.distance_unit = 'miles'
  and w.distance is not null
  and (
    w.source = 'walker'
    or exists (
      select 1 from user_profiles up
      where up.id = coalesce(w.logged_by_user_id, w.owner_user_id)
        and up.preferred_locale like 'en%'
    )
  );

update health_walk_logs set distance_unit = 'km' where distance_unit = 'miles';
