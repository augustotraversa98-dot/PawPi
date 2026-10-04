import { makeHarness, flushPromises } from './testKit';
import { FUNNEL_ONCE_KEY } from './client';
import { INSTALL_ID_KEY } from './installId';
import { PREF_KEY, OPT_OUT_MIRROR_KEY } from './telemetryPref';

const INSTALL_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

async function started(opts) {
  const h = makeHarness(opts);
  await h.telemetry.start();
  await flushPromises();
  return h;
}

describe('telemetry client: sending', () => {
  it('sends a well-formed batch: envelope fields, session_start first, install_id UUIDv4, no auth headers', async () => {
    const h = await started();
    h.telemetry.track('screen_view', { screen: '/health' });
    await h.telemetry.flush();
    expect(h.net.posts).toHaveLength(1);
    const { url, body } = h.net.posts[0];
    expect(url).toBe('https://api.test/api/telemetry/events');
    expect(body.install_id).toMatch(INSTALL_RE);
    expect(body.session_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(body).toMatchObject({ app_version: '1.0.0', build: '25', platform: 'ios', os_major: '17', locale: 'es-AR' });
    expect(typeof body.sent_at).toBe('number');
    expect(body.events.map((e) => e.name)).toEqual(['session_start', 'screen_view']);
    expect(body.events[0].props).toEqual({ cold: true });
    expect(body.events[1].t).toBeGreaterThanOrEqual(0);
    // anonymous: only a content type, never a token / cookie / platform identity header
    const headers = h.net.headers.map((x) => JSON.stringify(x).toLowerCase()).join(' ');
    expect(headers).not.toMatch(/authorization|bearer|cookie|x-createxyz|x-forwarded/);
    // the install id is persisted in the (secure) store, not derived from anything
    expect(h.secure.data.get(INSTALL_ID_KEY)).toBe(body.install_id);
  });

  it('flushes at 20 events and every 15 s (manual clock)', async () => {
    const h = await started();
    // session_start already queued by the first event
    for (let i = 0; i < 18; i += 1) h.telemetry.track('screen_view', { screen: '/health' });
    await flushPromises();
    expect(h.net.posts).toHaveLength(0); // 19 queued
    h.telemetry.track('screen_view', { screen: '/more' });
    await flushPromises();
    expect(h.net.posts).toHaveLength(1);
    expect(h.net.posts[0].body.events).toHaveLength(20);

    h.telemetry.track('screen_view', { screen: '/services' });
    await h.clock.advance(15_001);
    expect(h.net.posts).toHaveLength(2);
    expect(h.net.posts[1].body.events).toHaveLength(1);
  });

  it('drops events the registry does not know and PII-looking props, silently', async () => {
    const h = await started();
    h.telemetry.track('screen_view', { screen: '/health', email: 'a@b.co' });
    h.telemetry.track('screen_view', { screen: '/luna-the-dog' });
    h.telemetry.track('made_up_event', {});
    h.telemetry.track('tap', { target: 'Add my dog Luna', screen: '/' });
    await h.telemetry.flush();
    expect(h.net.posts).toHaveLength(0);
    expect(h.telemetry._debug().queued).toBe(0);
  });

  it('reserves opt_out: track("opt_out") from app code does nothing', async () => {
    const h = await started();
    h.telemetry.track('opt_out', {});
    await h.telemetry.flush();
    expect(h.sentEvents().filter((e) => e.name === 'opt_out')).toHaveLength(0);
  });
});

describe('telemetry client: kill switch / sampling (fail closed)', () => {
  it('sends nothing until the config fetch succeeds; events wait in the queue', async () => {
    const h = makeHarness();
    h.net.configMode = 'offline';
    await h.telemetry.start();
    await flushPromises();
    h.telemetry.track('screen_view', { screen: '/health' });
    await h.telemetry.flush();
    expect(h.net.posts).toHaveLength(0);
    expect(h.telemetry._debug().queued).toBe(2); // session_start + screen_view, buffered

    // config becomes reachable: the next attempt (>= 10 s later) enables sending and flushes the backlog
    h.net.configMode = 'ok';
    await h.clock.advance(20_000);
    await flushPromises();
    expect(h.net.posts.length).toBeGreaterThan(0);
    expect(h.sentEvents().map((e) => e.name)).toEqual(['session_start', 'screen_view']);
  });

  it('a non-2xx config response also fails closed', async () => {
    const h = makeHarness();
    h.net.configMode = 'http500';
    await h.telemetry.start();
    h.telemetry.track('screen_view', { screen: '/health' });
    await h.telemetry.flush();
    expect(h.net.posts).toHaveLength(0);
  });

  it('config enabled=false (kill switch): queue cleared, nothing sent, later events dropped', async () => {
    const h = makeHarness({ config: { enabled: false, sampleRate: 1 } });
    h.telemetry.track('screen_view', { screen: '/health' }); // before start: buffered
    await h.telemetry.start();
    await flushPromises();
    expect(h.telemetry._debug().queued).toBe(0);
    h.telemetry.track('screen_view', { screen: '/more' });
    await h.telemetry.flush();
    expect(h.net.posts).toHaveLength(0);
    expect(h.telemetry._debug().queued).toBe(0);
  });

  it('sampleRate is honoured per session: a session outside the sample records nothing', async () => {
    const out = await started({ config: { enabled: true, sampleRate: 0.5 }, random: 0.9 });
    out.telemetry.track('screen_view', { screen: '/health' });
    await out.telemetry.flush();
    expect(out.net.posts).toHaveLength(0);

    const inside = await started({ config: { enabled: true, sampleRate: 0.5 }, random: 0.1 });
    inside.telemetry.track('screen_view', { screen: '/health' });
    await inside.telemetry.flush();
    expect(inside.net.posts).toHaveLength(1);
  });

  it('events before start() are buffered (capped) and sent only after the preference + config are known', async () => {
    const h = makeHarness();
    h.telemetry.track('screen_view', { screen: '/health' });
    await h.telemetry.flush();
    expect(h.net.posts).toHaveLength(0); // preference not loaded yet: fail closed
    await h.telemetry.start();
    await flushPromises();
    await h.telemetry.flush();
    expect(h.sentEvents().map((e) => e.name)).toEqual(['session_start', 'screen_view']);
  });
});

describe('telemetry client: sessions', () => {
  it('session_end on background carries a duration bucket; same session after a short break', async () => {
    const h = await started();
    h.telemetry.track('screen_view', { screen: '/health' });
    await h.clock.advance(45_000);
    h.telemetry.onBackground();
    await flushPromises();
    const ids = new Set(h.net.posts.map((p) => p.body.session_id));
    const end = h.sentEvents().find((e) => e.name === 'session_end');
    expect(end.props).toEqual({ duration_s_bucket: 'lt60' });

    await h.clock.advance(5 * 60 * 1000);
    h.telemetry.onForeground();
    h.telemetry.track('screen_view', { screen: '/more' });
    await h.telemetry.flush();
    const last = h.net.posts[h.net.posts.length - 1].body;
    expect(ids.has(last.session_id)).toBe(true); // continued, not a new session
    expect(h.sentEvents().filter((e) => e.name === 'session_start')).toHaveLength(1);
  });

  it('a new session_id (and session_start cold:false) after 30 minutes in background', async () => {
    const h = await started();
    h.telemetry.track('screen_view', { screen: '/health' });
    h.telemetry.onBackground();
    await flushPromises();
    const first = h.net.posts[0].body.session_id;
    await h.clock.advance(31 * 60 * 1000);
    h.telemetry.onForeground();
    h.telemetry.track('screen_view', { screen: '/more' });
    await h.telemetry.flush();
    const last = h.net.posts[h.net.posts.length - 1].body;
    expect(last.session_id).not.toBe(first);
    expect(last.events[0]).toMatchObject({ name: 'session_start', props: { cold: false } });
  });
});

describe('telemetry client: opt-out / opt-in', () => {
  it('opt-out: queue cleared, ONE opt_out event sent, install_id deleted, nothing afterwards', async () => {
    const h = await started();
    h.telemetry.track('screen_view', { screen: '/health' });
    await h.telemetry.flush(); // the install id now exists
    const installBefore = h.secure.data.get(INSTALL_ID_KEY);
    expect(installBefore).toMatch(INSTALL_RE);
    h.net.posts.length = 0;

    h.telemetry.track('screen_view', { screen: '/more' }); // waiting in the queue
    h.telemetry.track('tap', { target: 'tab_health', screen: '/more' });
    expect(h.telemetry._debug().queued).toBeGreaterThan(0);

    await h.telemetry.optOut();
    await flushPromises();

    // exactly ONE request, carrying exactly ONE opt_out event; the queued events were discarded unsent
    expect(h.net.posts).toHaveLength(1);
    expect(h.net.posts[0].body.events.map((e) => e.name)).toEqual(['opt_out']);
    expect(h.net.posts[0].body.install_id).toBe(installBefore);
    expect(h.telemetry._debug().queued).toBe(0);
    // install_id deleted, preference persisted as OFF (also mirrored for AsyncStorage.clear())
    expect(h.secure.data.has(INSTALL_ID_KEY)).toBe(false);
    expect(h.kv.data.get(PREF_KEY)).toBe('0');
    expect(h.secure.data.get(OPT_OUT_MIRROR_KEY)).toBe('1');

    // nothing afterwards: no events, no timers, no requests
    h.telemetry.track('screen_view', { screen: '/health' });
    h.telemetry.trackFunnel('services', 'services_tab');
    h.telemetry.onBackground();
    h.telemetry.onForeground();
    await h.telemetry.flush();
    await h.clock.advance(120_000);
    expect(h.net.posts).toHaveLength(1);
    expect(h.telemetry._debug().queued).toBe(0);
    expect(h.secure.data.has(INSTALL_ID_KEY)).toBe(false);
    expect(h.clock.pending()).toBe(0);

    // opting out twice does not send a second opt_out
    await h.telemetry.optOut();
    expect(h.net.posts).toHaveLength(1);
  });

  it('an opt-out stays in force after AsyncStorage is wiped (sign-out) and on the next launch', async () => {
    const h = await started();
    await h.telemetry.optOut();
    h.kv.data.clear(); // AsyncStorage.clear() on sign-out / account deletion
    const relaunch = makeHarness({ kvInit: {}, secureInit: Object.fromEntries(h.secure.data) });
    await relaunch.telemetry.start();
    relaunch.telemetry.track('screen_view', { screen: '/health' });
    await relaunch.telemetry.flush();
    expect(relaunch.net.posts).toHaveLength(0);
    expect(relaunch.net.gets).toHaveLength(0); // not even the config call
    expect(relaunch.telemetry.isEnabled()).toBe(false);
  });

  it('opt-out before the kill-switch answered sends no opt_out (nothing was ever sent)', async () => {
    const h = makeHarness();
    h.net.configMode = 'offline';
    await h.telemetry.start();
    h.telemetry.track('screen_view', { screen: '/health' });
    await h.telemetry.optOut();
    expect(h.net.posts).toHaveLength(0);
    expect(h.telemetry._debug().queued).toBe(0);
  });

  it('opt back in: a NEW random install_id and events flow again', async () => {
    const h = await started();
    h.telemetry.track('screen_view', { screen: '/health' });
    await h.telemetry.flush();
    const first = h.net.posts[0].body.install_id;
    await h.telemetry.optOut();
    await h.telemetry.optIn();
    await flushPromises();
    expect(h.kv.data.get(PREF_KEY)).toBe('1');
    expect(h.secure.data.has(OPT_OUT_MIRROR_KEY)).toBe(false);
    h.telemetry.track('screen_view', { screen: '/more' });
    await h.telemetry.flush();
    const last = h.net.posts[h.net.posts.length - 1].body;
    expect(last.install_id).toMatch(INSTALL_RE);
    expect(last.install_id).not.toBe(first);
    expect(last.events.map((e) => e.name)).toContain('screen_view');
  });

  it('the preference defaults to ON when nothing is stored', async () => {
    const h = makeHarness();
    expect(await h.telemetry.readPreference()).toBe(true);
    await h.telemetry.optOut();
    expect(await h.telemetry.readPreference()).toBe(false);
  });
});

describe('telemetry client: never throws', () => {
  it('offline (every POST rejects): track/flush resolve, queue stays bounded', async () => {
    const h = await started();
    h.net.mode = 'offline';
    for (let i = 0; i < 400; i += 1) h.telemetry.track('screen_view', { screen: '/health' });
    await expect(h.telemetry.flush()).resolves.toBeUndefined();
    await h.clock.advance(60_000);
    expect(h.telemetry._debug().queued).toBeLessThanOrEqual(200);
  });

  it('a 400 from the server discards the batch (no retry loop)', async () => {
    const h = await started();
    h.net.mode = 400;
    h.telemetry.track('screen_view', { screen: '/health' });
    await h.telemetry.flush();
    expect(h.telemetry._debug().queued).toBe(0);
    expect(h.net.posts).toHaveLength(1);
  });

  it('disabled by preference: track/trackFunnel/onBackground are inert and do not throw', async () => {
    const h = makeHarness({ kvInit: { [PREF_KEY]: '0' } });
    await h.telemetry.start();
    expect(() => {
      h.telemetry.track('screen_view', { screen: '/health' });
      h.telemetry.trackFunnel('services', 'services_tab', { once: true });
      h.telemetry.onBackground();
      h.telemetry.onForeground();
    }).not.toThrow();
    await h.telemetry.flush();
    expect(h.net.posts).toHaveLength(0);
  });

  it('survives garbage input', async () => {
    const h = await started();
    expect(() => {
      h.telemetry.track(undefined, undefined);
      h.telemetry.track(null, null);
      h.telemetry.track('screen_view', { screen: Symbol('x') });
      h.telemetry.trackFunnel(undefined, undefined);
      h.telemetry.trackFunnel('nope', 'nope', { once: true });
    }).not.toThrow();
  });
});

describe('telemetry client: funnels', () => {
  it('validates the funnel/step pair', async () => {
    const h = await started();
    h.telemetry.trackFunnel('services', 'services_tab');
    h.telemetry.trackFunnel('services', 'log_saved'); // wrong funnel
    h.telemetry.trackFunnel('nope', 'services_tab');
    await h.telemetry.flush();
    const steps = h.sentEvents().filter((e) => e.name === 'funnel_step');
    expect(steps.map((e) => e.props)).toEqual([{ funnel: 'services', step: 'services_tab' }]);
  });

  it('once: emitted a single time per install, remembered across launches, forgotten on opt-out', async () => {
    const h = await started();
    h.telemetry.trackFunnel('activation', 'welcome_view', { once: true });
    await flushPromises();
    h.telemetry.trackFunnel('activation', 'welcome_view', { once: true });
    await flushPromises();
    await h.telemetry.flush();
    expect(h.sentEvents().filter((e) => e.name === 'funnel_step')).toHaveLength(1);
    expect(h.kv.data.get(FUNNEL_ONCE_KEY)).toContain('activation:welcome_view');

    await h.telemetry.optOut();
    expect(h.kv.data.has(FUNNEL_ONCE_KEY)).toBe(false);
  });
});
