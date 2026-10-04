// Every screen file under src/app has an entry in the telemetry registry (and the registry lists nothing else).
// Uses the SAME derivation rule as the web test (anything/apps/web/src/lib/telemetry/registry.test.js) and as the
// documented rule in registry.js. If this fails, add the screen to the WEB registry first
// (anything/apps/web/src/lib/telemetry/registry.js), then copy that file over src/telemetry/registry.js verbatim.

import fs from 'node:fs';
import path from 'node:path';
import { SCREENS, TAP_TARGETS, TAP_TARGET_PATTERN, FEATURES, FORMS, FUNNELS, PROP_SCHEMA, EVENT_NAMES } from './registry';
import { PII_KEY_RE } from './validate';

const APP_DIR = path.join(__dirname, '..', 'app');

/** file under src/app -> screen template (rule documented in registry.js). */
function screenForFile(rel) {
  const segs = rel
    .replace(/\.(jsx|tsx|js|ts)$/, '')
    .split('/')
    .filter((s) => !/^\(.*\)$/.test(s));
  if (segs[segs.length - 1] === 'index') segs.pop();
  return '/' + segs.map((s) => (/^\[.*\]$/.test(s) ? ':id' : s)).join('/');
}

function screenFiles() {
  const out = [];
  (function walk(dir, rel) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(path.join(dir, e.name), r);
      else if (
        /\.(jsx|tsx|js|ts)$/.test(e.name) &&
        !/\.test\./.test(e.name) &&
        !/^_layout\./.test(e.name) &&
        r !== '(tabs)/tabsConfig.js'
      )
        out.push(r);
    }
  })(APP_DIR, '');
  return out;
}

describe('telemetry registry coverage', () => {
  it('has a registry screen for EVERY screen file under src/app (names the offender)', () => {
    const missing = screenFiles()
      .map((file) => ({ file, screen: screenForFile(file) }))
      .filter(({ screen }) => !SCREENS.includes(screen));
    expect(missing.map((m) => `${m.file} -> ${m.screen}`)).toEqual([]);
  });

  it('lists no screen that has no file (besides "unknown")', () => {
    const fromFiles = new Set(screenFiles().map(screenForFile));
    const stale = SCREENS.filter((s) => s !== 'unknown' && !fromFiles.has(s));
    expect(stale).toEqual([]);
    expect(SCREENS).toContain('unknown');
  });

  it('screen conversion rule matches the documented examples', () => {
    expect(screenForFile('(tabs)/health.jsx')).toBe('/health');
    expect(screenForFile('(tabs)/index.jsx')).toBe('/');
    expect(screenForFile('index.jsx')).toBe('/');
    expect(screenForFile('business/index.jsx')).toBe('/business');
    expect(screenForFile('(tabs)/more/settings.jsx')).toBe('/more/settings');
    expect(screenForFile('+not-found.tsx')).toBe('/+not-found');
  });

  it('registry keys are short safe tokens and no allowed prop key looks like personal data', () => {
    const tap = new RegExp(TAP_TARGET_PATTERN);
    for (const t of TAP_TARGETS) expect(tap.test(t)).toBe(true);
    for (const f of [...FEATURES, ...FORMS, ...Object.keys(FUNNELS), ...Object.values(FUNNELS).flat()])
      expect(/^[a-z][a-z0-9_]{0,39}$/.test(f)).toBe(true);
    for (const [event, schema] of Object.entries(PROP_SCHEMA))
      for (const key of Object.keys(schema)) expect(PII_KEY_RE.test(key)).toBe(false);
    expect(Object.keys(PROP_SCHEMA).sort()).toEqual([...EVENT_NAMES].sort());
  });
});
