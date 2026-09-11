# DB migration runbook — index migrations 0128–0129 (AUDIT A-26, A-19)

**These are FILE-ONLY in the repo. Nothing here has been applied to production.**
The integration harness applies them on a fresh DB so CI stays green; a human
applies them on prod during a quiet window, per this runbook.

Both are index-only DDL (no application data written). They are safe to roll back
by dropping the indexes. Prefer `CREATE INDEX CONCURRENTLY` on prod (outside a
transaction) to avoid write locks — the repo files use the plain form because the
integration runner executes each file as a single non-concurrent statement.

---

## 0128 — `care_access_grants` active-grant unique index (A-26)

**Why.** `POST /api/care-access/grants` dedups with a select-then-insert; two
concurrent requests can both insert, leaving two active grants for one
`(provider_id, pet_id)`. The route now catches the resulting `23505` and returns
the winner — but only once this partial unique index exists.

**⚠️ Pre-check — de-dup first.** A `CREATE UNIQUE INDEX` over existing duplicate
active grants FAILS. Find and resolve duplicates before building:

```sql
-- Duplicates that would block the index (expect zero rows before you proceed):
select provider_id, pet_id, count(*), array_agg(id order by id)
from care_access_grants
where status in ('pending','active')
group by provider_id, pet_id
having count(*) > 1;
```

For each duplicate group, keep the newest row and revoke the rest (owner intent
is a single live grant per provider+pet):

```sql
-- Revoke all but the newest active/pending grant in each duplicate group:
update care_access_grants g
set status = 'revoked', updated_at = now()
where status in ('pending','active')
  and id <> (
    select max(g2.id) from care_access_grants g2
    where g2.provider_id = g.provider_id and g2.pet_id = g.pet_id
      and g2.status in ('pending','active')
  );
```

**Apply (prod — concurrent, outside a transaction):**

```sql
create unique index concurrently if not exists uq_care_access_grants_active_provider_pet
  on care_access_grants (provider_id, pet_id)
  where status in ('pending', 'active');
```

**Verify:** run `supabase/verify_0128.sql` — every row **PASS** (index present;
no remaining duplicate active grants).

**Rollback:**

```sql
drop index concurrently if exists uq_care_access_grants_active_provider_pet;
```

The route's `23505` handler simply stops firing after a rollback (it falls back to
the select-then-insert behaviour that shipped before — no code change needed).

---

<!-- 0129 (A-19 index cleanup) is appended below when that PR lands. -->
