// Privacy scrubber for OpenTelemetry TRACE spans, applied in-process before anything is exported to Grafana Tempo.
//
// Why: the http / undici / net auto-instrumentations record, by default, the raw URL path (ids, handles), the
// raw query string (e.g. /account/reset-password?token=..., Maps ?key=...), the client IP (from x-forwarded-for)
// and the user-agent. None of that may leave the server (docs/privacy/telemetry.md, privacy policy section 5).
//
// How: `SpanScrubber` is a SpanProcessor registered BEFORE the batch exporter (see instrumentation.mjs). It
// rewrites the finished span's attributes in place in `onEnd`, i.e. before the exporter ever reads them.
//
// PURE apart from `listApiRouteTemplates` (reads the route directory once at startup). This file is loaded by
// plain node (`node --import ./instrumentation.mjs`), so it may only use relative `.js` imports and node: builtins.
//
// What survives on a span: see the note at the bottom (spanScrubber.test.js pins it).

import fs from 'node:fs';
import path from 'node:path';
import { templateFromRoutePath, PAGE_ROUTE } from './routes.js';

export const UNKNOWN_ROUTE = '/unknown';
export const REDACTED_ERROR_TYPE = '_OTHER'; // OpenTelemetry's own value for "type not representable"

// SpanKind values (from @opentelemetry/api; copied so this file imports nothing from node_modules).
const KIND_SERVER = 1;

// Attributes removed outright (client / peer / local network identity, header captures, db credentials).
const DROP_KEYS = new Set([
  'client.address',
  'client.port',
  'source.address',
  'source.port',
  'http.client_ip',
  'net.peer.ip',
  'net.peer.port',
  'net.host.ip',
  'net.host.port',
  'url.query',
  'url.fragment',
  'http.query',
  'db.connection_string',
  'db.user',
]);
const DROP_PREFIXES = [
  'network.peer.', // address, port
  'network.local.', // address, port
  'net.sock.', // legacy semconv socket addresses
  'http.request.header.', // header captures can carry cookies / authorization
  'http.response.header.',
];

/** A coarse user-agent bucket. Never the raw string. */
export function coarseUserAgent(ua) {
  const s = typeof ua === 'string' ? ua : '';
  if (/iphone|ipad|ipod|\bios\b|cfnetwork|darwin/i.test(s)) return 'ios';
  if (/android|okhttp/i.test(s)) return 'android';
  return 'other';
}

/**
 * Template for every route file under `apiRoot` (src/app/api): `/api/pets/[id]/profile` -> `/api/pets/:id/profile`.
 * Uses routes.js's own file-path -> template rule so spans, metrics and logs share one vocabulary.
 * Returns [] if the directory cannot be read (the scrubber then reports '/unknown' for every API path).
 */
export function listApiRouteTemplates(apiRoot) {
  const out = [];
  const walk = (dir, rel) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.isDirectory()) walk(path.join(dir, e.name), [...rel, e.name]);
      else if (/^route\.(js|jsx|ts|tsx)$/.test(e.name)) out.push(templateFromRoutePath('/api/' + rel.join('/')));
    }
  };
  walk(apiRoot, []);
  out.push('/api/auth/*'); // registered by the auth layer, not a route file (see routes.js)
  return [...new Set(out)];
}

/**
 * Build `(rawPath) => template | null`. A path matches a template when every literal segment is equal and each
 * `:id` accepts any single segment; a trailing `*` accepts one or more. The most specific template wins (more
 * literal segments first), like the real router. The returned value is always one of `templates`, never input.
 */
export function buildRouteMatcher(templates) {
  const compiled = templates
    .map((t) => ({ t, segs: t.split('/').filter(Boolean) }))
    .map((c) => ({ ...c, literals: c.segs.filter((s) => s !== ':id' && s !== '*').length }))
    .sort((a, b) => b.literals - a.literals || b.segs.length - a.segs.length);
  return (rawPath) => {
    if (typeof rawPath !== 'string') return null;
    const segs = rawPath.split(/[?#]/)[0].split('/').filter(Boolean);
    for (const c of compiled) {
      const wildcard = c.segs[c.segs.length - 1] === '*';
      if (wildcard ? segs.length < c.segs.length : segs.length !== c.segs.length) continue;
      let ok = true;
      for (let i = 0; i < c.segs.length && ok; i++) {
        const want = c.segs[i];
        if (want === '*') break;
        if (want !== ':id' && want !== segs[i]) ok = false;
      }
      if (ok) return c.t;
    }
    return null;
  };
}

function templateFor(rawPath, kind, matchRoute) {
  const p = typeof rawPath === 'string' ? rawPath.split(/[?#]/)[0] : '';
  const hit = matchRoute ? matchRoute(p) : null;
  if (hit) return hit;
  // An incoming request for a page / static asset (not /api): same bucket the HTTP metrics use.
  if (kind === KIND_SERVER && p !== '' && !p.startsWith('/api/')) return PAGE_ROUTE;
  return UNKNOWN_ROUTE;
}

/** scheme://host[:port]<template> -- no userinfo, query or fragment, and never the raw path. null when unparseable. */
function scrubUrl(raw, kind, matchRoute) {
  try {
    const u = new URL(String(raw));
    return `${u.protocol}//${u.host}${templateFor(u.pathname, kind, matchRoute)}`;
  } catch {
    return null;
  }
}

/**
 * Scrub a span's attribute bag IN PLACE (and return it). Anything it cannot make safe is removed, not kept.
 * @param {Record<string, unknown>} attrs
 * @param {{kind?: number, matchRoute?: (p: string) => string | null}} [ctx]
 */
export function scrubSpanAttributes(attrs, { kind, matchRoute } = {}) {
  if (!attrs || typeof attrs !== 'object') return attrs;
  for (const key of Object.keys(attrs)) {
    if (DROP_KEYS.has(key) || DROP_PREFIXES.some((p) => key.startsWith(p))) {
      delete attrs[key];
      continue;
    }
    switch (key) {
      case 'url.path':
      case 'http.target': // legacy: path + query
        attrs[key] = templateFor(attrs[key], kind, matchRoute);
        break;
      case 'url.full':
      case 'http.url': {
        const clean = scrubUrl(attrs[key], kind, matchRoute);
        if (clean === null) delete attrs[key];
        else attrs[key] = clean;
        break;
      }
      case 'user_agent.original':
      case 'http.user_agent':
        attrs[key] = coarseUserAgent(attrs[key]);
        break;
      case 'error.type':
        // undici stores error.message here ("connect ECONNREFUSED 10.0.0.1:443"): keep only a type-like token.
        if (typeof attrs[key] !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.]{0,63}$/.test(attrs[key])) {
          attrs[key] = REDACTED_ERROR_TYPE;
        }
        break;
      default:
    }
  }
  return attrs;
}

/** Exception events carry free-text messages and stack traces (URLs, addresses): keep only the type. */
function scrubEvents(events) {
  if (!Array.isArray(events)) return;
  for (const ev of events) {
    if (ev?.attributes && typeof ev.attributes === 'object') {
      delete ev.attributes['exception.message'];
      delete ev.attributes['exception.stacktrace'];
    }
  }
}

/** SpanProcessor: scrubs each span as it ends, BEFORE the exporting processor (register this one first). */
export class SpanScrubber {
  /** @param {{templates?: string[]}} [opts] route templates (listApiRouteTemplates). */
  constructor({ templates = [] } = {}) {
    this.matchRoute = buildRouteMatcher(templates);
  }

  onStart() {}

  onEnd(span) {
    try {
      scrubSpanAttributes(span.attributes, { kind: span.kind, matchRoute: this.matchRoute });
      scrubEvents(span.events);
      if (span.status && span.status.message) span.status = { code: span.status.code }; // undici: message = error.message
    } catch {
      // Fail closed: if anything above throws, drop every attribute rather than export a half-scrubbed span.
      try {
        for (const k of Object.keys(span.attributes || {})) delete span.attributes[k];
      } catch {
        // nothing more we can do
      }
    }
  }

  forceFlush() {
    return Promise.resolve();
  }

  shutdown() {
    return Promise.resolve();
  }
}

// ATTRIBUTES THAT REMAIN on a span after scrubbing (everything else the instrumentations emit is dropped above or is
// a bounded technical value): http.request.method(+_original), url.scheme, server.address/port (the host we talk to),
// network.protocol.version, network.transport, http.response.status_code, http.route (already a template),
// url.path (template), url.full (scheme://host + template, no query), user_agent.original (ios|android|other),
// error.type (type token), db.system.name / db.namespace / db.query.text (placeholders only, no values) for pg spans.
