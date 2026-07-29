# N4 — Fix Edit Medical Profile sex/gender selector not showing the stored value

**Status:** ready · no migration · independent · safe-parallel: yes (single form component)

## Context
Known, pre-existing bug (not caused by the 2.77 redesign), noted in `docs/roadmap.md`'s CURRENT STATE
block: the Edit Medical Profile sex/gender selector never shows the stored value as pre-selected. Root
cause is a case mismatch — the picker renders options as `["Male","Female"]` (capitalized) while the
database stores the value lowercase.

## Current issue
Open Edit Medical Profile on a pet that already has a sex/gender saved → the selector shows no option
selected, even though a value exists in `pet_medical_profiles` (or wherever this field actually lives —
locate it via grep for the existing sex/gender field name; per `PawPi_instructions.md` this may be a
shared field synced between Dog Profile and Pet Medical Profile, so check both).

## Expected behavior
The selector reflects the actually-stored value on open, regardless of case, and continues saving
correctly. Fix the comparison (normalize case on read, or normalize the picker's option values to match
what's stored — pick whichever keeps the rest of the codebase's convention consistent; check how other
enum-style fields in this app handle case to match the existing pattern rather than inventing a new one).

## Data / API rules
No migration, no data change — this is a read-side display bug. Do not change what's stored in the
database (don't risk a data migration for a single UI comparison bug) unless the investigation shows the
stored value itself is inconsistent (mixed case across rows) — if so, flag that finding instead of
silently rewriting rows.

## Acceptance criteria
- Open a pet with a saved sex/gender → the correct option shows as selected.
- Editing and re-saving still persists correctly (regression check).
- Per `PawPi_instructions.md` data principles — this fix must not affect any other pet's or user's data
  (scoped correctly by `pet_id`/`owner_user_id`, unrelated to this bug but worth the standing reminder).
- `npm test` green.
- Update `docs/roadmap.md` CURRENT STATE "Known code gaps" list — remove this entry once fixed.
