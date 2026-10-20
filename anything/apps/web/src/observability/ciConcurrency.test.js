// @vitest-environment node
// Cancel-superseded-runs rules for ci.yml and gitleaks.yml: a newer push to a pull request cancels the older in-progress run; runs on
// push to main (and manual runs) are NEVER cancelled; the state-mutating workflows are not touched. Static checks of the workflow
// text plus a model of GitHub's concurrency semantics for the group key used. No network.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
const read = (f) => fs.readFileSync(path.join(REPO_ROOT, '.github/workflows', f), 'utf8');
const CI = read('ci.yml');
const GITLEAKS = read('gitleaks.yml');

const GROUP = "group: ${{ github.workflow }}-${{ github.event_name == 'pull_request' && format('pr-{0}', github.event.pull_request.number) || format('run-{0}', github.run_id) }}";
const CANCEL = "cancel-in-progress: ${{ github.event_name == 'pull_request' }}";

// The same logic as the expressions above, to reason about which runs share a group.
const groupOf = (workflow, ev) => `${workflow}-${ev.event_name === 'pull_request' ? `pr-${ev.pr}` : `run-${ev.run_id}`}`;
const cancels = (ev) => ev.event_name === 'pull_request';

describe('concurrency block', () => {
  it.each([['ci.yml', CI], ['gitleaks.yml', GITLEAKS]])('%s has the group key and cancel-in-progress for pull_request events only', (_n, text) => {
    expect(text).toContain(`concurrency:\n  ${GROUP}\n  ${CANCEL}\n`);
    expect((text.match(/^concurrency:/gm) || []).length).toBe(1);
    expect(text).not.toMatch(/cancel-in-progress: true/); // never an unconditional cancel
  });

  it('is a top-level block (workflow-wide), not repeated per job', () => {
    expect(CI).not.toMatch(/^ {4}concurrency:/m);
    expect(GITLEAKS).not.toMatch(/^ {4}concurrency:/m);
  });

  it('claude-autofix.yml, cron-jobs.yml and any other workflow keep their own settings: this change does not touch them', () => {
    for (const f of fs.readdirSync(path.join(REPO_ROOT, '.github/workflows')).filter((n) => /\.ya?ml$/.test(n))) {
      if (['ci.yml', 'gitleaks.yml'].includes(f)) continue;
      expect(read(f), f).not.toContain('format(\'pr-{0}\'');
      expect(read(f), f).not.toMatch(/cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}/);
    }
    expect(read('claude-autofix.yml')).toContain('cancel-in-progress: false');
    expect(read('cron-jobs.yml')).not.toContain('concurrency:');
  });
});

describe('semantics of the group key', () => {
  const pr = (n, run_id) => ({ event_name: 'pull_request', pr: n, run_id });
  const push = (run_id) => ({ event_name: 'push', run_id });

  it('two runs of the SAME pull request share a group and the older one is cancelled; different PRs do not interact', () => {
    expect(groupOf('CI', pr(7, 1))).toBe(groupOf('CI', pr(7, 2)));
    expect(groupOf('CI', pr(7, 1))).not.toBe(groupOf('CI', pr(8, 3)));
    expect(cancels(pr(7, 2))).toBe(true);
  });

  it('runs on push to main (and workflow_dispatch) each get their OWN group: never cancelled, never queued behind another', () => {
    expect(groupOf('CI', push(10))).not.toBe(groupOf('CI', push(11)));
    expect(cancels(push(11))).toBe(false);
    expect(groupOf('CI', { event_name: 'workflow_dispatch', run_id: 12 })).not.toBe(groupOf('CI', push(12 + 1)));
  });

  it('a pull-request run and a main run never share a group; CI and gitleaks never share one', () => {
    expect(groupOf('CI', pr(7, 1))).not.toBe(groupOf('CI', push(1)));
    expect(groupOf('CI', pr(7, 1))).not.toBe(groupOf('Secret scan (gitleaks)', pr(7, 1)));
  });
});

describe('required checks are unaffected', () => {
  it('ci.yml still has exactly the three required job names', () => {
    const names = [...CI.matchAll(/^ {4}name:\s*(.+?)\s*$/gm)].map((m) => m[1]).sort();
    expect(names).toEqual(['mobile (jest)', 'web (integration / real Postgres)', 'web (vitest)']);
  });
});
