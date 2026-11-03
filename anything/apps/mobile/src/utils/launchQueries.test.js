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
