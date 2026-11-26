# Sharing the vet record with a vet

Status: 2026-11-26. Part 1 is built. Part 2 is a proposal, nothing in it exists.

## 1. What exists (built, no migration, no server change)

Vet Record > **Share** (and Data Access > **Share with your vet**) opens a sheet
(`anything/apps/mobile/src/components/Health/VetShare/ShareWithVetSheet.jsx`).

- Backend: `care_access_grants`. `POST /api/care-access/grants` (owner creates an active grant),
  `PATCH /api/care-access/grants/[grantId]` (`revoke`). Enforced by RLS (0023, 0025, 0123) and `assertCareAccess`,
  which writes `care_access_audit` on each provider read. Grants are status-flipped, never deleted.
- The app sends one scope: `medical_read`.
- Who can be picked: providers the owner has a vet or telehealth booking with, for that pet. The provider web panel
  lists pets only through bookings, so any other vet would have access with no screen to open it.
- Who sees it: every active staff member of that provider. PawPi sends them no notification.
- Ends: when the owner revokes. Only the pet's owner can share; family members cannot.

### What `medical_read` opens (the consent copy; keep in step)

| Opened | Source |
|---|---|
| Medical profile: microchip, spay/neuter, usual vet and clinic contacts, emergency contact, insurance, medical notes | `pet_medical_profiles` |
| All vet notes, owner's and vets' | `vet_notes` |
| Vaccinations | `pet_vaccinations` |
| A private file of the pet, only when the exact key is known (e.g. a chat attachment) | `GET /api/media?providerId=` |

The `pets` row (name, photo, breed...) is already readable by any signed-in user (0021).

Not opened: allergies, conditions, surgeries, medications, lab results, documents list, photo checks, daily health logs.
`web/test/integration/vet-share-boundary.integration.test.ts` fails if a policy widens this.

## 2. Proposed, not built

Each needs server work, so each is a draft PR with owner review.

1. **Choose sections.** New scopes (`profile_read`, `notes_read`, `vaccines_read`, `allergies_read`,
   `conditions_read`, `medications_read`, `surgeries_read`, `labs_read`, `documents_read`, `photos_read`).
   Every one needs its own RLS select policy, a matching `assertCareAccess` call per query in the record route, a
   record screen that renders only granted sections, and a per-scope branch in `/api/media`. `medical_read` keeps its
   current meaning for existing grants. Integration tests: each scope opens its table and no other.
2. **Expiry (7 days, 30 days, until revoked).** The column and the enforcement exist; the owner create route does not
   accept a date. Add a validated `expiresAt` to the POST, and mark expired grants `expired` before inserting, because
   the one-open-grant index (0128) would otherwise block sharing again.
3. **Invite a vet who is not on PawPi (email, phone or link).** New `care_access_invites` (pet, owner, scopes, hashed
   token, expiry, accepted_by_provider, revoked_at), forced RLS, a rate-limited accept function that turns an invite
   into a grant for the accepting provider, single use. Needs working email delivery first.
4. **Let the vet find the pet without a booking.** A provider "Shared with us" list from active grants, plus a
   notification on grant. Then the booking restriction in the picker can go.
5. **Fix:** creating a grant while a pending one exists hits the unique index inside the request transaction, and the
   recovery query then fails (500). The app avoids the call; the route should use `withSavepoint`.
