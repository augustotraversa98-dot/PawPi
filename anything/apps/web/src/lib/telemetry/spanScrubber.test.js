// @vitest-environment node
//
// Traces must never carry a raw IP, user-agent, query string or raw id path out of the server. These tests fail if any
// of those appear unredacted on an incoming OR outgoing span, using the attribute shapes the real http / undici
// instrumentations emit (and, in the last block, the real instrumentations themselves).

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tracing } from '@opentelemetry/sdk-node';
import {
  SpanScrubber,
  scrubSpanAttributes,
  coarseUserAgent,
  buildRouteMatcher,
  listApiRouteTemplates,
  UNKNOWN_ROUTE,
  REDACTED_ERROR_TYPE,
} from './spanScrubber.js';
import { PAGE_ROUTE } from './routes.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const API_ROOT = path.resolve(HERE, '../../app/api');
const TEMPLATES = listApiRouteTemplates(API_ROOT);
const matchRoute = buildRouteMatcher(TEMPLATES);
const SERVER = 1;
const CLIENT = 2;

// Substrings that must not survive anywhere in a scrubbed span (values AND keys).
const FORBIDDEN = [
  '203.0.113.9', // client IP (x-forwarded-for)
  '10.1.2.3', // peer / local addresses
  'SECRET', // tokens, API keys, query values
  'token=',
  'key=',
  'email=',
  'RAWHANDLE',
  'Mozilla',
  'CFNetwork',
  'okhttp',
  'Bearer',
];
function expectClean(attrs) {
  const json = JSON.stringify(attrs);
  for (const bad of FORBIDDEN) expect(json, `leaked "${bad}": ${json}`).not.toContain(bad);
  for (const k of Object.keys(attrs)) {
    expect(k).not.toMatch(/^(client\.|peer\.|network\.peer\.|network\.local\.|net\.sock\.|url\.query$|http\.request\.header)/);
  }
}

describe('route templates', () => {
  it('finds the real API routes and maps any raw path to a template, never to itself', () => {
    expect(TEMPLATES.length).toBeGreaterThan(100);
    expect(TEMPLATES).toContain('/api/auth/*');
    for (const t of TEMPLATES) {
      const raw = t.replace(/:id/g, 'zz-SECRET-77').replace(/\*/g, 'cb/zz-SECRET-77');
      const hit = matchRoute(raw);
      expect(TEMPLATES, `${raw} -> ${hit}`).toContain(hit);
      expect(hit).not.toContain('SECRET');
    }
  });

  it('an unknown path matches nothing', () => {
    expect(matchRoute('/api/definitely/not/a/route/zz')).toBeNull();
    expect(matchRoute(undefined)).toBeNull();
  });
});

describe('scrubSpanAttributes', () => {
  // The id/handle path used below must exist as a real template with a parameter.
  const paramTemplate = TEMPLATES.find((t) => /^\/api\/[a-z-]+\/:id$/.test(t));

  it('INCOMING api span: no IP, user-agent, query or raw id path', () => {
    expect(paramTemplate).toBeTruthy();
    const attrs = {
      'http.request.method': 'GET',
      'url.scheme': 'https',
      'server.address': 'www.pawpi.info',
      'network.peer.address': '10.1.2.3',
      'network.peer.port': 51234,
      'network.protocol.version': '1.1',
      'user_agent.original': 'Mozilla/5.0 (Linux; Android 14) okhttp',
      'url.path': paramTemplate.replace(':id', 'RAWHANDLE-77'),
      'url.query': 'token=SECRET-RESET&email=a%40b.com',
      'client.address': '203.0.113.9',
      'server.port': 443,
      'http.response.status_code': 200,
    };
    scrubSpanAttributes(attrs, { kind: SERVER, matchRoute });
    expectClean(attrs);
    expect(attrs['url.path']).toBe(paramTemplate);
    expect(attrs['user_agent.original']).toBe('android');
    expect(attrs['http.response.status_code']).toBe(200);
    expect(attrs['http.request.method']).toBe('GET');
  });

  it('INCOMING /account/reset-password?token=SECRET page span: query gone, path is the page bucket', () => {
    const attrs = {
      'url.path': '/account/reset-password',
      'url.query': 'token=SECRET-RESET',
      'client.address': '203.0.113.9',
      'user_agent.original': 'PawPi/1.0 CFNetwork/1494 Darwin/23.4.0',
    };
    scrubSpanAttributes(attrs, { kind: SERVER, matchRoute });
    expectClean(attrs);
    expect(attrs['url.path']).toBe(PAGE_ROUTE);
    expect(attrs['user_agent.original']).toBe('ios');
    expect('url.query' in attrs).toBe(false);
  });

  it('INCOMING unknown /api path falls back to /unknown, never the raw path', () => {
    const attrs = { 'url.path': '/api/nope/RAWHANDLE-77/x' };
    scrubSpanAttributes(attrs, { kind: SERVER, matchRoute });
    expect(attrs['url.path']).toBe(UNKNOWN_ROUTE);
  });

  it('OUTGOING Maps-style span: ?key=SECRET stripped from url.full and url.query, path templated', () => {
    const attrs = {
      'http.request.method': 'GET',
      'url.full': 'https://maps.googleapis.com/maps/api/place/details/json?place_id=SECRET-PLACE&key=SECRET-KEY',
      'url.path': '/maps/api/place/details/json',
      'url.query': '?place_id=SECRET-PLACE&key=SECRET-KEY',
      'url.scheme': 'https',
      'server.address': 'maps.googleapis.com',
      'user_agent.original': 'node',
      'network.peer.address': '10.1.2.3',
      'network.peer.port': 443,
      'http.response.status_code': 200,
    };
    scrubSpanAttributes(attrs, { kind: CLIENT, matchRoute });
    expectClean(attrs);
    expect(attrs['url.full']).toBe(`https://maps.googleapis.com${UNKNOWN_ROUTE}`);
    expect(attrs['url.path']).toBe(UNKNOWN_ROUTE);
    expect(attrs['server.address']).toBe('maps.googleapis.com');
    expect(attrs['user_agent.original']).toBe('other');
  });

  it('OUTGOING span for a reset-password URL with a token and userinfo', () => {
    const attrs = { 'url.full': 'https://user:SECRET-PW@pawpi.info/account/reset-password?token=SECRET-RESET#frag' };
    scrubSpanAttributes(attrs, { kind: CLIENT, matchRoute });
    expectClean(attrs);
    expect(attrs['url.full']).toBe(`https://pawpi.info${UNKNOWN_ROUTE}`);
  });

  it('drops net / dns / legacy-semconv identity attributes (network.local.*, net.sock.*, http.client_ip, headers)', () => {
    const attrs = {
      'network.local.address': '10.1.2.3',
      'network.local.port': 40000,
      'network.peer.address': '10.1.2.3',
      'net.peer.ip': '10.1.2.3',
      'net.host.ip': '10.1.2.3',
      'net.sock.peer.addr': '10.1.2.3',
      'http.client_ip': '203.0.113.9',
      'http.request.header.authorization': 'Bearer SECRET-BEARER',
      'http.request.header.cookie': 'sid=SECRET',
      'http.url': 'http://h/api/pets/RAWHANDLE-77?token=SECRET',
      'http.target': '/api/pets/RAWHANDLE-77?token=SECRET',
      'http.user_agent': 'Mozilla/5.0',
      'db.connection_string': 'postgres://u:SECRET@10.1.2.3/db',
      'db.user': 'SECRET',
      'network.transport': 'tcp',
      'server.address': 'db.internal',
    };
    scrubSpanAttributes(attrs, { kind: CLIENT, matchRoute });
    expectClean(attrs);
    expect(attrs['network.transport']).toBe('tcp');
    expect(attrs['server.address']).toBe('db.internal');
  });

  it('drops peer.ipv4 and every other IP-bearing attribute, and keeps ordinary attributes', () => {
    const ipAttrs = {
      'peer.ipv4': '203.0.113.9',
      'peer.ipv6': '2001:db8::9',
      'peer.port': 51234,
      'peer.hostname': 'host-10.1.2.3.example',
      'net.peer.ip': '203.0.113.9',
      'net.sock.peer.addr': '203.0.113.9',
      'net.sock.host.addr': '10.1.2.3',
      'network.peer.address': '203.0.113.9',
      'client.address': '203.0.113.9',
      'client.ip': '203.0.113.9',
      'http.client_ip': '203.0.113.9',
      'http.request.header.x-forwarded-for': '203.0.113.9',
      'http.request.header.x_forwarded_for': '203.0.113.9',
      'http.request.header.x-real-ip': '203.0.113.9',
      'http.x_forwarded_for': '203.0.113.9',
      'x-forwarded-for': '203.0.113.9',
      'x-real-ip': '203.0.113.9',
    };
    const kept = {
      'http.request.method': 'GET',
      'http.response.status_code': 200,
      'http.route': '/api/pets/:id',
      'url.scheme': 'https',
      'server.address': 'www.pawpi.info',
      'network.transport': 'tcp',
    };
    const attrs = { ...ipAttrs, ...kept };
    scrubSpanAttributes(attrs, { kind: SERVER, matchRoute });
    for (const k of Object.keys(ipAttrs)) expect(k in attrs, `${k} survived`).toBe(false);
    expect(attrs).toEqual(kept);
    expect(JSON.stringify(attrs)).not.toMatch(/203\.0\.113\.9|10\.1\.2\.3/);
  });

  it('SpanScrubber removes peer.ipv4 from a real exported span', () => {
    const exporter = new tracing.InMemorySpanExporter();
    const provider = new tracing.BasicTracerProvider({
      spanProcessors: [new SpanScrubber({ templates: TEMPLATES }), new tracing.SimpleSpanProcessor(exporter)],
    });
    provider
      .getTracer('t')
      .startSpan('GET', { kind: SERVER, attributes: { 'peer.ipv4': '203.0.113.9', 'http.request.method': 'GET' } })
      .end();
    expect(exporter.getFinishedSpans()[0].attributes).toEqual({ 'http.request.method': 'GET' });
  });

  it('error.type holding an error message is reduced to _OTHER; a type token is kept', () => {
    const a = { 'error.type': 'connect ECONNREFUSED 10.1.2.3:443' };
    const b = { 'error.type': 'ECONNREFUSED' };
    const c = { 'error.type': '500' };
    scrubSpanAttributes(a, { kind: CLIENT, matchRoute });
    scrubSpanAttributes(b, { kind: CLIENT, matchRoute });
    scrubSpanAttributes(c, { kind: CLIENT, matchRoute });
    expect(a['error.type']).toBe(REDACTED_ERROR_TYPE);
    expect(b['error.type']).toBe('ECONNREFUSED');
    expect(c['error.type']).toBe('500');
  });

  it('an unparseable url.full is removed, not kept', () => {
    const attrs = { 'url.full': 'not a url ?key=SECRET' };
    scrubSpanAttributes(attrs, { kind: CLIENT, matchRoute });
    expect('url.full' in attrs).toBe(false);
  });

  it('coarseUserAgent only ever returns ios | android | other', () => {
    expect(coarseUserAgent('PawPi/1.0 CFNetwork/1494 Darwin/23.4.0')).toBe('ios');
    expect(coarseUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe('ios');
    expect(coarseUserAgent('okhttp/4.12.0')).toBe('android');
    expect(coarseUserAgent('Mozilla/5.0 (X11; Linux x86_64) Chrome/120')).toBe('other');
    expect(coarseUserAgent(undefined)).toBe('other');
  });
});

describe('SpanScrubber in the real SDK pipeline (scrubber registered before the exporter)', () => {
  function setup() {
    const exporter = new tracing.InMemorySpanExporter();
    const provider = new tracing.BasicTracerProvider({
      spanProcessors: [new SpanScrubber({ templates: TEMPLATES }), new tracing.SimpleSpanProcessor(exporter)],
    });
    return { exporter, tracer: provider.getTracer('test') };
  }

  it('exports scrubbed incoming and outgoing spans, including error events and status messages', () => {
    const { exporter, tracer } = setup();
    const incoming = tracer.startSpan('GET', {
      kind: SERVER,
      attributes: {
        'url.path': '/account/reset-password',
        'url.query': 'token=SECRET-RESET',
        'client.address': '203.0.113.9',
        'user_agent.original': 'Mozilla/5.0',
      },
    });
    incoming.end();

    const outgoing = tracer.startSpan('GET', {
      kind: CLIENT,
      attributes: {
        'url.full': 'https://maps.googleapis.com/maps/api/place/details/json?key=SECRET-KEY',
        'network.peer.address': '10.1.2.3',
      },
    });
    outgoing.recordException(new Error('connect ECONNREFUSED 10.1.2.3:443 key=SECRET-KEY'));
    outgoing.setStatus({ code: 2, message: 'connect ECONNREFUSED 10.1.2.3:443' });
    outgoing.end();

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(2);
    for (const s of spans) {
      expectClean(s.attributes);
      expect(JSON.stringify(s.events)).not.toMatch(/SECRET|10\.1\.2\.3|ECONNREFUSED/);
      expect(s.status.message ?? '').not.toContain('10.1.2.3');
    }
    expect(spans[0].attributes['url.path']).toBe(PAGE_ROUTE);
    expect(spans[1].attributes['url.full']).toBe(`https://maps.googleapis.com${UNKNOWN_ROUTE}`);
    expect(spans[1].events[0].name).toBe('exception'); // the event is kept (type only), just without message / stack
  });

  it('fails closed: a span the scrubber chokes on exports with NO attributes', () => {
    const exporter = new tracing.InMemorySpanExporter();
    const scrubber = new SpanScrubber({ templates: TEMPLATES });
    scrubber.matchRoute = () => {
      throw new Error('boom');
    };
    const provider = new tracing.BasicTracerProvider({
      spanProcessors: [scrubber, new tracing.SimpleSpanProcessor(exporter)],
    });
    provider
      .getTracer('t')
      .startSpan('GET', { kind: SERVER, attributes: { 'url.path': '/api/pets/RAWHANDLE-77', 'client.address': '203.0.113.9' } })
      .end();
    expect(exporter.getFinishedSpans()[0].attributes).toEqual({});
  });
});

describe('REAL http + undici auto-instrumentations through the scrubber (child process)', () => {
  it('no raw IP, user-agent, query string or raw id path in any exported span', () => {
    const out = execFileSync(process.execPath, [path.join(HERE, 'spanScrubber.probe.cjs')], {
      encoding: 'utf8',
      timeout: 60_000,
      env: { ...process.env, NODE_ENV: 'test' },
    });
    const line = out.split('\n').find((l) => l.startsWith('SPANS_JSON:'));
    expect(line, out).toBeTruthy();
    const spans = JSON.parse(line.slice('SPANS_JSON:'.length));

    // The probe must have produced real incoming (kind 1) and outgoing (kind 2) HTTP spans, or this proves nothing.
    expect(spans.some((s) => s.kind === SERVER && s.lib.includes('instrumentation-http'))).toBe(true);
    expect(spans.some((s) => s.kind === CLIENT && s.lib.includes('instrumentation-undici'))).toBe(true);

    const forbidden = ['SECRET', 'RAWHANDLE', 'CFNetwork', 'Darwin', 'token=', 'key=', 'x=', '?', 'Bearer'];
    for (const s of spans) {
      const json = JSON.stringify(s.attributes);
      for (const bad of forbidden) expect(json, `leaked "${bad}" in ${json}`).not.toContain(bad);
      // No IPv4 anywhere, except the loopback host the probe itself talks to (a legitimate server.address / url.full host).
      expect(json.replaceAll('127.0.0.1', 'LOOPBACK')).not.toMatch(/\b\d{1,3}(\.\d{1,3}){3}\b/);
      for (const k of Object.keys(s.attributes)) {
        expect(k).not.toMatch(/^(client\.|network\.peer\.|network\.local\.|url\.query$)/);
      }
      if (s.attributes['user_agent.original'] !== undefined) {
        expect(['ios', 'android', 'other']).toContain(s.attributes['user_agent.original']);
      }
    }
    const paths = spans.map((s) => s.attributes['url.path']).filter(Boolean);
    for (const p of paths) expect([PAGE_ROUTE, UNKNOWN_ROUTE, ...TEMPLATES]).toContain(p);
  }, 60_000);
});
