/**
 * Regression guard for the login bounce-back bug.
 *
 * The global fetch wrapper attaches the bearer token by reading it back out of
 * the Keychain. It used to read without the pinned `secureStoreOptions`, which
 * expo-secure-store resolves to a *different* `kSecAttrService` than the one the
 * auth store writes under — so the read returned null, every first-party request
 * went out unauthenticated, and the EntryPoint gate mistook the resulting 401
 * for an expired session and sent the user back to Welcome right after login.
 */
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'after-first-unlock-this-device-only',
}));

jest.mock('expo/fetch', () => ({ fetch: jest.fn(async () => ({ ok: true })) }));

import * as SecureStore from 'expo-secure-store';
import { fetch as expoFetch } from 'expo/fetch';
import fetchToWeb from './fetch';
import { authKey, secureStoreOptions } from '@/utils/auth/secureStore';

const BASE_URL = 'https://pawpi-production.up.railway.app';

beforeEach(() => {
  jest.clearAllMocks();
  process.env.EXPO_PUBLIC_BASE_URL = BASE_URL;
  SecureStore.getItemAsync.mockResolvedValue(
    JSON.stringify({ jwt: 'test-jwt', user: { id: 'u1' } }),
  );
});

test('reads the token with the same Keychain options the auth store writes with', async () => {
  await fetchToWeb('/api/pets');

  expect(SecureStore.getItemAsync).toHaveBeenCalledWith(authKey, secureStoreOptions);
  expect(secureStoreOptions.keychainService).toBe('anything-auth');
});

test('attaches the bearer token to first-party requests', async () => {
  await fetchToWeb('/api/pets');

  const [url, init] = expoFetch.mock.calls[0];
  expect(url).toBe(`${BASE_URL}/api/pets`);
  expect(init.headers.get('authorization')).toBe('Bearer test-jwt');
});

test('sends no Authorization header when nothing is stored', async () => {
  SecureStore.getItemAsync.mockResolvedValue(null);

  await fetchToWeb('/api/pets');

  const [, init] = expoFetch.mock.calls[0];
  expect(init.headers.get('authorization')).toBeNull();
});

test('does not leak the token to third-party hosts', async () => {
  await fetchToWeb('https://example.com/thing');

  const [, init] = expoFetch.mock.calls[0];
  expect(init?.headers?.get?.('authorization') ?? null).toBeNull();
});
