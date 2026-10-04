import { describe, it, expect } from 'vitest';
import {
  methodLabel,
  statusClass,
  templateFromRoutePath,
  pickMatchedApiPath,
  normalizePath,
  routeLabel,
  PAGE_ROUTE,
  UNMATCHED_ROUTE,
  OVERFLOW_ROUTE,
} from './routes.js';

const UUID = '3f2b8c1e-9a4d-4e7b-8c55-0d1f2a3b4c5d';

describe('templateFromRoutePath', () => {
  it.each([
    ['/api/pets/:petId/profile', '/api/pets/:id/profile'],
    ['/api/pets/:id/profile', '/api/pets/:id/profile'],
    ['/api/pets/[id]/profile', '/api/pets/:id/profile'],
    ['/api/places/[placeId]/reviews', '/api/places/:id/reviews'],
    ['/api/files/:path{.+}', '/api/files/:id'],
    ['/api/files/[...slug]', '/api/files/:id'],
    ['/api/auth/*', '/api/auth/*'],
    ['/api/social-walks/:id/join-request/:requestId/approve', '/api/social-walks/:id/join-request/:id/approve'],
    ['/api/pets', '/api/pets'],
  ])('%s -> %s', (input, expected) => {
    expect(templateFromRoutePath(input)).toBe(expected);
  });

  it('strips a query string', () => {
    expect(templateFromRoutePath('/api/pets/:id?x=1')).toBe('/api/pets/:id');
  });
});

describe('pickMatchedApiPath', () => {
  it('returns the last /api route, skipping catch-all middleware', () => {
    expect(
      pickMatchedApiPath([
        { path: '*' },
        { path: '/api/*' },
        { path: '/api/auth/*' },
        { path: '/api/pets/:id' },
      ])
    ).toBe('/api/pets/:id');
  });
  it('returns undefined when only catch-alls matched', () => {
    expect(pickMatchedApiPath([{ path: '*' }, { path: '/api/*' }])).toBeUndefined();
    expect(pickMatchedApiPath(undefined)).toBeUndefined();
    expect(pickMatchedApiPath([null, {}, { path: 5 }])).toBeUndefined();
  });
});

describe('normalizePath (fallback)', () => {
  it.each([
    ['/api/pets/42/profile', '/api/pets/:id/profile'],
    ['/api/pets/42/profile?token=abc&x=1', '/api/pets/:id/profile'],
    [`/api/pets/${UUID}/profile`, '/api/pets/:id/profile'],
    ['/api/pets/0123456789abcdef0123/profile', '/api/pets/:id/profile'],
    ['/api/places/search', '/api/places/search'],
    ['/api/providers/public/happy-paws-9', '/api/providers/public/:id'],
    ['/api/pets/a@b.com/profile', '/api/pets/:id/profile'],
    ['/api/pets/%E2%9C%93/profile', '/api/pets/:id/profile'],
    ['/api/pets/42#frag', '/api/pets/:id'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizePath(input)).toBe(expected);
  });

  it('refuses paths whose prefix is not a known API dir', () => {
    expect(normalizePath('/api/random-attacker-string/1')).toBe(UNMATCHED_ROUTE);
    expect(normalizePath('/assets/x.js')).toBe(UNMATCHED_ROUTE);
    expect(normalizePath('/api')).toBe(UNMATCHED_ROUTE);
    expect(normalizePath(undefined)).toBe(UNMATCHED_ROUTE);
  });

  it('caps depth', () => {
    const deep = '/api/pets/' + Array.from({ length: 30 }, (_, i) => 'seg' + 'x'.repeat(i % 3)).join('/');
    expect(normalizePath(deep).split('/').filter(Boolean).length).toBeLessThanOrEqual(8);
  });
});

describe('routeLabel', () => {
  it('uses the matched template, never the raw path', () => {
    expect(
      routeLabel({
        matchedRoutes: [{ path: '*' }, { path: '/api/*' }, { path: '/api/pets/:petId/profile' }],
        path: '/api/pets/123/profile',
        status: 200,
      })
    ).toBe('/api/pets/:id/profile');
  });

  it('buckets SPA pages / assets / non-api to /__page', () => {
    for (const path of ['/', '/account/signin', '/assets/app-4f3a2b.js', '/pets/123', '/integrations/x/y', '', undefined]) {
      expect(routeLabel({ matchedRoutes: [{ path: '*' }], path, status: 200 })).toBe(PAGE_ROUTE);
    }
  });

  it('buckets unmatched API paths (404/405) to "unmatched"', () => {
    expect(routeLabel({ matchedRoutes: [{ path: '/api/*' }], path: '/api/nope/123', status: 404 })).toBe(UNMATCHED_ROUTE);
    expect(routeLabel({ matchedRoutes: [], path: '/api/pets/123', status: 405 })).toBe(UNMATCHED_ROUTE);
  });

  it('falls back to the normalizer when no template matched but a handler answered', () => {
    expect(routeLabel({ matchedRoutes: undefined, path: '/api/pets/77/profile', status: 200 })).toBe('/api/pets/:id/profile');
  });

  it('unknown prefix in the fallback is "unmatched"', () => {
    expect(routeLabel({ matchedRoutes: [], path: '/api/zzz/1', status: 200 })).toBe(UNMATCHED_ROUTE);
  });

  it('caps the number of distinct fallback routes', () => {
    const labels = new Set();
    for (let i = 0; i < 300; i++) {
      labels.add(routeLabel({ matchedRoutes: [], path: `/api/pets/${'a'.repeat(1 + (i % 30))}x${'b'.repeat(i % 7)}/${'z'.repeat(1 + Math.floor(i / 7))}`, status: 200 }));
    }
    expect(labels.has(OVERFLOW_ROUTE)).toBe(true);
    expect(labels.size).toBeLessThanOrEqual(102);
  });
});

describe('methodLabel / statusClass', () => {
  it('bounds methods', () => {
    expect(methodLabel('get')).toBe('GET');
    expect(methodLabel('PATCH')).toBe('PATCH');
    expect(methodLabel('PROPFIND')).toBe('OTHER');
    expect(methodLabel('x'.repeat(500))).toBe('OTHER');
    expect(methodLabel(undefined)).toBe('OTHER');
  });
  it('maps status classes', () => {
    expect(statusClass(200)).toBe('2xx');
    expect(statusClass(204)).toBe('2xx');
    expect(statusClass(302)).toBe('3xx');
    expect(statusClass(404)).toBe('4xx');
    expect(statusClass(503)).toBe('5xx');
    expect(statusClass(101)).toBe('1xx');
    expect(statusClass(0)).toBe('unknown');
    expect(statusClass(undefined)).toBe('unknown');
    expect(statusClass(999)).toBe('unknown');
    expect(statusClass('abc')).toBe('unknown');
  });
});
