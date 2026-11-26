# Sharing the vet record with a vet

Status: 2026-11-26. Sections and expiry are built on the server and the web provider panel (migration 0147, applied by
hand before the server is deployed; then `supabase/verify_0147.sql`), and so is sharing while a provider's request is
pending. Part 3 is not built.

## 1. Grants (`care_access_grants`)

Owner routes: `GET` / `POST /api/care-access/grants`, `PATCH /api/care-access/grants/[grantId]` (`approve`, `deny`,
`revoke`). Provider requests: `POST /api/providers/[id]/access-requests`. Enforced by RLS (0023, 0025, 0123, 0147) and
`anything/apps/web/src/app/api/utils/careAccess.js`, which writes `care_access_audit` on each provider read. Grants are
status-flipped, never deleted. Only the pet's owner can share; family members cannot.

There are two kinds of grant:

| Kind | Stored as | Who creates it |
|---|---|---|
| By scope | `scopes` (e.g. `medical_read`), `sections` null | The owner, or a provider request the owner approves |
| By section | `scopes = {record_sections}`, `sections`, optional `expires_at` | Only the owner; never pending |

`record_sections` is not one of the scopes a route accepts or asks for, so a check that does not know about sections
denies a grant by section.

### `POST /api/care-access/grants`

| Body | Result |
|---|---|
| `{petId, providerId, scopes?}` (no `sections`, no `expiry`) | Grant by scope, `medical_read` by default, no expiry. 201, or 200 `{deduped: true}` when an active grant already covers the scopes. 409 `code: "sectioned_grant_exists"` while a grant by section is active: it is never widened |
| `{petId, providerId, sections, expiry}` | Grant by section with exactly that choice. 201 `{grant}`. An active grant of either kind for that pet and provider is revoked and replaced in the same transaction |
| `sections` or `expiry` without the other, empty or unknown values, or `scopes` with either | 400 |

- Sections: `profile`, `emergency_contact`, `insurance`, `vet_notes`, `vaccines`, `files`, `photos`, `lab_results`.
  Nothing is selected by default.
- Expiry: `7d`, `30d`, `1y`, `until_revoked`. The server computes `expires_at`.
- A grant past its date never blocks a new one: it is marked `expired` first (here and on a provider request).
- While the provider's request for the same pet is **pending**, the owner's `POST` of either shape approves that row
  with exactly what the owner chose and answers 200 `{grant, approvedRequest: true}`. By scope: the scopes in the body
  (`medical_read` by default), no expiry. By section: the chosen sections and expiry. Scopes the provider asked for and
  the owner did not choose are dropped; the row keeps `requested_by = 'provider'`. A pending row past its date is marked
  `expired` and a new grant is created instead.
- Shares for the same pet and provider run one at a time, and `PATCH approve` answers 409 if the request stopped being
  pending while it ran, so it never overwrites the owner's choice.

`GET` returns each grant with `sections` (null for a grant by scope) and `expires_at`. `status` is the effective status:
a pending or active row past its date reads `expired`, and `?status=` filters on that.

### Invite by link (a vet with no booking)

Server and web page. Migration 0148, applied by hand before the server is deployed; then `supabase/verify_0148.sql`. An
invite shares nothing: it ends in a pending request like the one a provider files, which only the owner can approve.

1. The pet's owner (not family members) creates an invite for one pet:
   `POST /api/care-access/invites` `{petId}` answers 201 `{invite, link}`. The link is `<site>/vet-invite#<token>` and
   is returned only then. It lasts 7 days, works once and can be withdrawn
   (`PATCH /api/care-access/invites/[inviteId]` `{action: "revoke"}`, 409 `invite_used` after use). At most 5 open
   invites per owner (409 `invite_limit`). `GET /api/care-access/invites?petId=` lists them without any token, with
   `status` `open`, `used`, `revoked` or `expired`. PawPi sends nothing to the vet: the owner shares the link.
2. A signed-in active staff member of a **published business with the `vet` capability** opens the link.
   `POST /api/care-access/invites/preview` `{token}` returns the pet's name, the owner's display name, the expiry and the
   caller's eligible businesses. No photo, no record data. 401 signed out, 403 `no_business`, and one answer, 404
   `invite_not_valid`, for an unknown, expired, used or withdrawn link (also when the pet changed owner or either person
   blocked the other).
3. `POST /api/care-access/invites/accept` `{token, providerId}` uses the invite and files a pending request
   (`scopes = {medical_read}`, `requested_by = 'provider'`, no sections) through the ordinary insert policy:
   `{status: "requested"}`. When that business already has a pending or active grant for the pet, nothing changes and the
   invite stays unused: `{status: "already_open"}`.
4. The owner gets a `care_access_requested` notification (push under the owner notification rules, category
   `owner_sharing`) and approves with sections and expiry, approves the request as asked, or denies it.
5. Once approved, the business finds the pet under Clinical, "Shared with us", with or without a booking
   (`GET /api/providers/[id]/shared-pets`: names of the pets whose record is open to it now).

Only a hash of the token is stored (`care_access_invites`, forced RLS, owner policies; a vet reaches it only through
`app_preview_vet_invite` and `app_claim_vet_invite`). The token sits after the `#`, so it is not part of a request URL:
the page keeps it in the tab's session storage across sign-in, removes it from the address bar and sends it only in a
request body. The page is `noindex` and sends no referrer. Creating, opening and accepting are rate limited.
The app screens for creating an invite are not built. Tests: `web/test/integration/vet-invite.integration.test.ts`.

## 2. What the vet sees

Who: every active staff member of that provider. Read at request time: expiry and revocation apply to the next request.

### Grant by section (read only)

| Section | Opened | Private files opened through `GET /api/media?providerId=` |
|---|---|---|
| `profile` | Microchip, spay/neuter and date, usual vet and clinic contacts, medical notes | none |
| `emergency_contact` | Emergency contact name and phone | none |
| `insurance` | Insurer and policy number | none |
| `vet_notes` | All vet notes, owner's and vets' | none |
| `vaccines` | Vaccinations | none |
| `files` | The documents list | the file of a listed document |
| `photos` | Health photo checks | the photo of a listed check |
| `lab_results` | Lab results | none: a lab result has no file of its own; lab documents are under `files`, and owner wording must say so |

- `profile`, `emergency_contact` and `insurance` live in one table, read only through `app_shared_medical_profile`,
  which returns just the granted columns.
- `GET /api/providers/[id]/pets/[petId]/record` returns `sharedSections` plus `medical_profile`, `notes`,
  `vaccinations`, `documents`, `photo_checks`, `lab_results`; whatever was not shared is null or empty.
- The web provider panel shows only the shared sections, names the ones not shared, and has no write forms.
- No write, prescription, vaccine check or care module is opened.

### Grant with `medical_read` (the consent copy of the mobile "Share" sheet; keep in step)

| Opened | Source |
|---|---|
| Medical profile: microchip, spay/neuter, usual vet and clinic contacts, emergency contact, insurance, medical notes | `pet_medical_profiles` |
| All vet notes, owner's and vets' | `vet_notes` |
| Vaccinations | `pet_vaccinations` |
| A private file of the pet, only when the exact key is known (e.g. a chat attachment) | `GET /api/media?providerId=` |

The record route answers these three with `sharedSections: null`. It does not open the documents list, photo checks or
lab results.

### Never shared by either kind

Allergies, conditions, surgeries, medications, prescriptions and daily health logs are not part of the record above.
The `pets` row (name, photo, breed...) is already readable by any signed-in user (0021).

`web/test/integration/vet-share-boundary.integration.test.ts` fails if a policy widens this;
`vet-sharing-sections` and `vet-sharing-routes` cover the database and the routes.

### The mobile sheet

Vet Record > **Share** (and Data Access > **Share with your vet**) opens
`anything/apps/mobile/src/components/Health/VetShare/ShareWithVetSheet.jsx`. It offers providers the owner has a vet or
telehealth booking with, for that pet: the web provider panel lists pets only through bookings, so any other vet would
have access with no screen to open it. Choosing sections and expiry in the app is a separate change; until it ships, the
app sends the by-scope body. The released data-access screen prints raw scope labels, so a grant by section reads
`record_sections` there.

## 3. Not built

Each needs its own change with owner review.

1. **Notify the vet** when access is given or revoked (`care_access_granted`, `care_access_revoked`; the types exist
   from 0147). PawPi sends nothing today.
2. **Invite a vet who is not on PawPi (email, phone or link).** New `care_access_invites` (pet, owner, what is shared,
   hashed token, expiry, accepted_by_provider, revoked_at), forced RLS, a rate-limited accept function that turns an
   invite into a grant for the accepting provider, single use. Needs working email delivery first.
3. **Let the vet find the pet without a booking.** A provider "Shared with us" list from active grants. Then the booking
   restriction in the picker can go.
4. **More sections** (allergies, conditions, medications, surgeries): each needs a read policy, a branch in the record
   route and a record screen section.
