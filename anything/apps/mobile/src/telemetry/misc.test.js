import { msBucket, durationSecondsBucket } from './bucket';
import { createSession, SESSION_IDLE_MS } from './session';
import { buildEnvelope, normalizeAppVersion, normalizeBuild, normalizeLocale, osMajorOf } from './envelope';
import { ENVELOPE_PATTERNS } from './registry';
import { tapTargetKey } from './tapTarget';
import { createInstallIdStore, INSTALL_ID_KEY } from './installId';
import { createPrefStore, PREF_KEY, OPT_OUT_MIRROR_KEY } from './telemetryPref';
import { uuidv4, isUuidV4 } from './uuid';
import { createNavExpectation } from './navExpect';
import { createNavObserver } from './navObserver';
import { installGlobalErrorHandlers } from './errorHooks';
import { memoryKv, fakeUuid } from './testKit';

describe('buckets', () => {
  it('ms edges', () => {
    expect(msBucket(0)).toBe('lt100');
    expect(msBucket(99)).toBe('lt100');
    expect(msBucket(100)).toBe('lt300');
    expect(msBucket(299)).toBe('lt300');
    expect(msBucket(300)).toBe('lt1000');
    expect(msBucket(999)).toBe('lt1000');
    expect(msBucket(1000)).toBe('lt3000');
    expect(msBucket(2999)).toBe('lt3000');
    expect(msBucket(3000)).toBe('lt10000');
    expect(msBucket(9999)).toBe('lt10000');
    expect(msBucket(10000)).toBe('gte10000');
    expect(msBucket(-5)).toBe('lt100');
    expect(msBucket(NaN)).toBeNull();
    expect(msBucket(undefined)).toBeNull();
  });
  it('session seconds edges', () => {
    expect(durationSecondsBucket(0)).toBe('lt10');
    expect(durationSecondsBucket(10)).toBe('lt60');
    expect(durationSecondsBucket(60)).toBe('lt300');
    expect(durationSecondsBucket(300)).toBe('lt900');
    expect(durationSecondsBucket(900)).toBe('lt3600');
    expect(durationSecondsBucket(3600)).toBe('gte3600');
    expect(durationSecondsBucket(NaN)).toBeNull();
  });
});

describe('session', () => {
  it('rotates after 30 min in background, not before', () => {
    let t = 0;
    const s = createSession({ now: () => t, uuid: fakeUuid() });
    expect(s.ensure()).toBe(true);
    expect(s.ensure()).toBe(false);
    const first = s.id();
    t = 20_000;
    expect(s.elapsedMs()).toBe(20_000);
    expect(s.background()).toBe(20);
    t += SESSION_IDLE_MS - 1;
    expect(s.foreground()).toEqual({ rotated: false });
    expect(s.id()).toBe(first);
    expect(s.background()).toBeGreaterThanOrEqual(0);
    t += SESSION_IDLE_MS;
    expect(s.foreground()).toEqual({ rotated: true });
    expect(s.id()).not.toBe(first);
    expect(s.elapsedMs()).toBe(0);
  });
  it('reset forgets the session', () => {
    const s = createSession({ now: () => 0, uuid: fakeUuid() });
    s.ensure();
    s.reset();
    expect(s.isStarted()).toBe(false);
    expect(s.elapsedMs()).toBe(0);
  });
});

describe('envelope', () => {
  const ctx = { app_version: '1.0.0', build: '25', platform: 'ios', os_major: '17.2', locale: 'es_AR' };
  it('always matches the server patterns', () => {
    const e = buildEnvelope({ install_id: fakeUuid()(), session_id: fakeUuid()(), events: [], context: ctx, sent_at: 5 });
    expect(new RegExp(ENVELOPE_PATTERNS.install_id).test(e.install_id)).toBe(true);
    expect(new RegExp(ENVELOPE_PATTERNS.app_version).test(e.app_version)).toBe(true);
    expect(new RegExp(ENVELOPE_PATTERNS.build).test(e.build)).toBe(true);
    expect(new RegExp(ENVELOPE_PATTERNS.os_major).test(e.os_major)).toBe(true);
    expect(new RegExp(ENVELOPE_PATTERNS.locale).test(e.locale)).toBe(true);
    expect(e).toMatchObject({ platform: 'ios', os_major: '17', locale: 'es-AR', sent_at: 5 });
  });
  it('normalises odd values instead of failing the batch', () => {
    expect(normalizeAppVersion('1.0.0')).toBe('1.0.0');
    expect(normalizeAppVersion('2')).toBe('2.0');
    expect(normalizeAppVersion('1.2.3-beta.1')).toBe('1.2.3-beta.1');
    expect(normalizeAppVersion('1.2.3 (debug build)')).toBe('1.2.3');
    expect(normalizeAppVersion(undefined)).toBe('0.0');
    expect(normalizeAppVersion('garbage')).toBe('0.0');
    expect(normalizeBuild(25)).toBe('25');
    expect(normalizeBuild('1.0.0 (25)')).toBe('1.0.025');
    expect(normalizeBuild(undefined)).toBe('0');
    expect(normalizeBuild('x'.repeat(40)).length).toBe(16);
    expect(normalizeLocale('es-AR')).toBe('es-AR');
    expect(normalizeLocale('en_US')).toBe('en-US');
    expect(normalizeLocale('es')).toBe('es');
    expect(normalizeLocale('zh-Hans-CN')).toBe('zh-CN');
    expect(normalizeLocale('')).toBe('en');
    expect(normalizeLocale(undefined)).toBe('en');
    expect(osMajorOf('17.2.1')).toBe('17');
    expect(osMajorOf(34)).toBe('34');
    expect(osMajorOf(undefined)).toBe('0');
  });
  it('refuses a platform the server does not accept', () => {
    expect(buildEnvelope({ install_id: 'x', session_id: 'y', events: [], context: { ...ctx, platform: 'windows' } })).toBeNull();
    expect(buildEnvelope({ install_id: 'x', session_id: 'y', events: [], context: undefined })).toBeNull();
  });
});

describe('tapTargetKey', () => {
  it('explicit trackId wins; testID/label only when they ARE a registry key; never free text', () => {
    expect(tapTargetKey({ trackId: 'tab_health' })).toBe('tab_health');
    expect(tapTargetKey({ trackId: 'not_a_target', testID: 'tab_health' })).toBeNull();
    expect(tapTargetKey({ testID: 'tab-health' })).toBe('tab_health');
    expect(tapTargetKey({ testID: 'TAB_HEALTH' })).toBe('tab_health');
    expect(tapTargetKey({ accessibilityLabel: 'Back' })).toBe('back');
    expect(tapTargetKey({ testID: 'delete-account', accessibilityLabel: 'Add my dog Luna' })).toBeNull();
    expect(tapTargetKey({ accessibilityLabel: 'Tab Health' })).toBeNull();
    expect(tapTargetKey({})).toBeNull();
    expect(tapTargetKey()).toBeNull();
    expect(tapTargetKey({ testID: 42 })).toBeNull();
  });
});

describe('install id + preference stores', () => {
  it('install id: random v4, persisted once, deleted on clear, new after clear', async () => {
    const store = memoryKv();
    const ids = createInstallIdStore({ store, uuid: fakeUuid() });
    expect(await ids.peek()).toBeNull();
    const a = await ids.get();
    expect(isUuidV4(a)).toBe(true);
    expect(await ids.get()).toBe(a);
    expect(store.data.get(INSTALL_ID_KEY)).toBe(a);
    await ids.clear();
    expect(store.data.has(INSTALL_ID_KEY)).toBe(false);
    expect(await ids.peek()).toBeNull();
    const b = await ids.get();
    expect(b).not.toBe(a);
  });
  it('install id: a corrupt stored value is replaced; a failing store still yields an id', async () => {
    const store = memoryKv({ [INSTALL_ID_KEY]: 'not-a-uuid' });
    const ids = createInstallIdStore({ store, uuid: fakeUuid() });
    expect(isUuidV4(await ids.get())).toBe(true);
    const broken = {
      getItem: async () => {
        throw new Error('keychain');
      },
      setItem: async () => {
        throw new Error('keychain');
      },
      removeItem: async () => {
        throw new Error('keychain');
      },
    };
    const ids2 = createInstallIdStore({ store: broken, uuid: fakeUuid() });
    expect(isUuidV4(await ids2.get())).toBe(true);
    await expect(ids2.clear()).resolves.toBeUndefined();
  });
  it('preference: default ON; opt-out mirrored; fail closed when nothing is readable', async () => {
    const kv = memoryKv();
    const mirror = memoryKv();
    const prefs = createPrefStore({ kv, mirror });
    expect(await prefs.getEnabled()).toBe(true);
    await prefs.setEnabled(false);
    expect(kv.data.get(PREF_KEY)).toBe('0');
    expect(mirror.data.get(OPT_OUT_MIRROR_KEY)).toBe('1');
    kv.data.clear();
    expect(await prefs.getEnabled()).toBe(false); // AsyncStorage wiped: the mirror still says OFF
    await prefs.setEnabled(true);
    expect(await prefs.getEnabled()).toBe(true);
    expect(mirror.data.has(OPT_OUT_MIRROR_KEY)).toBe(false);
    const broken = {
      getItem: async () => {
        throw new Error('x');
      },
      setItem: async () => {
        throw new Error('x');
      },
      removeItem: async () => {
        throw new Error('x');
      },
    };
    expect(await createPrefStore({ kv: broken, mirror: broken }).getEnabled()).toBe(false);
  });
});

describe('uuid', () => {
  it('always returns a v4 uuid', () => {
    const seen = new Set();
    for (let i = 0; i < 50; i += 1) {
      const u = uuidv4();
      expect(isUuidV4(u)).toBe(true);
      seen.add(u);
    }
    expect(seen.size).toBe(50);
  });
});

describe('nav_unexpected_redirect observer', () => {
  function observer() {
    let t = 1000;
    const events = [];
    const exp = createNavExpectation({ now: () => t });
    const o = createNavObserver({
      emit: (name, props) => events.push({ name, props }),
      now: () => t,
      takeExpectation: () => exp.take(),
    });
    return { o, events, exp, advance: (ms) => (t += ms) };
  }
  const redirects = (events) => events.filter((e) => e.name === 'nav_unexpected_redirect').map((e) => e.props);

  it('emits screen_view for each distinct screen and perf_screen_ready after ready()', () => {
    const { o, events, advance } = observer();
    o.onPathname('/');
    o.onPathname('/'); // same screen: nothing
    advance(250);
    o.ready();
    o.onPathname('/health');
    expect(events.map((e) => [e.name, e.props.screen])).toEqual([
      ['screen_view', '/'],
      ['perf_screen_ready', '/'],
      ['screen_view', '/health'],
    ]);
    expect(events[1].props.ms_bucket).toBe('lt300');
  });

  it('REPORTS Services -> onboarding (the bug this event exists for)', () => {
    const { o, events } = observer();
    o.onPathname('/');
    o.onPathname('/services');
    o.onPathname('/onboarding');
    expect(redirects(events)).toEqual([{ from: '/services', to: '/onboarding', reason: 'onboarding_guard' }]);
  });

  it('reports an unexpected landing on welcome as welcome_guard', () => {
    const { o, events } = observer();
    o.onPathname('/more/settings');
    o.onPathname('/welcome');
    expect(redirects(events)).toEqual([{ from: '/more/settings', to: '/welcome', reason: 'welcome_guard' }]);
  });

  it('does NOT report the first screen, the EntryPoint decision, or normal onboarding steps', () => {
    const { o, events } = observer();
    o.onPathname('/onboarding'); // very first screen of a launch
    o.onPathname('/onboarding-photo');
    o.onPathname('/onboarding');
    o.onPathname('/');
    o.onPathname('/welcome'); // EntryPoint decided
    o.onPathname('/vet-business-access');
    o.onPathname('/welcome'); // back
    expect(redirects(events)).toEqual([]);
  });

  it('an explicit user action (markExpected) suppresses it; a marked reason is reported with that reason', () => {
    const a = observer();
    a.o.onPathname('/more/settings');
    a.exp.markExpected();
    a.o.onPathname('/welcome');
    expect(redirects(a.events)).toEqual([]);

    const b = observer();
    b.o.onPathname('/services');
    b.exp.markReason('session_expired');
    b.o.onPathname('/welcome');
    expect(redirects(b.events)).toEqual([{ from: '/services', to: '/welcome', reason: 'session_expired' }]);
  });

  it('an expectation expires after 5 s and unknown reasons are ignored', () => {
    const a = observer();
    a.o.onPathname('/more/settings');
    a.exp.markExpected();
    a.advance(6000);
    a.o.onPathname('/welcome');
    expect(redirects(a.events)).toHaveLength(1);

    const b = observer();
    b.exp.markReason('made_up');
    b.o.onPathname('/services');
    b.o.onPathname('/onboarding');
    expect(redirects(b.events)[0].reason).toBe('onboarding_guard');
  });

  it('never reports a raw path: unmapped pathnames are "unknown"', () => {
    const { o, events } = observer();
    o.onPathname('/pet-profile/8f14e45f-ceea-467a-9575-1b1c0a1b1c1d');
    expect(events[0]).toEqual({ name: 'screen_view', props: { screen: 'unknown' } });
  });

  it('never throws', () => {
    const o = createNavObserver({
      emit() {
        throw new Error('boom');
      },
    });
    expect(() => o.onPathname('/health')).not.toThrow();
    expect(() => o.ready()).not.toThrow();
  });
});

describe('installGlobalErrorHandlers', () => {
  it('chains ErrorUtils: reports AND still calls the previous handler; restores on uninstall', () => {
    const calls = [];
    let handler = (e, fatal) => calls.push(['previous', e.message, fatal]);
    const globalObj = {
      ErrorUtils: {
        getGlobalHandler: () => handler,
        setGlobalHandler: (h) => {
          handler = h;
        },
      },
    };
    const reports = [];
    const original = handler;
    const uninstall = installGlobalErrorHandlers({ report: (kind, err) => reports.push([kind, err.message]), globalObj });
    handler(new Error('boom'), true);
    expect(reports).toEqual([['js', 'boom']]);
    expect(calls).toEqual([['previous', 'boom', true]]);
    uninstall();
    expect(handler).toBe(original);
  });

  it('a throwing reporter never blocks the previous handler', () => {
    let previousCalled = false;
    let handler = () => {
      previousCalled = true;
    };
    const globalObj = {
      ErrorUtils: { getGlobalHandler: () => handler, setGlobalHandler: (h) => (handler = h) },
    };
    installGlobalErrorHandlers({
      report() {
        throw new Error('reporter broke');
      },
      globalObj,
    });
    expect(() => handler(new Error('x'), false)).not.toThrow();
    expect(previousCalled).toBe(true);
  });

  it('observes unhandledrejection where the runtime dispatches it', () => {
    const listeners = {};
    const globalObj = {
      addEventListener: (type, fn) => (listeners[type] = fn),
      removeEventListener: (type) => delete listeners[type],
    };
    const reports = [];
    const uninstall = installGlobalErrorHandlers({ report: (k, e) => reports.push([k, e.message]), globalObj });
    listeners.unhandledrejection({ reason: new Error('nope') });
    expect(reports).toEqual([['promise', 'nope']]);
    uninstall();
    expect(listeners.unhandledrejection).toBeUndefined();
  });

  it('does nothing (and does not throw) when the runtime has neither hook', () => {
    expect(() => installGlobalErrorHandlers({ report() {}, globalObj: {} })()).not.toThrow();
  });
});
