// Deploy marker (night-run Step E): at server start post ONE Grafana annotation tagged ["deploy","pawpi",<short sha>] so every
// dashboard that has the built-in "deploy" annotation query (pawpi-overview does) shows a vertical line per deploy.
//
// Best-effort and invisible to the app: it only runs when BOTH
//   * the deploy is identifiable: RAILWAY_GIT_COMMIT_SHA is set (Railway sets it; dev/CI/tests never do) OR the explicit flag
//     GRAFANA_ANNOTATE_DEPLOY=true is set, AND
//   * Grafana is configured: GRAFANA_URL + a token (GRAFANA_ANNOTATION_TOKEN preferred, GRAFANA_SA_TOKEN as fallback).
// GRAFANA_ANNOTATE_DEPLOY=false is a kill switch. `dashboardUID` is deliberately omitted so the annotation is org-wide.
// Never throws, never rejects, short timeout (also enforced with a race for fetches that ignore abort), the token is never
// logged, the result carries no secrets. Called from __create/index.ts without await, after a short delay.

const SHA_RE = /^[A-Za-z0-9]{1,40}$/;
const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_DELAY_MS = 3000;

/** Plan the annotation from env: `{ url, token, tags, text, version }` or `{ skip: reason }`. Pure. */
export function planDeployAnnotation(env = process.env, nowMs = Date.now()) {
  const flag = String(env.GRAFANA_ANNOTATE_DEPLOY ?? '').trim().toLowerCase();
  if (flag === 'false') return { skip: 'disabled' };
  if (env.NODE_ENV === 'test') return { skip: 'test' };

  const rawSha = String(env.RAILWAY_GIT_COMMIT_SHA ?? '').trim();
  if (!rawSha && flag !== 'true') return { skip: 'no-commit' };

  const base = String(env.GRAFANA_URL ?? '').trim().replace(/\/+$/, '');
  const token = String(env.GRAFANA_ANNOTATION_TOKEN || env.GRAFANA_SA_TOKEN || '').trim();
  if (!base || !token) return { skip: 'no-grafana' };
  let url;
  try {
    const u = new URL(base);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return { skip: 'bad-url' };
    url = `${u.origin}${u.pathname.replace(/\/+$/, '')}/api/annotations`;
  } catch {
    return { skip: 'bad-url' };
  }

  const version = rawSha ? rawSha.slice(0, 7) : 'dev';
  if (!SHA_RE.test(version)) return { skip: 'bad-sha' };
  const envName = String(env.RAILWAY_ENVIRONMENT_NAME || 'production').replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 30) || 'production';
  return {
    url,
    token,
    version,
    tags: ['deploy', 'pawpi', version],
    text: `Deploy pawpi-web ${version} (service.version ${version}, ${envName})`,
    time: nowMs,
  };
}

/**
 * Post the annotation. Resolves to `{ posted: boolean, reason?: string, status?: number }`; never rejects.
 * @param {object} [opts]
 * @param {object} [opts.env]
 * @param {typeof fetch} [opts.fetchImpl]
 * @param {number} [opts.timeoutMs]
 * @param {() => number} [opts.now]
 */
export async function postDeployAnnotation({
  env = process.env,
  fetchImpl = (...a) => globalThis.fetch(...a),
  timeoutMs = DEFAULT_TIMEOUT_MS,
  now = Date.now,
} = {}) {
  let timer;
  try {
    const plan = planDeployAnnotation(env, now());
    if (plan.skip) return { posted: false, reason: plan.skip };

    const ctrl = new AbortController();
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => {
        ctrl.abort();
        reject(new Error('timeout'));
      }, timeoutMs);
      timer.unref?.();
    });
    const res = await Promise.race([
      fetchImpl(plan.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${plan.token}` },
        body: JSON.stringify({ time: plan.time, tags: plan.tags, text: plan.text }),
        signal: ctrl.signal,
      }),
      deadline,
    ]);
    const status = Number(res?.status) || 0;
    if (res && res.ok === false) return { posted: false, reason: 'rejected', status };
    return { posted: true, status };
  } catch {
    return { posted: false, reason: 'error' };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Fire-and-forget entry point for server start: schedules the post on an unref'd timer so it never delays boot or keeps the
 * process alive, and prints at most one short line (status only) when it actually tried. Returns the timer (or null).
 */
export function scheduleDeployAnnotation({
  delayMs = DEFAULT_DELAY_MS,
  log = (m) => console.log(m),
  ...opts
} = {}) {
  try {
    const env = opts.env ?? process.env;
    if (planDeployAnnotation(env).skip) return null; // dev / CI / tests / unconfigured: nothing scheduled at all
    const t = setTimeout(() => {
      postDeployAnnotation(opts)
        .then((r) => {
          try {
            log(r.posted ? `[deploy-annotation] posted (HTTP ${r.status})` : `[deploy-annotation] not posted (${r.reason}${r.status ? ` HTTP ${r.status}` : ''})`);
          } catch {
            /* ignore */
          }
        })
        .catch(() => {});
    }, delayMs);
    t.unref?.();
    return t;
  } catch {
    return null;
  }
}
