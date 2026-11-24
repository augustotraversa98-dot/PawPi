import { fetchPets } from './launchQueries';
import { markBearerSent } from '@/utils/auth/sessionHealth';

const coded401 = () => ({
  ok: false,
  status: 401,
  headers: { get: (h) => (h.toLowerCase() === 'x-pawpi-error-code' ? 'session_expired' : null) },
  clone() {
    return this;
  },
  json: async () => ({ code: 'session_expired' }),
});

const failureOf = async (response) => {
  global.fetch = jest.fn(async () => response);
  try {
    await fetchPets();
  } catch (e) {
    return e;
  }
  throw new Error('expected fetchPets to throw');
};

describe('fetchPets classifies a launch 401', () => {
  test('a session_expired 401 on a request that carried the token is a dead session', async () => {
    const res = coded401();
    markBearerSent(res);
    const e = await failureOf(res);
    expect(e).toMatchObject({ status: 401, bearerSent: true, sessionExpired: true });
  });

  test('the same coded 401 on a request that carried NO token is not a verdict on the stored session', async () => {
    const e = await failureOf(coded401());
    expect(e).toMatchObject({ status: 401, bearerSent: false, sessionExpired: false });
  });

  test('a bare 401 or a 500 is never "session expired"', async () => {
    const bare = { ok: false, status: 401, headers: { get: () => null }, clone() { return this; }, json: async () => ({}) };
    markBearerSent(bare);
    expect((await failureOf(bare)).sessionExpired).toBe(false);
    const five = { ok: false, status: 500, headers: { get: () => null } };
    markBearerSent(five);
    expect((await failureOf(five)).sessionExpired).toBe(false);
  });
});

// ---- family sharing (PR5a): the list URL, access_version, and "a shared pet vanished" ----
describe('fetchPets lists shared pets too', () => {
  const pets = [
    { id: 1, name: 'Mango', is_shared: false, access_role: 'owner' },
    { id: 7, name: 'Luna', is_shared: true, access_role: 'family', owner_display: { full_name: 'Sam' } },
  ];
  const ok = (body) => ({ ok: true, status: 200, json: async () => body });

  beforeEach(() => {
    jest.resetModules();
  });

  test('asks for ?include_shared=1 (own pets first, then shared) and returns the array', async () => {
    const { fetchPets, PETS_LIST_URL } = require('./launchQueries');
    global.fetch = jest.fn(async () => ok({ pets, access_version: 'v1' }));
    const result = await fetchPets();
    expect(PETS_LIST_URL).toBe('/api/pets?include_shared=1');
    expect(global.fetch.mock.calls[0][0]).toBe('/api/pets?include_shared=1');
    expect(result).toEqual(pets);
  });

  test('an old server (no access_version, no shared fields) still works', async () => {
    const { fetchPets } = require('./launchQueries');
    global.fetch = jest.fn(async () => ok({ pets: [{ id: 1, name: 'Mango' }] }));
    await expect(fetchPets()).resolves.toEqual([{ id: 1, name: 'Mango' }]);
  });

  test('records access_version; a CHANGED one is visible in the store', async () => {
    const { fetchPets } = require('./launchQueries');
    const store = require('@/store/petAccessStore').default;
    global.fetch = jest.fn(async () => ok({ pets, access_version: 'v1' }));
    await fetchPets();
    expect(store.getState().accessVersion).toBe('v1');
    global.fetch = jest.fn(async () => ok({ pets, access_version: 'v2' }));
    await fetchPets();
    expect(store.getState().accessVersion).toBe('v2');
  });

  test('a shared pet that disappears from a later read = access lost: notice queued, selection forgotten, its caches dropped', async () => {
    const { fetchPets } = require('./launchQueries');
    const accessStore = require('@/store/petAccessStore').default;
    const selected = require('@/store/selectedPetStore').default;
    const { queryClient } = require('@/utils/queryClient');
    queryClient.setQueryData(['care-ring', 7, 'd'], { x: 1 });
    selected.setState({ selectedPetId: 7 });

    global.fetch = jest.fn(async () => ok({ pets, access_version: 'v1' }));
    await fetchPets();
    expect(accessStore.getState().lostNotice).toBeNull();

    global.fetch = jest.fn(async () => ok({ pets: [pets[0]], access_version: 'v2' }));
    await fetchPets();

    expect(accessStore.getState().lostNotice).toEqual({ petId: 7, petName: 'Luna' });
    expect(selected.getState().selectedPetId).toBeNull();
    expect(queryClient.getQueryData(['care-ring', 7, 'd'])).toBeUndefined();
  });

  test('a 403 on the list is still an Error carrying its status (launch routing relies on it)', async () => {
    const { fetchPets } = require('./launchQueries');
    global.fetch = jest.fn(async () => ({ ok: false, status: 403, headers: { get: () => null } }));
    await expect(fetchPets()).rejects.toMatchObject({ status: 403 });
  });
});
