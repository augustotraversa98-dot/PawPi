// Test helpers for the telemetry unit tests (NOT imported by app code). No jest APIs, no react-native: manual
// clock + timers (so no real timer exists), in-memory stores and a recording fake fetch.

import { createTelemetry } from './client';
import { createInstallIdStore } from './installId';
import { createPrefStore } from './telemetryPref';
import { createSender } from './sender';

export async function flushPromises(n = 60) {
  for (let i = 0; i < n; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve();
  }
}

/** Manual clock: setTimer/clearTimer never use real timers; advance(ms) runs due callbacks in order. */
export function makeClock(start = 1_000_000) {
  let t = start;
  let seq = 0;
  let timers = [];
  return {
    now: () => t,
    setTimer(fn, ms) {
      seq += 1;
      timers.push({ id: seq, at: t + ms, fn });
      return seq;
    },
    clearTimer(id) {
      timers = timers.filter((x) => x.id !== id);
    },
    pending: () => timers.length,
    async advance(ms) {
      const target = t + ms;
      for (;;) {
        const due = timers.filter((x) => x.at <= target).sort((a, b) => a.at - b.at)[0];
        if (!due) break;
        timers = timers.filter((x) => x.id !== due.id);
        t = Math.max(t, due.at);
        due.fn();
        // eslint-disable-next-line no-await-in-loop
        await flushPromises();
      }
      t = target;
      await flushPromises();
    },
  };
}

export function memoryKv(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: async (k) => (data.has(k) ? data.get(k) : null),
    setItem: async (k, v) => {
      data.set(k, String(v));
    },
    removeItem: async (k) => {
      data.delete(k);
    },
  };
}

export function fakeUuid() {
  let n = 0;
  return () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
}

/** A complete client with fakes. `net.mode`: "ok" | "offline" | status number for POSTs; config endpoint via `net.config`. */
export function makeHarness({ config = { enabled: true, sampleRate: 1 }, random = 0, kvInit = {}, secureInit = {} } = {}) {
  const clock = makeClock();
  const kv = memoryKv(kvInit);
  const secure = memoryKv(secureInit);
  const uuid = fakeUuid();
  const net = { mode: 'ok', config, configMode: 'ok', posts: [], gets: [], headers: [] };

  const fetchImpl = async (url, init = {}) => {
    net.headers.push(init.headers ?? {});
    if (init.method === 'GET') {
      net.gets.push(url);
      if (net.configMode === 'offline') throw new Error('offline');
      if (net.configMode === 'http500') return { status: 500, json: async () => ({}) };
      return { status: 200, json: async () => net.config };
    }
    net.posts.push({ url, init, body: JSON.parse(init.body) });
    if (net.mode === 'offline') throw new Error('offline');
    return { status: net.mode === 'ok' ? 204 : net.mode };
  };

  const sender = createSender({
    getFetch: () => fetchImpl,
    getBaseUrl: () => 'https://api.test',
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
  });
  const prefs = createPrefStore({ kv, mirror: secure });
  const installIds = createInstallIdStore({ store: secure, uuid });
  const telemetry = createTelemetry({
    prefs,
    installIds,
    sender,
    kv,
    uuid,
    getContext: () => ({ app_version: '1.0.0', build: '25', platform: 'ios', os_major: '17.2', locale: 'es-AR' }),
    now: clock.now,
    random: () => random,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
  });
  const sentEvents = () => net.posts.flatMap((p) => p.body.events);
  return { clock, kv, secure, net, telemetry, prefs, installIds, sentEvents };
}
