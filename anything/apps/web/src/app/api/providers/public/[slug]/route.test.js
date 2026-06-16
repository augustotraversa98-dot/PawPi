import { describe, it, expect, vi, beforeEach } from 'vitest';

// GET /api/providers/public/[slug] — a single PUBLISHED provider's public profile
// (ticket 5). Any logged-in user; returns public business fields + locations +
// ACTIVE services only. Never staff, never owner identity, never pet data. A draft
// slug → 404. auth() and `sql` are mocked at the module boundary; there is no
// requireProviderRole/resolveUserId (unscoped public read).

import { GET } from './route';
import { auth } from '@/auth';
import sql from '@/app/api/utils/sql';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/app/api/utils/sql', () => ({ default: vi.fn() }));

const SESSION = { user: { id: 42 }, expires: '9999999999' };
const PARAMS = { params: { slug: 'happy-paws' } };

const allQueryText = () =>
  sql.mock.calls.map((c) => (c?.[0] ?? []).join(' ')).join(' ');

const req = () => new Request('http://localhost/api/providers/public/happy-paws');

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('GET /api/providers/public/[slug]', () => {
  it('anonymous → 401, no query', async () => {
    auth.mockResolvedValue(undefined);
    const res = await GET(req(), PARAMS);
    expect(res.status).toBe(401);
    expect(sql).not.toHaveBeenCalled();
  });

  it('a draft/unpublished slug → 404 (only published rows match)', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([]); // no published provider for this slug

    const res = await GET(req(), PARAMS);

    expect(res.status).toBe(404);
    // The lookup itself filters on published — drafts can never match.
    const [strings, ...values] = sql.mock.calls[0];
    expect(strings.join(' ')).toContain("status = 'published'");
    expect(values).toContain('happy-paws');
    // No follow-up location/service queries once the provider 404s.
    expect(sql).toHaveBeenCalledTimes(1);
  });

  it('published provider → public fields + locations + ACTIVE services only', async () => {
    auth.mockResolvedValue(SESSION);
    const PROVIDER = {
      id: 100,
      slug: 'happy-paws',
      name: 'Happy Paws',
      provider_type: 'vet',
      bio: 'We care',
      logo_url: null,
    };
    const LOCATIONS = [{ id: 5, name: 'Main', address: '1 St' }];
    const SERVICES = [{ id: 9, name: 'Checkup', active: true }];
    sql
      .mockResolvedValueOnce([PROVIDER]) // provider lookup
      .mockResolvedValueOnce(LOCATIONS) // locations
      .mockResolvedValueOnce(SERVICES) // active services
      .mockResolvedValueOnce([{ capability: 'shop' }, { capability: 'vet' }]); // capabilities

    const res = await GET(req(), PARAMS);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      provider: PROVIDER,
      locations: LOCATIONS,
      services: SERVICES,
      capabilities: ['shop', 'vet'],
    });

    // Services query is scoped to the resolved provider id and active=true only.
    const [svcStrings, ...svcValues] = sql.mock.calls[2];
    expect(svcStrings.join(' ')).toContain('active = true');
    expect(svcValues).toContain(100);
  });

  it('response carries NO staff list and NO owner_user_profile_id', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([{ id: 100, slug: 'happy-paws', name: 'Happy Paws' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]); // capabilities

    const res = await GET(req(), PARAMS);
    const body = await res.json();

    expect(body).not.toHaveProperty('staff');
    expect(body.provider).not.toHaveProperty('owner_user_profile_id');
    // No SQL path touches provider_staff or the owner column.
    const text = allQueryText();
    expect(text).not.toContain('provider_staff');
    expect(text).not.toContain('owner_user_profile_id');
  });

  it('never queries care_access_grants (structural)', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([{ id: 100, slug: 'happy-paws' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]); // capabilities

    await GET(req(), PARAMS);

    expect(allQueryText()).not.toContain('care_access');
  });
});
