# Backfill: cache-control on existing public media (owner runbook - NOT run)

**Why.** New uploads are stored with `cache-control: max-age=31536000` (`POST /api/upload`, perf audit 5.1/5.4). Objects uploaded before that were stored with Supabase's default (`no-cache`), so every view of an old photo revalidates. Object names are random UUIDs and are never rewritten, so a long max-age is safe for them too.

**Scope.** Public `media` bucket only (~90 objects at the audit date). Never touch `media-private` (medical/chat files are reached only through short-lived signed URLs).

**How (run by the owner, one time, with the Supabase service role - never commit the key):**
1. List objects: `GET {SUPABASE_URL}/storage/v1/object/list/media` (prefix `uploads/`, paginate with `limit`/`offset`).
2. For each object, re-upload it onto the same path so the new metadata applies: download `GET /storage/v1/object/media/<path>`, then `POST /storage/v1/object/media/<path>` with headers `x-upsert: true`, `cache-control: max-age=31536000` and the original `Content-Type`.
3. Spot-check with `curl -I <public url>`: the response must show `cache-control: max-age=31536000`. The Cloudflare/Supabase CDN may keep serving the old header until it expires or is purged.

**Rollback.** None needed; the object bytes are unchanged. To undo, re-upload with `cache-control: no-cache`.
**Do not** change the stored `image_url` values - they stay the original public URLs.
