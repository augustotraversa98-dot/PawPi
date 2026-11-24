# Runbook — migrations 0139, 0140 (family-sharing PR3) and 0141 (PR3b)

**All three are written, CI-proven on the throwaway Postgres, and NOT applied. You (human) apply them in the Supabase SQL editor.** Neither needs an app build; builds 30–32 are unaffected before or after.

| | 0139 `grantee_read_and_caregiver_log_rls` | 0140 `owner_private_pet_ownership_check` |
|---|---|---|
| What | additive permissive policies: any ACTIVE, UNEXPIRED grantee can **read** the 12 `health_*` logs, `pet_medications`, `pet_preventive_treatments`, `pet_allergies`, `pet_conditions`, `pet_emergency_cards`; caregivers can **insert** (owner-anchored, never update/delete) log rows | re-creates the own-row `<t>_owner_all` policy on 21 tables with `AND app_owns_pet(pet_id)` in WITH CHECK (USING unchanged) |
| Why | caregivers could neither read nor log | any signed-in user could write a row against another user's pet |
| Needed for | caregiver reads/logging (owners and family never depended on it) | security hardening (nothing has been exploited: 0 mismatched rows in prod on 2026-11-23) |
| Verify | `supabase/verify_0139.sql` — **8 PASS** | `supabase/verify_0140.sql` — **6 PASS** |
| Rollback | `supabase/rollback_0139.sql` | `supabase/rollback_0140.sql` |
| If not applied | a caregiver reads nothing and logging is a friendly 403 (`caregiver_logging_unavailable`), never a 500 | the two reachable routes (`PUT /api/routines`, `POST /api/health/reminder-dismissals`) already check pet ownership themselves |

## Order (0139, then 0140, then 0141)
1. (optional, read-only) before 0140 run `supabase/verify_0140.sql`: rows 1–5 FAIL by design, **row 6 must say `0 mismatched row(s)`**. If it is not 0, stop — there is data authored by a non-owner and you should look at it first.
2. Apply **0139**, run `verify_0139.sql` → 8 PASS.
3. Apply **0140**, run `verify_0140.sql` → 6 PASS.
4. Apply **0141** (PR3b), run `verify_0141.sql` → **9 PASS** (row 9 is the read-only "0 mismatched rows" check for `pet_vaccinations`, `vet_appointments`, `pet_medical_profiles`).

## Smoke test after applying (a phone is fine)
- As the **owner** of a dog: log a walk, add an allergy, edit a routine, dismiss a reminder → all succeed (0140 must not block the owner).
- With a second account holding a **family** grant: log a food entry on the shared dog → succeeds and appears for the owner.
- With a **caregiver** grant: the shared dog's logs are readable and a walk can be logged; editing a routine or the vet record is refused.
- (once PR5 ships) nothing else to test on 30–32.

## Rollback
Each rollback is **idempotent, non-destructive and takes effect on the next statement** (it only drops/re-creates policies; no row, table or function changes):
- `rollback_0139.sql` — drops the 0139 policies. Caregivers lose reads/logging (graceful: friendly 403 / empty lists); owners and family are unaffected.
- `rollback_0140.sql` — restores the 0022/0117 policy shape. **Reopens the cross-pet write gap** — only to get unblocked; re-apply 0140 afterwards.
- Roll back **0140 first, then 0139** if you are undoing both (they are independent, the order is just tidy).
- Proven by `test/integration/rollback-scripts-0139-0140.integration.test.ts` (apply → rollback → behaviour returns to the previous contract → re-apply).

## Cost note (0140)
`app_owns_pet` is evaluated only in the WITH CHECK of INSERT/UPDATE, never on reads. Measured on the harness: **+2.6 µs per inserted row** (20 000-row bulk insert 134 ms → 186 ms); a normal request inserts one row.

## 0141 `family_write_policies` (PR3b)
| | |
|---|---|
| What | `<t>_family_all` (FOR ALL, row tied to the pet's owner) on `pet_medications`, `pet_preventive_treatments`, `pet_vaccinations`, `vet_appointments`; `pet_medical_profiles_family_insert`; **and** the 0140 owner own-row hardening (`AND app_owns_pet(pet_id)` in WITH CHECK) for `pet_vaccinations`, `vet_appointments`, `pet_medical_profiles` |
| Why | owner decision 2: a family/co-owner writes meds, vaccines, appointments and the medical profile; the 3 tables 0140 skipped had the same "write a row against any pet" gap |
| Verify | `supabase/verify_0141.sql` — **9 PASS** |
| Rollback | `supabase/rollback_0141.sql` — drops the family policies and restores the old owner policy on the 3 tables (reopens that gap; only to get unblocked) |
| If not applied | a family member's first write answers a friendly `403 family_write_unavailable`; edits of existing rows match zero rows (404); owners, caregivers and providers unaffected; never a 500 |
| Smoke | as the OWNER: add a medication, a vaccine and an appointment, save the medical profile → all succeed |
| Cost | same as 0140: only INSERT/UPDATE WITH CHECK (`app_owns_pet`, ~2.6 µs/row); reads unchanged; `app_user_has_pet_family` is evaluated per candidate row on family writes only |
