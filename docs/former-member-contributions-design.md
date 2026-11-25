# Former members and the "also delete my posts" switch — design (night run #6, item 4)

**Status: design only. Nothing here is built, no server code, no migration, nothing applied.** The brief for this item was cut
off after "…and what"; I read it as "…and what the app does with the answer", and covered the app side in §5 too.

## 1. The problem

The delete-account screen shows the switch "Also delete my posts about dogs shared with me" only when the pets list
(`GET /api/pets?include_shared=1`) holds a dog someone else owns (`utils/deleteAccountContext.js` → `isMemberOfSharedDog`).
That list returns **current** grants only. Someone who **left** a shared dog, or was **removed** by its owner (grant status
`left` / `revoked` / `expired`), before deleting their account is not recognised as a member, so they never see the switch.
Their posts on that dog stay, shown as "Former member".

## 2. What the server already does (so the gap is only "knowing")

`app_delete_my_account(p_delete_contributions)` (migration 0142) acts on **posts**, not on grants:

```sql
delete from posts where user_id = v_uid and pet_id in (select id from pets where owner_user_id <> v_uid);
```

It runs for any caller who ever held a grant, whatever the grant's status today. So `DELETE /api/account?delete_contributions=1`
**already deletes a former member's posts**. Nothing needs to change in the deletion. The only missing piece is a way for the app
to learn "this person has posts on dogs they do not own" so it can show the switch.

Out of scope, unchanged: health logs and vet-record entries a member added stay with the dog, anonymised (same as today).
I did not verify that deleting a post removes its image **file** from storage, so no copy may say photos are erased.

## 3. Options

| | What | Verdict |
|---|---|---|
| A | Do nothing, document it (a former member's posts stay as "Former member"; they could delete a post themselves **before** leaving). | Safe, but a person who asks for deletion cannot get their photos out once access ended. Weak for 5.1.1(v)'s spirit. |
| B | The app remembers locally that the person was once a member. | Reject: lost on reinstall or a new phone, blind to removals done while the app was closed, stores a fact about sharing on the device. |
| C | Show the switch to everyone. | Reject: for most people it would read as a feature they cannot use and invite "what posts?" support questions. |
| **D** | **A small read endpoint that answers "do you have posts on dogs you do not own?" about the caller only.** | **Recommended.** |

## 4. Option D: the endpoint

`GET /api/account/contributions` → `200 { "posts_on_others_dogs": 3 }`

- **Who may call it:** any signed-in user, **about themselves only**. No query parameter, no body: there is no id to tamper
  with, so no way to ask about someone else. `401` when signed out. Same identity chain as every route (`session.user.id` →
  profile id → `withRequestContext`, which sets `app.current_user_id`).
- **What it returns:** one integer. No dog ids or names, no owner names, no post ids, captions or image URLs, no dates.
  Nothing about any other person: the number counts the caller's own posts.
- **How it is computed** (mirrors the predicate `app_delete_my_account` uses, so the switch appears exactly when turning it on
  would delete something):

```sql
select count(*)::int as n
from posts p
where p.user_id = ${userId}
  and not exists (select 1 from pets o where o.id = p.pet_id and o.owner_user_id = ${userId});
```

- **Why no migration:** the caller can read their own posts (`posts_author_all` and `posts_authed_read`, 0021), and the sub-select
  only needs the caller's **own** pets (`pets_owner_all`, 0020). It deliberately does **not** join to the other owner's `pets` row:
  `pets` reads are owner / active-grantee / provider scoped, so a former member (grant `left` or `revoked`) cannot read that row and
  a "posts joined to pets I do not own" query would wrongly return 0. (Read from the policies; **not** run against Postgres here, the
  integration test in the build PR must prove it.) If a future version needs data the caller cannot see, it needs a `SECURITY DEFINER`
  function with `set search_path = public, pg_temp` and the `REVOKE … FROM PUBLIC, anon, authenticated` + `GRANT … TO pawpi_app` pair,
  per `supabase/migrations/TEMPLATE.sql`; not needed here.
- **Failure:** any error returns a generic `500`/`{ error }`; the route logs no post data. It is read-only and idempotent.
- **Cost:** one indexed lookup (`posts.user_id`), only when the person taps "Delete account".

Classification for the PR rules: it is **server code that runs in production** → a **draft PR, not merged**, no Supabase change.
Tests when built: route unit test (401, shape, the count comes from SQL only); integration test on the real Postgres harness
(former member with grant `left` and one with `revoked` → count; a post on their own dog → not counted; another user's posts
and an owner's dogs → not counted; user B never sees user A's number; signed out → denied).

## 5. What the app does with the answer

In `loadDeleteAccountContext` (only when "Delete account" is tapped, never on app return):

- `showSwitch = isMember || posts_on_others_dogs > 0` (current members keep the switch even with 0 posts, as today).
- If the call fails or the route does not exist yet (older server): fall back to today's rule. **Never guess**, never block
  deletion.
- Copy stays as shipped ("Also delete my posts about dogs shared with me", hints about "Former member"). One optional
  wording decision for you: for a former member the dogs are no longer shared with them; "…about dogs that were shared with me"
  would be more exact. Not changed.
- The privacy/terms/support text already says a member can choose to delete the posts they published about shared dogs; it does not
  need to change.
- Order of release: deploy the server route first, then the app build that calls it.

## 6. Decision for you

Build option D after build 33 is through review (it is not needed for the submission: today's wording is accurate for the
current-member case, and the former-member case is documented in the night-run #5 report). Estimated size: one route + one
integration test + a small change in `deleteAccountContext.js` and its tests.
