// Client-side mirror of the server's allowlist validation (anything/apps/web/src/lib/telemetry/ingestSchema.js).
// PURE: depends only on the registry. The client validates BEFORE queueing so that nothing the server would
// drop (or that looks like personal data) ever leaves the device. Never throws.

import { EVENT_NAMES, PROP_SCHEMA, FUNNELS } from './registry';

/** Prop KEYS that look like personal data are refused outright (identical to the server rule). */
export const PII_KEY_RE = /email|name|pet|handle|user|address|phone|text|password|token|lat|lng|location|ip/i;

const MAX_PROP_KEYS = 8;
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const EVENT_SET = new Set(EVENT_NAMES);
const compiled = new Map();
function re(source) {
  let r = compiled.get(source);
  if (!r) {
    r = new RegExp(source);
    compiled.set(source, r);
  }
  return r;
}

const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** A pattern-valid string must still not look like an id (uuid, long hex run, digits-only path segment). */
function looksLikeId(v) {
  return (
    UUID_RE.test(v) ||
    /[0-9a-f]{12,}/i.test(v) ||
    (v.includes('/') && v.split('/').some((seg) => /^\d+$/.test(seg)))
  );
}

/**
 * Validate one event against the registry.
 * @returns {object|null} the CLEAN props (only registry-listed keys, registry-valid values) or null = drop.
 */
export function sanitizeEvent(name, props) {
  try {
    if (typeof name !== 'string' || !EVENT_SET.has(name)) return null;
    const p = props === undefined || props === null ? {} : props;
    if (!isPlainObject(p)) return null;
    const keys = Object.keys(p);
    if (keys.length > MAX_PROP_KEYS) return null;
    if (keys.some((k) => PII_KEY_RE.test(k))) return null;
    const schema = PROP_SCHEMA[name];
    if (!schema) return null;
    if (keys.some((k) => !hasOwn(schema, k))) return null;

    const clean = {};
    for (const [key, spec] of Object.entries(schema)) {
      if (!hasOwn(p, key) || p[key] === undefined) {
        if (spec.optional) continue;
        return null;
      }
      const v = p[key];
      if (spec.type === 'bool') {
        if (typeof v !== 'boolean') return null;
      } else {
        if (typeof v !== 'string') return null;
        if (spec.type === 'enum') {
          if (!spec.values.includes(v)) return null;
        } else if (spec.type === 'pattern') {
          if (v.length > 120 || !re(spec.pattern).test(v) || looksLikeId(v)) return null;
        } else {
          return null;
        }
      }
      clean[key] = v;
    }
    if (name === 'funnel_step' && !FUNNELS[clean.funnel].includes(clean.step)) return null;
    return clean;
  } catch {
    return null;
  }
}
