import { sanitizeEvent, PII_KEY_RE } from './validate';

describe('sanitizeEvent (client-side registry validation)', () => {
  it('accepts a valid event of every kind and returns the clean props', () => {
    expect(sanitizeEvent('session_start', { cold: true })).toEqual({ cold: true });
    expect(sanitizeEvent('session_end', { duration_s_bucket: 'lt60' })).toEqual({ duration_s_bucket: 'lt60' });
    expect(sanitizeEvent('screen_view', { screen: '/health' })).toEqual({ screen: '/health' });
    expect(sanitizeEvent('tap', { target: 'tab_health', screen: '/' })).toEqual({ target: 'tab_health', screen: '/' });
    expect(sanitizeEvent('form_step', { form: 'add_dog', step: 'photo', action: 'view' })).toEqual({
      form: 'add_dog',
      step: 'photo',
      action: 'view',
    });
    expect(
      sanitizeEvent('api_call', { area: 'pets', route: '/api/pets/:id/profile', status_class: '2xx', ms_bucket: 'lt300' }),
    ).toBeTruthy();
    expect(sanitizeEvent('error', { kind: 'js', screen: 'unknown', code: 'TypeError' })).toBeTruthy();
    expect(sanitizeEvent('error', { kind: 'js', screen: 'unknown' })).toEqual({ kind: 'js', screen: 'unknown' });
    expect(sanitizeEvent('nav_unexpected_redirect', { from: '/services', to: '/onboarding', reason: 'onboarding_guard' })).toBeTruthy();
    expect(sanitizeEvent('perf_startup', { ms_bucket: 'lt3000' })).toBeTruthy();
    expect(sanitizeEvent('perf_screen_ready', { screen: '/health', ms_bucket: 'lt300' })).toBeTruthy();
    expect(sanitizeEvent('feature_used', { feature: 'add_dog' })).toBeTruthy();
    expect(sanitizeEvent('funnel_step', { funnel: 'services', step: 'booking_done' })).toBeTruthy();
    expect(sanitizeEvent('opt_out', {})).toEqual({});
  });

  it('drops unknown events, unknown props and values that are not in the registry', () => {
    expect(sanitizeEvent('made_up', {})).toBeNull();
    expect(sanitizeEvent('screen_view', { screen: '/not-a-screen' })).toBeNull();
    expect(sanitizeEvent('screen_view', { screen: '/health', extra: 'x' })).toBeNull();
    expect(sanitizeEvent('screen_view', {})).toBeNull(); // required prop missing
    expect(sanitizeEvent('tap', { target: 'Buy Now', screen: '/' })).toBeNull(); // visible text, not a key
    expect(sanitizeEvent('feature_used', { feature: 'telepathy' })).toBeNull();
    expect(sanitizeEvent('funnel_step', { funnel: 'services', step: 'log_saved' })).toBeNull(); // wrong pair
    expect(sanitizeEvent('funnel_step', { funnel: 'nope', step: 'x' })).toBeNull();
    expect(sanitizeEvent('session_start', { cold: 'yes' })).toBeNull();
    expect(sanitizeEvent('session_end', { duration_s_bucket: 12 })).toBeNull();
  });

  it('PII-guard: prop keys that look like personal data are refused, whatever the event', () => {
    for (const key of ['email', 'name', 'petName', 'pet_id', 'handle', 'userId', 'address', 'phone', 'text', 'password', 'token', 'lat', 'lng', 'location', 'ip', 'Email', 'USERNAME']) {
      expect(PII_KEY_RE.test(key)).toBe(true);
      expect(sanitizeEvent('screen_view', { screen: '/health', [key]: 'x' })).toBeNull();
      expect(sanitizeEvent('made_up', { [key]: 'x' })).toBeNull();
    }
  });

  it('PII-guard: free text / ids in allowed pattern props are dropped', () => {
    expect(sanitizeEvent('form_step', { form: 'add_dog', step: 'Luna the dog', action: 'view' })).toBeNull();
    expect(sanitizeEvent('form_step', { form: 'add_dog', step: 'a'.repeat(200), action: 'view' })).toBeNull();
    expect(sanitizeEvent('api_call', { area: 'pets', route: '/api/pets/8f14e45f-ceea-467a-9575-1b1c0a1b1c1d', status_class: '2xx', ms_bucket: 'lt100' })).toBeNull();
    expect(sanitizeEvent('api_call', { area: 'pets', route: '/api/pets/123/profile', status_class: '2xx', ms_bucket: 'lt100' })).toBeNull();
    expect(sanitizeEvent('error', { kind: 'js', screen: '/', code: 'Cannot read property name of undefined' })).toBeNull();
    expect(sanitizeEvent('error', { kind: 'js', screen: '/', code: 'deadbeefdeadbeef' })).toBeNull();
  });

  it('rejects non-object props, nested values and never throws', () => {
    expect(sanitizeEvent('screen_view', 'x')).toBeNull();
    expect(sanitizeEvent('screen_view', ['/health'])).toBeNull();
    expect(sanitizeEvent('screen_view', { screen: { a: 1 } })).toBeNull();
    expect(sanitizeEvent('screen_view', { screen: null })).toBeNull();
    expect(() => sanitizeEvent(undefined, undefined)).not.toThrow();
    expect(() => sanitizeEvent({}, null)).not.toThrow();
    const cyclic = {};
    cyclic.self = cyclic;
    expect(() => sanitizeEvent('screen_view', cyclic)).not.toThrow();
  });
});
