import { describe, it, expect, vi } from 'vitest';

const reg = vi.hoisted(() => ({ gauges: {} }));
vi.mock('@opentelemetry/api', () => ({
  metrics: {
    getMeter: () => ({
      createObservableGauge: (name, opts) => ({
        addCallback: (cb) => (reg.gauges[name] = { cb, opts }),
      }),
    }),
  },
}));

import { startProcessMetrics } from './process.js';

function observe(name) {
  const out = [];
  reg.gauges[name].cb({ observe: (v, attrs) => out.push({ v, attrs }) });
  return out;
}

describe('startProcessMetrics', () => {
  it('registers the three contract gauges (idempotently) with sane values', () => {
    startProcessMetrics();
    startProcessMetrics();
    expect(Object.keys(reg.gauges).sort()).toEqual([
      'pawpi_process_event_loop_lag_seconds',
      'pawpi_process_memory_bytes',
      'pawpi_process_uptime_seconds',
    ]);

    const mem = observe('pawpi_process_memory_bytes');
    expect(mem.map((m) => m.attrs.kind)).toEqual(['rss', 'heap_used', 'heap_total', 'external']);
    expect(mem.every((m) => m.v >= 0)).toBe(true);

    const up = observe('pawpi_process_uptime_seconds');
    expect(up).toHaveLength(1);
    expect(up[0].v).toBeGreaterThan(0);

    const lag = observe('pawpi_process_event_loop_lag_seconds');
    expect(lag).toHaveLength(1);
    expect(Number.isFinite(lag[0].v)).toBe(true);
    expect(lag[0].v).toBeGreaterThanOrEqual(0);
  });
});
