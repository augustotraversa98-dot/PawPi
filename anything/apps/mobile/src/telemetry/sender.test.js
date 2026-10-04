import { createSender } from './sender';

const ENVELOPE = { install_id: '00000000-0000-4000-8000-000000000001', events: [] };

function sender(fetchImpl, extra = {}) {
  return createSender({
    getFetch: () => fetchImpl,
    getBaseUrl: () => 'https://api.test',
    setTimer: () => 1,
    clearTimer: () => {},
    ...extra,
  });
}

describe('sender', () => {
  it('POSTs JSON to /api/telemetry/events with NO Authorization (or any identity) header and no cookies', async () => {
    const calls = [];
    const s = sender(async (url, init) => {
      calls.push({ url, init });
      return { status: 204 };
    });
    expect(await s.post(ENVELOPE)).toBe('ok');
    expect(calls).toHaveLength(1);
    const { url, init } = calls[0];
    expect(url).toBe('https://api.test/api/telemetry/events');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('omit');
    expect(JSON.parse(init.body)).toEqual(ENVELOPE);
    expect(Object.keys(init.headers).map((k) => k.toLowerCase())).toEqual(['content-type']);
    expect(JSON.stringify(init).toLowerCase()).not.toMatch(/authorization|bearer|cookie|x-createxyz/);
  });

  it('maps outcomes: 2xx ok; 429/5xx/network retry; other 4xx drop', async () => {
    const run = (status) => sender(async () => ({ status })).post(ENVELOPE);
    expect(await run(204)).toBe('ok');
    expect(await run(200)).toBe('ok');
    expect(await run(429)).toBe('retry');
    expect(await run(500)).toBe('retry');
    expect(await run(503)).toBe('retry');
    expect(await run(400)).toBe('drop');
    expect(await run(413)).toBe('drop');
    const offline = sender(async () => {
      throw new Error('offline');
    });
    expect(await offline.post(ENVELOPE)).toBe('retry');
  });

  it('no base URL or no raw fetch available: nothing is sent and nothing throws', async () => {
    let called = false;
    const noBase = createSender({ getFetch: () => async () => (called = true), getBaseUrl: () => undefined });
    expect(await noBase.post(ENVELOPE)).toBe('drop');
    const noFetch = createSender({ getFetch: () => null, getBaseUrl: () => 'https://api.test' });
    expect(await noFetch.post(ENVELOPE)).toBe('drop');
    expect(called).toBe(false);
    expect(await noFetch.getConfig()).toBeNull();
  });

  it('aborts a request that hangs (timeout timer fires the abort)', async () => {
    let fire;
    let aborted = false;
    const s = createSender({
      getFetch: () => (url, init) =>
        new Promise((resolve, reject) => {
          init.signal.addEventListener('abort', () => {
            aborted = true;
            reject(new Error('Aborted'));
          });
        }),
      getBaseUrl: () => 'https://api.test',
      setTimer: (fn) => {
        fire = fn;
        return 7;
      },
      clearTimer: () => {},
    });
    const pending = s.post(ENVELOPE);
    fire();
    expect(await pending).toBe('retry');
    expect(aborted).toBe(true);
  });

  it('getConfig: parses { enabled, sampleRate }, clamps, and returns null on anything else (fail closed)', async () => {
    const cfg = (res) => sender(async () => res).getConfig();
    expect(await cfg({ status: 200, json: async () => ({ enabled: true, sampleRate: 0.25 }) })).toEqual({ enabled: true, sampleRate: 0.25 });
    expect(await cfg({ status: 200, json: async () => ({ enabled: false, sampleRate: 1 }) })).toEqual({ enabled: false, sampleRate: 1 });
    expect(await cfg({ status: 200, json: async () => ({ enabled: true, sampleRate: 7 }) })).toEqual({ enabled: true, sampleRate: 1 });
    expect(await cfg({ status: 200, json: async () => ({ enabled: true }) })).toEqual({ enabled: true, sampleRate: 1 });
    expect(await cfg({ status: 200, json: async () => ({ enabled: 'yes' }) })).toBeNull();
    expect(await cfg({ status: 200, json: async () => null })).toBeNull();
    expect(await cfg({ status: 200, json: async () => Promise.reject(new Error('bad json')) })).toBeNull();
    expect(await cfg({ status: 500, json: async () => ({ enabled: true }) })).toBeNull();
    const offline = sender(async () => {
      throw new Error('offline');
    });
    expect(await offline.getConfig()).toBeNull();
  });

  it('the config GET carries no headers at all and omits credentials', async () => {
    const calls = [];
    const s = sender(async (url, init) => {
      calls.push({ url, init });
      return { status: 200, json: async () => ({ enabled: true, sampleRate: 1 }) };
    });
    await s.getConfig();
    expect(calls[0].url).toBe('https://api.test/api/telemetry/config');
    expect(calls[0].init.headers).toBeUndefined();
    expect(calls[0].init.credentials).toBe('omit');
  });
});
