# Unattended mode — decisions already made (the owner is asleep; NEVER ask, NEVER wait)

If a question comes up, pick the option below (or, if not listed, the safest reversible option), write the
decision + one-line reason to PROGRESS.md under "Decisions made", and continue.

| Question | Decision |
|---|---|
| Client telemetry default | ON, anonymous, with Settings opt-out toggle (EN+ES) |
| Identifiers | random install_id + session_id only; never account/pet/email/IP |
| Behaviour detail storage | Loki log lines; metrics only for bounded labels |
| Alert rules | create PAUSED; never unpaused by the run |
| P1 channels | email + webhook to autofix; document the Grafana mobile-app push step for the owner |
| Existing dashboards/alerts/contact points | never modify or delete; only uid prefix `pawpi-` |
| Existing 3 alert rules | keep; re-point only if the new metric is strictly equivalent |
| Synthetic scripted sign-up journey | skip unless a clearly-labelled test account is safe; document why |
| New metric/event needed | add to 01-TELEMETRY-CONTRACT.md in the same PR |
| Merge | Owner-authorised for this run: squash-merge each of the five PRs ONLY when CI is green, then verify production (see runbook); never merge red/pending |
| Test/CI fails 3 times | stop that step, leave PR as DRAFT with the failure explained, continue to next independent step |
| Product bug found | write to PROGRESS.md "Found bugs" with evidence; do not fix in an observability PR |
| Free-tier cardinality doubt | drop the label, keep it in logs |
| Missing credential / blocked network | do ALL work that needs no access (code, tests, JSON, docs, PRs); skip only the live "apply" actions; list exactly what to fix in PROGRESS.md |

## Never, even unattended
Merge any PR outside this run's five (or its own revert); merge red/pending CI; skip or weaken tests/checks to get green; submit to App Store; run eas build/submit; change app version/build number or eas.json; print or commit secrets;
delete anything in Grafana/Railway/GitHub/Supabase; run database migrations; create real user accounts in production;
send email/messages to anyone.
