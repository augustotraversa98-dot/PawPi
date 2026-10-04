#!/usr/bin/env bash
# claude-autofix pre-flight (job `preflight`): alert context, KILL SWITCH, DEDUPE, labels.
# Writes job outputs to $GITHUB_OUTPUT and a human-readable note to the run summary. Runs no model-written code.
#
# env: GH_TOKEN (github.token), GITHUB_REPOSITORY, GITHUB_OUTPUT, GITHUB_STEP_SUMMARY,
#      AUTOFIX_ENABLED (repo variable; the string "false" turns the whole loop off),
#      PAYLOAD / IN_NAME / IN_SUMMARY / IN_ALLOW (event inputs; see gate.mjs `context`)
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GATE="$HERE/gate.mjs"
REPO="${GITHUB_REPOSITORY:?}"
OUT="${GITHUB_OUTPUT:?}"
SUMMARY="${GITHUB_STEP_SUMMARY:-/dev/null}"

CTX="$(node "$GATE" context)"
ALERT="$(jq -r '.alertname' <<<"$CTX")"
SOURCE="$(jq -r '.source // "relay"' <<<"$CTX")"

# manual (workflow_dispatch) runs never auto-merge unless allow_merge=true; relay dispatches may.
ALLOW_MERGE=true
if [ "$SOURCE" = "manual" ] && [ "${IN_ALLOW:-false}" != "true" ]; then ALLOW_MERGE=false; fi

emit() { printf '%s=%s\n' "$1" "$2" >> "$OUT"; }
emit alert_name "$ALERT"
emit source "$SOURCE"
emit allow_merge "$ALLOW_MERGE"

# 1. kill switch: decided before anything touches GitHub
RES="$(jq -n --arg a "$ALERT" '{alertname:$a, openPrs:[]}' | node "$GATE" preflight --kill "${AUTOFIX_ENABLED:-}")"
if [ "$(jq -r .killed <<<"$RES")" = "true" ]; then
  echo "Autofix is switched OFF (repository variable AUTOFIX_ENABLED=false). Alert '$ALERT' was not investigated; nothing was changed." | tee -a "$SUMMARY"
  emit run false; emit killed true; emit duplicate ""; emit issue_only false
  exit 0
fi

# 2. dedupe: an OPEN autofix PR for the same alertname means the fix is already in flight
OPEN_PRS="$(gh api "repos/$REPO/pulls?state=open&per_page=100")"
RES="$(jq -n --arg a "$ALERT" --argjson p "$OPEN_PRS" '{alertname:$a, openPrs:$p}' | node "$GATE" preflight --kill "${AUTOFIX_ENABLED:-}")"
DUP="$(jq -r '.duplicate // ""' <<<"$RES")"
ISSUE_ONLY="$(jq -r .issueOnly <<<"$RES")"
emit killed false; emit duplicate "$DUP"; emit issue_only "$ISSUE_ONLY"
if [ -n "$DUP" ]; then
  echo "Dedupe: open autofix PR #$DUP already exists for alert '$ALERT'. Doing nothing." | tee -a "$SUMMARY"
  emit run false
  exit 0
fi

# 3. labels (idempotent; an existing label makes `create` fail, which is fine)
ensure_label() { gh api -X POST "repos/$REPO/labels" -f name="$1" -f color="$2" -f description="$3" >/dev/null 2>&1 || true; }
ensure_label autofix c2e0c6 "Opened or handled by the Grafana-alert autofix loop"
ensure_label needs-human fbca04 "Autofix stopped: a person must review"
ensure_label autofix-revert d93f0b "Automatic revert of an autofix that failed production verification"

emit run true
{
  echo "Autofix proceeding for alert '$ALERT' (source: $SOURCE, issue-only: $ISSUE_ONLY, auto-merge allowed: $ALLOW_MERGE)."
} | tee -a "$SUMMARY"
