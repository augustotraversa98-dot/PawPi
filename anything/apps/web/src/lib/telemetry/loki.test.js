import { describe, it, expect, vi } from 'vitest';
import { createLokiShipper, lokiConfigFromEnv, lokiPushUrl } from './loki.js';

const CONFIG = { url: 'https://logs.example.net/loki/api/v1/push', user: '12345', token: 'glc_secret' };
const ok = () => Promise.resolve({ ok: true, status: 204 });
const LABELS = { job: 'pawpi-client', event: 'screen_view', app_version: '1.4.2', platform: 'ios' };

function make(over = {}) {
  const calls = [];
  const fetchImpl = vi.fn((url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    return ok();
  });
  const shipper = createLokiShipper({ getConfig: () => CONFIG, fetchImpl, flushMs: 5, ...over });
  return { shipper, fetchImpl, calls };
}

describe('config', () => {
  it('push URL: with or without the suffix / trailing slash', () => {
    const want = 'https://logs-prod.grafana.net/loki/api/v1/push';
    for (const u of ['https://logs-prod.grafana.net', 'https://logs-prod.grafana.net/', want, want + '/'])
      expect(lokiPushUrl(u)).toBe(want);
  });

  it('is null unless ALL THREE env vars are set', () => {
    const all = { GRAFANA_LOKI_URL: 'https://l.example', GRAFANA_LOKI_USER: 'u', GRAFANA_LOKI_TOKEN: 't' };
    expect(lokiConfigFromEnv(all)).toEqual({ url: 'https://l.example/loki/api/v1/push', user: 'u', token: 't' });
    for (const k of Object.keys(all)) expect(lokiConfigFromEnv({ ...all, [k]: undefined }), k).toBeNull();
    expect(lokiConfigFromEnv({ ...all, GRAFANA_LOKI_TOKEN: '  ' })).toBeNull();
    expect(lokiConfigFromEnv({})).toBeNull();
  });
});

describe('createLokiShipper', () => {
  it('is a no-op without config: nothing queued, nothing sent, no timer', async () => {
    const fetchImpl = vi.fn(ok);
    const s = createLokiShipper({ getConfig: () => null, fetchImpl, flushMs: 1 });
    expect(s.push(LABELS, 'x')).toBe(false);
    await s.flush();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(s.stats().pending).toBe(0);
  });

  it('pushes to the Loki API with Basic auth and the streams/values shape', async () => {
    const { shipper, calls } = make();
    expect(shipper.push(LABELS, '{"a":1}')).toBe(true);
    await shipper.flush();
    expect(calls).toHaveLength(1);
    const { url, init, body } = calls[0];
    expect(url).toBe(CONFIG.url);
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Basic ' + Buffer.from('12345:glc_secret').toString('base64'));
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(body.streams).toHaveLength(1);
    expect(body.streams[0].stream).toEqual(LABELS);
    expect(body.streams[0].values).toHaveLength(1);
    const [ts, line] = body.streams[0].values[0];
    expect(ts).toMatch(/^\d{19}$/);
    expect(line).toBe('{"a":1}');
  });

  it('groups lines by label set into streams; timestamps strictly increase', async () => {
    const { shipper, calls } = make({ now: () => 1_700_000_000_000 });
    shipper.push(LABELS, 'a');
    shipper.push({ ...LABELS, event: 'tap' }, 'b');
    shipper.push(LABELS, 'c');
    await shipper.flush();
    const streams = calls[0].body.streams;
    expect(streams).toHaveLength(2);
    const first = streams.find((s) => s.stream.event === 'screen_view').values;
    expect(first.map((v) => v[1])).toEqual(['a', 'c']);
    expect(BigInt(first[1][0])).toBeGreaterThan(BigInt(first[0][0]));
  });

  it('batches: flushes immediately at maxBatch lines, otherwise on the timer', async () => {
    const { shipper, fetchImpl } = make({ maxBatch: 3, flushMs: 20 });
    shipper.push(LABELS, '1');
    shipper.push(LABELS, '2');
    expect(fetchImpl).not.toHaveBeenCalled();
    shipper.push(LABELS, '3'); // hits maxBatch
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    shipper.push(LABELS, '4');
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2)); // the timer
  });

  it('never sends more than maxBatch lines per request', async () => {
    const { shipper, calls } = make({ maxBatch: 4, flushMs: 5 });
    for (let i = 0; i < 10; i++) shipper.push(LABELS, String(i));
    await vi.waitFor(() => expect(calls.reduce((n, c) => n + c.body.streams[0].values.length, 0)).toBe(10));
    for (const c of calls) expect(c.body.streams.flatMap((s) => s.values).length).toBeLessThanOrEqual(4);
  });

  it('is memory-bounded: beyond maxQueue the OLDEST lines are dropped', async () => {
    const fetchImpl = vi.fn(() => new Promise(() => {})); // network hangs forever
    const s = createLokiShipper({ getConfig: () => CONFIG, fetchImpl, maxBatch: 1_000_000, maxQueue: 5, flushMs: 100_000 });
    for (let i = 0; i < 100; i++) s.push(LABELS, `line-${i}`);
    expect(s.stats().pending).toBe(5);
    expect(s.stats().dropped).toBe(95);
    s.reset();
  });

  it('a hung network cannot wedge the shipper (timeout) and never throws', async () => {
    const fetchImpl = vi.fn(() => new Promise(() => {}));
    const s = createLokiShipper({ getConfig: () => CONFIG, fetchImpl, timeoutMs: 10, flushMs: 100_000 });
    s.push(LABELS, 'x');
    await expect(s.flush()).resolves.toBeUndefined();
    expect(s.stats().failed).toBe(1);
    s.push(LABELS, 'y');
    await s.flush(); // not stuck in-flight
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('swallows every failure: rejecting fetch, non-2xx, throwing fetch, throwing config', async () => {
    for (const fetchImpl of [
      () => Promise.reject(new Error('ECONNRESET')),
      () => Promise.resolve({ ok: false, status: 401 }),
      () => { throw new Error('sync boom'); },
    ]) {
      const s = createLokiShipper({ getConfig: () => CONFIG, fetchImpl, flushMs: 100_000 });
      expect(s.push(LABELS, 'x')).toBe(true);
      await expect(s.flush()).resolves.toBeUndefined();
      expect(s.stats().failed).toBe(1);
      expect(s.stats().pending).toBe(0); // dropped, not retried forever
    }
    const bad = createLokiShipper({ getConfig: () => { throw new Error('env boom'); }, fetchImpl: ok });
    expect(bad.push(LABELS, 'x')).toBe(false);
    await expect(bad.flush()).resolves.toBeUndefined();
  });

  it('refuses unsafe labels and oversize lines instead of sending them', () => {
    const { shipper } = make();
    expect(shipper.push({ job: 'a b' }, 'x')).toBe(false);
    expect(shipper.push({ job: 'jane@example.com' }, 'x')).toBe(false);
    expect(shipper.push({ 'bad-name': 'x' }, 'x')).toBe(false);
    expect(shipper.push({ job: 'x'.repeat(100) }, 'x')).toBe(false);
    expect(shipper.push({}, 'x')).toBe(false);
    expect(shipper.push(null, 'x')).toBe(false);
    expect(shipper.push(LABELS, 'x'.repeat(10_000))).toBe(false);
    expect(shipper.push(LABELS, '')).toBe(false);
    expect(shipper.stats().pending).toBe(0);
    shipper.reset();
  });

  it('timers are unref\'d so they never hold the process open', () => {
    const spy = vi.spyOn(globalThis, 'setTimeout');
    const { shipper } = make({ flushMs: 100_000 });
    shipper.push(LABELS, 'x');
    const timer = spy.mock.results.at(-1).value;
    expect(timer.hasRef()).toBe(false);
    spy.mockRestore();
    shipper.reset();
  });
});
