# PawPi observability night run — how to use

Goal: Grafana becomes the main instrument of the app: every request, screen, flow and interaction
is measured, anonymously; dashboards per area; alerts routed to one person; fixes via the autofix PR loop.

## Files (read in this order)
1. 00-PREFLIGHT.md          — run FIRST, in the SAME environment as the night run. Must say READY = YES.
2. 01-TELEMETRY-CONTRACT.md — metric/event names. Shared by all steps. (03-UNATTENDED-DEFAULTS.md = decisions pre-made for the night run.)
3. 02-RUNBOOK-NIGHT-RUN.md  — paste/run this for the night run (it executes steps A..E in order).
4. step-A..E *.md          — the individual prompts (each is also a valid standalone fresh-chat prompt).

## Human steps (cannot be automated)
- Before leaving: preflight READY = YES.
- Merge PRs in the morning in the order A, B, C, D, E (Squash and merge; confirm per PR).
- Ship client telemetry: it needs app build 25 + App Store Connect "App Privacy" update + privacy policy update.
- Un-pause alert rules after real data flows (rules are created paused).
