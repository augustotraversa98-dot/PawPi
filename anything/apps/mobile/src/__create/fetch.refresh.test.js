/**
 * Rolling session refresh, client side. The server hands a fresh token back in X-Pawpi-Refreshed-Token on a
 * successful authenticated /api response once the one we sent has aged. The fetch wrapper stores it through the
 * REAL auth store (Keychain + in-memory cache in lockstep) — but only while the signed-in session is still the one
 * that sent the request.
 */
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => {}),
  deleteItemAsync: jest.fn(async () => {}),
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'after-first-unlock-this-device-only',
}));
jest.mock('expo/fetch', () => ({ fetch: jest.fn() }));
jest.mock('@/utils/queryClient', () => ({ queryClient: { clear: jest.fn() } }));
jest.mock('@/utils/auth/sessionCleanup', () => ({
  ...jest.requireActual('@/utils/auth/sessionCleanup'),
  cleanUpAfterIdentityChange: jest.fn(),
}));
jest.mock('expo-router', () => ({ router: { replace: jest.fn() } }));
const mockTrack = jest.fn();
jest.mock('@/telemetry/track', () => ({ track: (...a) => mockTrack(...a) }));
jest.mock('@/telemetry/navExpect', () => ({ markNavigationReason: jest.fn() }));

import * as SecureStore from 'expo-secure-store';
import { fetch as expoFetch } from 'expo/fetch';
import fetchToWeb, { __resetSessionExpiryForTests } from './fetch';
import { useAuthStore } from '@/utils/auth/store';
import { queryClient } from '@/utils/queryClient';
import { getCachedAuth, resetCachedAuthForTests, setCachedAuth } from '@/utils/auth/tokenCache';
import { closeLaunchGate, __resetLaunchGateForTests } from '@/utils/auth/sessionLaunchGate';
import { __resetSessionHealthForTests, wasBearerSent } from '@/utils/auth/sessionHealth';

const OLD = 'old-token.part.sig';
const NEW = 'new-token.part.sig';
const NEW2 = 'newer-token.part.sig';
const USER_A = { jwt: OLD, user: { id: 1, email: 'a@x.com' } };
const USER_B = { jwt: 'other-user.part.sig', user: { id: 2, email: 'b@x.com' } };

const response = ({ status = 200, refreshed, extra = {} } = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: {
    get: (h) => {
      const k = h.toLowerCase();
      if (k === 'x-pawpi-refreshed-token') return refreshed ?? null;
      if (k === 'content-type') return 'application/json';
      return extra[k] ?? null;
    },
  },
  clone() {
    return this;
  },
  json: async () => ({}),
});

const diag = () => mockTrack.mock.calls.filter(([n]) => n === 'auth_diag').map(([, p]) => p.kind);
const tick = () => new Promise((r) => setTimeout(r, 0));
const signIn = (auth) => {
  useAuthStore.setState({ auth, isReady: true });
  setCachedAuth(auth);
};

beforeEach(() => {
  jest.clearAllMocks();
  resetCachedAuthForTests();
  __resetSessionExpiryForTests();
  __resetSessionHealthForTests();
  __resetLaunchGateForTests();
  closeLaunchGate(); // past the cold-launch window
  process.env.EXPO_PUBLIC_BASE_URL = 'https://api.test';
  // a Keychain that stores what it is given, so persistAuth's read-back passes
  let keychain = null;
  SecureStore.getItemAsync.mockImplementation(async () => keychain);
  SecureStore.setItemAsync.mockImplementation(async (_k, v) => {
    keychain = v;
  });
  expoFetch.mockImplementation(async () => response());
  signIn(USER_A);
});

describe('applying a refreshed token', () => {
  test('stores it: store, in-memory cache and Keychain move together; same user, same cache, no cleanup', async () => {
    expoFetch.mockImplementation(async () => response({ refreshed: NEW }));
    await fetchToWeb('/api/pets');
    await tick();

    const auth = useAuthStore.getState().auth;
    expect(auth.jwt).toBe(NEW);
    expect(auth.user).toEqual(USER_A.user);
    expect(typeof auth.tokenAt).toBe('number');
    expect(getCachedAuth()).toEqual(auth);
    expect(SecureStore.setItemAsync).toHaveBeenCalledTimes(1);
    expect(JSON.parse(SecureStore.setItemAsync.mock.calls[0][1]).jwt).toBe(NEW);
    // a refresh is not an identity change: the React Query cache and the device cleanup are left alone
    expect(queryClient.clear).not.toHaveBeenCalled();
    expect(require('@/utils/auth/sessionCleanup').cleanUpAfterIdentityChange).not.toHaveBeenCalled();
    expect(diag()).toContain('token_refreshed');
    expect(diag()).not.toContain('keychain_ok'); // not a sign-in
  });

  test('the next request goes out with the new token', async () => {
    expoFetch.mockImplementationOnce(async () => response({ refreshed: NEW }));
    await fetchToWeb('/api/pets');
    await fetchToWeb('/api/posts');
    expect(expoFetch.mock.calls[0][1].headers.get('authorization')).toBe(`Bearer ${OLD}`);
    expect(expoFetch.mock.calls[1][1].headers.get('authorization')).toBe(`Bearer ${NEW}`);
  });

  test('ignored when the user signed out while the request was in flight', async () => {
    expoFetch.mockImplementation(async () => {
      useAuthStore.getState().setAuth(null);
      return response({ refreshed: NEW });
    });
    await fetchToWeb('/api/pets');
    await tick();
    expect(useAuthStore.getState().auth).toBeNull();
    expect(getCachedAuth()).toBeNull();
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
    expect(diag()).not.toContain('token_refreshed');
  });

  test('ignored when another account signed in while the request was in flight', async () => {
    expoFetch.mockImplementation(async () => {
      useAuthStore.getState().setAuth(USER_B);
      return response({ refreshed: NEW });
    });
    await fetchToWeb('/api/pets');
    await tick();
    expect(useAuthStore.getState().auth.jwt).toBe(USER_B.jwt);
    expect(useAuthStore.getState().auth.user).toEqual(USER_B.user);
    expect(getCachedAuth().jwt).toBe(USER_B.jwt);
  });

  test('parallel responses: the first refresh wins, the others (sent with the old token) are ignored', async () => {
    let n = 0;
    expoFetch.mockImplementation(async () => response({ refreshed: n++ === 0 ? NEW : NEW2 }));
    await Promise.all([fetchToWeb('/api/pets'), fetchToWeb('/api/posts')]);
    await tick();
    expect(useAuthStore.getState().auth.jwt).toBe(NEW);
    expect(SecureStore.setItemAsync).toHaveBeenCalledTimes(1);
  });

  test('ignored while the launch gate is still deciding (the EntryPoint owns that window)', async () => {
    __resetLaunchGateForTests(); // open again
    expoFetch.mockImplementation(async () => response({ refreshed: NEW }));
    await fetchToWeb('/api/pets');
    await tick();
    expect(useAuthStore.getState().auth.jwt).toBe(OLD);
  });

  test.each([
    ['no header', undefined],
    ['an empty header', ''],
    ['a malformed value', 'bad token\nwith newline'],
    ['the token we already have', OLD],
  ])('%s → nothing changes', async (_name, refreshed) => {
    expoFetch.mockImplementation(async () => response({ refreshed }));
    await fetchToWeb('/api/pets');
    await tick();
    expect(useAuthStore.getState().auth.jwt).toBe(OLD);
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  });

  test('a header on an error response is never applied', async () => {
    expoFetch.mockImplementation(async () => response({ status: 500, refreshed: NEW }));
    await fetchToWeb('/api/pets');
    await tick();
    expect(useAuthStore.getState().auth.jwt).toBe(OLD);
  });

  test('a signed-out request (no token sent) ignores the header', async () => {
    signIn(null);
    expoFetch.mockImplementation(async () => response({ refreshed: NEW }));
    await fetchToWeb('/api/pets');
    await tick();
    expect(useAuthStore.getState().auth).toBeNull();
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  });

  test('the sign-in bridge (/api/auth/*) is not a refresh channel', async () => {
    expoFetch.mockImplementation(async () => response({ refreshed: NEW }));
    await fetchToWeb('/api/auth/token');
    await tick();
    expect(useAuthStore.getState().auth.jwt).toBe(OLD);
  });

  test('a Keychain failure never breaks the request; the app keeps the new token in memory', async () => {
    SecureStore.setItemAsync.mockRejectedValue(new Error('denied'));
    expoFetch.mockImplementation(async () => response({ refreshed: NEW }));
    const res = await fetchToWeb('/api/pets');
    await tick();
    await tick();
    expect(res.status).toBe(200);
    expect(useAuthStore.getState().auth.jwt).toBe(NEW);
    expect(diag()).toContain('keychain_write_failed');
  });
});

describe('a late 401 for the OLD token after a refresh', () => {
  test('does not sign out the session that now holds the new token', async () => {
    let releaseOld;
    const oldRequest = new Promise((r) => {
      releaseOld = r;
    });
    expoFetch
      .mockImplementationOnce(async () => {
        await oldRequest; // the slow request, sent with OLD
        return response({
          status: 401,
          extra: { 'x-pawpi-error-code': 'session_expired' },
        });
      })
      .mockImplementationOnce(async () => response({ refreshed: NEW }));

    const slow = fetchToWeb('/api/pets');
    await tick();
    await fetchToWeb('/api/posts'); // refresh lands: OLD -> NEW
    await tick();
    expect(useAuthStore.getState().auth.jwt).toBe(NEW);

    releaseOld();
    await slow;
    await tick();
    expect(useAuthStore.getState().auth?.jwt).toBe(NEW);
  });
});

describe('which responses count as "a token was sent"', () => {
  test('marked when the request carried the stored token, not when it did not', async () => {
    const withToken = await fetchToWeb('/api/pets');
    expect(wasBearerSent(withToken)).toBe(true);

    signIn(null);
    const withoutToken = await fetchToWeb('/api/pets');
    expect(wasBearerSent(withoutToken)).toBe(false);
  });
});

describe('first request with an unread Keychain', () => {
  test('a burst of cold-start requests shares one Keychain read and all carry the token', async () => {
    resetCachedAuthForTests();
    SecureStore.getItemAsync.mockImplementation(async () => JSON.stringify(USER_A));
    await Promise.all([fetchToWeb('/api/pets'), fetchToWeb('/api/posts'), fetchToWeb('/api/providers')]);
    expect(SecureStore.getItemAsync).toHaveBeenCalledTimes(1);
    for (const [, init] of expoFetch.mock.calls) {
      expect(init.headers.get('authorization')).toBe(`Bearer ${OLD}`);
    }
  });
});
