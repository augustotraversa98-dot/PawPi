# Private media bucket + streamer — AUDIT A-04

**Status: backend + client wiring MERGED and safe on prod. The `media-private`
bucket is created (private). The public `media` bucket is UNCHANGED and existing
public URLs still resolve — nothing is broken for installed apps or the in-review
build. The final privatization steps (privatize/expire existing public URLs) are
DEFERRED to build-20 go-live — see the checklist at the bottom.**

## Why
Vet PDFs, health/stool/vomit photos, chat attachments and vet-shared docs are
written to the **public** `media` bucket as permanent, unrevocable URLs. The path
is unguessable (122 bits), but the URL is a **bearer secret**: once minted it
grants anyone with the link permanent access to a medical document — it survives
care-grant revocation, caregiver removal, chat deletion and account deletion, and
it is logged client-side. This is a bearer-URL problem, not an enumeration one.

## The design (backward-compatible by construction)
The private path is **additive** and dual-mode, which is what lets it ship before
the bucket is privatized:
- A file is stored as an **object KEY** (`pets/<petId>/<uuid>.<ext>`) in the
  private `media-private` bucket instead of a public URL.
- Render sites accept **either** a key **or** a legacy public URL. Keys are
  exchanged for a short-lived (60 s) signed URL via the auth-gated streamer;
  public URLs pass straight through. So existing rows keep rendering with no
  round-trip and no migration, everywhere, on every app version.
- Only **new** uploads from a build that has the client wiring write keys.

## What is DONE (merged in this PR)
**Storage**
- `media-private` **private** bucket created on prod (`storage.buckets`): 25 MB
  `file_size_limit`, `allowed_mime_types` mirror `uploadValidation.js` (images +
  PDF + CSV/XLS/XLSX). Public `media` bucket untouched.

**Server (`anything/apps/web`)**
- `utils/mediaAccess.js` — `PRIVATE_BUCKET`, `parsePrivateMediaKey` (validates the
  key shape, rejects traversal), `buildPrivateMediaKey`, `createSignedMediaUrl`
  (service-role signed URL, default 60 s).
- `GET /api/media?key=…[&providerId=…][&json=1]` — auth-gated streamer. Authorises
  the caller two ways:
  - **owner / accepted family** of the pet (`resolvePetLogOwner`), or
  - **provider staff** acting as `?providerId` holding an active `medical_read`
    care-access grant (`assertCareAccess`, wrapped in `withSavepoint`; writes the
    append-only care_access_audit row). This is the sanctioned provider→pet-data
    path (docs/provider-design.md §3).
  Responds `302 → signed URL` (browser/`<img>`) or, with `?json=1`, `{ url }` for
  the mobile client (RN can't read a manual-redirect Location and a native
  `<Image>` can't carry the caller's auth header). 400 bad key · 403/404 not
  authorised · 502 signing failure.
- `POST /api/upload` **private mode**: `visibility=private` + `petId` writes to
  `media-private` under `pets/<petId>/<uuid>.<ext>` (owner/family checked) and
  returns `{ key }`. Public mode (default) is unchanged, returns `{ url }`.

**Mobile (`anything/apps/mobile`)**
- `utils/useUpload.js` — accepts `{ visibility: "private", petId }`; returns `key`
  (private) alongside `url` (public).
- `utils/privateMedia.js` — `isPrivateMediaKey`, `resolvePrivateMediaUrl` (key →
  signed URL via `?json=1`; URL/local uri passthrough), `usePrivateMediaUri` hook.
- `components/ui/PrivateImage.jsx` — drop-in `<Image>` that renders a key or URL.
- Wired the **5 pet-scoped medical surfaces** to upload private + render via the
  streamer: `AddDocumentModal` (vet PDFs → `vet_documents.file_url`; extraction is
  handed a fresh signed URL, open via resolved URL in `HealthVetRecord`),
  `PhotoCheckCaptureModal` (→ `health_photo_checks.image_url`, rendered in
  `PhotoHistory`), `GeneralCheckModal` (photos in `health_general_checks.areas`),
  `PooTrackerModal` (→ `health_poo_logs.photo_url`), `VomitTrackerModal` (→
  `health_vomit_logs.photo_url`).

## What is DEFERRED (NOT done here — do NOT skip before flipping public)
1. **Chat attachments (`chat.jsx` DM, `provider-chat.jsx`)** — still upload to the
   PUBLIC bucket. They are **thread-scoped**, not pet-scoped: a DM attachment has
   no natural `petId`, and the streamer authorises by pet ownership/grant. Moving
   chat to private needs a **thread-scoped** streamer authorization path (authorise
   the caller as a participant of the message's thread), which this PR does not
   build. Track as a follow-up. (`vet-business-access.jsx` is intentionally out of
   scope — it uploads a PUBLIC business price list and persists no media.)
2. **Bucket privatization / existing-URL migration** — the public `media` bucket
   stays public and existing public URLs are NOT expired. See go-live below.

## Build-20 go-live checklist (run ONLY once build 20 — which contains the client
wiring above — is LIVE in the App Store and adopted; NOT before, or media breaks
for installed/in-review builds)
1. **Confirm build 20 (with the streamer client) is live** in the App Store and
   the older builds are past their meaningful usage tail.
2. **Migrate existing medical rows** off the public bucket, behind the dual-mode
   fallback (already in place — a URL still renders, so a partial migration never
   404s): for each of `vet_documents.file_url`, `health_photo_checks.image_url`,
   `health_general_checks.areas[].photos[]`, `health_poo_logs.photo_url`,
   `health_vomit_logs.photo_url`, copy the object `media/uploads/<x>` →
   `media-private/pets/<petId>/<uuid>.<ext>`, rewrite the column to the key, then
   delete the public object.
3. **(When chat is migrated)** build the thread-scoped streamer path first, ship a
   build that renders chat attachments through it, THEN migrate `dm_messages.image_url`
   / `messages.attachment_url`.
4. **Do NOT make the `media` bucket itself private** unless every remaining public
   object has been migrated or is genuinely public — privatizing the bucket breaks
   any still-public URL immediately.
5. **Rollback**: the change is additive. To revert the client, ship a build that
   writes public URLs again; already-written keys still resolve through the streamer
   as long as the code + `media-private` bucket remain. Deleting `media-private` is
   safe only after no column references a key.

## Device QA still owed (build-20 QA, on a phone — cannot be done headlessly:
login is a WebView credential form)
Upload a vet PDF + a health photo on build 20, confirm they render through the
streamer; confirm a copied streamer URL 403s for a different account; confirm a
provider with a `medical_read` grant can open a shared file and one without cannot;
confirm a signed URL expires (~60 s).

## Tests
`mediaAccess.test.js` (key parsing/traversal), `media/route.test.js`
(401/400/403/302/502 + provider-grant 302 + `json=1` + owner-only-without-providerId),
`upload/route.test.js` (private-mode), mobile `privateMedia.test.js` (key detection
+ resolver + providerId + passthrough). Public upload behaviour unchanged.
