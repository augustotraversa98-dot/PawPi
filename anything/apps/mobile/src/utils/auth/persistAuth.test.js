// The sign-in token must be PROVEN to be in the Keychain: write -> read back -> compare, one retry on a
// miss, and when it still fails keep the user signed in (memory) and report it — never crash, never
// leave an unhandled rejection (that is what took iOS 26 down).
import * as SecureStore from 'expo-secure-store';
import { persistAuth } from './persistAuth';
import { useAuthStore } from './store';
import { authKey, secureStoreOptions } from './secureStore';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'afu',
}));
jest.mock('@/utils/queryClient', () => ({ queryClient: { clear: jest.fn() } }));
jest.mock('./sessionCleanup', () => ({
  ...jest.requireActual('./sessionCleanup'),
  cleanUpAfterIdentityChange: jest.fn(),
}));
const mockTrack = jest.fn();
jest.mock('@/telemetry/track', () => ({ track: (...a) => mockTrack(...a) }));

const AUTH = { jwt: 'aaa.bbb.ccc', user: { id: 7 } };
const STORED = JSON.stringify(AUTH);
const diag = () => mockTrack.mock.calls.filter(([n]) => n === 'auth_diag').map(([, p]) => p.kind);

beforeEach(() => {
  jest.clearAllMocks();
  SecureStore.setItemAsync.mockResolvedValue(undefined);
  SecureStore.deleteItemAsync.mockResolvedValue(undefined);
  SecureStore.getItemAsync.mockResolvedValue(STORED);
  useAuthStore.setState({ auth: null });
});

test('writes with the pinned Keychain options, reads back with the SAME ones, and reports ok', async () => {
  await expect(persistAuth(AUTH)).resolves.toBe('ok');

  expect(SecureStore.setItemAsync).toHaveBeenCalledTimes(1);
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith(authKey, STORED, secureStoreOptions);
  expect(SecureStore.getItemAsync).toHaveBeenCalledWith(authKey, secureStoreOptions);
  expect(diag()).toEqual(['keychain_ok']);
});

test('a read-back MISMATCH triggers exactly one retry; a retry that sticks is reported as retried_ok', async () => {
  SecureStore.getItemAsync.mockResolvedValueOnce(null).mockResolvedValueOnce(STORED);

  await expect(persistAuth(AUTH)).resolves.toBe('retried_ok');

  expect(SecureStore.setItemAsync).toHaveBeenCalledTimes(2);
  expect(diag()).toEqual(['keychain_retried_ok']);
});

test('a mismatch that persists after the retry is reported (keychain_readback_mismatch) and does not throw', async () => {
  SecureStore.getItemAsync.mockResolvedValue('something-else');

  await expect(persistAuth(AUTH)).resolves.toBe('readback_mismatch');

  expect(SecureStore.setItemAsync).toHaveBeenCalledTimes(2); // one retry, not more
  expect(diag()).toEqual(['keychain_readback_mismatch']);
});

test('a Keychain WRITE failure retries once, then reports keychain_write_failed without crashing', async () => {
  SecureStore.setItemAsync.mockRejectedValue(new Error('errSecInteractionNotAllowed'));

  await expect(persistAuth(AUTH)).resolves.toBe('write_failed');

  expect(SecureStore.setItemAsync).toHaveBeenCalledTimes(2);
  expect(SecureStore.getItemAsync).not.toHaveBeenCalled();
  expect(diag()).toEqual(['keychain_write_failed']);
});

test('a SYNCHRONOUS throw from the native module is contained too', async () => {
  SecureStore.setItemAsync.mockImplementation(() => {
    throw new Error('TurboModule rethrow');
  });

  await expect(persistAuth(AUTH)).resolves.toBe('write_failed');
  expect(diag()).toEqual(['keychain_write_failed']);
});

test('no token, id or email ever reaches telemetry', async () => {
  SecureStore.setItemAsync.mockRejectedValue(new Error('boom'));
  await persistAuth(AUTH);
  const sent = JSON.stringify(mockTrack.mock.calls);
  expect(sent).not.toContain('aaa.bbb.ccc');
  expect(sent).not.toContain('"id"');
});

test('a retry never resurrects a session the user already left', async () => {
  SecureStore.getItemAsync.mockResolvedValue(null); // mismatch…
  await expect(persistAuth(AUTH, { isCurrent: () => false })).resolves.toBe('superseded');

  expect(SecureStore.setItemAsync).toHaveBeenCalledTimes(1); // …but no retry
  // signed out meanwhile -> make sure the Keychain does not keep the session
  expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(authKey, secureStoreOptions);
});

describe('through the real store', () => {
  test('setAuth stays signed in (memory) when the Keychain keeps failing, and does not throw or reject', async () => {
    SecureStore.setItemAsync.mockRejectedValue(new Error('denied'));
    const unhandled = jest.fn();
    process.on('unhandledRejection', unhandled);

    expect(() => useAuthStore.getState().setAuth(AUTH)).not.toThrow();
    expect(useAuthStore.getState().auth).toEqual(AUTH);

    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    process.off('unhandledRejection', unhandled);
    expect(unhandled).not.toHaveBeenCalled();
    expect(diag()).toEqual(['keychain_write_failed']);
    expect(useAuthStore.getState().auth).toEqual(AUTH);
  });

  test('signing out right after signing in wins: the retry is skipped and the Keychain ends up empty', async () => {
    SecureStore.getItemAsync.mockResolvedValue(null);
    useAuthStore.getState().setAuth(AUTH);
    useAuthStore.getState().setAuth(null);

    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    expect(SecureStore.setItemAsync).toHaveBeenCalledTimes(1);
    expect(SecureStore.deleteItemAsync).toHaveBeenCalled();
    expect(useAuthStore.getState().auth).toBeNull();
  });
});
