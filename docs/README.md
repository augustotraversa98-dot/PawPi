# PawPi — Documentation

## Observability & self-healing (LIVE)
Start here: **[observability/OPERATIONS.md](observability/OPERATIONS.md)** — the operations runbook.

- [observability/GRAFANA_SETUP.md](observability/GRAFANA_SETUP.md) — alert rules + Grafana contact point
- [observability/dashboard.json](observability/dashboard.json) — Grafana dashboard (import into Grafana)
- [observability/PawPi_Observability_and_SelfHealing_Loop.md](observability/PawPi_Observability_and_SelfHealing_Loop.md) — full build/design plan
- [observability/claude-autofix.yml](observability/claude-autofix.yml) — reference copy of the autofix workflow (the live copy is .github/workflows/claude-autofix.yml)
- [observability/metrics.js](observability/metrics.js) — business-metrics helper (source of truth is anything/apps/web/src/lib/metrics.js)

## Planning / prompt history
- [planning/](planning/) — PawPi_PROMPT_*.md, PawPi_HANDOFF_next_tasks.md, PawPi_i18n_night_run_prompt.md
