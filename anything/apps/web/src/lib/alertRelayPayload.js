// Builds the `client_payload` of the GitHub repository_dispatch sent by the Grafana alert relay
// (src/app/api/internal/grafana-alert/route.js).
//
// HARD LIMIT: GitHub rejects a repository_dispatch whose client_payload has more than 10 TOP-LEVEL properties with
// 422 "No more than 10 properties" (it already bit this relay once: see the OPERATIONS.md troubleshooting table). Nested objects count
// as ONE property, so everything variable (area, route, app_version, ...) lives inside the single `labels` object and
// the top-level key set is fixed below. Every value is length-capped and stripped of control characters, because the
// workflow pastes this JSON into an LLM prompt and uses `alertname` in a git branch name.

export const MAX_CLIENT_PAYLOAD_KEYS = 10;

/** The fixed top-level keys (exactly 10 = the GitHub maximum; adding one more breaks the autofix loop). */
export const CLIENT_PAYLOAD_KEYS = Object.freeze([
  'source', 'status', 'alertname', 'severity', 'summary', 'value', 'labels', 'generatorURL', 'panelURL', 'runbook',
]);

/** Alert labels that are forwarded (bounded contract labels + Grafana's own). Everything else is dropped. */
export const LABEL_ALLOWLIST = Object.freeze([
  'alertname', 'severity', 'area', 'route', 'app_version', 'method', 'status_class', 'op', 'event', 'kind', 'funnel', 'step',
  'platform', 'screen', 'grafana_folder',
]);
export const MAX_LABEL_VALUE_LENGTH = 80;

const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g;

/** Free text: control characters (newlines too) become a space, whitespace collapses, length is capped. */
export function sanitizeText(value, max) {
  const s = String(value ?? '').replace(CONTROL, ' ').replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

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

function safeUrl(value) {
  const s = String(value ?? '').trim();
  return /^https?:\/\/[^\s]+$/.test(s) ? s.slice(0, 500) : '';
}

/**
 * @param {object} payload  the Grafana webhook body ({status, title, message, alerts: [...]})
 * @param {object[]} firing the firing alerts (may be empty for a test ping)
 * @returns {object} client_payload with exactly CLIENT_PAYLOAD_KEYS
 */
export function buildClientPayload(payload = {}, firing = []) {
  const first = firing[0] || {};
  const labels = sanitizeLabels(first.labels);
  let summary = sanitizeText(first.annotations?.summary || first.annotations?.description || payload.message || '', 500);
  if (firing.length > 1) {
    // Several rules in one notification group: the relay dispatches once, so name the others for the investigator.
    const others = [...new Set(firing.slice(1).map((a) => sanitizeLabelValue(a.labels?.alertname || 'unknown', 60)))].slice(0, 5);
    summary = sanitizeText(`${summary} [+${firing.length - 1} more firing: ${others.join(', ')}]`, 600);
  }
  return {
    source: 'grafana',
    status: payload.status === 'resolved' ? 'resolved' : 'firing',
    alertname: sanitizeLabelValue(first.labels?.alertname || payload.title || 'unknown', 100) || 'unknown',
    severity: sanitizeLabelValue(first.labels?.severity || 'warning', 20) || 'warning',
    summary,
    value: sanitizeText(first.valueString || '', 200),
    labels,
    generatorURL: safeUrl(first.generatorURL),
    panelURL: safeUrl(first.panelURL),
    runbook: sanitizeText(first.annotations?.runbook || '', 400),
  };
}
