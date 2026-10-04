// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest';
import { planDeployAnnotation, postDeployAnnotation, scheduleDeployAnnotation } from './deployAnnotation.js';

const SHA = '6cabd02f1e3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c';
const ENV = { RAILWAY_GIT_COMMIT_SHA: SHA, GRAFANA_URL: 'https://pawpi.grafana.net', GRAFANA_ANNOTATION_TOKEN: 'glsa_annot' };
const okFetch = () => vi.fn(() => Promise.resolve({ ok: true, status: 200 }));

afterEach(() => vi.useRealTimers());

describe('planDeployAnnotation', () => {
  it('builds an org-wide annotation: tags deploy + pawpi + short sha, version in the text, no dashboardUID/panelId', () => {
    const p = planDeployAnnotation(ENV, 1_700_000_000_000);
    expect(p.url).toBe('https://pawpi.grafana.net/api/annotations');
    expect(p.tags).toEqual(['deploy', 'pawpi', '6cabd02']);
    expect(p.text).toContain('6cabd02');
    expect(p.text).toContain('pawpi-web');
    expect(p.time).toBe(1_700_000_000_000);
  });

  it('prefers GRAFANA_ANNOTATION_TOKEN and falls back to GRAFANA_SA_TOKEN', () => {
    expect(planDeployAnnotation({ ...ENV, GRAFANA_SA_TOKEN: 'glsa_sa' }).token).toBe('glsa_annot');
    const { GRAFANA_ANNOTATION_TOKEN, ...noAnnot } = ENV;
    expect(planDeployAnnotation({ ...noAnnot, GRAFANA_SA_TOKEN: 'glsa_sa' }).token).toBe('glsa_sa');
  });

  it.each([
    ['nothing set (dev / CI / tests)', {}, 'no-commit'],
    ['no commit sha and no flag', { GRAFANA_URL: ENV.GRAFANA_URL, GRAFANA_ANNOTATION_TOKEN: 't' }, 'no-commit'],
    ['sha but no Grafana URL', { RAILWAY_GIT_COMMIT_SHA: SHA, GRAFANA_ANNOTATION_TOKEN: 't' }, 'no-grafana'],
    ['sha + URL but no token', { RAILWAY_GIT_COMMIT_SHA: SHA, GRAFANA_URL: ENV.GRAFANA_URL }, 'no-grafana'],
    ['kill switch', { ...ENV, GRAFANA_ANNOTATE_DEPLOY: 'false' }, 'disabled'],
    ['NODE_ENV=test', { ...ENV, NODE_ENV: 'test' }, 'test'],
    ['bad URL', { ...ENV, GRAFANA_URL: 'not a url' }, 'bad-url'],
    ['non-http URL', { ...ENV, GRAFANA_URL: 'file:///etc/passwd' }, 'bad-url'],
    ['sha with junk characters', { ...ENV, RAILWAY_GIT_COMMIT_SHA: '../../x' }, 'bad-sha'],
  ])('skips: %s', (_n, env, reason) => {
    expect(planDeployAnnotation(env)).toEqual({ skip: reason });
  });

  it('explicit flag GRAFANA_ANNOTATE_DEPLOY=true works without a sha (version "dev")', () => {
    const p = planDeployAnnotation({ GRAFANA_URL: ENV.GRAFANA_URL, GRAFANA_ANNOTATION_TOKEN: 't', GRAFANA_ANNOTATE_DEPLOY: 'true' });
    expect(p.tags).toEqual(['deploy', 'pawpi', 'dev']);
  });

  it('tolerates a trailing slash and a sub-path in GRAFANA_URL', () => {
    expect(planDeployAnnotation({ ...ENV, GRAFANA_URL: 'https://x.grafana.net/' }).url).toBe('https://x.grafana.net/api/annotations');
    expect(planDeployAnnotation({ ...ENV, GRAFANA_URL: 'https://x.example.com/grafana/' }).url).toBe('https://x.example.com/grafana/api/annotations');
  });
});

describe('postDeployAnnotation', () => {
  it('POSTs once with Bearer auth and a JSON body {time,tags,text} only', async () => {
    const fetchImpl = okFetch();
    const r = await postDeployAnnotation({ env: ENV, fetchImpl, now: () => 1_700_000_000_000 });
    expect(r).toEqual({ posted: true, status: 200 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://pawpi.grafana.net/api/annotations');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer glsa_annot');
    const body = JSON.parse(init.body);
    expect(Object.keys(body).sort()).toEqual(['tags', 'text', 'time']);
    expect(body.tags).toEqual(['deploy', 'pawpi', '6cabd02']);
    expect(body).not.toHaveProperty('dashboardUID');
    expect(init.body).not.toContain('glsa_annot');
  });

  it('is a no-op (fetch never called) without the env', async () => {
    const fetchImpl = okFetch();
    for (const env of [{}, { GRAFANA_URL: ENV.GRAFANA_URL }, { RAILWAY_GIT_COMMIT_SHA: SHA }, { ...ENV, GRAFANA_ANNOTATE_DEPLOY: 'false' }]) {
      expect((await postDeployAnnotation({ env, fetchImpl })).posted).toBe(false);
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('never rejects: network error, HTTP error, and a throwing fetch all resolve to posted:false', async () => {
    expect(await postDeployAnnotation({ env: ENV, fetchImpl: () => Promise.reject(new Error('ECONNRESET')) })).toEqual({ posted: false, reason: 'error' });
    expect(await postDeployAnnotation({ env: ENV, fetchImpl: () => { throw new Error('sync boom'); } })).toEqual({ posted: false, reason: 'error' });
    expect(await postDeployAnnotation({ env: ENV, fetchImpl: () => Promise.resolve({ ok: false, status: 401 }) })).toEqual({ posted: false, reason: 'rejected', status: 401 });
  });

  it('times out even when fetch ignores the abort signal', async () => {
    vi.useFakeTimers();
    const p = postDeployAnnotation({ env: ENV, fetchImpl: () => new Promise(() => {}), timeoutMs: 100 });
    await vi.advanceTimersByTimeAsync(150);
    expect(await p).toEqual({ posted: false, reason: 'error' });
  });
});

describe('scheduleDeployAnnotation (boot path)', () => {
  it('schedules nothing at all when the env is not set (dev/CI/tests)', () => {
    const fetchImpl = okFetch();
    expect(scheduleDeployAnnotation({ env: {}, fetchImpl })).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('posts after the delay, not synchronously, and logs one short line without secrets', async () => {
    vi.useFakeTimers();
    const fetchImpl = okFetch();
    const log = vi.fn();
    const t = scheduleDeployAnnotation({ env: ENV, fetchImpl, delayMs: 3000, log });
    expect(t).not.toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled(); // boot path does not wait for or run it
    await vi.advanceTimersByTimeAsync(3001);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith('[deploy-annotation] posted (HTTP 200)');
    expect(JSON.stringify(log.mock.calls)).not.toContain('glsa_annot');
  });

  it('a failing post and a throwing logger are both swallowed', async () => {
    vi.useFakeTimers();
    const log = vi.fn(() => { throw new Error('logger down'); });
    scheduleDeployAnnotation({ env: ENV, fetchImpl: () => Promise.reject(new Error('x')), delayMs: 1, log });
    await vi.advanceTimersByTimeAsync(10);
    expect(log).toHaveBeenCalled(); // no unhandled rejection => the test would fail
  });
});
