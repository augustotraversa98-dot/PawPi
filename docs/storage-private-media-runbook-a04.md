# Private media bucket + streamer — AUDIT A-04 (HELD)

**⚠️ HELD — storage/design review + on-device media test required. Nothing here
is applied to production. No SQL migration is included; this is a Supabase Storage
change plus a data migration of existing rows.**

## Why
Vet PDFs, health/stool/vomit photos, chat attachments and vet-shared docs are
written to the **public** `media` bucket as permanent, unrevocable URLs. The path
is unguessable (122 bits), but the URL is a **bearer secret**: once minted it
grants anyone with the link permanent access to a medical document — it survives
care-grant revocation, caregiver removal, chat deletion and account deletion, and
it is logged client-side. This is a bearer-URL problem, not an enumeration one.

## What this PR ships (code)
- `utils/mediaAccess.js` — `PRIVATE_BUCKET = "media-private"`, `parsePrivateMediaKey`
  (validates `pets/<petId>/<uuid>.<ext>`, rejects traversal), `buildPrivateMediaKey`,
  `createSignedMediaUrl` (service-role signed URL, default 60 s).
- `GET /api/media?key=…` — auth-gated streamer: resolves the caller, authorises
  against the pet the key is scoped to (owner OR accepted family via
  `resolvePetLogOwner`), then **302s to a 60 s signed URL**. 400 on a bad key,
  403/404 for a non-owner, 502 on a signing failure.
- `POST /api/upload` gains a **private mode**: `visibility=private` + `petId`
  writes to `media-private` under `pets/<petId>/<uuid>.<ext>` (owner/family
  checked) and returns `{ key }` — the client stores the KEY, not a URL.

## What a reviewer MUST do before merging / enabling
1. **Create the bucket.** In Supabase → Storage, create `media-private` as a
   **private** bucket. Set `file_size_limit` and `allowed_mime_types` to mirror
   `uploadValidation.js` (images + PDF + CSV/XLSX, 50 MB). Leave the public
   `media` bucket for genuinely public assets only.
2. **Provider access path.** The streamer currently authorises owner/family only.
   Add the provider branch — active staff with an `assertCareAccess('medical_read')`
   grant — before shipping, so a vet the owner shared records with can still open
   them. (The key carries the petId; the provider path needs the providerId from
   context.)
3. **Wire the 6 medical/chat callers** to upload with `visibility=private` + petId
   and to render via `GET /api/media?key=…`: `AddDocumentModal` (vet PDFs →
   `vet_record_documents.file_url`), `PhotoCheckCaptureModal`, `GeneralCheckModal`,
   `PooTrackerModal`, `VomitTrackerModal`, `chat.jsx`, `provider-chat.jsx`,
   `vet-business-access.jsx`. (This PR ships the server capability only — the
   callers still use the public path until migrated, so nothing breaks.)
4. **Migrate existing rows (DATA CHANGE — review).** For each table that stores a
   public `media` URL for a medical/chat file, copy the object into
   `media-private/pets/<petId>/…`, rewrite the column to the key, and delete the
   public object. Do this behind a feature flag with a fallback (serve the public
   URL if no key yet) so a partial migration never 404s a user's records.
5. **Device test.** Upload a vet PDF + a health photo, confirm they render through
   the streamer, confirm a copied streamer URL 403s for a different account, and
   confirm a signed URL expires (~60 s).

## Tests included
`mediaAccess.test.js` (key parsing/traversal), `media/route.test.js`
(401/400/403/302/502), `upload/route.test.js` private-mode case. Public upload
behaviour is unchanged (existing tests green).
