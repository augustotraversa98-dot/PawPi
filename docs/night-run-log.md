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
- **2026-07-29 04:15** — N3 (adoption screen restyled to Liquid Glass) merged — [#269](https://github.com/augustotraversa98-dot/PawPi/pull/269). Structural parity confirmed (testID/useState/onPress/etc. counts unchanged).
- **2026-07-29 04:44** — N4 (medical profile sex/gender selector fix) merged — [#267](https://github.com/augustotraversa98-dot/PawPi/pull/267). Note: this PR's conflicts were resolved and pushed earlier but the actual merge call was missed until caught during N8 — see that entry below. Also found (not fixed, flagged): the Save button on this same screen is a pre-existing no-op from the 2.77 restyle (prop-name mismatch) — spawned as a separate follow-up task.
- **2026-07-29 05:11** — N8 (iOS Simulator self-verify pass) merged — [#272](https://github.com/augustotraversa98-dot/PawPi/pull/272). Confirmed the app boots + round-trips real backend data; fixed a stale dev-env LAN IP along the way. Caught and fixed the missed N4 merge above. Simulator tap-injection was unreliable for a stretch, so most of the historical `2.x` device-test backlog was left untouched rather than false-positived — documented honestly in `docs/test-backlog.md`.
- **2026-07-29 ~05:15** — N10 (widget PR #187 rebase) — **not merged, by design.** Rebased the ~40-day-stale branch cleanly onto `main` (2 conflicts resolved, zero reverted work, mobile jest 156/156 green). Confirmed `expo prebuild` generates both the app and widget Xcode targets. Left **open as an updated draft** — this PR is explicitly gated on Tats' Apple Developer account setup + on-device acceptance pass (see `docs/native-widgets.md`); tonight's job was just to un-stick it from staleness, not to merge it.

---

# Night-run log — 2026-08-11 (Wave 10, tickets 2.88–2.92)

Preamble: `docs/night-run-2026-08-11.md`. Continues the Shop/Store + business-social work. One line per merge.

- **2026-08-11 (2.88)** — provider-post open route fix merged — [#339](https://github.com/augustotraversa98-dot/PawPi/pull/339). Root cause: the storefront post card passed the whole post (signed image URLs with `?`/`&`/`%`) as a `router.push` param, corrupting the deep-link URL so expo-router fell back to the `/service` root ("screen doesn't exist"). Fix: navigate with only `providerId`+`postId`; hand the rich post off in memory (`utils/providerPostHandoff.js`). Mobile jest 1562→1565 (+3 regression tests). No migration.
- **2026-08-11 (2.89)** — grouped offering picker merged — [#340](https://github.com/augustotraversa98-dot/PawPi/pull/340). The dashboard nav was already capability-driven + grouped (#327/#328); the remaining flat list was the Business-Profile offering picker (and onboarding form). Added shared `provider/lib/capabilityGroups.js` (presentation-only taxonomy over the EXISTING keys — Veterinary & Health / Walking & Sitting / Training / Store / Adoption / Other); both pickers now render grouped sections. No capability key created/renamed/removed (`capabilities.js` untouched). web vitest 1764→1770. No migration.
- **2026-08-11 (2.90)** — Products enable clarity merged — [#341](https://github.com/augustotraversa98-dot/PawPi/pull/341). A store-less business hit the API's jargon 403 ("Provider does not have the 'shop' capability") on the Products page. Replaced with a friendly explainer + one "Enable Products" button that flips the SAME `shop` offering the profile controls (`useAddCapability`, reused) and lands on add-a-product; enabled-empty shows the inviting add-first state. Header Shop→Products. No user-facing jargon (grep-checked). web vitest 1770→1773. No migration.
