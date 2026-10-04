import { routeTemplate } from './routeTemplate';
import { SCREENS } from './registry';

describe('routeTemplate', () => {
  it('maps real expo-router pathnames to registry templates', () => {
    expect(routeTemplate('/')).toBe('/');
    expect(routeTemplate('/health')).toBe('/health');
    expect(routeTemplate('/services')).toBe('/services');
    expect(routeTemplate('/more')).toBe('/more');
    expect(routeTemplate('/more/settings')).toBe('/more/settings');
    expect(routeTemplate('/service/provider')).toBe('/service/provider');
    expect(routeTemplate('/onboarding')).toBe('/onboarding');
    expect(routeTemplate('/welcome')).toBe('/welcome');
    expect(routeTemplate('/business')).toBe('/business');
  });

  it('tolerates groups, index, trailing slashes, query strings and hashes (never params)', () => {
    expect(routeTemplate('/(tabs)/health')).toBe('/health');
    expect(routeTemplate('/(tabs)')).toBe('/');
    expect(routeTemplate('/(tabs)/more/index')).toBe('/more');
    expect(routeTemplate('/health/')).toBe('/health');
    expect(routeTemplate('/service/provider?id=abc123&petId=77')).toBe('/service/provider');
    expect(routeTemplate('/pet-profile#top')).toBe('/pet-profile');
  });

  it('anything not in the registry is the bounded token "unknown" (no raw path leaks)', () => {
    expect(routeTemplate('/nope')).toBe('unknown');
    expect(routeTemplate('/pet-profile/8f14e45f-ceea-467a-9575-1b1c0a1b1c1d')).toBe('unknown');
    expect(routeTemplate('/service/provider/123')).toBe('unknown');
    expect(routeTemplate('')).toBe('unknown');
    expect(routeTemplate(undefined)).toBe('unknown');
    expect(routeTemplate(null)).toBe('unknown');
    expect(routeTemplate(42)).toBe('unknown');
  });

  it('every registry screen maps to itself and the result is always a registry value', () => {
    for (const s of SCREENS) {
      if (s === 'unknown') continue;
      expect(routeTemplate(s)).toBe(s);
    }
    for (const p of ['/x', '/health', '/a/b/c', '/(tabs)/zzz', 'health']) {
      expect(SCREENS).toContain(routeTemplate(p));
    }
  });
});
