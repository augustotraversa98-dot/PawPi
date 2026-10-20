import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as R from './registry.js';
import { AREAS } from './areas.js';
import { PII_KEY_RE } from './ingestSchema.js';
// The screen derivation + screen-file filter live in ONE place (shared with the Step E coverage guard).
import { screenForFile, isScreenFile } from '../../observability/coverageGuard.js';

export { screenForFile };

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../../../../..');
const MOBILE_APP = path.join(REPO, 'anything/apps/mobile/src/app');
const MOBILE_REGISTRY = path.join(REPO, 'anything/apps/mobile/src/telemetry/registry.js');

// Spelled out so a drive-by edit fails here (contract: 01-TELEMETRY-CONTRACT.md).
const CONTRACT_EVENTS = [
  'session_start', 'session_end', 'screen_view', 'tap', 'form_step', 'api_call', 'error',
  'nav_unexpected_redirect', 'perf_startup', 'perf_screen_ready', 'feature_used', 'funnel_step', 'opt_out', 'auth_diag',
];
const CONTRACT_FUNNELS = {
  activation: ['welcome_view', 'signup_or_oauth_start', 'auth_done', 'onboarding_photo', 'onboarding_dog_details', 'onboarding_done', 'first_post', 'first_health_log'],
  services: ['services_tab', 'discover_view', 'provider_view', 'booking_start', 'booking_done'],
  health_logging: ['health_tab', 'track_open', 'log_saved'],
  routines: ['routines_open', 'routine_form_open', 'routine_saved'],
};

function mobileScreenFiles() {
  const out = [];
  (function walk(dir, rel) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(path.join(dir, e.name), r);
      else if (isScreenFile(r)) out.push(r);
    }
  })(MOBILE_APP, '');
  return out;
}

describe('registry', () => {
  it('events and funnels are exactly the contract', () => {
    expect(R.EVENT_NAMES).toEqual(CONTRACT_EVENTS);
    expect(R.FUNNELS).toEqual(CONTRACT_FUNNELS);
    expect(Object.keys(R.PROP_SCHEMA).sort()).toEqual([...CONTRACT_EVENTS].sort());
  });

  it('AREAS mirrors areas.js and platforms/buckets are the contract values', () => {
    expect(R.AREAS).toEqual([...AREAS]);
    expect(R.PLATFORMS).toEqual(['ios', 'android', 'web']);
    expect(R.MS_BUCKETS).toEqual(['lt100', 'lt300', 'lt1000', 'lt3000', 'lt10000', 'gte10000']);
    expect(R.ERROR_KINDS).toEqual(['js', 'promise', 'render', 'network', 'api']);
  });

  it('is plain data with no imports (so the mobile app can copy it verbatim)', () => {
    const src = fs.readFileSync(path.join(HERE, 'registry.js'), 'utf8');
    expect(/^\s*import\s/m.test(src)).toBe(false);
    expect(/\brequire\(/.test(src)).toBe(false);
  });

  it('no allowed prop KEY looks like personal data', () => {
    for (const [event, schema] of Object.entries(R.PROP_SCHEMA))
      for (const key of Object.keys(schema)) expect(PII_KEY_RE.test(key), `${event}.${key}`).toBe(false);
  });

  it('every registry key is a short safe token', () => {
    const tap = new RegExp(R.TAP_TARGET_PATTERN);
    for (const t of R.TAP_TARGETS) expect(tap.test(t), t).toBe(true);
    for (const f of [...R.FEATURES, ...R.FORMS, ...Object.keys(R.FUNNELS), ...Object.values(R.FUNNELS).flat()])
      expect(/^[a-z][a-z0-9_]{0,39}$/.test(f), f).toBe(true);
    for (const list of [R.TAP_TARGETS, R.FEATURES, R.FORMS, R.SCREENS]) expect(new Set(list).size).toBe(list.length);
    expect(R.SCREENS).toContain('unknown');
  });

  it('screen conversion rule', () => {
    expect(screenForFile('(tabs)/health.jsx')).toBe('/health');
    expect(screenForFile('(tabs)/index.jsx')).toBe('/');
    expect(screenForFile('index.jsx')).toBe('/');
    expect(screenForFile('business/index.jsx')).toBe('/business');
    expect(screenForFile('(tabs)/more/settings.jsx')).toBe('/more/settings');
    expect(screenForFile('service/[id].jsx')).toBe('/service/:id');
    expect(screenForFile('+not-found.tsx')).toBe('/+not-found');
  });

  it('SCREENS covers EVERY screen file under mobile src/app (and nothing else but "unknown")', () => {
    if (!fs.existsSync(MOBILE_APP)) return; // web-only checkout
    const expected = [...new Set(mobileScreenFiles().map(screenForFile))].sort();
    expect(expected.length).toBeGreaterThan(50);
    expect([...R.SCREENS].filter((s) => s !== 'unknown').sort()).toEqual(expected);
  });

  it('the mobile mirror (when present) is byte-identical', () => {
    if (!fs.existsSync(MOBILE_REGISTRY)) return; // mobile half not landed yet
    expect(fs.readFileSync(MOBILE_REGISTRY, 'utf8')).toBe(fs.readFileSync(path.join(HERE, 'registry.js'), 'utf8'));
  });
});
