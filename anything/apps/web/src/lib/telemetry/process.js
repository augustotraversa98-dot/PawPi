// Process / host health as OTel observable gauges (contract: pawpi_process_*). Started once from
// __create/index.ts. Values are read lazily by the metric reader on each export, so there is no timer of
// our own and nothing to do (and nothing exported) without an OTel SDK.

import { monitorEventLoopDelay } from 'node:perf_hooks';
import { metrics } from '@opentelemetry/api';

let started = false;

/** Idempotent. Never throws. */
export function startProcessMetrics() {
  if (started) return;
  started = true;
  try {
    const meter = metrics.getMeter('pawpi-process', '1.0.0');

    const memory = meter.createObservableGauge('pawpi_process_memory_bytes', {
      description: 'Process memory by kind (rss, heap_used, heap_total, external)',
      unit: 'By',
    });
    memory.addCallback((obs) => {
      const m = process.memoryUsage();
      obs.observe(m.rss, { kind: 'rss' });
      obs.observe(m.heapUsed, { kind: 'heap_used' });
      obs.observe(m.heapTotal, { kind: 'heap_total' });
      obs.observe(m.external, { kind: 'external' });
    });

    // p99 event-loop delay since the previous export, then reset: a stalled loop shows up as a spike
    // instead of being averaged away over the process lifetime.
    const loop = monitorEventLoopDelay({ resolution: 20 });
    loop.enable();
    const lag = meter.createObservableGauge('pawpi_process_event_loop_lag_seconds', {
      description: 'p99 event-loop delay since the previous export',
      unit: 's',
    });
    lag.addCallback((obs) => {
      const seconds = loop.count > 0 ? loop.percentile(99) / 1e9 : 0;
      loop.reset();
      if (Number.isFinite(seconds)) obs.observe(seconds);
    });

    const uptime = meter.createObservableGauge('pawpi_process_uptime_seconds', {
      description: 'Seconds since this process started (drops to ~0 on a restart/deploy)',
      unit: 's',
    });
    uptime.addCallback((obs) => obs.observe(process.uptime()));
  } catch {
    // telemetry must never stop the server from booting
  }
}
