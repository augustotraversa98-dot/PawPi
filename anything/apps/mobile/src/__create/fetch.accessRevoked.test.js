// A first-party 403 carrying { code: "pet_access_revoked" } (the owner removed this person from a shared dog, they left, or the grant
// expired) makes the global fetch wrapper refetch the pet lists — and the response is still handed back to the caller untouched.
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'after-first-unlock-this-device-only',
}));
jest.mock('expo/fetch', () => ({ fetch: jest.fn() }));

import * as SecureStore from 'expo-secure-store';
import { fetch as expoFetch } from 'expo/fetch';
import fetchToWeb from './fetch';
import { queryClient } from '@/utils/queryClient';
import { resetCachedAuthForTests } from '@/utils/auth/tokenCache';
import { closeLaunchGate, __resetLaunchGateForTests } from '@/utils/auth/sessionLaunchGate';

const forbidden = (body) => {
  const res = {
    ok: false,
    status: 403,
    headers: { get: () => 'application/json' },
    json: jest.fn(async () => body),
  };
  res.clone = () => ({ ...res, json: async () => body });
  return res;
};

let invalidate;
beforeEach(() => {
  jest.clearAllMocks();
  resetCachedAuthForTests();
  __resetLaunchGateForTests();
  closeLaunchGate();
  process.env.EXPO_PUBLIC_BASE_URL = 'https://pawpi-production.up.railway.app';
  SecureStore.getItemAsync.mockResolvedValue(JSON.stringify({ jwt: 'test-jwt', user: { id: 'u1' } }));
  invalidate = jest.spyOn(queryClient, 'invalidateQueries').mockImplementation(() => Promise.resolve());
});
afterEach(() => invalidate.mockRestore());

const flush = () => new Promise((r) => setTimeout(r, 0));

test('a pet_access_revoked 403 refetches the pets / shared-with-me / household lists', async () => {
  expoFetch.mockResolvedValueOnce(forbidden({ error: 'Pet not found or access denied', code: 'pet_access_revoked' }));
  const res = await fetchToWeb('/api/health/walk-logs', { method: 'POST' });
  await flush();
  expect(res.status).toBe(403);
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['pets'] });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['shared-with-me'] });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['household'] });
});

test('the caller can still read the body of that 403 (only a clone was read)', async () => {
  const original = forbidden({ error: 'Pet not found or access denied', code: 'pet_access_revoked' });
  expoFetch.mockResolvedValueOnce(original);
  const res = await fetchToWeb('/api/routines?petId=7');
  await flush();
  expect(original.json).not.toHaveBeenCalled();
  await expect(res.json()).resolves.toMatchObject({ code: 'pet_access_revoked' });
});

test('an ordinary 403 (no code) triggers nothing', async () => {
  expoFetch.mockResolvedValueOnce(forbidden({ error: 'Forbidden' }));
  await fetchToWeb('/api/providers/1/walk-pickup/redeem', { method: 'POST' });
  await flush();
  expect(invalidate).not.toHaveBeenCalled();
});

test('a 403 from a third-party host triggers nothing', async () => {
  expoFetch.mockResolvedValueOnce(forbidden({ code: 'pet_access_revoked' }));
  await fetchToWeb('https://example.com/thing');
  await flush();
  expect(invalidate).not.toHaveBeenCalled();
});
