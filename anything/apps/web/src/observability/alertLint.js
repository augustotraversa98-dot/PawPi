// Offline lint for the Grafana alert rules in /observability/grafana/alerts (Step D).
//
// Same philosophy as dashboardLint.js: the telemetry contract markdown is the single source of truth for metric and label
// names (reuses `parseContract` / `analyzePromQL`), datasources are placeholders only, and every rule must be safe to
// create (PAUSED, no-data never pages) and actionable (a "What to do:" runbook line).
//
// The one documented exception to "contract metrics only": the free-tier-usage rule reads Grafana Cloud's own
// `grafanacloud_*` usage metrics from the separate usage datasource (`${DS_USAGE}`). Those names are allow-listed
// explicitly below and are only accepted on that datasource.
//
// Every error names the file, the rule uid and the offender.
import { analyzePromQL } from './dashboardLint.js';

export const ALERT_UID_PREFIX = 'pawpi-';
export const ALERT_FOLDER = 'PawPi';
export const ALERT_DS = Object.freeze({
  prometheus: { type: 'prometheus', uid: '${DS_PROMETHEUS}' },
  loki: { type: 'loki', uid: '${DS_LOKI}' },
  usage: { type: 'prometheus', uid: '${DS_USAGE}' },
});
export const EXPR_DS_UID = '__expr__';

/** file name (without .json) -> the only severity allowed in that file. */
export const TIER_FILES = Object.freeze({ 'p1-critical': 'P1', 'p2-digest': 'P2' });
/** Contract areas (areas.js) plus the three alert-only categories for rules that are not about one API area. */
export const ALERT_AREAS = Object.freeze([
  'auth', 'pets', 'feed', 'health', 'services', 'providers', 'booking', 'payments', 'shop', 'forum', 'walks', 'messages',
  'training', 'adoption', 'insurance', 'telehealth', 'notifications', 'admin', 'telemetry', 'other',
  'platform', 'database', 'client',
]);
/** Static labels a rule may carry. Anything else must come from the query's `by (...)` (bounded contract labels only). */
export const STATIC_LABEL_KEYS = Object.freeze(['severity', 'area', 'pawpi_managed']);
/** Labels that may reach an alert through `by (...)`: bounded contract labels (never an identifier). */
export const QUERY_LABEL_KEYS = Object.freeze([
  'area', 'route', 'method', 'status_class', 'op', 'event', 'outcome', 'app_version', 'platform', 'screen', 'kind',
  'funnel', 'step', 'result',
]);
/** Grafana Cloud usage metrics, allowed ONLY on ${DS_USAGE}. */
export const USAGE_METRICS = Object.freeze(['grafanacloud_instance_active_series']);

const FORBIDDEN_LABELS =
  /^(install_id|session_id|user_id|auth_user_id|account_id|email|device_id|idfa|idfv|pet_id|pet_name|handle|ip|ip_address|phone|address|text|token|request_id)$/;
const RESOURCE_LABELS = new Set(['job', 'instance', 'service_name', 'service_version', 'service_instance_id', 'service_namespace', 'deployment_environment']);
const DURATION = /^[1-9]\d*[smhd]$/;
const EXPR_TYPES = new Set(['reduce', 'math', 'threshold', 'classic_conditions', 'resample']);
const EVALUATORS = new Set(['gt', 'lt', 'within_range', 'outside_range']);
const EXEC_ERR = new Set(['OK', 'Alerting', 'Error']);
// `title` becomes the alertname: it travels into a git branch name and the GitHub concurrency group by the autofix
// workflow, so it must contain no spaces or odd characters.
const TITLE = /^P[12]-[A-Za-z0-9]{3,60}$/;

const dsOf = (ref) => Object.values(ALERT_DS).find((d) => ref && d.type === ref.type && d.uid === ref.uid);

/** `$labels.x` references in an annotation. */
function labelRefs(text) {
  return [...String(text).matchAll(/\$labels\.([A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => m[1]);
}

/**
 * Lint one rule. `file` is the file name without directory ("p1-critical.json"), `groupName` the enclosing group.
 * @returns {string[]} errors
 */
export function lintRule({ file, groupName, rule, contract }) {
  const errors = [];
  const tier = TIER_FILES[String(file).replace(/\.json$/, '')];
  const id = rule?.uid ?? '(no uid)';
  const at = (msg) => errors.push(`[${file}] rule ${id}: ${msg}`);
  if (!rule || typeof rule !== 'object') {
    errors.push(`[${file}] rule is not an object`);
    return errors;
  }

  if (typeof rule.uid !== 'string' || !/^pawpi-[a-z0-9-]+$/.test(rule.uid)) at(`uid must match ^pawpi-[a-z0-9-]+$`);
  else if (rule.uid.length > 40) at('uid longer than 40 characters');
  else if (tier && !rule.uid.startsWith(`pawpi-${tier.toLowerCase()}-`)) at(`uid must start with pawpi-${tier.toLowerCase()}- in this file`);
  if (typeof rule.title !== 'string' || !TITLE.test(rule.title)) at(`title "${rule.title}" must match ${TITLE} (no spaces: it becomes the alertname used in branch names)`);
  else if (tier && !rule.title.startsWith(`${tier}-`)) at(`title must start with ${tier}- in this file`);
  if (!groupName || !groupName.startsWith('pawpi-')) at(`group "${groupName}" must start with pawpi-`);

  // safety switches
  if (rule.isPaused !== true) at('isPaused must be true (the run never creates a live alert; the owner un-pauses by hand)');
  if (rule.noDataState !== 'OK') at(`noDataState must be "OK" so an idle or not-yet-reporting service never pages (got ${rule.noDataState})`);
  if (!EXEC_ERR.has(rule.execErrState)) at(`execErrState must be one of OK|Alerting|Error (got ${rule.execErrState})`);
  if (typeof rule.for !== 'string' || !DURATION.test(rule.for)) at(`"for" (pending period) is required, like "5m" (got ${JSON.stringify(rule.for)})`);

  // labels
  const labels = rule.labels && typeof rule.labels === 'object' ? rule.labels : {};
  if (!labels.severity || !['P1', 'P2'].includes(labels.severity)) at(`labels.severity must be P1 or P2 (got ${labels.severity})`);
  else if (tier && labels.severity !== tier) at(`labels.severity ${labels.severity} does not match the file tier ${tier}`);
  if (labels.pawpi_managed !== 'true') at('labels.pawpi_managed must be "true" (the notification policy matches on it)');
  for (const [k, v] of Object.entries(labels)) {
    if (!STATIC_LABEL_KEYS.includes(k)) at(`static label "${k}" is not allowed (only ${STATIC_LABEL_KEYS.join(', ')}; route/app_version/... must come from the query's by (...))`);
    if (typeof v !== 'string' || /\{\{|\$\{/.test(v)) at(`static label "${k}" must be a plain string (no templating: unbounded)`);
  }
  if (labels.area !== undefined && !ALERT_AREAS.includes(labels.area)) at(`labels.area "${labels.area}" is not a known area`);

  // data
  const data = Array.isArray(rule.data) ? rule.data : [];
  if (!data.length) {
    at('data[] is empty');
    return errors;
  }
  const refIds = new Set();
  const byLabels = new Set();
  const allowedMetrics = new Set();
  for (const q of data) {
    if (!q.refId || refIds.has(q.refId)) at(`missing/duplicate refId "${q.refId}"`);
    refIds.add(q.refId);
  }
  if (!refIds.has(rule.condition)) at(`condition "${rule.condition}" is not a refId of data[]`);
  let queries = 0;
  for (const q of data) {
    const m = q.model ?? {};
    if (q.datasourceUid === EXPR_DS_UID) {
      if (m.datasource?.uid !== EXPR_DS_UID) at(`expression ${q.refId}: model.datasource must be __expr__`);
      if (!EXPR_TYPES.has(m.type)) at(`expression ${q.refId}: unsupported type "${m.type}"`);
      if (m.type !== 'classic_conditions' && !refIds.has(m.expression)) at(`expression ${q.refId}: refers to unknown refId "${m.expression}"`);
      if (m.type === 'threshold') {
        const ev = m.conditions?.[0]?.evaluator;
        if (!ev || !EVALUATORS.has(ev.type) || !Array.isArray(ev.params) || !ev.params.length || !ev.params.every(Number.isFinite)) {
          at(`threshold ${q.refId}: needs a numeric evaluator (gt|lt|within_range|outside_range)`);
        }
      }
      continue;
    }
    queries += 1;
    const ds = Object.values(ALERT_DS).find((d) => d.uid === q.datasourceUid);
    if (!ds) {
      at(`query ${q.refId}: datasourceUid "${q.datasourceUid}" must be a placeholder (\${DS_PROMETHEUS} / \${DS_LOKI} / \${DS_USAGE})`);
      continue;
    }
    if (!dsOf(m.datasource) || m.datasource.uid !== q.datasourceUid) at(`query ${q.refId}: model.datasource must match datasourceUid`);
    const rt = q.relativeTimeRange;
    if (!rt || !Number.isInteger(rt.from) || !Number.isInteger(rt.to) || rt.from <= rt.to || rt.to < 0) at(`query ${q.refId}: invalid relativeTimeRange ${JSON.stringify(rt)}`);
    if (ds.type === 'loki') {
      at(`query ${q.refId}: Loki rules are not used by Step D (extend the lint before adding one)`);
      continue;
    }
    if (m.instant !== true) at(`query ${q.refId}: must be an instant query (instant: true)`);
    const { problems, metrics, clauseLabels } = analyzePromQL(m.expr);
    for (const p of problems) at(`query ${q.refId} (PromQL): ${p} in ${JSON.stringify(m.expr)}`);
    const clauseSet = new Set(clauseLabels);
    const usage = q.datasourceUid === ALERT_DS.usage.uid;
    const exprLabels = new Set();
    for (const { name, matcherLabels } of metrics) {
      if (usage) {
        if (!USAGE_METRICS.includes(name)) at(`query ${q.refId}: usage metric "${name}" is not in the allow-list ${USAGE_METRICS.join(', ')}`);
        continue;
      }
      let base = name;
      let spec = contract.get(name);
      let suffix = null;
      if (!spec) {
        const sm = name.match(/^(.*)_(bucket|sum|count)$/);
        if (sm && contract.get(sm[1])?.type === 'histogram') {
          base = sm[1];
          spec = contract.get(base);
          suffix = sm[2];
        }
      }
      if (!spec) {
        at(`query ${q.refId}: metric "${name}" is not in the telemetry contract`);
        continue;
      }
      if (suffix === null && spec.type === 'histogram') at(`query ${q.refId}: "${name}" is a histogram: use ${name}_bucket / _sum / _count`);
      allowedMetrics.add(base);
      for (const l of spec.labels) exprLabels.add(l);
      for (const l of matcherLabels) {
        if (FORBIDDEN_LABELS.test(l)) at(`query ${q.refId}: label "${l}" must never be used (anonymous, low-cardinality only)`);
        else if (!(spec.labels.has(l) || RESOURCE_LABELS.has(l))) at(`query ${q.refId}: label "${l}" is not a documented label of ${base}`);
      }
    }
    if (usage && !metrics.length) at(`query ${q.refId}: no metric referenced`);
    for (const l of clauseSet) {
      if (FORBIDDEN_LABELS.test(l)) at(`query ${q.refId}: label "${l}" must never be grouped on (anonymous, low-cardinality only)`);
      else if (l === 'le') continue;
      else if (!usage && !exprLabels.has(l)) at(`query ${q.refId}: by/on label "${l}" is not a documented label of the metrics in the expression`);
      else if (usage) at(`query ${q.refId}: usage queries must not group by labels (got "${l}")`);
      else {
        if (!QUERY_LABEL_KEYS.includes(l)) at(`query ${q.refId}: by/on label "${l}" is not an approved alert label`);
        byLabels.add(l);
      }
    }
  }
  if (!queries) at('no query in data[]');

  // area must exist (static or via by (area)); a static label may not shadow a by() label
  if (labels.area === undefined && !byLabels.has('area')) at('rule has no area: set labels.area or group the query by (area)');
  for (const k of Object.keys(labels)) {
    if (byLabels.has(k)) at(`static label "${k}" is also a by (...) label: pick one (the static one would override the query label)`);
  }

  // annotations
  const ann = rule.annotations && typeof rule.annotations === 'object' ? rule.annotations : {};
  for (const k of ['summary', 'description', 'runbook']) {
    if (typeof ann[k] !== 'string' || !ann[k].trim()) at(`annotations.${k} is required`);
  }
  if (typeof ann.runbook === 'string' && ann.runbook.trim()) {
    if (!/^What to do: \S/.test(ann.runbook)) at('annotations.runbook must start with "What to do:" followed by the first thing to check');
    if (/\n/.test(ann.runbook)) at('annotations.runbook must be ONE line');
    if (ann.runbook.length > 320) at(`annotations.runbook too long (${ann.runbook.length} chars, max 320)`);
  }
  if (typeof ann.summary === 'string' && ann.summary.length > 200) at(`annotations.summary too long (${ann.summary.length} chars, max 200)`);
  const known = new Set([...Object.keys(labels), ...byLabels]);
  for (const k of Object.keys(ann)) {
    for (const ref of labelRefs(ann[k])) {
      if (!known.has(ref)) at(`annotations.${k} uses {{ $labels.${ref} }} but the rule has no such label`);
    }
  }
  const extra = Object.keys(ann).filter((k) => !['summary', 'description', 'runbook'].includes(k));
  if (extra.length) at(`unexpected annotations: ${extra.join(', ')}`);
  return errors;
}

/**
 * Lint one alert file ({apiVersion:1, groups:[{name, folder, rules:[...]}]}).
 * @param {{file: string, doc: object, contract: Map}} args
 */
export function lintAlertFile({ file, doc, contract }) {
  const errors = [];
  const name = String(file).replace(/\.json$/, '');
  if (!TIER_FILES[name]) errors.push(`[${file}] unknown tier file (expected ${Object.keys(TIER_FILES).map((n) => `${n}.json`).join(', ')})`);
  if (!doc || typeof doc !== 'object') return [...errors, `[${file}] not a JSON object`];
  if (doc.apiVersion !== 1) errors.push(`[${file}] apiVersion must be 1`);
  if (!Array.isArray(doc.groups) || !doc.groups.length) return [...errors, `[${file}] no groups`];
  for (const g of doc.groups) {
    if (g.folder !== ALERT_FOLDER) errors.push(`[${file}] group "${g.name}": folder must be "${ALERT_FOLDER}" (the apply script resolves its uid)`);
    if (!Array.isArray(g.rules) || !g.rules.length) {
      errors.push(`[${file}] group "${g.name}": no rules`);
      continue;
    }
    for (const rule of g.rules) errors.push(...lintRule({ file, groupName: g.name, rule, contract }));
  }
  return errors;
}

/** Lint a whole set of {file, doc}: per-file rules + cross-file uniqueness of uid and title. */
export function lintAlerts(entries, { contract }) {
  const errors = [];
  const uids = new Map();
  const titles = new Map();
  for (const { file, doc } of entries) {
    errors.push(...lintAlertFile({ file, doc, contract }));
    for (const g of doc?.groups ?? []) {
      for (const r of g.rules ?? []) {
        if (uids.has(r.uid)) errors.push(`[${file}] duplicate rule uid ${r.uid} (also in ${uids.get(r.uid)})`);
        uids.set(r.uid, file);
        if (titles.has(r.title)) errors.push(`[${file}] duplicate rule title ${r.title} (also in ${titles.get(r.title)})`);
        titles.set(r.title, file);
      }
    }
  }
  return errors;
}
