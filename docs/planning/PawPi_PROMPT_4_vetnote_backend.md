# PawPi — PROMPT 4: Vet-Note Integrity Backend (append-only + author + archive/hide)

Paste into a fresh Claude Code conversation on its own branch. This finishes Flow A: the
backend half the audit deliberately held for sign-off. The founder has decided the
policy — implement it.

---

```
ROLE
Finish PawPi's vet-note integrity model. The audit already shipped the frontend safe
fixes (a vet note never renders as "You"; a bell awareness signal). This task implements
the backend half that was held for approval. The policy is DECIDED — implement it.

FOUNDER'S DECISION (this is the spec)
- Vet notes are part of the pet's medical history. The pet OWNER must NOT be able to
  DELETE a note a vet wrote. Notes must always show WHO wrote them (attribution is
  permanent).
- The owner CAN archive / hide a note (e.g. a finished med follow-up) so it no longer
  clutters the active list — but it is hidden/archived, never destroyed, and can be
  un-hidden. Archiving preserves history.

BRANCH & SAFETY
- Base on the latest `main` (git fetch first — audit fixes are now on main). Branch
  `feat/vet-note-integrity` (worktree if the folder is shared).
- This touches the web API + likely a DB migration. Additive only — never drop columns
  or destroy data. Commit in small steps. Do NOT merge to main or deploy.

IMPLEMENT
1. Structured attribution (no more relying on free-text vet_name):
   - Add an additive author reference to vet_notes (e.g. `author_provider_id` /
     `author_user_id` as appropriate to how vets authenticate on the web dashboard),
     nullable, backfilled where derivable. Keep the existing `vet_name` for display
     fallback. A migration that only ADDS columns.
   - Ensure the vet/provider write path stamps the author; the owner write path marks
     the note as owner-authored. Reads resolve display name from author → vet_name →
     "Veterinario", never "You" for a vet-authored note.
2. Append-only enforcement (owner cannot delete a vet note):
   - Guard the delete route so an owner DELETE is REJECTED when the note is
     vet-authored (author is a provider / vet_name present). Owner-authored notes remain
     owner-deletable. Return a clear error the UI can show.
   - Add/adjust an RLS policy if the project uses RLS, so enforcement holds at the DB
     level, not just the route.
3. Archive / hide (owner-controlled, non-destructive):
   - Add an additive `archived_at` (or `hidden_at`) column to vet_notes. Owner can
     archive AND un-archive ANY note visible to them (including vet notes) — archiving
     is not deletion.
   - Default note reads return active (non-archived) notes; add a way to view archived
     notes (a filter/toggle). Wire the mobile Vet Record UI: replace/augment the current
     owner "trash" affordance on vet-authored notes with "Archive" (and an Archived
     view + un-archive). Keep delete only for owner-authored notes.
   - All new user-facing strings go through the existing i18n system (t(); keys in
     src/i18n/locales/en.json + es.json; neutral LatAm Spanish "tú").

RULES
- Do NOT ask questions — pick the best implementation, note decisions in the report.
- No fake/mock data; real empty/archived states only.
- Additive migrations ONLY; never lose a note. Preserve past history.

VERIFY
- Web: `bun run test` + `bun run typecheck` + `bun run build` (report new vs pre-existing
  baseline errors). Mobile: `npm test`. Add tests for: attribution never resolves to
  "You" for a vet note; owner DELETE of a vet note is rejected; owner-authored delete
  still works; archive hides from the default list and un-archive restores; migration is
  additive.
- Re-trace the "vet adds a note to Mango" flow end to end: correct author shown, owner
  cannot delete it, owner can archive/un-archive it.

DELIVERABLE
- The migration, API guards, and mobile UI changes on feat/vet-note-integrity, tests
  green, plus a short report of what changed, the migration, and any decision you made.
  Do NOT merge or deploy.
```
