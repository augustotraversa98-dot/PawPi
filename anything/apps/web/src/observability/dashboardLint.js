// Offline lint for the Grafana dashboards-as-code in /observability/grafana/dashboards (Step C).
//
// SINGLE SOURCE OF TRUTH for metric names is the telemetry contract markdown
// (docs/observability/night-run/01-TELEMETRY-CONTRACT.md): its tables are parsed by `parseContract`, so a dashboard can
// only chart a metric someone first documented there. Log queries may only read the two documented Loki streams.
//
// NOTE ON PromQL VALIDATION: there is no PromQL parser available offline in this repo (no promql-parser / lezer-promql
// in node_modules and no network in CI), so the syntax check is deliberately CONSERVATIVE rather than a full parser:
// balanced quotes/brackets, known function names, metric-name + matcher-label extraction against the contract. It
// catches typos, unknown metrics/labels and unbalanced expressions; it does not prove every expression type-checks
// (Grafana's own query editor / the first dry-run in Explore is the final word).
//
// Every error names the dashboard file, the panel (title + id) and the offender.

export const EXPECTED_DASHBOARDS = [
  'overview',
  'auth-onboarding',
  'pets-feed-social',
  'health-reminders',
  'services-bookings-providers',
  'payments-shop',
  'walks-messaging-forum',
  'mobile-client-health',
  'behaviour',
  'database-infra',
  'bottlenecks',
];

export const DS_PLACEHOLDERS = Object.freeze({
  prometheus: '${DS_PROMETHEUS}',
  loki: '${DS_LOKI}',
});
// Grafana's built-in annotation datasource (not a user datasource uid).
export const GRAFANA_BUILTIN_DS = Object.freeze({ type: 'grafana', uid: '-- Grafana --' });

export const LOKI_JOBS = ['pawpi-client', 'pawpi-web'];
// Labels that exist on the Loki streams (01-TELEMETRY-CONTRACT.md "Logs (Loki)"): everything else is a JSON field.
export const LOKI_STREAM_LABELS = ['job', 'event', 'app_version', 'platform'];

// Label names that must never appear in a PromQL expression (metrics are low-cardinality and anonymous).
const FORBIDDEN_METRIC_LABELS =
  /^(install_id|session_id|user_id|auth_user_id|account_id|email|device_id|idfa|idfv|pet_id|pet_name|handle|ip|ip_address|phone|address|text|token|request_id)$/;

// Resource labels the OTLP -> Prometheus pipeline adds to every series.
const RESOURCE_LABELS = new Set([
  'job', 'instance', 'service_name', 'service_version', 'service_instance_id', 'service_namespace',
  'deployment_environment', 'otel_scope_name', 'otel_scope_version',
]);

const PROMQL_FUNCTIONS = new Set([
  'rate', 'irate', 'increase', 'delta', 'idelta', 'deriv', 'resets', 'changes', 'predict_linear',
  'sum', 'avg', 'min', 'max', 'count', 'group', 'stddev', 'stdvar', 'topk', 'bottomk', 'quantile', 'count_values',
  'histogram_quantile', 'clamp', 'clamp_min', 'clamp_max', 'abs', 'ceil', 'floor', 'round', 'sqrt', 'exp', 'ln', 'log2', 'log10',
  'sort', 'sort_desc', 'label_replace', 'label_join', 'vector', 'scalar', 'time', 'timestamp', 'absent', 'absent_over_time',
  'sum_over_time', 'avg_over_time', 'min_over_time', 'max_over_time', 'count_over_time', 'quantile_over_time',
  'stddev_over_time', 'last_over_time', 'present_over_time', 'day_of_week', 'hour', 'minute', 'month', 'year',
]);
const PROMQL_KEYWORDS = new Set([
  'and', 'or', 'unless', 'bool', 'by', 'without', 'on', 'ignoring', 'group_left', 'group_right', 'offset', 'inf', 'nan',
]);
const PANEL_TYPES = new Set(['stat', 'timeseries', 'table', 'bargauge', 'piechart', 'logs', 'text', 'gauge', 'barchart', 'heatmap', 'row']);

// ---------------------------------------------------------------- contract
/**
 * Parse every `| pawpi_metric | type | labels |` row of the contract markdown.
 * @returns {Map<string, {type: string, labels: Set<string>}>}
 */
export function parseContract(markdown) {
  const out = new Map();
  for (const line of String(markdown).split('\n')) {
    const m = line.match(/^\|\s*(pawpi_[a-z0-9_]+)\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|/);
    if (!m) continue;
    const [, name, typeCol, labelCol] = m;
    const type = typeCol.trim().split(/\s+/)[0].toLowerCase();
    const labels = new Set();
    const cleaned = labelCol.replace(/\([^)]*\)/g, '');
    for (const l of cleaned.split(',')) {
      const t = l.trim();
      if (t && t !== '-') labels.add(t);
    }
    out.set(name, { type, labels });
  }
  return out;
}

// ---------------------------------------------------------------- expression helpers
/** Replace string literals by "" (keeping the text of each in `strings`). */
function stripStrings(expr) {
  let out = '';
  const strings = [];
  let i = 0;
  while (i < expr.length) {
    const c = expr[i];
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      let buf = '';
      while (j < expr.length && expr[j] !== c) {
        if (expr[j] === '\\' && c !== '`') {
          buf += expr[j] + (expr[j + 1] ?? '');
          j += 2;
          continue;
        }
        buf += expr[j];
        j += 1;
      }
      if (j >= expr.length) return { error: 'unterminated string literal' };
      strings.push(buf);
      out += '""';
      i = j + 1;
      continue;
    }
    out += c;
    i += 1;
  }
  return { text: out, strings };
}

function checkBalanced(text) {
  const pairs = { ')': '(', ']': '[', '}': '{' };
  const stack = [];
  for (const c of text) {
    if ('([{'.includes(c)) stack.push(c);
    else if (')]}'.includes(c)) {
      if (stack.pop() !== pairs[c]) return `unbalanced "${c}"`;
    }
  }
  return stack.length ? `unclosed "${stack[stack.length - 1]}"` : null;
}

const GRAFANA_VAR = /\$\{[^}]*\}|\$[A-Za-z_][A-Za-z0-9_]*|\[\[[A-Za-z_][A-Za-z0-9_]*\]\]/g;

/**
 * Conservative PromQL analysis.
 * @returns {{problems: string[], metrics: Array<{name: string, matcherLabels: string[]}>, clauseLabels: string[]}}
 */
export function analyzePromQL(expr) {
  const problems = [];
  const metrics = [];
  const clauseLabels = [];
  if (typeof expr !== 'string' || !expr.trim()) return { problems: ['empty expression'], metrics, clauseLabels };

  const s = stripStrings(expr);
  if (s.error) return { problems: [s.error], metrics, clauseLabels };
  let text = s.text.replace(GRAFANA_VAR, 'VAR');
  const bal = checkBalanced(text);
  if (bal) problems.push(bal);
  if (/[*/^%]\s*[*/^%]/.test(text) || /[*/+\-^%]\s*$/.test(text)) problems.push('dangling operator');
  if (/,\s*\)|\(\s*,/.test(text)) problems.push('empty argument');

  text = text.replace(/\boffset\s+-?\w+/g, ' ').replace(/\[[^\]]*\]/g, '[]');
  text = text.replace(/\b(by|without|on|ignoring|group_left|group_right)\s*\(([^)]*)\)/g, (_, kw, list) => {
    if (kw === 'by' || kw === 'without' || kw === 'on' || kw === 'ignoring') {
      for (const l of list.split(',')) if (l.trim()) clauseLabels.push(l.trim());
    }
    return ' ';
  });
  text = text.replace(/(?<![A-Za-z0-9_:.])\d+(?:\.\d+)?(?:[eE][+-]?\d+)?(?![A-Za-z0-9_:])/g, '0');

  let rest = '';
  let last = 0;
  const re = /([A-Za-z_:][A-Za-z0-9_:]*)(\s*\{([^{}]*)\})?(\s*\()?/g;
  let m;
  while ((m = re.exec(text))) {
    rest += text.slice(last, m.index);
    last = re.lastIndex;
    const [, name, , matchers, paren] = m;
    if (name === 'VAR') {
      rest += ' ';
      continue;
    }
    if (paren) {
      if (PROMQL_KEYWORDS.has(name.toLowerCase())) {
        rest += '(';
        continue;
      }
      if (!PROMQL_FUNCTIONS.has(name)) problems.push(`unknown function "${name}"`);
      rest += '(';
      continue;
    }
    if (PROMQL_KEYWORDS.has(name.toLowerCase())) {
      rest += ' ';
      continue;
    }
    const matcherLabels = [];
    if (matchers) {
      for (const lm of matchers.matchAll(/([A-Za-z_][A-Za-z0-9_]*)\s*(?:=~|!=|!~|=)/g)) matcherLabels.push(lm[1]);
    }
    metrics.push({ name, matcherLabels });
    rest += ' ';
  }
  rest += text.slice(last);
  if (/[{}]/.test(rest.replace(/\{\s*\}/g, ''))) problems.push('selector without a metric name');
  if (!metrics.length && !/\bvector\s*\(|\btime\s*\(/.test(text)) problems.push('no metric referenced');
  return { problems, metrics, clauseLabels };
}

/** Split `label_values(<expr>, label)` into its PromQL expression; null if not that shape. */
function labelValuesExpr(q) {
  const m = String(q).trim().match(/^label_values\(([\s\S]*),\s*[A-Za-z_][A-Za-z0-9_]*\s*\)$/);
  return m ? m[1] : null;
}

/** Capture `{...}` selectors outside string literals. */
function lokiSelectors(expr) {
  const sels = [];
  let quote = null;
  let depth = 0;
  let start = -1;
  for (let i = 0; i < expr.length; i++) {
    const c = expr[i];
    if (quote) {
      if (c === '\\' && quote !== '`') i += 1;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      quote = c;
      continue;
    }
    if (c === '{') {
      if (depth === 0) start = i;
      depth += 1;
    } else if (c === '}' && depth > 0) {
      depth -= 1;
      if (depth === 0) sels.push(expr.slice(start + 1, i));
    }
  }
  return sels;
}

export function analyzeLogQL(expr, { eventNames = null } = {}) {
  const problems = [];
  if (typeof expr !== 'string' || !expr.trim()) return ['empty expression'];
  const s = stripStrings(expr);
  if (s.error) return [s.error];
  const bal = checkBalanced(s.text.replace(GRAFANA_VAR, 'VAR'));
  if (bal) problems.push(bal);
  const sels = lokiSelectors(expr);
  if (!sels.length) problems.push('no stream selector');
  for (const sel of sels) {
    const matchers = [...sel.matchAll(/([A-Za-z_][A-Za-z0-9_]*)\s*(=~|!=|!~|=)\s*"((?:[^"\\]|\\.)*)"/g)];
    const jobs = matchers.filter((x) => x[1] === 'job');
    if (jobs.length !== 1 || jobs[0][2] !== '=' || !LOKI_JOBS.includes(jobs[0][3])) {
      problems.push(`selector {${sel}} must have exactly one job="pawpi-client"|"pawpi-web"`);
    }
    for (const [, label, op, value] of matchers) {
      if (!LOKI_STREAM_LABELS.includes(label)) problems.push(`label "${label}" is not a Loki stream label (use | json)`);
      if (label === 'event' && eventNames && (op === '=' || op === '=~')) {
        for (const ev of value.split('|')) {
          if (!eventNames.includes(ev) && !/[.*+?[\]()$]/.test(ev)) problems.push(`unknown event "${ev}"`);
        }
      }
    }
  }
  return problems;
}

// ---------------------------------------------------------------- dashboard walk
function* walkPanels(panels = [], parent = null) {
  for (const p of panels) {
    yield { panel: p, parent };
    if (Array.isArray(p.panels) && p.panels.length) yield* walkPanels(p.panels, p);
  }
}

function* walkDatasourceRefs(node, trail = '') {
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) yield* walkDatasourceRefs(node[i], `${trail}[${i}]`);
  } else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (k === 'datasource') yield { ref: v, trail: `${trail}.${k}` };
      else yield* walkDatasourceRefs(v, `${trail}.${k}`);
    }
  }
}

function dsAllowed(ref) {
  if (!ref || typeof ref !== 'object') return false;
  if (ref.type === 'prometheus' && ref.uid === DS_PLACEHOLDERS.prometheus) return true;
  if (ref.type === 'loki' && ref.uid === DS_PLACEHOLDERS.loki) return true;
  return ref.type === GRAFANA_BUILTIN_DS.type && ref.uid === GRAFANA_BUILTIN_DS.uid;
}

/**
 * Lint one dashboard. Returns a list of human-readable errors (empty = clean).
 * @param {{file: string, dashboard: object, contract: Map, eventNames?: string[]}} args
 *   `file` is the file name WITHOUT directory, e.g. "overview.json".
 */
export function lintDashboard({ file, dashboard, contract, eventNames = null }) {
  const errors = [];
  const name = String(file).replace(/\.json$/, '');
  const at = (panel, msg) =>
    errors.push(panel ? `[${file}] panel "${panel.title ?? '(untitled)'}" (id ${panel.id}): ${msg}` : `[${file}] ${msg}`);

  if (!dashboard || typeof dashboard !== 'object') {
    at(null, 'not a JSON object');
    return errors;
  }
  if (dashboard.uid !== `pawpi-${name}`) at(null, `uid "${dashboard.uid}" must equal "pawpi-${name}" (pawpi- + file name)`);
  if (typeof dashboard.uid === 'string' && dashboard.uid.length > 40) at(null, 'uid longer than 40 characters');
  if (!dashboard.title || typeof dashboard.title !== 'string') at(null, 'missing title');
  if (dashboard.schemaVersion !== 39) at(null, `schemaVersion must be 39 (got ${dashboard.schemaVersion})`);
  if (dashboard.editable !== true) at(null, 'editable must be true');
  if (!Array.isArray(dashboard.tags) || !dashboard.tags.includes('pawpi')) at(null, 'tags must include "pawpi"');
  if (!dashboard.time || !dashboard.time.from || !dashboard.time.to) at(null, 'missing time range');
  if (typeof dashboard.refresh !== 'string') at(null, 'missing refresh');
  if ('id' in dashboard && dashboard.id !== null) at(null, 'id must be omitted/null (Grafana assigns it)');
  if (!Array.isArray(dashboard.panels) || !dashboard.panels.length) at(null, 'no panels');

  // datasources: only the two placeholders (plus Grafana's built-in annotation source)
  for (const { ref, trail } of walkDatasourceRefs(dashboard)) {
    if (!dsAllowed(ref)) {
      errors.push(`[${file}] hard-coded or invalid datasource at ${trail}: ${JSON.stringify(ref)} (use "\${DS_PROMETHEUS}" / "\${DS_LOKI}")`);
    }
  }

  // overview must carry the deploy annotation query
  if (name === 'overview') {
    const hasDeploy = (dashboard.annotations?.list ?? []).some((a) => a?.target?.type === 'tags' && a.target.tags?.includes('deploy'));
    if (!hasDeploy) at(null, 'missing annotation query for Grafana annotations tagged "deploy"');
  }

  // panels
  const ids = new Map();
  const grid = [];
  for (const { panel, parent } of walkPanels(dashboard.panels ?? [])) {
    if (!Number.isInteger(panel.id) || panel.id <= 0) at(panel, 'id must be a positive integer');
    else if (ids.has(panel.id)) at(panel, `duplicate panel id ${panel.id} (also "${ids.get(panel.id)}")`);
    else ids.set(panel.id, panel.title);
    if (!panel.title || typeof panel.title !== 'string' || !panel.title.trim()) at(panel, 'missing title');
    if (!PANEL_TYPES.has(panel.type)) at(panel, `unsupported panel type "${panel.type}"`);
    if (panel.type === 'row' && !parent) continue; // a top-level row is only a separator; its children are checked
    const d = panel.description;
    if (typeof d !== 'string' || !d.trim()) at(panel, 'missing description (say what a bad value means and what to do)');
    else if (/\n/.test(d)) at(panel, 'description must be ONE line');
    else if (d.length > 320) at(panel, `description too long (${d.length} chars, max 320)`);
    if (panel.type === 'row') continue;

    const g = panel.gridPos;
    if (!g || ![g.x, g.y, g.w, g.h].every(Number.isInteger) || g.w < 1 || g.h < 1 || g.x < 0 || g.x + g.w > 24) {
      at(panel, `invalid gridPos ${JSON.stringify(g)}`);
    } else {
      for (const o of grid) {
        if (g.x < o.g.x + o.g.w && o.g.x < g.x + g.w && g.y < o.g.y + o.g.h && o.g.y < g.y + g.h) at(panel, `overlaps panel "${o.title}"`);
      }
      grid.push({ g, title: panel.title });
    }
    if (panel.type === 'text') continue;

    if (!dsAllowed(panel.datasource)) at(panel, `panel datasource must be a placeholder (got ${JSON.stringify(panel.datasource)})`);
    if (!Array.isArray(panel.targets) || !panel.targets.length) {
      at(panel, 'no targets');
      continue;
    }
    const refIds = new Set();
    for (const t of panel.targets) {
      if (!t.refId || refIds.has(t.refId)) at(panel, `missing/duplicate refId "${t.refId}"`);
      refIds.add(t.refId);
      if (!dsAllowed(t.datasource)) at(panel, `target ${t.refId} datasource must be a placeholder`);
      lintExpr({ panel, target: t, contract, eventNames, at });
    }
  }

  // template variables
  for (const v of dashboard.templating?.list ?? []) {
    if (v.type !== 'query') continue;
    if (!dsAllowed(v.datasource)) errors.push(`[${file}] variable "${v.name}": datasource must be a placeholder`);
    const q = typeof v.query === 'string' ? v.query : v.query?.query;
    const inner = labelValuesExpr(q);
    if (inner === null) {
      errors.push(`[${file}] variable "${v.name}": query must be label_values(<expr>, <label>) (got ${JSON.stringify(q)})`);
      continue;
    }
    const pseudo = { title: `variable ${v.name}`, id: '-' };
    lintExpr({ panel: pseudo, target: { expr: inner, datasource: v.datasource, refId: 'var' }, contract, eventNames, at });
  }
  return errors;
}

function lintExpr({ panel, target, contract, eventNames, at }) {
  const expr = target.expr;
  const type = target.datasource?.type;
  if (type === 'loki') {
    for (const p of analyzeLogQL(expr, { eventNames })) at(panel, `target ${target.refId} (LogQL): ${p} in ${JSON.stringify(expr)}`);
    return;
  }
  const { problems, metrics, clauseLabels } = analyzePromQL(expr);
  for (const p of problems) at(panel, `target ${target.refId} (PromQL): ${p} in ${JSON.stringify(expr)}`);
  for (const l of clauseLabels) {
    if (FORBIDDEN_METRIC_LABELS.test(l)) at(panel, `target ${target.refId}: label "${l}" must never be a metric label (anonymous, low-cardinality only)`);
  }
  if (typeof target.legendFormat === 'string') {
    for (const lm of target.legendFormat.matchAll(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g)) {
      if (FORBIDDEN_METRIC_LABELS.test(lm[1])) at(panel, `target ${target.refId}: legendFormat uses forbidden label "${lm[1]}"`);
    }
  }
  for (const { name, matcherLabels } of metrics) {
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
      at(panel, `metric "${name}" is not in the telemetry contract`);
      continue;
    }
    if (suffix === null && spec.type === 'histogram') {
      at(panel, `metric "${name}" is a histogram: use ${name}_bucket / _sum / _count`);
    }
    for (const l of matcherLabels) {
      if (FORBIDDEN_METRIC_LABELS.test(l)) {
        at(panel, `target ${target.refId}: label "${l}" must never be a metric label (anonymous, low-cardinality only)`);
      } else if (!(spec.labels.has(l) || RESOURCE_LABELS.has(l) || (l === 'le' && suffix === 'bucket'))) {
        at(panel, `label "${l}" is not a documented label of ${base} (contract: ${[...spec.labels].join(', ') || 'none'})`);
      }
    }
  }
}

/** Convenience for the test + tooling: lint a whole set of {file, dashboard}. */
export function lintAll(entries, { contract, eventNames }) {
  const errors = [];
  const uids = new Set();
  for (const { file, dashboard } of entries) {
    errors.push(...lintDashboard({ file, dashboard, contract, eventNames }));
    if (dashboard?.uid) {
      if (uids.has(dashboard.uid)) errors.push(`[${file}] duplicate dashboard uid ${dashboard.uid}`);
      uids.add(dashboard.uid);
    }
  }
  return errors;
}
