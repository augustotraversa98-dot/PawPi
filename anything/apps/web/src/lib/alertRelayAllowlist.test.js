// @vitest-environment node
// Drift guard: the relay's allow-list of alert names must equal the alert rules defined as code
// (observability/grafana/alerts/*.json) plus the legacy / data-source alerts, and must agree with the workflow-side check
// (scripts/autofix/gate.mjs). Adding a rule without allow-listing it silently disables autofix for that alert; this test says so.
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { KNOWN_ALERT_NAMES, LEGACY_ALERTS, RULE_ALERTS, isKnownAlertName } from './alertRelayAllowlist.js';
import { LEGACY_ALERTS as GATE_LEGACY, loadRuleNames, isKnownAlert } from '../../../../../scripts/autofix/gate.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');

describe('relay alert-name allow-list', () => {
  it('RULE_ALERTS equals the rule titles in observability/grafana/alerts/*.json', () => {
    expect([...RULE_ALERTS].sort()).toEqual(loadRuleNames(REPO_ROOT));
  });

  it('LEGACY_ALERTS equals the workflow-side list (gate.mjs)', () => {
    expect([...LEGACY_ALERTS].sort()).toEqual([...GATE_LEGACY].sort());
  });

  it('the relay and the workflow agree on every name, including near misses', () => {
    const rules = loadRuleNames(REPO_ROOT);
    for (const n of [...KNOWN_ALERT_NAMES, 'TestAlert', 'ManualTest', 'Evil', 'p1-dberrors', 'P1-DbErrors2', '', 'HighLatencyP95b']) {
      expect(isKnownAlertName(n), n).toBe(isKnownAlert(n, rules));
    }
  });

  it('is exact: case-sensitive, no trimming, no prefix, non-strings are unknown', () => {
    expect(isKnownAlertName('P1-DbErrors')).toBe(true);
    for (const n of ['p1-dberrors', ' P1-DbErrors', 'P1-DbErrors2', 'P1', null, undefined, 5, {}]) expect(isKnownAlertName(n)).toBe(false);
  });
});
