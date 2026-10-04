// Every funnel step in the registry is emitted somewhere in the app (Step E adds a stricter guard on the web side;
// this keeps the mobile wiring honest as screens move). Scans the source for literal trackFunnel("funnel", "step")
// calls, outside tests and this folder's own test files.

import fs from 'node:fs';
import path from 'node:path';
import { FUNNELS, FORMS, FEATURES } from './registry';

const SRC = path.join(__dirname, '..');

function sourceFiles() {
  const out = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === 'node_modules') continue;
        walk(full);
      } else if (/\.(js|jsx|ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name) && e.name !== 'testKit.js') {
        out.push(full);
      }
    }
  })(SRC);
  return out;
}

const ALL = sourceFiles()
  .map((f) => fs.readFileSync(f, 'utf8'))
  .join('\n');

describe('funnel / form wiring coverage', () => {
  it('every registry funnel step has a trackFunnel call site', () => {
    const missing = [];
    for (const [funnel, steps] of Object.entries(FUNNELS)) {
      for (const step of steps) {
        const re = new RegExp(`trackFunnel\\(\\s*["']${funnel}["']\\s*,\\s*["']${step}["']`);
        if (!re.test(ALL)) missing.push(`${funnel}/${step}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('every trackFunnel call site names a real funnel + step', () => {
    const re = /trackFunnel\(\s*["']([a-z_]+)["']\s*,\s*["']([a-z_]+)["']/g;
    const bad = [];
    let m;
    while ((m = re.exec(ALL))) {
      if (!FUNNELS[m[1]] || !FUNNELS[m[1]].includes(m[2])) bad.push(`${m[1]}/${m[2]}`);
    }
    expect(bad).toEqual([]);
  });

  it('every useFormTelemetry / trackFeature literal is a registry key', () => {
    const bad = [];
    const formRe = /useFormTelemetry\(\s*["']([a-z_]+)["']/g;
    const featRe = /trackFeature\(\s*["']([a-z_]+)["']/g;
    let m;
    while ((m = formRe.exec(ALL))) if (!FORMS.includes(m[1])) bad.push(`form:${m[1]}`);
    while ((m = featRe.exec(ALL))) if (!FEATURES.includes(m[1])) bad.push(`feature:${m[1]}`);
    expect(bad).toEqual([]);
  });

  it('every trackTap / trackId literal is a registry tap target', () => {
    const { TAP_TARGETS } = require('./registry');
    const bad = [];
    const re = /(?:trackTap\(\s*|trackId=)["']([a-z_]+)["']/g;
    let m;
    while ((m = re.exec(ALL))) if (!TAP_TARGETS.includes(m[1])) bad.push(m[1]);
    expect(bad).toEqual([]);
  });
});
