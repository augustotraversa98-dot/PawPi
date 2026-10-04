import { recordApiCall, __resetApiTelemetryForTests, NETWORK_ERROR_GAP_MS } from './apiTelemetry';
import { __setTelemetryForTests } from './runtime';
import { setCurrentScreen } from './screenState';

const BASE = 'https://pawpi.example';

function fakeTelemetry() {
  const events = [];
  return { events, track: (name, props) => events.push({ name, props }) };
}

describe('recordApiCall', () => {
  let t;
  beforeEach(() => {
    t = fakeTelemetry();
    __setTelemetryForTests(t);
    __resetApiTelemetryForTests();
    setCurrentScreen('/health');
  });
  afterEach(() => __setTelemetryForTests(null));

  it('records api_call for a 200 and nothing else', () => {
    recordApiCall({ url: '/api/pets', status: 200, startedAt: 1000, now: 1200, baseUrl: BASE });
    expect(t.events).toEqual([
      { name: 'api_call', props: { area: 'pets', route: '/api/pets', status_class: '2xx', ms_bucket: 'lt300' } },
    ]);
  });

  it('a 5xx also records error{kind:api, code:<status>} on the current screen', () => {
    recordApiCall({ url: '/api/posts', status: 503, startedAt: 0, now: 50, baseUrl: BASE });
    expect(t.events.map((e) => e.name)).toEqual(['api_call', 'error']);
    expect(t.events[1].props).toEqual({ kind: 'api', screen: '/health', code: '503' });
  });

  it('a 4xx is only an api_call (expected flows like 401/404 are not errors)', () => {
    recordApiCall({ url: '/api/pets', status: 404, startedAt: 0, now: 50, baseUrl: BASE });
    expect(t.events.map((e) => e.name)).toEqual(['api_call']);
  });

  it('a network failure records api_call(unknown) + error{kind:network, code:<error name>}, rate limited', () => {
    const err = new TypeError('Network request failed');
    recordApiCall({ url: '/api/pets', status: null, startedAt: 0, now: 10, error: err, baseUrl: BASE });
    recordApiCall({ url: '/api/pets', status: null, startedAt: 0, now: 20, error: err, baseUrl: BASE });
    expect(t.events.filter((e) => e.name === 'api_call')).toHaveLength(2);
    const errors = t.events.filter((e) => e.name === 'error');
    expect(errors).toHaveLength(1);
    expect(errors[0].props).toEqual({ kind: 'network', screen: '/health', code: 'TypeError' });
    recordApiCall({ url: '/api/pets', status: null, startedAt: 0, now: 20 + NETWORK_ERROR_GAP_MS, error: err, baseUrl: BASE });
    expect(t.events.filter((e) => e.name === 'error')).toHaveLength(2);
  });

  it('SKIPS /api/telemetry/* (no feedback loop) and non-API urls', () => {
    recordApiCall({ url: '/api/telemetry/events', status: 500, startedAt: 0, now: 5, baseUrl: BASE });
    recordApiCall({ url: `${BASE}/api/telemetry/config`, status: null, startedAt: 0, now: 5, baseUrl: BASE });
    recordApiCall({ url: 'https://example.com/a', status: 200, startedAt: 0, now: 5, baseUrl: BASE });
    expect(t.events).toEqual([]);
  });

  it('never throws, even when telemetry itself explodes', () => {
    __setTelemetryForTests({
      track() {
        throw new Error('boom');
      },
    });
    expect(() => recordApiCall({ url: '/api/pets', status: 200, startedAt: 0, now: 5, baseUrl: BASE })).not.toThrow();
    expect(() => recordApiCall(undefined)).not.toThrow();
  });
});
