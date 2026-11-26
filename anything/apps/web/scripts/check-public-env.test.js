// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { nextPublicProcessEnv } from '../plugins/nextPublicProcessEnv';
import { checkPublicEnv, EXPECTED_PUBLIC_ENV } from './check-public-env.mjs';

const MAPS = 'NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY';

describe('checkPublicEnv', () => {
  it('flags an expected var that is not set (the production Maps-key case)', () => {
    const r = checkPublicEnv({ NEXT_PUBLIC_TERMS_URL: 'https://x.test/t' }, 'https://x.test/t');
    expect(r.unsetExpected).toEqual([MAPS]);
    expect(r.missingFromBundle).toEqual([]);
  });

  it('treats an empty value as unset', () => {
    expect(checkPublicEnv({ [MAPS]: '' }, '').unsetExpected).toEqual([MAPS]);
  });

  it('reports a set var whose value is in the bundle as present', () => {
    const r = checkPublicEnv({ [MAPS]: 'abc123' }, 'x={k:"abc123"}');
    expect(r).toEqual({ present: [MAPS], missingFromBundle: [], unsetExpected: [] });
  });

  it('reports a set var that never reached the bundle', () => {
    const r = checkPublicEnv({ [MAPS]: 'abc123' }, 'nothing here');
    expect(r.missingFromBundle).toEqual([MAPS]);
  });

  it('finds values that need JSON escaping in the bundle', () => {
    const r = checkPublicEnv({ NEXT_PUBLIC_X: 'a"b' }, 'x={k:"a\\"b"}', {});
    expect(r.present).toEqual(['NEXT_PUBLIC_X']);
  });

  it('lists the Maps browser key as an expected var', () => {
    expect(Object.keys(EXPECTED_PUBLIC_ENV)).toContain(MAPS);
  });
});

describe('nextPublicProcessEnv plugin (what the check relies on)', () => {
  const OLD = process.env[MAPS];
  const OLD_SECRET = process.env.SOME_SERVER_SECRET;

  it('inlines NEXT_PUBLIC_* from the build environment into client modules only', () => {
    process.env[MAPS] = 'sentinel-maps-key';
    process.env.SOME_SERVER_SECRET = 'do-not-inline';
    try {
      const plugin = nextPublicProcessEnv();
      const client = plugin.transform('const a = 1;', '/src/a.jsx', { ssr: false });
      expect(client.code).toContain('sentinel-maps-key');
      expect(client.code).not.toContain('do-not-inline');
      // Server/SSR modules are left alone.
      expect(plugin.transform('const a = 1;', '/src/a.jsx', { ssr: true })).toBeNull();
    } finally {
      if (OLD === undefined) delete process.env[MAPS];
      else process.env[MAPS] = OLD;
      if (OLD_SECRET === undefined) delete process.env.SOME_SERVER_SECRET;
      else process.env.SOME_SERVER_SECRET = OLD_SECRET;
    }
  });

  it('a var that is not set on the build is absent from the client stub', () => {
    delete process.env[MAPS];
    const plugin = nextPublicProcessEnv();
    const client = plugin.transform('const a = 1;', '/src/a.jsx', { ssr: false });
    expect(client.code).not.toContain(MAPS);
  });
});
