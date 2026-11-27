# Sharing the vet record with a vet

Status: 2026-11-26. Sections and expiry are built on the server and the web provider panel (migration 0147, applied by
hand before the server is deployed; then `supabase/verify_0147.sql`), and so are sharing while a provider's request is
pending, telling the provider when access is given or revoked, and inviting a vet by link (migration 0148, then
`supabase/verify_0148.sql`; server and web). Record links, which open with no account (migration 0153, applied by hand
after the merge; then `supabase/verify_0153.sql`), are section 5. Invitations to a vet that is on PawPi (migration
0154, applied by hand after the merge; then `supabase/verify_0154.sql`) are section 6. Part 4 is not built.

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

### `PATCH approve` on a request from an invite

`PATCH /api/care-access/grants/[grantId]` `{action: "approve"}` answers 409 `code: "choose_sections"` when the pending
request was filed by accepting an invite link **and** the business has no booking for that pet. Nothing changes and
nobody is notified. `error` is a sentence in the owner's language (stored language; without one, English only when
`Accept-Language` prefers English over Spanish, else Spanish) that says to choose what to share, to update PawPi if
that option is missing, or to deny. `deny`, `revoke`, approving any other request and sharing by section are not
affected.

- **From an invite:** `care_access_invites` has a used invite of the same owner and pet, `used_by_provider_id` equal to
  the request's provider and `used_at` equal to the request's `created_at`. The accept writes both in one transaction,
  and both are its `now()`. No column of the grant records the origin, so a change that sets either timestamp any other
  way has to keep them equal (`vet-invite.integration.test.ts` checks it). A request the same business files itself
  does not match.
- **Booking:** a `vet_appointments` row of the owner's for that pet and business, not deleted, whose `booking_status` is
  not `cancelled` or `declined` (none counts). Any kind of service, any date. This is the app's rule
  (`mobile/src/utils/vetShare.js`, `hasBookingForPet`), except that the app only sees the 50 latest past bookings.

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
   `owner_sharing`) and approves with sections and expiry or denies it. Approving the request as asked needs a booking
   for the pet with that business (`PATCH approve` on a request from an invite, above).
5. Once approved, the business finds the pet under Clinical, "Shared with us", with or without a booking
   (`GET /api/providers/[id]/shared-pets`: names of the pets whose record is open to it now).

Only a hash of the token is stored (`care_access_invites`, forced RLS, owner policies; a vet reaches it only through
`app_preview_vet_invite` and `app_claim_vet_invite`). The token sits after the `#`, so it is not part of a request URL:
the page keeps it in the tab's session storage across sign-in, removes it from the address bar and sends it only in a
request body. The page is `noindex` and sends no referrer. Creating, opening and accepting are rate limited.
Tests: `web/test/integration/vet-invite.integration.test.ts`.

In the app (`mobile/src/components/Health/VetShare/InviteVet.jsx`, released versions after build 33): the share sheet
offers **Invite a vet by link** to the pet's owner, states the rules before creating, hands the link straight to the
phone's share sheet without keeping it, and lists every invite of the owner with its state and **Withdraw** on open ones.
A `care_access_requested` notification, in the list or as a tapped push, opens Data Access.

In app versions that create record links (section 5), the share sheet no longer creates invites: it lists the ones made
earlier, with **Withdraw** on open ones.

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

### Grant with `medical_read` (the app lists it as "Older access"; keep `mobile/src/utils/vetShare.js` in step)

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
`anything/apps/mobile/src/components/Health/VetShare/ShareWithVetSheet.jsx`. From there it offers providers the owner
has a vet or telehealth booking with, for that pet; any other vet is found by search and invited (section 6) or, without
PawPi, sent a link (section 5). The same sheet opens for one given provider from a booking that is not completed (any
kind of provider) and from Data Access > **Choose what to share** on a pending request.

- It sends only the by-section body. Nothing is selected beforehand, a review step states who can see what, until when
  and what ending access does not take back, and consent is explicit.
- Access is reported as given only when the returned grant matches the choice; otherwise the app says so and revokes a
  newly created grant that differs.
- Data Access also keeps **Approve all asked**, which approves a provider request as asked, after listing everything in
  it, only for a provider with a booking for that pet (not cancelled or declined). Any other request offers **Choose
  what to share** or **Deny**, and asks the owner to check the name. For a request from an invite the server holds the
  same rule on `PATCH approve` (section 1), so it also applies to app versions released before this screen.
- App versions released before this sheet (including build 33) send the by-scope body, and their data-access screen
  prints raw scope labels, so a grant by section reads `record_sections` there. They cannot choose sections: on a
  request from an invite without a booking, **Approve** shows the `choose_sections` sentence, and **Deny** works.

## 3. Telling the provider

Every active staff member of the provider gets one in-app notification, never the person acting
(`utils/careAccessNotify.js`).

| Type | Sent when | Phone push follows the business switch |
|---|---|---|
| `care_access_granted` | A grant is created active (either body shape), or a pending request is approved (by the owner's `POST` or `PATCH approve`) | New bookings (`biz_booking`) |
| `care_access_revoked` | `PATCH revoke` | Booking changes (`biz_booking_change`) |

Nothing is sent for a repeated share (`deduped`), a refused request (400, 404, 409), `PATCH deny`, expiry, or the old
grant that a share by section replaces (only `care_access_granted` goes out).

- Text: a sentence in the recipient's language (EN or es-AR) with the owner's public display name (a neutral word
  without one), the dog's name and, for a grant, the end date (`dd/MM/yyyy` on the recipient's local day) or "until
  revoked". Nothing from the record and not the sections shared. The push banner shows the same sentence.
- `subject_ref` is the **pet id**. The app shows the sentence and a tap only marks it read: it has no provider record
  screen. Released builds that do not know the types show the sentence under the owner's name, a tap goes back, and a
  tapped push opens the notifications list.
- Push preferences work as for other business notifications: on by default, off with the switch; the bell row is always
  written. Business pushes have no quiet hours or daily cap.
- A failure while notifying never fails the share or the revoke: each step runs in a savepoint.
- The web provider panel has no notification list.

## 4. Not built

Each needs its own change with owner review.

1. **Send an invite by email or phone.** PawPi sends nothing to an invited vet: the owner shares the link ("Invite by
   link", section 1). Needs working email delivery first.
2. **More sections** (allergies, conditions, medications, surgeries): each needs a read policy, a branch in the record
   route and a record screen section.

## 5. Record links (no account)

Migration 0153. A link is a different thing from an invite (section 1) and lives in its own table, so an invite made
before, or by an app that predates links, never shows anything to anyone.

**The owner** (not family members) creates one for one pet: `POST /api/care-access/links`
`{petId, sections, expiry, allowNotes}`. Every field is required: one or more of the eight section keys, `7d`, `30d` or
`1y` (there is no "until revoked"), and a boolean. 201 `{link, url}`; the address `<site>/shared-record#<token>` is
returned only then. At most 10 links in use per owner (409 `link_limit`); creating is rate limited.
`GET /api/care-access/links?petId=` answers `{available, links}` without any token;
`PATCH /api/care-access/links/[linkId]` `{action: "revoke"}` removes one and is never limited. On a database without
0153, `available` is false and creating answers 409 `share_links_unavailable`.

**Whoever has the link** opens `/shared-record`, with no account. The page takes the token from after the `#`, keeps it
in the tab's session storage, removes it from the address bar and sends it only in a request body. The page and the
answers are `no-store`, `noindex` and `no-referrer`. Three public routes, each reading a small, size-capped body (413 beyond it), rate limited per sender address and
checking the link on every call (not revoked, not expired, the pet still belongs to the link's owner):

| Route | Answer |
|---|---|
| `POST /api/public/record-link/open` `{token}` | `{record}`: pet name, owner display name, end date, the sections and only their data |
| `POST /api/public/record-link/file` `{token, kind, id}` | `{url}`: a signed address of about 60 s for a file of a granted document or photo check. 409 `file_not_available` for a file that is not a private file of that pet (older public web addresses are never handed out) |
| `POST /api/public/record-link/notes` `{token, note}` | 201 `{note}`: adds one vet note, only when the link allows it; at most 2000 characters and 10 notes per link in 24 h (429 `note_limit`) |

An unusable link answers 403 `link_not_valid`, whatever the reason. The database is reached only through
`app_record_link_view`, `app_record_link_file` and `app_record_link_add_note`.

**What a section opens** is the table in section 2. The medical profile, emergency contact and insurance columns are
returned separately. No user ids, storage keys or file addresses are in the record.

**Notes added through a link** are only additions: nothing can be changed or deleted through a link. The author is the
signed-in visitor's display name, read by the database from the request's identity, never from the request body;
otherwise the note has no name and reads "Anonymous" / "Cambios de alguien externo". `vet_notes.via_record_link` marks
them. `vet_name` holds that label in the owner's language followed by "(shared link)" / "(enlace compartido)", and the
notes routes answer it as `created_by_name` too (with `created_by_role` `editor`), so app versions released before
links show where such a note came from and never read it as the owner's; the vet summary data carries the same text.
The current app, the provider record page and the link page show `external_author_name` with their own mark. The three
link columns are written only by the database, never by the application role. Link notes do not count towards
`app_pet_has_vet_relationship`. If the signed-in author deletes their account, the name becomes "Former member".

Tests: `web/test/integration/vet-record-links.integration.test.ts`, `web/src/app/shared-record/page.test.jsx`,
`mobile/src/components/Health/VetShare/RecordLinks.test.jsx`.

## 6. Invitations to a vet on PawPi

Migration 0154. The owner finds a vet business that is on PawPi and invites it to parts of the record; no link changes
hands. An invitation is an offer: it opens nothing, and access starts only when the business accepts, as an ordinary
grant by section (section 1).

**Who can be found and invited** (`app_vet_can_receive_share`): a published, non-demo business with the `vet`
capability that is not an unclaimed directory listing and has an active team member with an account, where neither the
owner nor the business's owner has blocked the other. `GET /api/care-access/vets?q=` (2 to 60 characters, at most 20
results, rate limited with the other searches) matches part of the business name or handle, or the owning account's
username typed in full (ignoring case), and answers public business fields only: name, handle, logo and first location.

**The owner** (not family members):

| Route | Result |
|---|---|
| `POST /api/care-access/offers` `{petId, providerId, sections, expiry}` | 201 `{offer}`. The same choice already waiting: 200 `{offer, deduped: true}`. A different one waiting: 409 `offer_open` with it. At most 20 waiting per owner (409 `offer_limit`); rate limited |
| `GET /api/care-access/offers?petId=` | `{available, offers}` with `status` `open`, `accepted`, `declined`, `withdrawn` or `lapsed` |
| `PATCH /api/care-access/offers/[offerId]` `{action: "withdraw"}` | Withdraws an unanswered one; never limited. 409 `offer_accepted` / `offer_closed` |

**The business** (any active staff member):

| Route | Result |
|---|---|
| `GET /api/providers/[id]/share-offers` | `{available, offers}`: the unanswered ones, each with pet name, owner display name, sections, length and dates. Nothing from the record |
| `POST /api/providers/[id]/share-offers/[offerId]` `{action: "accept" \| "decline"}` | `{status}`; the same answer again adds `already: true` and changes nothing. 409 `offer_not_open`, `not_eligible` (accepting needs a published vet business) |

Rules, held in the database (`app_respond_share_offer`, forced RLS on `care_share_offers`):

- At most one unanswered invitation per business and pet (unique index). It lapses after 7 days, and also when the pet
  changes owner.
- Accepting gives exactly the offered sections for the chosen length, counted from the acceptance. It answers a pending
  request of that business, or replaces access in place, under the same lock as the owner's own share. Two answers at
  once make one grant.
- The owner's later decision wins: when access for that pet and business starts, is approved, is denied or is revoked,
  an unanswered invitation is withdrawn (trigger on `care_access_grants`). A repeated share that finds the access
  already in place changes no row there, so `POST /api/care-access/grants` withdraws it itself.
- Only the database marks an invitation accepted or declined: the owner's own update rights end at withdrawing it.

**Notifications** (in-app and push, recipient's language): `care_share_offered` to the business's team, leaving out a
member with a block between them and the owner (push follows the New bookings switch; `subject_ref` is the **provider
id**), `care_share_accepted` and `care_share_declined` to the
owner (category `owner_sharing`; `subject_ref` is the provider id). Released app builds show the sentence.

**Where the business answers:** the web provider area, Clinical, and in the app's business mode (a card on the business
home that opens **Record invitations**). Reading the record stays on the web.

**Where the owner sends:** the share sheet's search. A business found there that already has access or a pending request
is shared with directly (section 1); any other is invited. Waiting invitations, with **Withdraw invitation**, are listed
in the share sheet and in Data Access.

On a database without 0154 the search and both lists answer `available: false`, sending and answering say it is not
available, and every other sharing route behaves as before. Tests: `web/test/integration/vet-share-offers.integration.test.ts`,
`web/src/app/provider/components/ClinicalShareOffers.test.jsx`, `mobile/src/components/Health/VetShare/VetInvitation.test.jsx`.
