// The public track() API end to end over the real core with fakes (no react-native).
import { track, trackTap, trackFunnel, trackFeature, trackForm, trackError } from './track';
import { __setTelemetryForTests } from './runtime';
import { setCurrentScreen } from './screenState';
import { makeHarness, flushPromises } from './testKit';

let h;
beforeEach(async () => {
  h = makeHarness();
  __setTelemetryForTests(h.telemetry);
  await h.telemetry.start();
  await flushPromises();
  setCurrentScreen('/health');
});
afterEach(() => __setTelemetryForTests(null));

const names = () => h.sentEvents().map((e) => e.name);

describe('track()', () => {
  it('PII guard: props keyed like personal data never leave, even on a known event', async () => {
    track('screen_view', { screen: '/health', email: 'luna@example.com' });
    track('feature_used', { feature: 'add_dog', petName: 'Luna' });
    track('form_step', { form: 'add_dog', step: 'name', action: 'view', userId: 'u1' });
    track('tap', { target: 'tab_health', screen: '/', handle: '@luna' });
    await h.telemetry.flush();
    expect(h.net.posts).toHaveLength(0);
  });

  it('PII guard: strings that are not registry values or safe patterns are dropped', async () => {
    track('screen_view', { screen: '/pet-profile/Luna' });
    track('screen_view', { screen: 'Luna' });
    track('tap', { target: 'Luna', screen: '/' });
    track('form_step', { form: 'add_dog', step: 'Luna is a very good dog', action: 'view' });
    track('feature_used', { feature: 'luna@example.com' });
    await h.telemetry.flush();
    expect(h.net.posts).toHaveLength(0);
  });

  it('valid events are sent', async () => {
    track('screen_view', { screen: '/health' });
    trackFeature('add_dog');
    trackForm('add_dog', 'photo', 'view');
    trackFunnel('health_logging', 'health_tab');
    await h.telemetry.flush();
    expect(names()).toEqual(['session_start', 'screen_view', 'feature_used', 'form_step', 'funnel_step']);
  });

  it('trackTap: registry keys only, screen added automatically', async () => {
    trackTap('tab_services');
    trackTap('Tab-Health'); // normalised: lower-case, - -> _
    trackTap('Buy now!');
    trackTap(undefined);
    await h.telemetry.flush();
    const taps = h.sentEvents().filter((e) => e.name === 'tap');
    expect(taps.map((e) => e.props)).toEqual([
      { target: 'tab_services', screen: '/health' },
      { target: 'tab_health', screen: '/health' },
    ]);
  });

  it('trackError sends only the error class name', async () => {
    trackError('js', new TypeError('Cannot read property email of undefined'));
    trackError('render', { name: 'RenderCrash', message: 'luna@example.com' }, 'RenderError');
    await h.telemetry.flush();
    const errors = h.sentEvents().filter((e) => e.name === 'error');
    expect(errors.map((e) => e.props)).toEqual([
      { kind: 'js', screen: '/health', code: 'TypeError' },
      { kind: 'render', screen: '/health', code: 'RenderCrash' },
    ]);
    expect(JSON.stringify(h.net.posts)).not.toMatch(/luna|email/);
  });

  it('never throws: no instance, a throwing instance, offline, disabled, garbage', async () => {
    __setTelemetryForTests({
      track() {
        throw new Error('boom');
      },
      trackFunnel() {
        throw new Error('boom');
      },
    });
    expect(() => {
      track('screen_view', { screen: '/health' });
      trackTap('tab_health');
      trackFunnel('services', 'services_tab');
      trackFeature('add_dog');
      trackForm('add_dog', 'x', 'view');
      trackError('js', new Error('x'));
    }).not.toThrow();

    __setTelemetryForTests(h.telemetry);
    h.net.mode = 'offline';
    expect(() => {
      track('screen_view', { screen: '/health' });
      track(undefined);
      trackTap(null);
    }).not.toThrow();
    await expect(h.telemetry.flush()).resolves.toBeUndefined();

    await h.telemetry.optOut(); // disabled
    expect(() => {
      track('screen_view', { screen: '/health' });
      trackFunnel('services', 'services_tab', { once: true });
    }).not.toThrow();
  });
});
