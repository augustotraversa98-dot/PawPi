// Strict validation for POST /api/telemetry/events, driven ENTIRELY by registry.js (the allowlist).
//
// Outcomes per event (these feed pawpi_telemetry_ingest_total):
//   accepted -- every key and value is allowlisted
//   dropped  -- well-formed but not on the allowlist (unknown event / prop key / screen / target / funnel step, a
//               string that is not in the registry set or fails its short safe pattern)
//   invalid  -- malformed (not an object, bad `t`, wrong value type, nested value, missing required prop) or a
//               prop KEY that looks like personal data (email/name/pet/handle/user/address/phone/text/...)
// Nothing here throws on any input; the caller never sees an exception.

import {
  EVENT_NAMES,
  PROP_SCHEMA,
  FUNNELS,
  ENVELOPE_PATTERNS,
  LIMITS,
  PLATFORMS,
} from './registry.js';

/** Prop KEYS that look like personal data are refused outright, whatever the event. */
export const PII_KEY_RE = /email|name|pet|handle|user|address|phone|text|password|token|lat|lng|location|ip/i;

const MAX_PROP_KEYS = 8;
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const compiled = new Map();
function re(source) {
  let r = compiled.get(source);
  if (!r) {
    r = new RegExp(source);
    compiled.set(source, r);
  }
  return r;
}

const EVENT_SET = new Set(EVENT_NAMES);
const ENVELOPE_RE = Object.fromEntries(Object.entries(ENVELOPE_PATTERNS).map(([k, v]) => [k, new RegExp(v)]));

/** A string that matched a pattern must still not look like an id: no uuid, no long hex run, no digits-only path segment (paths only: a bare "500" is a fine error code). */
function looksLikeId(v) {
  return UUID_RE.test(v) || /[0-9a-f]{12,}/i.test(v) || (v.includes('/') && v.split('/').some((seg) => /^\d+$/.test(seg)));
}

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * Validate the envelope (everything except `events`). Returns the normalised envelope or null.
 * Lenient on representation (os_major may be a number, sent_at a number or ISO string), strict on content.
 */
export function validateEnvelope(body) {
  try {
    if (!isPlainObject(body)) return null;
    const lower = (v) => (typeof v === 'string' ? v.toLowerCase() : v);
    const install_id = lower(body.install_id);
    const session_id = lower(body.session_id);
    if (typeof install_id !== 'string' || !ENVELOPE_RE.install_id.test(install_id)) return null;
    if (typeof session_id !== 'string' || !ENVELOPE_RE.session_id.test(session_id)) return null;
    const { app_version, build, platform, locale } = body;
    if (typeof app_version !== 'string' || app_version.length > 24 || !ENVELOPE_RE.app_version.test(app_version)) return null;
    if (typeof build !== 'string' && typeof build !== 'number') return null;
    const buildStr = String(build);
    if (!ENVELOPE_RE.build.test(buildStr)) return null;
    if (!PLATFORMS.includes(platform)) return null;
    let os = body.os_major;
    if (typeof os === 'number' && Number.isInteger(os) && os >= 0) os = String(os);
    if (typeof os !== 'string' || !ENVELOPE_RE.os_major.test(os)) return null;
    if (typeof locale !== 'string' || !ENVELOPE_RE.locale.test(locale)) return null;
    const sent = body.sent_at;
    const sentOk =
      (typeof sent === 'number' && Number.isFinite(sent)) ||
      (typeof sent === 'string' && sent.length <= 40 && Number.isFinite(Date.parse(sent)));
    if (!sentOk) return null;
    if (!Array.isArray(body.events) || body.events.length > LIMITS.maxEvents) return null;
    return {
      install_id,
      session_id,
      app_version,
      build: buildStr,
      platform,
      os_major: os,
      locale,
      sent_at: String(sent),
    };
  } catch {
    return null;
  }
}

/**
 * Validate one event against the registry.
 * @returns {{result: 'accepted', event: {name: string, t: number, props: object}} | {result: 'dropped' | 'invalid'}}
 */
export function validateEvent(raw) {
  try {
    if (!isPlainObject(raw)) return { result: 'invalid' };
    const { name, t, props } = raw;
    if (typeof name !== 'string') return { result: 'invalid' };
    if (typeof t !== 'number' || !Number.isFinite(t) || t < 0 || t > LIMITS.maxEventT) return { result: 'invalid' };
    const p = props === undefined ? {} : props;
    if (!isPlainObject(p)) return { result: 'invalid' };
    const keys = Object.keys(p);
    if (keys.length > MAX_PROP_KEYS) return { result: 'invalid' };
    // PII-looking keys are refused first, whether or not the event name is known.
    if (keys.some((k) => PII_KEY_RE.test(k))) return { result: 'invalid' };
    if (!EVENT_SET.has(name)) return { result: 'dropped' };
    const schema = PROP_SCHEMA[name];
    if (!schema) return { result: 'dropped' };
    if (keys.some((k) => !Object.prototype.hasOwnProperty.call(schema, k))) return { result: 'dropped' };

    const clean = {};
    for (const [key, spec] of Object.entries(schema)) {
      if (!Object.prototype.hasOwnProperty.call(p, key)) {
        if (spec.optional) continue;
        return { result: 'invalid' }; // required prop missing
      }
      const v = p[key];
      if (spec.type === 'bool') {
        if (typeof v !== 'boolean') return { result: 'invalid' };
      } else {
        if (typeof v !== 'string') return { result: 'invalid' }; // numbers/objects/arrays/null are not allowed
        if (spec.type === 'enum') {
          if (!spec.values.includes(v)) return { result: 'dropped' };
        } else if (spec.type === 'pattern') {
          if (v.length > 120 || !re(spec.pattern).test(v) || looksLikeId(v)) return { result: 'dropped' };
        } else {
          return { result: 'dropped' };
        }
      }
      clean[key] = v;
    }

    if (name === 'funnel_step' && !FUNNELS[clean.funnel].includes(clean.step)) return { result: 'dropped' };
    return { result: 'accepted', event: { name, t: Math.round(t), props: clean } };
  } catch {
    return { result: 'invalid' };
  }
}
