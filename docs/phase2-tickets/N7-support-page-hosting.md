# N7 — Get the Support URL live (pawpi.info/support)

**Status:** ✅ RESOLVED (2026-07-31) · docs/hosting only, no app code · independent · safe-parallel: yes

## Resolution
The support page is genuinely live and returns HTTP 200 at
`https://augustotraversa98-dot.github.io/pawpi-legal/support` (same `pawpi-legal` repo + GitHub Pages
mechanism as Privacy/Terms). `pawpi.info` itself remains unhosted (parked at one.com), so rather than
wait on DNS, `docs/app-store-connect-content.md` §6's Support URL field was updated to point at the
github.io URL directly — mirroring the already-accepted Privacy Policy precedent. See
`docs/app-store-readiness.md` FLAGGED #5 for the full note.

## Context
`docs/app-store-connect-content.md` §6 requires a live Support URL for submission —
`https://pawpi.info/support` — flagged "⚠️ page must be LIVE before submission." Content already exists
at `docs/legal/support.md` and `docs/legal/support.html` in this repo. The Privacy Policy and Terms of
Service were already solved the same way (ticket work behind PR #251): hosted from a separate public repo
(`augustotraversa98-dot/pawpi-legal`) via GitHub Pages, with the live URLs
`https://augustotraversa98-dot.github.io/pawpi-legal/{privacy,terms}`.

Note the domain mismatch worth resolving: the legal docs currently live at a `github.io` URL, but the ASC
pack now expects `pawpi.info` (the demo accounts were also just renamed onto `pawpi.info` — email
`docs/roadmap.md` / recent PRs #261–#263 for that context). Whether `pawpi.info` itself is DNS-configured
to point anywhere yet is unknown — check before assuming.

## Current issue
The support page isn't live at the URL the App Store submission pack requires.

## Expected behavior
1. Check the actual mechanism used to publish `pawpi-legal` (how PR #251 did it) and replicate it for the
   support page — push `docs/legal/support.html` (or a converted version of `support.md`) into that repo
   the same way privacy/terms were published.
2. If `pawpi.info` has real DNS pointing somewhere already (check, don't assume), figure out whether the
   support page should live there instead of/alongside the `github.io` URL, and note what you find either
   way.
3. **If Code does not have push access to the separate `pawpi-legal` repo or to whatever controls
   `pawpi.info` DNS, do not force it or guess at credentials.** Instead: finalize the support page content
   in this repo (`docs/legal/support.md`/`.html`, fill in the real support email `augusto@pawpi.info` per
   the ASC pack), and write up in the PR body exactly what remains — the specific push/deploy step Tats
   needs to run by hand — so it's a 2-minute task, not a research task, when they pick it up.

## Data / API rules
None — this is a content/hosting task, no application code, no migration.

## Acceptance criteria
- Either the Support URL is genuinely live and returns 200, OR the content is finalized in this repo and
  the exact remaining manual step is documented precisely.
- Update `docs/app-store-connect-content.md`'s §6 note only if this file has no outstanding Tats edits
  elsewhere that would be clobbered — if in doubt, describe the needed URL-field update in the PR body
  instead of editing that file directly (see the night-run preamble's WIP-file rule).
- Update `docs/roadmap.md` + `PawPi_instructions.md` status block on merge.
