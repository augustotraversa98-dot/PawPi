// anything/apps/web/instrumentation.mjs
//
// OpenTelemetry bootstrap for the PawPi web/API service (Railway).
// Loaded via NODE_OPTIONS="--import ./instrumentation.mjs" BEFORE the server
// starts, so HTTP auto-instrumentation can patch node:http first.
//
// Ships traces + metrics + logs to Grafana Cloud over a single OTLP/HTTP
// endpoint. It is a NO-OP unless OTEL_EXPORTER_OTLP_ENDPOINT is set, so local
// dev, tests, and CI are completely unaffected.
//
// Required env (set in Railway only):
//   OTEL_EXPORTER_OTLP_ENDPOINT   e.g. https://otlp-gateway-prod-us-east-0.grafana.net/otlp
//   OTEL_EXPORTER_OTLP_HEADERS    e.g. Authorization=Basic <base64(instanceID:token)>
// Optional:
//   OTEL_SERVICE_NAME             defaults to "pawpi-web"
//   OTEL_LOGS_ENABLED             "true" to also ship logs to Grafana (default OFF).
//                                 Logs are the easiest way to burn the 50GB/mo free
//                                 logs quota, so this is opt-in. Railway keeps its own
//                                 logs regardless, and the autofix loop doesn't need it.
//   OTEL_TRACES_SAMPLER           Free-tier safety. Set to
//                                 "parentbased_traceidratio" and
//                                 OTEL_TRACES_SAMPLER_ARG="0.2" to keep only ~20% of
//                                 traces so you stay under the 50GB/mo traces quota.
//                                 (NodeSDK reads these standard env vars automatically.)

import process from 'node:process';
import { fileURLToPath } from 'node:url';

if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
  // Not configured (dev / test / CI) — do nothing.
  console.log('[otel] OTEL_EXPORTER_OTLP_ENDPOINT not set — telemetry disabled');
} else {
  try {
    const { NodeSDK, tracing } = await import('@opentelemetry/sdk-node');
    const { getNodeAutoInstrumentations } = await import(
      '@opentelemetry/auto-instrumentations-node'
    );
    const { OTLPTraceExporter } = await import(
      '@opentelemetry/exporter-trace-otlp-http'
    );
    const { OTLPMetricExporter } = await import(
      '@opentelemetry/exporter-metrics-otlp-http'
    );
    const { PeriodicExportingMetricReader } = await import(
      '@opentelemetry/sdk-metrics'
    );
    const { resourceFromAttributes } = await import('@opentelemetry/resources');
    const {
      ATTR_SERVICE_NAME,
      ATTR_SERVICE_VERSION,
    } = await import('@opentelemetry/semantic-conventions');

    // TRACES ARE SCRUBBED BEFORE EXPORT (privacy): the http/undici/net auto-instrumentations record raw URL paths,
    // query strings, client IPs and user-agents. SpanScrubber (src/lib/telemetry/spanScrubber.js) strips or coarsens
    // all of that and is registered BEFORE the exporter. If it cannot be loaded we export NO traces at all (an empty
    // spanProcessors list stops the SDK from falling back to a default, unscrubbed OTLP exporter); metrics are unaffected.
    let spanProcessors = [];
    try {
      const { SpanScrubber, listApiRouteTemplates } = await import('./src/lib/telemetry/spanScrubber.js');
      const templates = listApiRouteTemplates(fileURLToPath(new URL('./src/app/api', import.meta.url)));
      spanProcessors = [
        new SpanScrubber({ templates }),
        new tracing.BatchSpanProcessor(new OTLPTraceExporter()),
      ];
    } catch (err) {
      console.error('[otel] span scrubber unavailable, NOT exporting traces:', err);
    }

    const resource = resourceFromAttributes({
      [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME || 'pawpi-web',
      [ATTR_SERVICE_VERSION]:
        process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) || 'dev',
      'deployment.environment':
        process.env.RAILWAY_ENVIRONMENT_NAME || 'production',
    });

    // Logs are opt-in (default OFF) to protect the free-tier logs quota.
    const enableLogs = process.env.OTEL_LOGS_ENABLED === 'true';
    let logRecordProcessors;
    if (enableLogs) {
      const { OTLPLogExporter } = await import(
        '@opentelemetry/exporter-logs-otlp-http'
      );
      const { BatchLogRecordProcessor } = await import('@opentelemetry/sdk-logs');
      logRecordProcessors = [new BatchLogRecordProcessor(new OTLPLogExporter())];
    }

    const sdk = new NodeSDK({
      resource,
      spanProcessors, // [SpanScrubber, BatchSpanProcessor(OTLP)] -- see above
      metricReader: new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter(),
        exportIntervalMillis: 30_000,
      }),
      // Sampling is controlled by OTEL_TRACES_SAMPLER / _ARG env (read automatically).
      ...(logRecordProcessors ? { logRecordProcessors } : {}),
      instrumentations: [
        getNodeAutoInstrumentations({
          // Keep noise down: disable fs spans, keep http/express/pg/undici.
          '@opentelemetry/instrumentation-fs': { enabled: false },
        }),
      ],
    });

    sdk.start();
    console.log('[otel] telemetry started → ' + process.env.OTEL_EXPORTER_OTLP_ENDPOINT);

    const shutdown = () =>
      sdk.shutdown().finally(() => process.exit(0));
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  } catch (err) {
    // Never let telemetry crash the app.
    console.error('[otel] failed to start, continuing without telemetry:', err);
  }
}
