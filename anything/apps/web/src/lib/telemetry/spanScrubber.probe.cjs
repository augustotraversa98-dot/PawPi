// Test fixture for spanScrubber.test.js (run in a child process; NOT a test itself).
//
// Boots the REAL http + undici auto-instrumentations with the REAL SpanScrubber in front of an in-memory exporter,
// sends one incoming request (through a "proxy" that adds x-forwarded-for) and one outgoing fetch, and prints the
// exported spans as JSON on stdout. CommonJS on purpose: require-in-the-middle can only patch node:http when it is
// loaded through require().
const { pathToFileURL } = require('node:url');
const path = require('node:path');

(async () => {
  const { NodeSDK, tracing } = require('@opentelemetry/sdk-node');
  const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
  const { SpanScrubber, listApiRouteTemplates } = await import(pathToFileURL(path.join(__dirname, 'spanScrubber.js')).href);

  const exporter = new tracing.InMemorySpanExporter();
  const templates = listApiRouteTemplates(path.join(__dirname, '../../app/api'));
  const sdk = new NodeSDK({
    serviceName: 'probe',
    spanProcessors: [new SpanScrubber({ templates }), new tracing.SimpleSpanProcessor(exporter)],
    instrumentations: [getNodeAutoInstrumentations({ '@opentelemetry/instrumentation-fs': { enabled: false } })],
  });
  sdk.start();

  const http = require('node:http');
  const srv = http.createServer((req, res) => res.end('ok'));
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;

  // Incoming (SERVER span): a reset-password page with a token, as Railway's proxy would forward it.
  await new Promise((resolve) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path: '/account/reset-password?token=SECRET-RESET',
        headers: {
          'x-forwarded-for': '203.0.113.9',
          authorization: 'Bearer SECRET-BEARER',
          cookie: 'sid=SECRET-COOKIE',
          'user-agent': 'PawPi/1.0 CFNetwork/1494 Darwin/23.4.0',
        },
      },
      (res) => {
        res.resume();
        res.on('end', resolve);
      },
    );
    req.end();
  });
  // Incoming API request with an id-like and a handle-like segment.
  await new Promise((resolve) => {
    http.get({ host: '127.0.0.1', port, path: '/api/pets/RAWHANDLE-77/profile?x=SECRET-Q' }, (res) => {
      res.resume();
      res.on('end', resolve);
    });
  });
  // Outgoing (CLIENT span, undici): a Maps-style URL with an API key.
  await fetch(`http://127.0.0.1:${port}/maps/api/place/details/json?place_id=SECRET-PLACE&key=SECRET-KEY`);
  await new Promise((r) => setTimeout(r, 300));

  const spans = exporter.getFinishedSpans().map((s) => ({
    name: s.name,
    kind: s.kind,
    lib: s.instrumentationScope.name,
    attributes: s.attributes,
  }));
  // Exit explicitly (no sdk.shutdown(): it blocks ~7 s on exporter/detector teardown and the spans are already captured).
  process.stdout.write('SPANS_JSON:' + JSON.stringify(spans) + '\n', () => process.exit(0));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
