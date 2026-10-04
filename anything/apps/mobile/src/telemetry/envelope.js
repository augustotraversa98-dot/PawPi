// Request envelope for POST /api/telemetry/events. PURE. Raw platform values -> the exact patterns the server
// accepts (registry ENVELOPE_PATTERNS); a value that cannot be normalised falls back to a harmless default
// rather than failing the whole batch.

import { ENVELOPE_PATTERNS, PLATFORMS } from './registry';

const APP_VERSION_RE = new RegExp(ENVELOPE_PATTERNS.app_version);
const BUILD_RE = new RegExp(ENVELOPE_PATTERNS.build);
const LOCALE_RE = new RegExp(ENVELOPE_PATTERNS.locale);
const OS_RE = new RegExp(ENVELOPE_PATTERNS.os_major);

/** "1.0.0" / "1.2" / "1.2.3-beta.1" stay; "2" -> "2.0"; junk -> "0.0". */
export function normalizeAppVersion(raw) {
  try {
    let v = String(raw ?? '').trim();
    if (/^\d{1,3}$/.test(v)) v = `${v}.0`;
    if (APP_VERSION_RE.test(v) && v.length <= 24) return v;
    const m = v.match(/^(\d{1,3}(?:\.\d{1,4}){1,3})/);
    if (m && APP_VERSION_RE.test(m[1])) return m[1];
  } catch {
    // fall through
  }
  return '0.0';
}

/** Build number as a short token (digits / dots / dashes); junk -> "0". */
export function normalizeBuild(raw) {
  try {
    const v = String(raw ?? '')
      .replace(/[^A-Za-z0-9._-]/g, '')
      .slice(0, 16);
    return BUILD_RE.test(v) ? v : '0';
  } catch {
    return '0';
  }
}

/** "es-AR" / "es_AR" / "es" / "zh-Hans-CN" -> "es-AR" | "es" | "zh-CN"; anything else -> "en". */
export function normalizeLocale(raw) {
  try {
    const parts = String(raw ?? '')
      .replace(/_/g, '-')
      .split('-');
    const lang = (parts[0] || '').toLowerCase();
    if (!/^[a-z]{2}$/.test(lang)) return 'en';
    const region = parts.slice(1).find((p) => /^[A-Za-z]{2}$/.test(p));
    const out = region ? `${lang}-${region.toUpperCase()}` : lang;
    return LOCALE_RE.test(out) ? out : lang;
  } catch {
    return 'en';
  }
}

/** iOS "17.2" -> "17"; Android API level 34 -> "34"; junk -> "0". */
export function osMajorOf(raw) {
  try {
    const m = String(raw ?? '').match(/^\d{1,3}/);
    return m && OS_RE.test(m[0]) ? m[0] : '0';
  } catch {
    return '0';
  }
}

/** @returns {string|null} the platform if the server allows it, else null (do not send). */
export function platformOf(raw) {
  return PLATFORMS.includes(raw) ? raw : null;
}

/**
 * @param {{install_id: string, session_id: string, events: Array<{name: string, t: number, props: object}>,
 *          context: {app_version: any, build: any, platform: any, os_major: any, locale: any}, sent_at?: number}} input
 * @returns {object|null} the envelope, or null when the platform is not sendable
 */
export function buildEnvelope({ install_id, session_id, events, context, sent_at = Date.now() }) {
  const platform = platformOf(context?.platform);
  if (!platform) return null;
  return {
    install_id,
    session_id,
    app_version: normalizeAppVersion(context.app_version),
    build: normalizeBuild(context.build),
    platform,
    os_major: osMajorOf(context.os_major),
    locale: normalizeLocale(context.locale),
    sent_at,
    events,
  };
}
