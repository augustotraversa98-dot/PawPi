import { describe, it, expect } from 'vitest';
import { validateEvent, validateEnvelope, PII_KEY_RE } from './ingestSchema.js';
import { EVENT_NAMES, PROP_SCHEMA, FUNNELS, LIMITS } from './registry.js';

// One canonical, valid sample per contract event (spelled out; the "every event is covered" test checks the keys).
const VALID = {
  session_start: { cold: true },
  session_end: { duration_s_bucket: 'lt300' },
  screen_view: { screen: '/health' },
  tap: { target: 'tab_services', screen: '/' },
  form_step: { form: 'onboarding', step: 'dog_details', action: 'complete' },
  api_call: { area: 'pets', route: '/api/pets/:id/profile', status_class: '2xx', ms_bucket: 'lt300' },
  error: { kind: 'api', screen: '/services', code: '500' },
  nav_unexpected_redirect: { from: '/services', to: '/onboarding', reason: 'onboarding_guard' },
  perf_startup: { ms_bucket: 'lt3000' },
  perf_screen_ready: { screen: '/more/settings', ms_bucket: 'lt1000' },
  feature_used: { feature: 'add_dog' },
  funnel_step: { funnel: 'activation', step: 'auth_done' },
  opt_out: {},
};
const ev = (name, props, t = 1200) => ({ name, t, props });

const ENVELOPE = {
  install_id: '3f2b8c1e-9a4d-4e7b-8c55-0d1f2a3b4c5d',
  session_id: '0b9a3d1f-6c2e-4d8a-9f10-2a3b4c5d6e7f',
  app_version: '1.4.2',
  build: '25',
  platform: 'ios',
  os_major: '17',
  locale: 'es-AR',
  sent_at: '2026-10-04T12:00:00.000Z',
  events: [],
};

describe('validateEvent: accepts', () => {
  it('has a valid sample for every contract event', () => {
    expect(Object.keys(VALID).sort()).toEqual([...EVENT_NAMES].sort());
  });

  it.each(Object.entries(VALID))('%s', (name, props) => {
    const out = validateEvent(ev(name, props));
    expect(out.result).toBe('accepted');
    expect(out.event).toEqual({ name, t: 1200, props });
  });

  it('error.code is optional; opt_out may omit props', () => {
    expect(validateEvent(ev('error', { kind: 'js', screen: 'unknown' })).result).toBe('accepted');
    expect(validateEvent({ name: 'opt_out', t: 0 }).result).toBe('accepted');
  });

  it('accepts every funnel/step pair and every enum value in the schema', () => {
    for (const [funnel, steps] of Object.entries(FUNNELS))
      for (const step of steps) expect(validateEvent(ev('funnel_step', { funnel, step })).result, `${funnel}/${step}`).toBe('accepted');
    for (const [name, schema] of Object.entries(PROP_SCHEMA))
      for (const [key, spec] of Object.entries(schema))
        if (spec.type === 'enum' && name !== 'funnel_step')
          for (const v of spec.values) {
            const out = validateEvent(ev(name, { ...VALID[name], [key]: v }));
            expect(out.result, `${name}.${key}=${v}`).toBe('accepted');
          }
  });
});

describe('validateEvent: rejects', () => {
  it('PII-looking prop keys are INVALID, even on a known event and even with a harmless value', () => {
    for (const key of ['email', 'name', 'pet_name', 'petId', 'handle', 'user_id', 'userId', 'address', 'phone', 'text', 'password', 'token', 'lat', 'lng', 'location', 'ip', 'IP_ADDRESS', 'Email']) {
      const out = validateEvent(ev('screen_view', { screen: '/health', [key]: 'x' }));
      expect(out.result, key).toBe('invalid');
      expect(validateEvent(ev('not_an_event', { [key]: 'x' })).result, key).toBe('invalid');
    }
  });

  it('unknown events are dropped', () => {
    for (const name of ['', 'purchase', 'SESSION_START', 'screen_view ', '__proto__', 'constructor', 'a@b.com'])
      expect(validateEvent(ev(name, {})).result, name).toBe('dropped');
  });

  it('unknown prop keys drop the event', () => {
    expect(validateEvent(ev('screen_view', { screen: '/health', extra: 'x' })).result).toBe('dropped');
    expect(validateEvent(ev('opt_out', { why: 'x' })).result).toBe('dropped');
    expect(validateEvent(ev('screen_view', JSON.parse('{"screen":"/health","__proto__":"x"}'))).result).toBe('dropped');
  });

  it('unknown screens / targets / features / forms / funnels / steps are dropped', () => {
    expect(validateEvent(ev('screen_view', { screen: '/pets/12345' })).result).toBe('dropped');
    expect(validateEvent(ev('screen_view', { screen: '/health?x=1' })).result).toBe('dropped');
    expect(validateEvent(ev('tap', { target: 'Buy now!', screen: '/' })).result).toBe('dropped');
    expect(validateEvent(ev('tap', { target: 'totally_new_button', screen: '/' })).result).toBe('dropped');
    expect(validateEvent(ev('feature_used', { feature: 'jane@example.com' })).result).toBe('dropped');
    expect(validateEvent(ev('form_step', { form: 'secret_form', step: 'a', action: 'view' })).result).toBe('dropped');
    expect(validateEvent(ev('funnel_step', { funnel: 'nope', step: 'auth_done' })).result).toBe('dropped');
    expect(validateEvent(ev('funnel_step', { funnel: 'activation', step: 'booking_done' })).result).toBe('dropped'); // step of ANOTHER funnel
    expect(validateEvent(ev('nav_unexpected_redirect', { from: '/x', to: '/onboarding', reason: 'onboarding_guard' })).result).toBe('dropped');
  });

  it('free text / ids / emails in pattern props are dropped', () => {
    const base = { area: 'pets', status_class: '2xx', ms_bucket: 'lt100' };
    for (const route of [
      'my dog Rex is sick and I need help please', 'jane@example.com', '/api/pets/123456/profile',
      '/api/pets/3f2b8c1e-9a4d-4e7b-8c55-0d1f2a3b4c5d', '/api/pets/0123456789abcdef0123', '/api/x?token=abc', 'x'.repeat(500), '/' + 'a'.repeat(300), '',
    ])
      expect(validateEvent(ev('api_call', { ...base, route })).result, route.slice(0, 30)).toBe('dropped');
    for (const step of ['Rex the dog', 'a@b.com', 'x'.repeat(100), '1abc', ''])
      expect(validateEvent(ev('form_step', { form: 'onboarding', step, action: 'view' })).result, step).toBe('dropped');
    for (const code of ['Something went wrong while saving Rex', 'a@b.com', 'x'.repeat(33), '3f2b8c1e-9a4d-4e7b-8c55-0d1f2a3b4c5d', 'abcdef0123456789abcd'])
      expect(validateEvent(ev('error', { kind: 'js', screen: '/', code })).result, code).toBe('dropped');
  });

  it('malformed shapes are invalid', () => {
    const bad = [
      null, undefined, 42, 'x', [], [1], { t: 1, props: {} }, { name: 5, t: 1 }, { name: 'opt_out' },
      { name: 'opt_out', t: -1 }, { name: 'opt_out', t: NaN }, { name: 'opt_out', t: 1e30 }, { name: 'opt_out', t: '12' },
      { name: 'opt_out', t: 1, props: [] }, { name: 'opt_out', t: 1, props: 'x' }, { name: 'opt_out', t: 1, props: null },
      ev('session_start', {}), ev('session_start', { cold: 'yes' }), ev('session_start', { cold: 1 }),
      ev('screen_view', {}), ev('screen_view', { screen: 7 }), ev('screen_view', { screen: { a: 1 } }), ev('screen_view', { screen: ['/health'] }), ev('screen_view', { screen: null }),
    ];
    for (const b of bad) expect(validateEvent(b).result, JSON.stringify(b)).toBe('invalid');
  });

  it('too many prop keys is invalid; never throws on hostile objects', () => {
    const many = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`k${i}`, 'x']));
    expect(validateEvent(ev('screen_view', many)).result).toBe('invalid');
    const hostile = { get name() { throw new Error('boom'); }, t: 1 };
    expect(validateEvent(hostile).result).toBe('invalid');
  });

  it('PII key regex is the one from the brief', () => {
    expect(PII_KEY_RE.source).toBe('email|name|pet|handle|user|address|phone|text|password|token|lat|lng|location|ip');
    expect(PII_KEY_RE.flags).toBe('i');
  });
});

describe('validateEnvelope', () => {
  it('accepts the canonical envelope and normalises', () => {
    const e = validateEnvelope({ ...ENVELOPE, os_major: 17, build: 25, install_id: ENVELOPE.install_id.toUpperCase(), sent_at: 1760000000000 });
    expect(e).toMatchObject({ install_id: ENVELOPE.install_id, os_major: '17', build: '25', platform: 'ios', locale: 'es-AR' });
    expect(validateEnvelope({ ...ENVELOPE, locale: 'en' })).not.toBeNull();
    for (const platform of ['ios', 'android', 'web']) expect(validateEnvelope({ ...ENVELOPE, platform })).not.toBeNull();
    for (const app_version of ['1.2', '1.2.3', '12.34.56', '1.2.3-beta.1']) expect(validateEnvelope({ ...ENVELOPE, app_version }), app_version).not.toBeNull();
  });

  it('rejects bad ids, versions, platforms, locales, dates, event arrays', () => {
    const bads = [
      { install_id: 'not-a-uuid' }, { install_id: '3f2b8c1e-9a4d-1e7b-8c55-0d1f2a3b4c5d' }, // not v4
      { install_id: undefined }, { install_id: 5 }, { session_id: 'x' }, { session_id: ENVELOPE.session_id + 'zz' },
      { app_version: 'latest' }, { app_version: '1.2.3; drop table' }, { app_version: '1'.repeat(30) }, { app_version: 123 },
      { build: 'x'.repeat(40) }, { build: 'a b' }, { build: null },
      { platform: 'windows' }, { platform: 'IOS' }, { os_major: 'abc' }, { os_major: '12345' }, { os_major: '17.2' }, { os_major: -3 },
      { locale: 'english' }, { locale: 'es_AR' }, { locale: 'es-ar' }, { locale: 5 },
      { sent_at: 'yesterday' }, { sent_at: undefined }, { sent_at: 'x'.repeat(100) }, { sent_at: NaN },
      { events: undefined }, { events: 'x' }, { events: {} }, { events: Array.from({ length: LIMITS.maxEvents + 1 }, () => ({})) },
    ];
    for (const b of bads) expect(validateEnvelope({ ...ENVELOPE, ...b }), JSON.stringify(b).slice(0, 60)).toBeNull();
    for (const b of [null, undefined, 5, 'x', [], [ENVELOPE]]) expect(validateEnvelope(b)).toBeNull();
  });

  it('exactly 50 events is fine', () => {
    expect(validateEnvelope({ ...ENVELOPE, events: Array.from({ length: 50 }, () => ({})) })).not.toBeNull();
  });
});
