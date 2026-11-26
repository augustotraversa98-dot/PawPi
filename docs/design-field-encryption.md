# Design: application-layer encryption for the most sensitive fields

Status: **proposal for the owner to decide on. Nothing in this document is implemented.**
Written 2026-11-26. Production numbers below are read-only row counts taken that day.

## 1. What this is for, and what it is not

PawPi stores pets' medical notes, owners' emergency contacts and, from the public tag page, messages and contact details left by
strangers who found a pet. Today those are plain text columns in Supabase Postgres, protected by row-level security (RLS), a
least-privilege `pawpi_app` role and TLS.

Field encryption would encrypt chosen columns **inside the web server, before the value reaches Postgres**, with a key that is
**never stored in the database**. It is the same idea already used for MercadoPago tokens
(`src/app/api/utils/payments/tokenCrypto.js`: AES-256-GCM, key in the `PAYMENTS_TOKEN_KEY` environment variable, values stored as
`enc:v1:<base64>`, plaintext rows passed through on read).

**It protects against:** someone who gets the database but not the web server's environment: a database dump or backup, a leaked
`DATABASE_URL`, a mistaken or overly broad SQL grant, someone with access to the Supabase dashboard or SQL editor, and any bug
that reads rows without going through the app's decrypt path (a read-only SQL flaw returns ciphertext).

**It does not protect against:** anyone who gets the web server's environment (the key sits next to `DATABASE_URL` on Railway);
a bug in the app's own routes that returns decrypted data to the wrong person (RLS and route checks still do that job); data that
already left the database (push notifications pass through Expo and Apple; photos and documents live in storage buckets and are
out of scope here); and **old backups**, which keep plaintext until they expire.

So it is defence in depth for the database layer, not a replacement for any existing control.

## 2. Which columns

Counts are rows in production on 2026-11-26 (total pets 34, users 92).

**Tier 1: recommended first.** The three groups named in the request.

| Group | Column | Rows now | Notes |
|---|---|---|---|
| Medical notes | `pet_medical_profiles.medical_notes` | 1 of 2 profiles | free text |
| Emergency contact | `pet_medical_profiles.emergency_contact_name`, `emergency_contact_phone` | 2 of 2 | personal data of a third person |
| Emergency contact | `pet_emergency_cards.contact_value` | 2 | the phone/email the public tag shows or relays to |
| Finder messages | `notifications.body` where `type = 'emergency_contact'` | 4 of 5 | the finder's name, phone, email and message (0146) |
| Finder messages | `notifications.finder_contact` (everything except `pet_name`) | 4 of 5 | same data as JSON |

**Tier 2: the rest of the medical free text,** in the same way once Tier 1 has run for a while: `vet_notes.note` (2 rows),
`pet_allergies.notes`/`reaction` (2), `pet_conditions.notes` (1), `pet_surgeries.notes` (1), `pet_lab_results.results`/`notes` (2),
`pet_medications.notes` (4), the `notes` column on the `health_*` logs and `health_general_checks.notes`/`areas` (6).

**Not proposed:** identifiers and structured values that SQL needs to compare or filter on (dates, ids, statuses, vaccine names),
public pet profile fields, and `insurance_policy_number` / `vet_phone` (lower sensitivity; can join Tier 2 if wanted).

## 3. Where the key would live

Recommended: **a new Railway variable `FIELD_ENCRYPTION_KEY`** (32 random bytes, `openssl rand -hex 32`), exactly like
`PAYMENTS_TOKEN_KEY`.

- Do **not** reuse `PAYMENTS_TOKEN_KEY`. A leak or rotation of one must not touch the other.
- Derive a sub-key per data class with HKDF (e.g. `medical`, `contact`, `finder`) so one class can be rotated or migrated alone.
- Bind each ciphertext to where it lives with AES-GCM "additional authenticated data": `table.column:pet_id`. A ciphertext copied to
  another row or column then fails to decrypt instead of showing up in the wrong place.
- Format: `enc:v2:<keyId>:<base64(iv|tag|ciphertext)>`. The v1 token format has no key id, which is what makes rotation hard; the
  new format carries one from day one. Plaintext and old formats keep passing through on read.
- Never store the key in the repository, in `.env` files that are committed, in a PR, or in a session. The owner generates it and
  keeps an offline copy (password manager). **Losing the key means losing the data in those columns**; there is no recovery.
  Add it to `docs/ops/secret-rotation-runbook.md` with the same "what breaks if rotated" line as the payments key.

Alternative: a managed key service (AWS KMS, Google Cloud KMS) with envelope encryption: each value is encrypted with a random data
key, and the data key is wrapped by a master key that never leaves the service. Benefits: an access log, and rotation without
re-encrypting everything. Costs: a new vendor and account, credentials for it are still a secret that has to live on Railway
(so the blast radius against a Railway compromise is the same), a network call per decrypt, and a new outage dependency on the
public tag page. For this size of data and team that is not worth it now; the key-id in the format keeps the door open.

## 4. What breaks, and what does not

I looked for anything that filters, searches, sorts or indexes these columns:

- **Searching and filtering.** No route uses `ILIKE`/`LIKE`/full-text search on any of the Tier 1 or Tier 2 columns, and none of
  them has an index (`idx_vet_notes_*` are on dates, ids and the appointment). So **nothing that exists today stops working.**
  What this rules out for the future: searching inside notes (in SQL or in the app list) on the server side. If search over notes is
  ever wanted, either the app decrypts and filters in memory for one pet's records (small sets), or the feature is built on a separate
  derived index (e.g. keyword hashes) with its own leakage trade-offs. Equality lookups on an encrypted field are not possible either
  (the random IV makes the same value encrypt differently each time); nothing relies on that.
- **SQL that reads or builds these values.** This is the main cost:
  - `app_emergency_card_json` (and the wrappers `app_emergency_card_by_tag` / `_by_link`) assemble the public tag and vet-card pages in
    SQL from `medical_notes`, `emergency_contact_*` and `contact_value`, and use `nullif(btrim(...), '')` / `coalesce(...)` to decide
    whether a field is present. Passing ciphertext through works (the function only selects and gates it), but the presence tests must
    keep seeing "empty" as null, so empty strings must never be encrypted (store `null`).
  - `app_shared_medical_profile` (0147, vet sharing by section) returns the same columns, gated by section. Same pass-through.
  - `app_emergency_finder_message` (0146) **composes** the message in SQL: it trims and truncates the finder's fields
    (`left(..., 500)` etc.), builds the readable `body`, and fans the notification out to the owner and every household member via
    `app_notify`. With encryption the trimming and composing move to the web route, which then hands the function ciphertext to
    store; the function keeps its rate limits, gating and fan-out. This is the largest code change (see section 6).
  - `app_purge_finder_details` (0146/0151) clears `body` and strips `finder_contact` down to `pet_name` after 90 days. That still works
    if the ciphertext is stored under a key inside the JSON (`{"pet_name": "Rex", "enc": "enc:v2:..."}`), because the purge already
    deletes every key except `pet_name`.
- **People reading data in SQL.** Support, debugging, ad-hoc checks and the repository's `verify_NNNN.sql` files can no longer read
  these columns. That is the point, but it is a workflow change: the verify files only check structure and counts today, and counts
  keep working.
- **Constraints and defaults.** Any CHECK, length limit or default on these columns would see ciphertext (longer than the plaintext by
  roughly 50 bytes plus a third). None exists on the Tier 1 columns (checked in the migrations; the only constraint on a Tier 2 column is `NOT NULL` on `vet_notes.note`, which ciphertext satisfies); the first PR should still re-check, since new migrations land.
- **Mobile apps already installed.** They talk only to the API, never to the database, so as long as the routes return plaintext
  after decrypting, no app build changes. `GET /api/notifications` already filters finder details by age; it would also decrypt.
- **Cost.** AES-GCM on short strings is microseconds. The public tag page decrypts a handful of fields per request.
- **Failure mode.** If the key is missing, reads of encrypted values must fail loudly (503-shaped, as `tokenCrypto` does), never
  fall back to returning the ciphertext as if it were text. Writes must refuse rather than store plaintext once the switch is on.

## 5. Migration plan for existing rows

The volume is tiny (a few dozen rows in total), so the risk is correctness, not time.

0. **Inventory PR (no behaviour change).** Check CHECK constraints and defaults on every column in scope; list every SQL function,
   route, test and seed script that reads or writes them (section 6 is the starting list); decide Tier 2.
1. **Read side first.** Ship `fieldCrypto.js` and make every read path decrypt-if-prefixed (plaintext passes through). Deploy. At
   this point nothing is encrypted yet and nothing changes.
2. **Set the key** in Railway and confirm a round trip in a test environment. Take the offline copy of the key *before* the next step.
3. **Write side behind a switch** (`FIELD_ENCRYPTION_ENABLED=1`): new and edited values are encrypted; empty values are stored as
   `null`. Change `app_emergency_finder_message` to accept pre-composed ciphertext (needs a migration: hand-applied, with a
   `verify_NNNN.sql`, following the usual rules; keep the old signature working for one deploy so either deploy order is safe,
   as 0146 did).
4. **Backfill** with a script (not SQL, because the key must not be in the database): for each in-scope row not already prefixed,
   encrypt and update, in small batches, idempotent (re-running skips prefixed values), logging counts only. It has to run as a role
   that can see every owner's rows (RLS is forced on these tables), so it is run by the owner against the production connection
   string, not from this kind of session. Verify by counting rows whose column does not start with `enc:` (must be 0, apart from nulls).
5. **Close the door.** A later migration adds `CHECK (col IS NULL OR col LIKE 'enc:%')` so a plaintext write by a future bug is refused
   by the database. Only after the switch has been on long enough that nothing legitimate writes plaintext.
6. **Backups.** Postgres backups and point-in-time recovery keep the old plaintext until their retention window ends. Encryption does
   not change that; if the owner wants the old values gone from backups, that is a Supabase retention decision, and the window should
   be written down.

Rollback: turn the switch off (new writes plaintext again; reads still decrypt), and run the backfill in reverse (decrypt and
store) if ever needed. Do not delete the key until nothing is prefixed.

## 6. Code paths that would change

Starting list (to be confirmed in step 0):

- New: `src/app/api/utils/fieldCrypto.js` (+ tests), generalising `tokenCrypto.js` (versioned format, key id, per-class sub-keys, AAD).
- Medical profile and emergency card: `api/pet-medical-profiles/route.js`, `api/emergency-card/route.js`.
- Public pages and the finder flow: `api/public/emergency/tag/[token]/route.js`, `.../contact/route.js`, `api/public/emergency/card/[token]/route.js`,
  `src/lib/publicPet/finder.js` (composition and trimming moves here), and the page code that renders them.
- Notifications: `api/notifications/route.js` (decrypt on read), the push-sending code that builds finder text, and
  `app_emergency_finder_message` / `app_notify` call sites.
- Vet record (Tier 2): `api/vet-record/{notes,allergies,conditions,surgeries,lab-results}/route.js`, `summary` and `full-summary`,
  `api/health/medications/route.js`, `api/pet-vaccinations/route.js` (if its notes are in scope), and the provider reads
  `api/providers/[id]/pets/[petId]/{record,notes,groom-sessions}/route.js` plus `utils/careAccess.js`.
- Database (hand-applied migrations): `app_emergency_finder_message`; optionally the final CHECK constraints. `app_emergency_card_json`
  and `app_shared_medical_profile` need no change if empty values are stored as null.
- Tests and seeds that assert plaintext in the database: the emergency/finder integration tests, vet-record tests, and
  `scripts/demo-seed/index.mjs`.
- Docs: `docs/ops/secret-rotation-runbook.md` (new key), `docs/emergency-finder.md` (retention and storage), the privacy wording if it
  describes how this data is stored.

## 7. Decisions for the owner

1. Is protection against a database-only compromise worth a new secret that, if lost, makes these fields unrecoverable?
2. Tier 1 only first (recommended), or Tier 1 and 2 together?
3. Railway variable (recommended) or a managed key service?
4. Who keeps the offline copy of the key, and where is it written down?
5. Is losing in-SQL visibility of these columns acceptable for support and debugging?
6. How long should old plaintext be allowed to remain in backups?

Suggested order if approved: step 0 (inventory) and the read-side PR, then the key, then Tier 1 writes with the finder function
change, then backfill and the CHECK constraints, then Tier 2. Each is a normal PR; the finder-function migration and the CHECK
constraints are the two that are hand-applied.
