#!/usr/bin/env bash
# claude-autofix FINAL STEP (always runs): comment the outcome (merged / left for human / reverted) on the PR or issue.
# If the run died before any PR/issue existed, open a needs-human issue so the failure is never silent.
#
# env: GH_TOKEN, GITHUB_REPOSITORY, GITHUB_RUN_ID, GITHUB_SERVER_URL, GITHUB_STEP_SUMMARY, ALERT_NAME, JOB_STATUS
#      plus the state deliver.sh wrote to $GITHUB_ENV: OUTCOME, DETAIL, TARGET_KIND, TARGET_NUMBER, PR_NUMBER, MERGE_SHA,
#      VERIFY_DETAIL, REVERT_DETAIL, REVERT_PR_NUMBER, REVERT_ISSUE_NUMBER
set -euo pipefail

REPO="${GITHUB_REPOSITORY:?}"
RUN_URL="${GITHUB_SERVER_URL:-https://github.com}/$REPO/actions/runs/${GITHUB_RUN_ID:?}"
ALERT="${ALERT_NAME:-alert}"
SUMMARY="${GITHUB_STEP_SUMMARY:-/dev/null}"
OUTCOME="${OUTCOME:-}"
DETAIL="${DETAIL:-}"
TARGET="${TARGET_NUMBER:-}"

# the job ended without a verdict (crash, cancel, timeout): say so, and never leave a possibly-live merge unmentioned
case "$OUTCOME" in
  "") OUTCOME=left_for_human; DETAIL="the workflow stopped before reaching a verdict (job status: ${JOB_STATUS:-unknown}); see the run log" ;;
  merged_unverified) DETAIL="the PR was merged but the run ended before production verification finished (job status: ${JOB_STATUS:-unknown}): CHECK PRODUCTION BY HAND" ;;
esac

comment() { # number text
  printf '%s\n' "$2" > /tmp/autofix-outcome.md
  gh api -X POST "repos/$REPO/issues/$1/comments" -F "body=@/tmp/autofix-outcome.md" >/dev/null
}

case "$OUTCOME" in
  merged)
    TEXT="✅ **Autofix outcome: merged.** Squash-merged \`${MERGE_SHA:0:7}\` after the safety gate and the three required checks passed. Production verified: ${VERIFY_DETAIL:-ok}. Run: $RUN_URL" ;;
  reverted)
    TEXT="↩️ **Autofix outcome: reverted.** The merge of \`${MERGE_SHA:0:7}\` failed production verification (${VERIFY_DETAIL:-unknown}). Revert: ${REVERT_DETAIL:-see run log}. Incident issue: #${REVERT_ISSUE_NUMBER:-?}. Run: $RUN_URL" ;;
  merged_unverified)
    TEXT="⚠️ **Autofix outcome: merged, NOT verified.** ${DETAIL} Merge commit \`${MERGE_SHA:0:7}\`. Run: $RUN_URL" ;;
  *)
    TEXT="🙋 **Autofix outcome: left for a human.** ${DETAIL} The \`needs-human\` label is set. Run: $RUN_URL" ;;
esac

echo "$TEXT" | tee -a "$SUMMARY"

if [ -n "$TARGET" ]; then
  comment "$TARGET" "$TEXT"
  if [ "$OUTCOME" = "reverted" ] && [ -n "${REVERT_ISSUE_NUMBER:-}" ]; then comment "$REVERT_ISSUE_NUMBER" "$TEXT"; fi
  if [ "$OUTCOME" != "merged" ] && [ "${TARGET_KIND:-}" = "pr" ]; then
    gh api -X POST "repos/$REPO/issues/$TARGET/labels" -f "labels[]=needs-human" >/dev/null 2>&1 || true
  fi
else
  printf '%s\n' "$TEXT" "" "No PR or issue had been created when the run ended." > /tmp/autofix-outcome-issue.md
  gh api -X POST "repos/$REPO/issues" -f title="⚠️ Autofix workflow error: ${ALERT}" -F "body=@/tmp/autofix-outcome-issue.md" -f "labels[]=autofix" -f "labels[]=needs-human" --jq '.html_url' | tee -a "$SUMMARY"
fi
