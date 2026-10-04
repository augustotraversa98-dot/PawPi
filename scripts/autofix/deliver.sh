#!/usr/bin/env bash
# claude-autofix DELIVERY (job `deliver`): turn the investigation result into an issue or a PR, run the merge gate, squash-merge
# with the head sha pinned, verify production, and revert on failure. Runs from a TRUSTED copy of scripts/autofix made before
# any model-written code existed, in a job that never executes the model's output (it only `git apply`s a patch that the
# file gate then re-checks from GitHub's own PR file list).
#
# env (set by the workflow):
#   GH_TOKEN                      github.token (issues, comments, labels, read)
#   AUTOFIX_PAT                   fine-grained PAT: push + create PR + merge (a PR from GITHUB_TOKEN would not trigger CI)
#   GITHUB_REPOSITORY, GITHUB_RUN_ID, GITHUB_SERVER_URL, GITHUB_ENV, GITHUB_STEP_SUMMARY
#   ALERT_NAME, ISSUE_ONLY, ALLOW_MERGE   from the preflight job
#   RESULT_DIR                    downloaded artifact: incident.md, changes.patch
#   PROD_URL                      default https://www.pawpi.info
#   GRAFANA_URL, GRAFANA_ANNOTATION_TOKEN   optional: annotation on revert
# test overrides: AUTOFIX_GIT_REMOTE, AUTOFIX_POLL_SECONDS, AUTOFIX_VERIFY_POLL_SECONDS, CHECKS_TIMEOUT_MINUTES, DEPLOY_TIMEOUT_MINUTES
#
# State for the final comment step (outcome.sh) goes to $GITHUB_ENV: OUTCOME, DETAIL, TARGET_KIND, TARGET_NUMBER, PR_NUMBER,
# MERGE_SHA, VERIFY_DETAIL, REVERT_PR_NUMBER, REVERT_ISSUE_NUMBER. Values are single-line and never contain raw git/curl output.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GATE="$HERE/gate.mjs"
REPO="${GITHUB_REPOSITORY:?}"
RUN_ID="${GITHUB_RUN_ID:?}"
RUN_URL="${GITHUB_SERVER_URL:-https://github.com}/$REPO/actions/runs/$RUN_ID"
ALERT="${ALERT_NAME:?}"
RESULT_DIR="${RESULT_DIR:-/tmp/result}"
INCIDENT="$RESULT_DIR/incident.md"
PATCH="$RESULT_DIR/changes.patch"
PROD_URL="${PROD_URL:-https://www.pawpi.info}"
POLL="${AUTOFIX_POLL_SECONDS:-30}"
VERIFY_POLL="${AUTOFIX_VERIFY_POLL_SECONDS:-20}"
CHECKS_TIMEOUT="${CHECKS_TIMEOUT_MINUTES:-25}"
DEPLOY_TIMEOUT="${DEPLOY_TIMEOUT_MINUTES:-15}"
SUMMARY="${GITHUB_STEP_SUMMARY:-/dev/null}"
BRANCH="autofix/${ALERT}-${RUN_ID}"
PR_NUMBER=""

note() { echo "$*" | tee -a "$SUMMARY"; }
oneline() { printf '%s' "$*" | tr '\r\n' '  ' | cut -c1-500; }
set_state() { printf '%s=%s\n' "$1" "$(oneline "$2")" >> "${GITHUB_ENV:-/dev/null}"; export "$1=$(oneline "$2")"; }
# the PAT is used ONLY for what must trigger CI or touch main: push, create the PR, merge. Everything else uses GITHUB_TOKEN.
gh_pat() { GH_TOKEN="$AUTOFIX_PAT" gh "$@"; }
add_label() { gh api -X POST "repos/$REPO/issues/$1/labels" -f "labels[]=$2" >/dev/null 2>&1 || true; }

mkdir -p "$RESULT_DIR"
[ -s "$INCIDENT" ] || echo "The investigation produced no report (the investigate job failed or was skipped). See the run log." > "$INCIDENT"

# body file = incident report + run link, capped (GitHub limit is 65536 chars)
make_body() {
  local out="$1"; shift
  { [ "$#" -gt 0 ] && printf '%s\n\n' "$*"; head -c 50000 "$INCIDENT"; printf '\n\n---\n_Autofix run: %s_\n' "$RUN_URL"; } > "$out"
}

# ---- issue helpers -----------------------------------------------------------------------------------------------------
create_issue() { # title bodyfile -> prints issue number
  gh api -X POST "repos/$REPO/issues" -f title="$1" -F "body=@$2" -f "labels[]=autofix" -f "labels[]=needs-human" --jq .number
}
# diagnosis-only issue; a re-fire of the same alert comments on the open issue instead of opening another
report_issue() { # title bodyfile
  local existing num
  existing="$(gh api "repos/$REPO/issues?state=open&labels=autofix&per_page=100" | jq -r --arg t "$1" '[.[] | select(.pull_request == null and .title == $t)][0].number // empty')"
  if [ -n "$existing" ]; then
    gh api -X POST "repos/$REPO/issues/$existing/comments" -F "body=@$2" >/dev/null
    num="$existing"
  else
    num="$(create_issue "$1" "$2")"
  fi
  set_state TARGET_KIND issue; set_state TARGET_NUMBER "$num"
}
left_for_human() { # reason
  note "Left for a human: $1"
  set_state OUTCOME left_for_human; set_state DETAIL "$1"
  [ -n "$PR_NUMBER" ] && add_label "$PR_NUMBER" needs-human
  return 0
}

# ---- 1. nothing to merge: issue only -----------------------------------------------------------------------------------
HAS_CHANGES=false
[ -s "$PATCH" ] && HAS_CHANGES=true
if [ "${ISSUE_ONLY:-false}" = "true" ]; then
  [ "$HAS_CHANGES" = true ] && note "Issue-only alert ($ALERT): the proposed code change is discarded."
  HAS_CHANGES=false
fi

if [ "$HAS_CHANGES" = false ]; then
  make_body /tmp/autofix-body.md
  report_issue "🔎 Grafana alert (no auto-fix): ${ALERT}" /tmp/autofix-body.md
  if [ "${ISSUE_ONLY:-false}" = "true" ]; then left_for_human "issue only: the app itself may be down, so this alert never gets an automatic code change"
  else left_for_human "diagnosis only: no code change was proposed"; fi
  exit 0
fi

# ---- 2. a patch exists: needs AUTOFIX_PAT --------------------------------------------------------------------------------
if [ -z "${AUTOFIX_PAT:-}" ]; then
  { printf '%s\n\n' "**The repository secret \`AUTOFIX_PAT\` is not set**, so the loop cannot open a pull request (a PR created with the default \`GITHUB_TOKEN\` does not trigger CI, so it could never be verified or merged). Nothing was pushed. Add the secret (fine-grained PAT: Contents + Pull requests + Issues read/write, Metadata read) and re-run, or apply the proposed patch by hand."
    printf '%s\n\n' '<details><summary>Proposed patch (not applied)</summary>'
    printf '%s\n' '````diff'; head -c 30000 "$PATCH"; printf '\n%s\n' '````'; printf '%s\n\n' '</details>'
    head -c 15000 "$INCIDENT"; printf '\n\n---\n_Autofix run: %s_\n' "$RUN_URL"; } > /tmp/autofix-body.md
  NUM="$(create_issue "⚠️ Autofix needs a human: AUTOFIX_PAT secret missing (${ALERT})" /tmp/autofix-body.md)"
  set_state TARGET_KIND issue; set_state TARGET_NUMBER "$NUM"
  left_for_human "the AUTOFIX_PAT secret is missing, so no PR could be opened (patch attached to the issue)"
  exit 0
fi

SERVER_HOST="${GITHUB_SERVER_URL:-https://github.com}"; SERVER_HOST="${SERVER_HOST#https://}"
GIT_REMOTE="${AUTOFIX_GIT_REMOTE:-https://x-access-token:${AUTOFIX_PAT}@${SERVER_HOST}/${REPO}.git}"
git config user.name "pawpi-autofix[bot]"
git config user.email "autofix@pawpi.app"

# ---- 3. apply the patch, push, open the PR ----------------------------------------------------------------------------
failed_to_open_pr() { # reason ; falls back to an issue so the failure is never silent
  { printf '%s\n\n' "**Autofix could not open a pull request:** $1. Proposed patch:"; printf '%s\n' '````diff'; head -c 30000 "$PATCH"; printf '\n%s\n\n' '````'
    head -c 15000 "$INCIDENT"; printf '\n\n---\n_Autofix run: %s_\n' "$RUN_URL"; } > /tmp/autofix-body.md
  NUM="$(create_issue "⚠️ Autofix needs a human: could not open PR (${ALERT})" /tmp/autofix-body.md)"
  set_state TARGET_KIND issue; set_state TARGET_NUMBER "$NUM"
  left_for_human "could not open a PR: $1"
}

if ! git apply --index --whitespace=nowarn "$PATCH" 2>/dev/null; then failed_to_open_pr "the proposed patch does not apply to the current default branch"; exit 0; fi
git checkout -q -b "$BRANCH"
git commit -q -m "autofix: investigate ${ALERT}" -m "Automated change proposed by claude-autofix. Run: ${RUN_URL}"
if ! git push -q "$GIT_REMOTE" "HEAD:refs/heads/$BRANCH" >/dev/null 2>&1; then failed_to_open_pr "git push was rejected (see the run log; the PAT may lack write access or the workflow scope)"; exit 0; fi

make_body /tmp/autofix-pr-body.md "_Opened by the claude-autofix loop. It is auto-merged only when every gate in docs/observability/OPERATIONS.md (Automatic fix loop) holds; otherwise it carries \`needs-human\`._"
PR_JSON="$(gh_pat api -X POST "repos/$REPO/pulls" -f title="🤖 Autofix proposal: ${ALERT}" -f head="$BRANCH" -f base=main -F "body=@/tmp/autofix-pr-body.md" 2>/dev/null)" || PR_JSON=""
PR_NUMBER="$(jq -r '.number // empty' <<<"${PR_JSON:-null}" 2>/dev/null || true)"
if [ -z "$PR_NUMBER" ]; then failed_to_open_pr "the pull request could not be created (the branch $BRANCH was pushed)"; exit 0; fi
add_label "$PR_NUMBER" autofix
set_state PR_NUMBER "$PR_NUMBER"; set_state TARGET_KIND pr; set_state TARGET_NUMBER "$PR_NUMBER"
note "Opened PR #$PR_NUMBER ($BRANCH)."

# ---- 4. the merge gate ------------------------------------------------------------------------------------------------
wait_for_checks() { # sha -> 0 success | 1 failed | 2 timeout ; sets CHECKS_DETAIL
  local sha="$1" deadline res state runs
  deadline=$((SECONDS + CHECKS_TIMEOUT * 60))
  while :; do
    runs="$(gh api "repos/$REPO/commits/$sha/check-runs?per_page=100" --jq .check_runs 2>/dev/null)" || runs='[]'
    res="$(node "$GATE" checks --sha "$sha" <<<"${runs:-[]}")"
    state="$(jq -r .state <<<"$res")"
    CHECKS_DETAIL="$(jq -c .details <<<"$res")"
    case "$state" in success) return 0 ;; failed) return 1 ;; esac
    [ "$SECONDS" -ge "$deadline" ] && return 2
    sleep "$POLL"
  done
}

# squash-merge with the head sha pinned (the API refuses if anyone pushed in between); sets MERGE_RESPONSE_SHA
merge_pinned() { # number sha title
  local resp
  resp="$(gh_pat api -X PUT "repos/$REPO/pulls/$1/merge" -f merge_method=squash -f sha="$2" -f commit_title="$3" -f commit_message="Merged by claude-autofix after the safety gate passed. Run: $RUN_URL" 2>/dev/null)" || return 1
  [ "$(jq -r '.merged // false' <<<"$resp")" = "true" ] || return 1
  MERGE_RESPONSE_SHA="$(jq -r '.sha' <<<"$resp")"
}

verify_deploy() { # merge sha -> 0 ok | 1 failed ; sets VERIFY_DETAIL
  local short body v deadline code path try
  short="${1:0:7}"
  deadline=$((SECONDS + DEPLOY_TIMEOUT * 60))
  while :; do
    body="$(curl -sS --max-time 15 "$PROD_URL/api/health/deep" 2>/dev/null || true)"
    v="$(printf '%s' "$body" | node "$GATE" health --sha "$short")"
    [ "$(jq -r .ok <<<"$v")" = "true" ] && break
    if [ "$SECONDS" -ge "$deadline" ]; then VERIFY_DETAIL="/api/health/deep did not report ok:true with version $short within ${DEPLOY_TIMEOUT} min ($(jq -r .reason <<<"$v"))"; return 1; fi
    sleep "$VERIFY_POLL"
  done
  for path in /api/auth/session /api/telemetry/config; do
    code=000
    for try in 1 2 3; do
      code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$PROD_URL$path" 2>/dev/null || true)"
      [ "$code" = "200" ] && break
      sleep "$VERIFY_POLL"
    done
    if [ "$code" != "200" ]; then VERIFY_DETAIL="$path returned HTTP $code instead of 200"; return 1; fi
  done
  VERIFY_DETAIL="health/deep ok with version $short; /api/auth/session 200; /api/telemetry/config 200"
  return 0
}

gate_and_merge() {
  local pr head prov files conf reasons merged rl v

  if [ "${ALLOW_MERGE:-true}" != "true" ]; then left_for_human "manual run: auto-merge is disabled unless allow_merge=true"; return 0; fi

  pr="$(gh api "repos/$REPO/pulls/$PR_NUMBER")"
  head="$(jq -r .head.sha <<<"$pr")"
  prov="$(node "$GATE" provenance --repo "$REPO" --branch "$BRANCH" --number "$PR_NUMBER" <<<"$pr")"
  files="$(gh api --paginate "repos/$REPO/pulls/$PR_NUMBER/files?per_page=100" | jq -s 'add // []')"
  conf="$(node "$GATE" confidence < "$INCIDENT")"
  reasons="$( { jq -r '.reasons[]' <<<"$prov"; jq -r '.reasons[]' <<<"$(node "$GATE" files <<<"$files")"; [ "$(jq -r .high <<<"$conf")" = "true" ] || echo 'incident report lacks the line "CONFIDENCE: high"'; } | paste -sd ';' - | sed 's/;/; /g')"
  if [ -n "$reasons" ]; then left_for_human "gate failed: $reasons"; return 0; fi
  note "Gate (provenance, files, confidence) passed for $head. Waiting up to ${CHECKS_TIMEOUT} min for the required checks."

  set +e; wait_for_checks "$head"; local rc=$?; set -e
  case "$rc" in
    1) left_for_human "a required check failed on $head: $CHECKS_DETAIL"; return 0 ;;
    2) left_for_human "timed out after ${CHECKS_TIMEOUT} min waiting for the required checks on $head: $CHECKS_DETAIL"; return 0 ;;
  esac

  # last look right before merging: kill switch (best effort), rate limit, head unchanged
  v="$(gh api "repos/$REPO/actions/variables/AUTOFIX_ENABLED" --jq .value 2>/dev/null || true)"
  if [ "$(printf '%s' "$v" | tr '[:upper:]' '[:lower:]')" = "false" ]; then left_for_human "the kill switch (AUTOFIX_ENABLED=false) was turned on while waiting"; return 0; fi
  merged="$( { gh api "repos/$REPO/issues?state=closed&labels=autofix&per_page=100" 2>/dev/null || echo '[]'; gh api "repos/$REPO/issues?state=closed&labels=autofix-revert&per_page=100" 2>/dev/null || echo '[]'; } | jq -s '[.[][] | select(.pull_request.merged_at != null) | {number, mergedAt: .pull_request.merged_at, labels}]')"
  rl="$(node "$GATE" ratelimit <<<"$merged")"
  if [ "$(jq -r .blocked <<<"$rl")" = "true" ]; then left_for_human "rate limit: $(jq -r .reason <<<"$rl")"; return 0; fi
  if [ "$(gh api "repos/$REPO/pulls/$PR_NUMBER" --jq .head.sha)" != "$head" ]; then left_for_human "the PR head changed while waiting; a person must re-review"; return 0; fi

  if ! merge_pinned "$PR_NUMBER" "$head" "autofix: ${ALERT} (#${PR_NUMBER})"; then left_for_human "the merge API refused the sha-pinned squash merge (conflict, protection rule or a new push)"; return 0; fi
  set_state MERGE_SHA "$MERGE_RESPONSE_SHA"; set_state OUTCOME merged_unverified
  note "Squash-merged PR #$PR_NUMBER as ${MERGE_RESPONSE_SHA:0:7}. Verifying production (up to ${DEPLOY_TIMEOUT} min)."

  set +e; verify_deploy "$MERGE_RESPONSE_SHA"; rc=$?; set -e
  set_state VERIFY_DETAIL "$VERIFY_DETAIL"
  if [ "$rc" -eq 0 ]; then set_state OUTCOME merged; note "Production verified: $VERIFY_DETAIL"; return 0; fi
  note "PRODUCTION VERIFICATION FAILED: $VERIFY_DETAIL"
  rollback
}

# ---- 5. rollback --------------------------------------------------------------------------------------------------------
annotate() {
  if [ -n "${GRAFANA_ANNOTATION_TOKEN:-}" ] && [ -n "${GRAFANA_URL:-}" ]; then
    node "$GATE" annotation --text "$1" --tags revert \
      | curl -sS --max-time 20 -X POST "${GRAFANA_URL%/}/api/annotations" -H "Authorization: Bearer $GRAFANA_ANNOTATION_TOKEN" -H 'Content-Type: application/json' --data-binary @- >/dev/null 2>&1 \
      && note "Grafana annotation posted." || note "Grafana annotation failed (non-fatal)."
  else
    note "Grafana annotation skipped: GRAFANA_ANNOTATION_TOKEN / GRAFANA_URL not set."
  fi
}

rollback() {
  local rbranch="autofix-revert/${ALERT}-${RUN_ID}" parents rpr rjson rsha rc issue_note revert_state
  local failure_detail="$VERIFY_DETAIL" # verify_deploy overwrites VERIFY_DETAIL when it re-checks after the revert
  revert_state="not attempted"
  if ! git fetch -q "$GIT_REMOTE" main >/dev/null 2>&1; then
    revert_state="FAILED: could not fetch main"
  elif ! git cat-file -e "${MERGE_SHA}^{commit}" 2>/dev/null; then
    revert_state="FAILED: the merge commit is not in this clone"
  else
    git checkout -q -B "$rbranch" FETCH_HEAD
    parents="$(git rev-list --parents -n1 "$MERGE_SHA" | wc -w)"
    set +e
    if [ "$parents" -gt 2 ]; then git revert --no-edit -m 1 "$MERGE_SHA" >/dev/null 2>&1; else git revert --no-edit "$MERGE_SHA" >/dev/null 2>&1; fi
    rc=$?
    set -e
    if [ "$rc" -ne 0 ]; then
      git revert --abort >/dev/null 2>&1 || true
      revert_state="FAILED: git revert does not apply cleanly (main has moved on); revert by hand"
    elif ! git push -q "$GIT_REMOTE" "HEAD:refs/heads/$rbranch" >/dev/null 2>&1; then
      revert_state="FAILED: pushing the revert branch was rejected"
    else
      printf '%s\n' "Automatic revert of #${PR_NUMBER} (squash commit ${MERGE_SHA:0:7}): production verification failed after the merge — ${failure_detail}." "" "Run: ${RUN_URL}" > /tmp/autofix-revert-body.md
      rjson="$(gh_pat api -X POST "repos/$REPO/pulls" -f title="Revert: autofix ${ALERT} (#${PR_NUMBER})" -f head="$rbranch" -f base=main -F "body=@/tmp/autofix-revert-body.md" 2>/dev/null)" || rjson=""
      rpr="$(jq -r '.number // empty' <<<"${rjson:-null}" 2>/dev/null || true)"
      if [ -z "$rpr" ]; then
        revert_state="FAILED: the revert PR could not be created (branch $rbranch was pushed)"
      else
        add_label "$rpr" autofix-revert
        set_state REVERT_PR_NUMBER "$rpr"
        rsha="$(jq -r .head.sha <<<"$rjson")"
        note "Opened revert PR #$rpr. Waiting for the required checks."
        set +e; wait_for_checks "$rsha"; rc=$?; set -e
        if [ "$rc" -ne 0 ]; then
          add_label "$rpr" needs-human
          revert_state="revert PR #$rpr is OPEN but its required checks did not go green ($CHECKS_DETAIL): merge it by hand, URGENT"
        elif merge_pinned "$rpr" "$rsha" "Revert: autofix ${ALERT} (#${PR_NUMBER})"; then
          set +e; verify_deploy "$MERGE_RESPONSE_SHA"; rc=$?; set -e
          if [ "$rc" -eq 0 ]; then revert_state="revert PR #$rpr merged as ${MERGE_RESPONSE_SHA:0:7} and production verified"
          else revert_state="revert PR #$rpr merged as ${MERGE_RESPONSE_SHA:0:7} but production verification still failed ($VERIFY_DETAIL): URGENT"; fi
        else
          add_label "$rpr" needs-human
          revert_state="revert PR #$rpr is OPEN and green but the merge API refused it: merge it by hand, URGENT"
        fi
      fi
    fi
  fi
  note "Revert: $revert_state"
  set_state OUTCOME reverted; set_state REVERT_DETAIL "$revert_state"

  { printf '%s\n\n' "🚨 **Autofix PR #${PR_NUMBER} was merged, production verification failed, and the loop reverted it.**"
    printf -- '- Verification failure: %s\n- Revert: %s\n- Merged commit: `%s`\n- Run: %s\n\n' "$failure_detail" "$revert_state" "${MERGE_SHA:0:7}" "$RUN_URL"
    printf '%s\n\n' '### Incident report from the investigation'
    head -c 40000 "$INCIDENT"; } > /tmp/autofix-revert-issue.md
  issue_note="$(create_issue "🚨 Autofix reverted: ${ALERT} (PR #${PR_NUMBER})" /tmp/autofix-revert-issue.md)"
  set_state REVERT_ISSUE_NUMBER "$issue_note"
  annotate "autofix PR #${PR_NUMBER} for ${ALERT} failed production verification; ${revert_state}"
}

gate_and_merge
