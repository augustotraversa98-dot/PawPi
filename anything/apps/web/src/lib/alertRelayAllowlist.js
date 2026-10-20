// Which alert names the Grafana relay (src/app/api/internal/grafana-alert/route.js) will forward to GitHub.
// Anything else is acknowledged with 202 and ignored, so a forged or mistyped request cannot start an autofix run for an
// arbitrary name. Defence in depth: scripts/autofix/preflight.sh repeats the check inside the workflow (gate.mjs `known`).
//
// Keep in sync with: observability/grafana/alerts/*.json (alert rules as code) and scripts/autofix/gate.mjs LEGACY_ALERTS.
// A unit test (alertRelayAllowlist.test.js) fails when this list and those files drift apart.

/** Rules defined as code in observability/grafana/alerts/*.json. */
export const RULE_ALERTS = Object.freeze([
  'P1-ClientApi5xxShare',
  'P1-ClientCrashRate',
  'P1-DbErrors',
  'P1-HealthDeepFailing',
  'P1-Http5xxRate',
  'P1-PaymentsFailureSpike',
  'P1-Route4xxBurst',
  'P1-ServerMetricsSilent',
  'P1-SigninFailureSpike',
  'P1-SignupCollapse',
  'P2-ActivationFunnelDrop',
  'P2-FreeTierUsage',
  'P2-NavUnexpectedRedirect',
  'P2-SlowRoutesP95',
  'P2-TelemetrySilent',
]);

/** The three legacy live rules plus Grafana's own data-source alerts (real, but not rules in the repo). */
export const LEGACY_ALERTS = Object.freeze(['HighServerErrorRate', 'HighLatencyP95', 'PaymentFailuresSpike', 'DatasourceError', 'DatasourceNoData']);

export const KNOWN_ALERT_NAMES = Object.freeze([...RULE_ALERTS, ...LEGACY_ALERTS]);

/** Exact, case-sensitive match against the allow-list (no trimming, no prefix match). */
export function isKnownAlertName(name) {
  return typeof name === 'string' && KNOWN_ALERT_NAMES.includes(name);
}

// throwaway path-filter test
