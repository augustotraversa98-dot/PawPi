# PR6 — invite codes (for partners who cannot be found by name)

**Status: built, in a DRAFT pull request. Migration `0143` is NOT applied.** Decide, apply, verify, then merge.

## Why
Inviting today is a search by name / @handle. A partner who signed up with Apple "Hide My Email" and has not set up a
dog has no profile to find. A code turns it around: the owner hands over a secret, the partner types it.

## Flow
1. Owner: More → Family & caregivers → pick the role → **Create a code** → shown **once** → Share.
2. Partner: same screen → **Shared with me** → "Have an invite code?" → Join. A brand-new account reaches it from
   onboarding ("I have an invite code"), so no duplicate dog is ever created. The share text also carries
   `pawpi://pet-sharing?code=…`, which only **fills in** the field.
3. The partner gets **active** access at once; the owner gets the "accepted" notification.

## Rules (enforced in the database)
| Rule | How |
|---|---|
| Single use | `used_at`, row locked `FOR UPDATE` while redeeming (two people at once: one wins) |
| Expires | 3 days (the table refuses more than 7) |
| Revocable | owner sets `revoked_at` ("Cancel code") |
| One pet, one role | columns on the row; the grant is created for exactly that pet |
| Never stored in clear | only `sha256(code)`; 12 characters from a 30-letter alphabet (about 59 bits) |
| Never logged | travels only in the POST body; routes log database messages only; tested |
| Guessing | 10 attempts per 10 minutes per account; max 5 live codes per pet; 20 creations an hour |
| Privacy | only the owner can read the table; a blocked pair just sees "that code doesn't work" |

## Decisions taken (change them if you disagree)
- **Redeeming is accepting.** No second approval by the owner: the code is the consent. Alternative: create a *pending*
  grant the owner confirms (safer if a code is forwarded; one more step for a couple).
- A code can **activate a pending invite** and sets the role of the code. A person who **already has access** keeps
  their role and the code stays usable for someone else.
- Codes give open-ended access (no end date); a caregiver with an end date still goes through the by-name invite.
- A plain hash, not an HMAC with a server secret: no new environment variable; the 3-day life and 59 bits make an
  offline guess from a database dump impractical.
- No universal link (`https://…`): it needs a native change and would put codes in web server logs.

## To ship
1. Run `supabase/migrations/0143_pet_invite_codes.sql` in the Supabase SQL editor.
2. Run `supabase/verify_0143.sql`: all 9 rows **PASS**. (Undo: `supabase/rollback_0143.sql`.)
3. Mark the PR ready and merge (deploys the API). It needs the next EAS build for the screens.
Before step 1 the API answers a friendly "not available yet"; nothing else changes.

## Known limits
- The custom `pawpi://` link is not clickable in every messaging app; the typed code always works.
- A signed-out person who taps the link must sign in first and type the code.
