// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The patched fetch keeps `originalFetch` from module load, so stub the global first and import afterwards.
let outbound;
let fetchWithHeaders;

beforeEach(async () => {
  vi.resetModules();
  outbound = vi.fn(async () => new Response('ok'));
  vi.stubGlobal('fetch', outbound);
  vi.stubEnv('NEXT_PUBLIC_PROJECT_GROUP_ID', 'group-1');
  ({ fetchWithHeaders } = await import('./fetch'));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('the patched fetch and the removed /integrations proxy', () => {
  it('no longer treats /integrations as a first-party path: it is passed through untouched', async () => {
    await fetchWithHeaders('/integrations/example/path');
    expect(outbound).toHaveBeenCalledTimes(1);
    const [url, init] = outbound.mock.calls[0];
    expect(url).toBe('/integrations/example/path'); // not rewritten to the old platform's host
    expect(init).toBeUndefined(); // no platform headers added
  });

  it('keeps treating /_create as first-party (platform header added)', async () => {
    await fetchWithHeaders('/_create/x');
    const [, init] = outbound.mock.calls[0];
    expect(new Headers(init.headers).get('x-createxyz-project-group-id')).toBe('group-1');
  });

  it('leaves /api requests alone', async () => {
    await fetchWithHeaders('/api/pets');
    expect(outbound.mock.calls[0][1]).toBeUndefined();
  });
});
