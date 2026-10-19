// Builds the `client_payload` of the GitHub repository_dispatch sent by the Grafana alert relay
// (src/app/api/internal/grafana-alert/route.js).
//
// NO FREE TEXT REACHES THE MODEL. The workflow pastes this JSON into an LLM prompt, so anything an alert sender can write
// (annotations: summary / runbook, valueString, URLs, label values outside the allow-list) is a prompt-injection channel.
// The payload therefore carries only: the (allow-listed) alert name, a status flag, a short severity token and allow-listed
// label values, each reduced to a safe character set and length. The agent reads the rule's own description / runbook from the
// repository (observability/grafana/alerts/*.json), which is trusted, reviewed content.
//
// GitHub rejects a repository_dispatch whose client_payload has more than 10 TOP-LEVEL properties (422); the key set below is
// fixed and far below that. Nested objects count as one property, so variable data lives inside `labels`.

export const MAX_CLIENT_PAYLOAD_KEYS = 10;

/** The fixed top-level keys. */
export const CLIENT_PAYLOAD_KEYS = Object.freeze(['source', 'status', 'alertname', 'severity', 'labels']);

/** Alert labels that are forwarded (bounded contract labels + Grafana's own). Everything else is dropped.
 *  Mirrored in scripts/autofix/gate.mjs (LABEL_ALLOWLIST); autofix-gate.test.js pins both. */
export const LABEL_ALLOWLIST = Object.freeze([
  'alertname', 'severity', 'area', 'route', 'app_version', 'method', 'status_class', 'op', 'event', 'kind', 'funnel', 'step',
  'platform', 'screen', 'grafana_folder',
]);
export const MAX_LABEL_VALUE_LENGTH = 80;

/** Label values / identifiers: only characters that occur in route templates, versions and metric label values (no shell/markdown metacharacters). */
export function sanitizeLabelValue(value, max = MAX_LABEL_VALUE_LENGTH) {
  return String(value ?? '').replace(/[^A-Za-z0-9_.\-\/:@ ]/g, '_').slice(0, max);
}

/** Allow-listed, sanitised, length-capped copy of the alert labels (at most one entry per allow-listed key). */
export function sanitizeLabels(labels) {
  const out = {};
  if (!labels || typeof labels !== 'object') return out;
  for (const key of LABEL_ALLOWLIST) {
    const v = labels[key];
    if (typeof v === 'string' || typeof v === 'number') out[key] = sanitizeLabelValue(v);
  }
  return out;
}

/**
 * @param {object} payload  the Grafana webhook body ({status, title, message, alerts: [...]})
 * @param {object[]} firing the firing alerts whose names passed the allow-list (may be empty)
 * @returns {object} client_payload with exactly CLIENT_PAYLOAD_KEYS
 */
export function buildClientPayload(payload = {}, firing = []) {
  const first = firing[0] || {};
  return {
    source: 'grafana',
    status: payload?.status === 'resolved' ? 'resolved' : 'firing',
    alertname: sanitizeLabelValue(first.labels?.alertname || 'unknown', 100) || 'unknown',
    severity: String(first.labels?.severity ?? '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 20) || 'warning',
    labels: sanitizeLabels(first.labels),
  };
}
