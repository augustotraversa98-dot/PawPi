// The cold-launch Keychain read in useAuth.initiate: it hands a found session to the fetch wrapper's cache
// (one read instead of two) and reports WHY there was no token (timeout / threw / empty) — anonymous telemetry only.
let mockGetItem;
jest.mock('expo-secure-store', () => ({
  getItemAsync: (...a) => mockGetItem(...a),
  setItemAsync: jest.fn(async () => {}),
  deleteItemAsync: jest.fn(async () => {}),
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'afu',
}));
jest.mock('expo-router', () => ({ router: { replace: jest.fn() } }));
jest.mock('react-native', () => ({ Modal: 'Modal', View: 'View' }));
jest.mock('../../../__create/boot-trace', () => ({ markBootStep: jest.fn() }));
jest.mock('@/utils/queryClient', () => ({ queryClient: { clear: jest.fn() } }));
const mockTrack = jest.fn();
jest.mock('@/telemetry/track', () => ({ track: (...a) => mockTrack(...a) }));

import { renderHook, act } from '@testing-library/react-native';
import { useAuth } from './useAuth';
import { useAuthStore } from './store';
import { getCachedAuth, resetCachedAuthForTests } from './tokenCache';
import { reportLaunchToken, __resetSessionHealthForTests } from './sessionHealth';

const SESSION = { jwt: 'aaa.bbb.ccc', user: { id: 1 } };
const diag = () => mockTrack.mock.calls.filter(([n]) => n === 'auth_diag').map(([, p]) => p.kind);

const launch = async () => {
  const { result } = renderHook(() => useAuth());
  await act(async () => {
    result.current.initiate();
    await jest.advanceTimersByTimeAsync(3100);
  });
  reportLaunchToken(!!useAuthStore.getState().auth);
};

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  resetCachedAuthForTests();
  __resetSessionHealthForTests();
  useAuthStore.setState({ auth: null, isReady: false });
});
afterEach(() => jest.useRealTimers());

test('a stored session is hydrated AND cached for the first request, and reported as found', async () => {
  mockGetItem = jest.fn(async () => JSON.stringify(SESSION));
  await launch();
  expect(useAuthStore.getState()).toMatchObject({ isReady: true, auth: SESSION });
  expect(getCachedAuth()).toEqual(SESSION);
  expect(diag()).toEqual(['launch_token_found']);
});

test('an empty Keychain is launch_no_token and caches nothing', async () => {
  mockGetItem = jest.fn(async () => null);
  await launch();
  expect(useAuthStore.getState()).toMatchObject({ isReady: true, auth: null });
  expect(getCachedAuth()).toBeUndefined();
  expect(diag()).toEqual(['launch_no_token']);
});

test('a read that outlives the 3 s guard is launch_read_timeout (and the app still becomes ready)', async () => {
  mockGetItem = jest.fn(() => new Promise(() => {}));
  await launch();
  expect(useAuthStore.getState()).toMatchObject({ isReady: true, auth: null });
  expect(getCachedAuth()).toBeUndefined();
  expect(diag()).toEqual(['launch_read_timeout']);
});

test('a read that throws is launch_read_error (and the app still becomes ready)', async () => {
  mockGetItem = jest.fn(async () => {
    throw new Error('keychain locked');
  });
  await launch();
  expect(useAuthStore.getState()).toMatchObject({ isReady: true, auth: null });
  expect(diag()).toEqual(['launch_read_error']);
});
