// Demo-content guard (night-run A2a / migration 0111) — proves that content owned by an
// is_demo profile is EXCLUDED from every GLOBAL surface (Discover, Search, feed Suggested,
// provider + adoption discovery) while identical REAL content stays visible. Run as the REAL
// handlers against the embedded DB AS pawpi_app (FORCE RLS like production).
//
// Fixture: one real owner and one demo owner (is_demo=true), each with a matching pet + daily
// post + published provider + available adoption listing, all sharing the search token "zeta".
// Every assertion is symmetric: the real row appears, the demo row does not.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { inject } from 'vitest';
import postgres from 'postgres';
import type { Sql } from 'postgres';
import {
  makeTestSql,
  resetDb,
  seedUser,
  seedProvider,
  seedCapability,
  seedAdoptableListing,
  seedPost,
} from './db';

const authState = vi.hoisted(() => ({ session: null as any }));
vi.mock('@/auth', () => ({ auth: async () => authState.session }));

const VIEWER = { authUserId: 1, profileId: 1, username: 'viewer' };
const REAL = { authUserId: 10, profileId: 10, username: 'zeta_real_owner' };
const DEMO = { authUserId: 11, profileId: 11, username: 'zeta_demo_owner' };
const REAL_PET = 100;
const DEMO_PET = 101;
const REAL_PROVIDER = 200;
const DEMO_PROVIDER = 201;

let raw: Sql;
let app: Sql;
let appSql: any;
let discoverGET: (r: Request) => Promise<Response>;
let searchGET: (r: Request) => Promise<Response>;
let suggestionsGET: (r: Request) => Promise<Response>;
let providersDiscoverGET: (r: Request) => Promise<Response>;
let adoptionGET: (r: Request) => Promise<Response>;

const req = (path: string) => new Request(`http://localhost${path}`);

beforeAll(async () => {
  raw = makeTestSql();
  const url = new URL(inject('TEST_DATABASE_URL'));
  app = postgres({
    host: url.hostname,
    port: Number(url.port),
    database: url.pathname.replace(/^\//, ''),
    username: 'pawpi_app',
    password: 'pawpi_app',
    max: 1,
    onnotice: () => {},
  });
  url.username = 'pawpi_app';
  url.password = 'pawpi_app';
  process.env.DATABASE_URL = url.toString();
  process.env.DATABASE_SSL = 'disable';
  appSql = (await import('@/app/api/utils/sql')).default;
  discoverGET = (await import('@/app/api/discover/route')).GET as any;
  searchGET = (await import('@/app/api/search/route')).GET as any;
  suggestionsGET = (await import('@/app/api/feed/suggestions/route')).GET as any;
  providersDiscoverGET = (await import('@/app/api/providers/discover/route')).GET as any;
  adoptionGET = (await import('@/app/api/adoption/listings/route')).GET as any;
});

afterAll(async () => {
  await appSql.end?.();
  await app.end();
  await raw.end();
});

afterEach(async () => {
  await resetDb(raw);
  authState.session = null;
});

beforeEach(async () => {
  for (const u of [VIEWER, REAL, DEMO]) await seedUser(raw, u);
  // Flag the demo owner (0111). Everything they own must drop out of global surfaces.
  await raw`update user_profiles set is_demo = true where id = ${DEMO.profileId}`;

  // Two pets sharing the "zeta" search token.
  await raw`insert into pets (id, owner_user_id, name, handle, species, breed)
            values (${REAL_PET}, ${REAL.profileId}, 'Zeta Real', 'zeta-real', 'dog', 'zeta breed')`;
  await raw`insert into pets (id, owner_user_id, name, handle, species, breed)
            values (${DEMO_PET}, ${DEMO.profileId}, 'Zeta Demo', 'zeta-demo', 'dog', 'zeta breed')`;

  // One daily post each (feeds it into Discover moments + the Suggested feed).
  await seedPost(raw, { postId: 1000, userId: REAL.profileId, petId: REAL_PET, caption: 'real moment' });
  await seedPost(raw, { postId: 1001, userId: DEMO.profileId, petId: DEMO_PET, caption: 'demo moment' });

  // Two published providers (businesses) sharing the "zeta" token, each with an adoption listing.
  await seedProvider(raw, { providerId: REAL_PROVIDER, ownerUserProfileId: REAL.profileId, slug: 'zeta-real-clinic', status: 'published' });
  await seedProvider(raw, { providerId: DEMO_PROVIDER, ownerUserProfileId: DEMO.profileId, slug: 'zeta-demo-clinic', status: 'published' });
  await raw`update providers set name = 'Zeta Real Clinic' where id = ${REAL_PROVIDER}`;
  await raw`update providers set name = 'Zeta Demo Clinic', is_demo = true where id = ${DEMO_PROVIDER}`;
  for (const id of [REAL_PROVIDER, DEMO_PROVIDER]) await seedCapability(raw, { providerId: id, capability: 'adoption' });
  await seedAdoptableListing(raw, { listingId: 2000, providerId: REAL_PROVIDER, name: 'Zeta Real Pup', status: 'available' });
  await seedAdoptableListing(raw, { listingId: 2001, providerId: DEMO_PROVIDER, name: 'Zeta Demo Pup', status: 'available' });

  authState.session = { user: { id: String(VIEWER.authUserId) } };
});

async function json(r: Response) {
  expect(r.status).toBe(200);
  return r.json();
}

describe('demo-content guard (0111): global surfaces exclude is_demo owners', () => {
  it('Discover: profiles + moments exclude the demo owner, keep the real one', async () => {
    const { profiles, moments } = await json(await discoverGET(req('/api/discover')));
    const profileIds = profiles.map((p: any) => p.id);
    expect(profileIds).toContain(REAL_PET);
    expect(profileIds).not.toContain(DEMO_PET);
    const momentPetIds = moments.map((m: any) => m.pet_id);
    expect(momentPetIds).toContain(REAL_PET);
    expect(momentPetIds).not.toContain(DEMO_PET);
  });

  it('Search: pets, owners, and providers exclude the demo owner', async () => {
    const { pets, owners, providers } = await json(await searchGET(req('/api/search?q=zeta')));
    expect(pets.map((p: any) => p.id)).toEqual(expect.arrayContaining([REAL_PET]));
    expect(pets.map((p: any) => p.id)).not.toContain(DEMO_PET);
    expect(owners.map((o: any) => o.id)).toContain(REAL.profileId);
    expect(owners.map((o: any) => o.id)).not.toContain(DEMO.profileId);
    expect(providers.map((p: any) => p.id)).toContain(REAL_PROVIDER);
    expect(providers.map((p: any) => p.id)).not.toContain(DEMO_PROVIDER);
  });

  it('feed/suggestions: provider suggestions exclude the demo provider', async () => {
    const { suggestions } = await json(await suggestionsGET(req('/api/feed/suggestions')));
    const provIds = suggestions.providers.map((p: any) => p.id);
    expect(provIds).toContain(REAL_PROVIDER);
    expect(provIds).not.toContain(DEMO_PROVIDER);
    const adoptProviderIds = suggestions.adoptions.map((a: any) => a.provider_id);
    expect(adoptProviderIds).toContain(REAL_PROVIDER);
    expect(adoptProviderIds).not.toContain(DEMO_PROVIDER);
  });

  it('providers/discover: excludes the demo provider', async () => {
    const rows = await json(await providersDiscoverGET(req('/api/providers/discover')));
    const list = Array.isArray(rows) ? rows : rows.providers ?? rows.results ?? [];
    const ids = list.map((p: any) => p.id);
    expect(ids).toContain(REAL_PROVIDER);
    expect(ids).not.toContain(DEMO_PROVIDER);
  });

  it('adoption/listings: excludes the demo shelter listing', async () => {
    const body = await json(await adoptionGET(req('/api/adoption/listings')));
    const list = Array.isArray(body) ? body : body.listings ?? body.results ?? [];
    const providerIds = list.map((l: any) => l.provider_id);
    expect(providerIds).toContain(REAL_PROVIDER);
    expect(providerIds).not.toContain(DEMO_PROVIDER);
  });
});
