// Offline lint for observability/grafana/synthetics/*.json (Step D): Grafana Synthetic Monitoring HTTP checks.
// Read-only probes of PUBLIC GET endpoints. Nothing here may create an account, log in or send credentials (the scripted
// sign-up journey is intentionally NOT implemented: it would create real production accounts).
export const EXPECTED_CHECKS = ['account-signin', 'account-signup', 'auth-providers', 'auth-social-enabled', 'health-deep'];
export const SM_REGIONS = ['EMEA', 'AMER', 'APAC'];
export const SITE = 'https://www.pawpi.info';
/** Grafana Cloud free tier: 100k Synthetic Monitoring test executions per month (one per check, probe and run). */
export const FREE_TIER_EXECUTIONS = 100_000;
const FORBIDDEN_HTTP_KEYS = ['headers', 'body', 'basicAuth', 'bearerToken', 'tlsConfig'];

/** Executions per 31-day month for one check. */
export function monthlyExecutions(check) {
  return Math.ceil((31 * 24 * 3600 * 1000) / check.frequency) * (check.probeRegions?.length ?? 0);
}

/** @returns {string[]} errors, each naming the file and the offender */
export function lintCheck({ file, check }) {
  const errors = [];
  const at = (m) => errors.push(`[${file}] ${m}`);
  const name = String(file).replace(/\.json$/, '');
  if (!check || typeof check !== 'object') return [`[${file}] not a JSON object`];
  if (check.job !== `pawpi-${name}`) at(`job "${check.job}" must equal "pawpi-${name}"`);
  if (typeof check.target !== 'string' || !check.target.startsWith(`${SITE}/`)) at(`target must be an https ${SITE}/... URL (got ${check.target})`);
  else if (/[?#]/.test(check.target)) at('target must not carry a query string or fragment');
  if (check.frequency !== 300000) at(`frequency must be 300000 ms (5 min), got ${check.frequency}`);
  if (!Number.isInteger(check.timeout) || check.timeout < 1000 || check.timeout > 10000 || check.timeout >= check.frequency) at(`timeout must be 1000..10000 ms and below the frequency (got ${check.timeout})`);
  if (check.enabled !== true) at('enabled must be true (checks only probe; they never page)');
  if (check.alertSensitivity !== 'none') at('alertSensitivity must be "none" (alerts on sm_check are not part of this step)');
  if (check.basicMetricsOnly !== true) at('basicMetricsOnly must be true (keeps series low on the free tier)');
  if (!Array.isArray(check.probeRegions) || check.probeRegions.length < 2 || check.probeRegions.length > 3 || new Set(check.probeRegions).size !== check.probeRegions.length || !check.probeRegions.every((r) => SM_REGIONS.includes(r))) {
    at(`probeRegions must be 2-3 distinct regions of ${SM_REGIONS.join('/')}`);
  }
  if (!Array.isArray(check.labels) || !check.labels.some((l) => l.name === 'service')) at('labels must include {name: "service"}');
  for (const l of check.labels ?? []) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(l.name ?? '') || typeof l.value !== 'string' || !l.value) at(`invalid label ${JSON.stringify(l)}`);
  }
  if ((check.labels ?? []).length > 10) at('at most 10 labels');

  const http = check.settings?.http;
  if (!http || Object.keys(check.settings).length !== 1) {
    at('settings must contain only an http block');
    return errors;
  }
  if (http.method !== 'GET') at(`method must be GET (got ${http.method}): no check may write`);
  for (const k of FORBIDDEN_HTTP_KEYS) if (k in http) at(`settings.http.${k} is not allowed (no credentials, bodies or custom headers)`);
  if (JSON.stringify(http.validStatusCodes) !== '[200]') at('validStatusCodes must be [200]');
  if (http.failIfNotSSL !== true) at('failIfNotSSL must be true');
  const must = http.failIfBodyNotMatchesRegexp;
  if (!Array.isArray(must) || !must.length) at('failIfBodyNotMatchesRegexp must name what the body must contain');
  const never = http.failIfBodyMatchesRegexp ?? [];
  for (const re of [...(must ?? []), ...never]) {
    if (typeof re !== 'string' || !re) at('regexp entries must be non-empty strings');
    else {
      if (/\(\?[=!<]|\\[1-9]/.test(re)) at(`regexp ${re} uses lookaround/backreference (Synthetic Monitoring uses RE2)`);
      try {
        new RegExp(re);
      } catch {
        at(`regexp ${re} does not compile`);
      }
    }
  }
  if (name.startsWith('account-') && !never.includes('Coming soon')) at('account pages must fail if the body matches "Coming soon"');
  return errors;
}

export function lintChecks(entries) {
  const errors = [];
  const jobs = new Set();
  let executions = 0;
  for (const { file, check } of entries) {
    errors.push(...lintCheck({ file, check }));
    if (jobs.has(check?.job)) errors.push(`[${file}] duplicate job ${check.job}`);
    jobs.add(check?.job);
    if (check?.frequency) executions += monthlyExecutions(check);
  }
  if (executions >= FREE_TIER_EXECUTIONS) errors.push(`checks would use ~${executions} executions/month, over the ${FREE_TIER_EXECUTIONS} free tier`);
  return errors;
}
