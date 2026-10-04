import {
  apiPathFromUrl,
  routeTemplateForApiPath,
  statusClassOf,
  isTelemetryPath,
  buildApiCallProps,
  errorCodeOf,
} from './apiCall';
import { API_ROUTE_TEMPLATES } from './apiRoutes';
import { AREAS, ROUTE_PATTERN, ERROR_CODE_PATTERN } from './registry';
import { areaForPath } from './apiAreas';
import { sanitizeEvent } from './validate';

const BASE = 'https://pawpi.example';

describe('api path helpers', () => {
  it('extracts first-party /api paths (relative or base-URL form), query and hash stripped', () => {
    expect(apiPathFromUrl('/api/pets?limit=5', BASE)).toBe('/api/pets');
    expect(apiPathFromUrl(`${BASE}/api/pets/123/profile?x=1#y`, BASE)).toBe('/api/pets/123/profile');
    expect(apiPathFromUrl('https://other.example/api/pets', BASE)).toBeNull();
    expect(apiPathFromUrl('/assets/logo.png', BASE)).toBeNull();
    expect(apiPathFromUrl('file:///tmp/a.jpg', BASE)).toBeNull();
    expect(apiPathFromUrl(undefined, BASE)).toBeNull();
    expect(apiPathFromUrl({ url: '/api/pets' }, BASE)).toBeNull();
  });

  it('flags the telemetry endpoints (no feedback loop)', () => {
    expect(isTelemetryPath('/api/telemetry/events')).toBe(true);
    expect(isTelemetryPath('/api/telemetry/config')).toBe(true);
    expect(isTelemetryPath('/api/telemetry')).toBe(true);
    expect(isTelemetryPath('/api/telemetry-ish')).toBe(false);
    expect(isTelemetryPath('/api/pets')).toBe(false);
  });

  it('status classes', () => {
    expect(statusClassOf(200)).toBe('2xx');
    expect(statusClassOf(204)).toBe('2xx');
    expect(statusClassOf(301)).toBe('3xx');
    expect(statusClassOf(404)).toBe('4xx');
    expect(statusClassOf(503)).toBe('5xx');
    expect(statusClassOf(null)).toBe('unknown');
    expect(statusClassOf(undefined)).toBe('unknown');
    expect(statusClassOf(99)).toBe('unknown');
    expect(statusClassOf(600)).toBe('unknown');
    expect(statusClassOf('x')).toBe('unknown');
  });
});

describe('routeTemplateForApiPath: only server templates ever leave the device', () => {
  it('turns concrete paths into templates', () => {
    expect(routeTemplateForApiPath('/api/pets')).toBe('/api/pets');
    expect(routeTemplateForApiPath('/api/pets/8f14e45f-ceea-467a-9575-1b1c0a1b1c1d')).toBe('/api/pets/:id');
    expect(routeTemplateForApiPath('/api/pets/luna_the_dog/profile')).toBe('/api/pets/:id/profile');
    expect(routeTemplateForApiPath('/api/providers/42/book')).toBe('/api/providers/:id/book');
  });

  it('prefers a static template over a parameter (handle-availability is not a pet id)', () => {
    expect(routeTemplateForApiPath('/api/pets/handle-availability')).toBe('/api/pets/handle-availability');
  });

  it('a path no template matches is "unknown" (an unknown slug/handle is never echoed)', () => {
    expect(routeTemplateForApiPath('/api/zzz/maxthedog')).toBe('unknown');
    expect(routeTemplateForApiPath('/api/pets/a/b/c/d/e/f/g/h/i')).toBe('unknown');
    expect(routeTemplateForApiPath('')).toBe('unknown');
    expect(routeTemplateForApiPath(undefined)).toBe('unknown');
  });

  it('every template is a valid registry route, maps to a registry area and is accepted by the validator', () => {
    const re = new RegExp(ROUTE_PATTERN);
    for (const tpl of API_ROUTE_TEMPLATES) {
      expect(re.test(tpl)).toBe(true);
      expect(AREAS).toContain(areaForPath(tpl));
      expect(
        sanitizeEvent('api_call', { area: areaForPath(tpl), route: tpl, status_class: '2xx', ms_bucket: 'lt100' }),
      ).not.toBeNull();
    }
  });
});

describe('buildApiCallProps', () => {
  it('builds area / route / status_class / ms_bucket', () => {
    expect(buildApiCallProps({ url: '/api/pets/abc123def/profile?x=1', status: 200, ms: 250, baseUrl: BASE })).toEqual({
      area: 'pets',
      route: '/api/pets/:id/profile',
      status_class: '2xx',
      ms_bucket: 'lt300',
    });
    expect(buildApiCallProps({ url: `${BASE}/api/posts`, status: 500, ms: 12_000, baseUrl: BASE })).toEqual({
      area: 'feed',
      route: '/api/posts',
      status_class: '5xx',
      ms_bucket: 'gte10000',
    });
  });

  it('a request with no response is status_class "unknown"', () => {
    expect(buildApiCallProps({ url: '/api/pets', status: null, ms: 50, baseUrl: BASE }).status_class).toBe('unknown');
  });

  it('SKIPS /api/telemetry/* and non-API urls', () => {
    expect(buildApiCallProps({ url: '/api/telemetry/events', status: 204, ms: 5, baseUrl: BASE })).toBeNull();
    expect(buildApiCallProps({ url: `${BASE}/api/telemetry/config`, status: 200, ms: 5, baseUrl: BASE })).toBeNull();
    expect(buildApiCallProps({ url: 'https://example.com/x', status: 200, ms: 5, baseUrl: BASE })).toBeNull();
  });

  it('never throws on bad input', () => {
    expect(() => buildApiCallProps(undefined)).not.toThrow();
    expect(buildApiCallProps({ url: '/api/pets', status: 200, ms: NaN, baseUrl: BASE })).toBeNull();
  });
});

describe('errorCodeOf', () => {
  it('uses the class name only and always matches the registry pattern', () => {
    const re = new RegExp(ERROR_CODE_PATTERN);
    expect(errorCodeOf(new TypeError('Cannot read property email of undefined'))).toBe('TypeError');
    expect(errorCodeOf({ name: 'Weird Name!!' })).toBe('WeirdName');
    expect(errorCodeOf('plain string with luna@example.com')).toBe('Error');
    expect(errorCodeOf(null)).toBe('Error');
    expect(errorCodeOf(undefined, 'Fallback')).toBe('Fallback');
    expect(errorCodeOf({ name: 'x'.repeat(100) }).length).toBe(32);
    expect(errorCodeOf({ name: 'deadbeefdeadbeefdead' })).toBe('Error');
    for (const v of [new Error('x'), { name: 'A.B-c_9' }, null]) expect(re.test(errorCodeOf(v))).toBe(true);
  });
});
