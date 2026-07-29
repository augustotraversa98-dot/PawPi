# Night-run log — 2026-07-29

Fast, timestamped, one-line-per-merge scan for Augusto. Full detail lives in each PR and in
`docs/roadmap.md` / `PawPi_instructions.md`'s status block (updated in step). Ticket briefs:
`docs/phase2-tickets/N1-N10`; run preamble: `docs/night-run-2026-07-29.md`.

- **2026-07-29 00:19** — Prereq: password reset flow (migration 0069) merged — [#261](https://github.com/augustotraversa98-dot/PawPi/pull/261) (predates tonight's queue, landed first to bring `main` current).
- **2026-07-29 00:19** — Prereq: support-contact domain fix (augusto@pawpi.info) merged — [#262](https://github.com/augustotraversa98-dot/PawPi/pull/262).
- **2026-07-29 00:20** — Prereq: demo accounts renamed to pawpi.info — [#263](https://github.com/augustotraversa98-dot/PawPi/pull/263).
- **2026-07-29 03:53** — N2 (retire PATCH /api/pets repair handler) merged — [#266](https://github.com/augustotraversa98-dot/PawPi/pull/266). Docs-only: the actual code removal had already landed via an earlier PR #225; this closed the paper trail (FLAGGED item → FIXED).
- **2026-07-29 03:53** — N9 (docs hygiene sweep) merged — [#264](https://github.com/augustotraversa98-dot/PawPi/pull/264). Only 1 of 3 items needed a change (guideline-1.2-audit.md superseded banner); the other two were already resolved by #263.
- **2026-07-29 03:58** — N5 (payments go-live hardening + setup checklist) merged — [#268](https://github.com/augustotraversa98-dot/PawPi/pull/268).
- **2026-07-29 04:07** — N1 (address autofill on shared location picker) merged — [#270](https://github.com/augustotraversa98-dot/PawPi/pull/270). Needs a device pass (jest mocks expo-location) — see `docs/test-backlog.md`.
- **2026-07-29 04:08** — N7 (support page live + pawpi.info DNS gap documented) merged — [#265](https://github.com/augustotraversa98-dot/PawPi/pull/265). Support URL is live at the github.io URL; pawpi.info itself still needs Tats' one.com DNS action — see FLAGGED #5 in `docs/app-store-readiness.md`.
- **2026-07-29 04:08** — N6 (Apple Sign-in client-secret JWT automation) merged — [#271](https://github.com/augustotraversa98-dot/PawPi/pull/271).
