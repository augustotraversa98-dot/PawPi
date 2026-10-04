// pawpi_http_* server metrics (contract: 01-TELEMETRY-CONTRACT.md). Called from the Hono middleware in
// __create/index.ts AFTER the response is produced. Never throws; no-op without an OTel SDK.
//
// Instrument names follow the contract verbatim. No `unit` on the counter (an OTLP->Prometheus translator
// would otherwise append it); the histogram's unit 's' matches the `_seconds` in its name.

import { metrics } from '@opentelemetry/api';
import { areaForPath } from './areas.js';
import { methodLabel, routeLabel, statusClass } from './routes.js';

const meter = metrics.getMeter('pawpi-server', '1.0.0');

const requestsTotal = meter.createCounter('pawpi_http_requests_total', {
  description: 'Inbound HTTP requests by feature area, route template, method and status class',
});

const requestDuration = meter.createHistogram('pawpi_http_request_duration_seconds', {
  description: 'Inbound HTTP request duration by feature area, route template and method',
  unit: 's',
  advice: {
    explicitBucketBoundaries: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  },
});

/** The bounded label sets for one request. Exported for the label-cardinality test. */
export function httpLabels({ method, path, matchedRoutes, status }) {
  const route = routeLabel({ matchedRoutes, path, status });
  const area = areaForPath(route.startsWith('/api/') ? route : path);
  return {
    counter: { area, route, method: methodLabel(method), status_class: statusClass(status) },
    histogram: { area, route, method: methodLabel(method) },
  };
}

/**
 * Record one finished request.
 * @param {{method: string, path: string, matchedRoutes?: Array<{path: string}>, status: number, seconds: number}} r
 */
export function recordHttpRequest(request) {
  try {
    const { method, path, matchedRoutes, status, seconds } = request;
    const { counter, histogram } = httpLabels({ method, path, matchedRoutes, status });
    requestsTotal.add(1, counter);
    if (Number.isFinite(seconds) && seconds >= 0) requestDuration.record(seconds, histogram);
  } catch {
    // telemetry must never affect a request
  }
}
