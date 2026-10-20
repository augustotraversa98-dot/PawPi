import {
  carriesSessionExpiredCode,
  hasSessionExpiredHeader,
  confirmSessionDead,
  isSessionDead,
  reportLaunchToken,
  RECHECK_TIMEOUT_MS,
  RECHECK_ALIVE_COOLDOWN_MS,
  __resetSessionHealthForTests,
} from './sessionHealth';
import { fetch as expoFetch } from 'expo/fetch';

jest.mock('expo/fetch', () => ({ fetch: jest.fn() }));
const mockTrack = jest.fn();
jest.mock('@/telemetry/track', () => ({ track: (...a) => mockTrack(...a) }));

const withHeader = (value) => ({ headers: { get: (h) => (h.toLowerCase() === 'x-pawpi-error-code' ? value : null) } });
const withBody = (body) => ({ headers: { get: () => null }, clone() { return this; }, json: async () => body });

beforeEach(() => {
  jest.clearAllMocks();
  __resetSessionHealthForTests();
  process.env.EXPO_PUBLIC_BASE_URL = 'https://api.test';
});

describe('the session_expired code', () => {
  test('is read from the header, or from the body when the header is missing', async () => {
    expect(hasSessionExpiredHeader(withHeader('session_expired'))).toBe(true);
    expect(await carriesSessionExpiredCode(withHeader('session_expired'))).toBe(true);
    expect(await carriesSessionExpiredCode(withBody({ code: 'session_expired' }))).toBe(true);
  });

  test('a bare 401, another code, an unreadable body or a response with no headers is NOT the code', async () => {
    expect(await carriesSessionExpiredCode(withBody({ error: 'Unauthorized' }))).toBe(false);
    expect(await carriesSessionExpiredCode(withHeader('something_else'))).toBe(false);
    expect(await carriesSessionExpiredCode({ headers: { get: () => null }, clone() { return this; }, json: async () => { throw new Error('not json'); } })).toBe(false);
    expect(await carriesSessionExpiredCode({})).toBe(false);
    expect(await carriesSessionExpiredCode(undefined)).toBe(false);
  });
});

describe('confirmSessionDead (one re-check against GET /api/session)', () => {
  test('401 -> dead; 2xx -> alive; anything else or a throw -> unknown', async () => {
    expoFetch.mockResolvedValueOnce({ ok: false, status: 401 });
    expect(await confirmSessionDead('jwt-1')).toBe('dead');
    expect(expoFetch).toHaveBeenCalledWith(
      'https://api.test/api/session',
      expect.objectContaining({ method: 'GET', headers: { authorization: 'Bearer jwt-1' } }),
    );

    expoFetch.mockResolvedValueOnce({ ok: false, status: 503 });
    expect(await confirmSessionDead('jwt-1')).toBe('unknown');

    expoFetch.mockRejectedValueOnce(new Error('offline'));
    expect(await confirmSessionDead('jwt-1')).toBe('unknown');

    expoFetch.mockResolvedValueOnce({ ok: true, status: 200 });
    expect(await confirmSessionDead('jwt-1')).toBe('alive');
  });

  test('concurrent callers share one request, and an "alive" answer is reused for the cooldown', async () => {
    let t = 1000;
    expoFetch.mockResolvedValue({ ok: true, status: 200 });
    const [a, b] = await Promise.all([
      confirmSessionDead('j', { now: () => t }),
      confirmSessionDead('j', { now: () => t }),
    ]);
    expect([a, b]).toEqual(['alive', 'alive']);
    expect(expoFetch).toHaveBeenCalledTimes(1);

    t += RECHECK_ALIVE_COOLDOWN_MS - 1;
    expect(await confirmSessionDead('j', { now: () => t })).toBe('alive');
    expect(expoFetch).toHaveBeenCalledTimes(1);

    t += 2;
    await confirmSessionDead('j', { now: () => t });
    expect(expoFetch).toHaveBeenCalledTimes(2);
  });

  test('a re-check that never answers times out as unknown (never dead)', async () => {
    jest.useFakeTimers();
    expoFetch.mockImplementation(
      (_u, init) => new Promise((_res, rej) => init.signal.addEventListener('abort', () => rej(new Error('aborted')))),
    );
    const pending = confirmSessionDead('j');
    await jest.advanceTimersByTimeAsync(RECHECK_TIMEOUT_MS);
    expect(await pending).toBe('unknown');
    jest.useRealTimers();
  });
});

describe('isSessionDead', () => {
  test('the code is enough: no re-check', async () => {
    expect(await isSessionDead({ response: withHeader('session_expired'), jwt: 'j' })).toEqual({ dead: true, via: 'code' });
    expect(await isSessionDead({ hasCode: true, jwt: 'j' })).toEqual({ dead: true, via: 'code' });
    expect(expoFetch).not.toHaveBeenCalled();
  });

  test('without the code only a confirming re-check makes it dead', async () => {
    expoFetch.mockResolvedValueOnce({ ok: false, status: 401 });
    expect(await isSessionDead({ hasCode: false, jwt: 'j' })).toEqual({ dead: true, via: 'recheck' });

    __resetSessionHealthForTests();
    expoFetch.mockResolvedValueOnce({ ok: true, status: 200 });
    expect(await isSessionDead({ hasCode: false, jwt: 'j' })).toEqual({ dead: false, via: null, recheck: 'alive' });

    __resetSessionHealthForTests();
    expoFetch.mockRejectedValueOnce(new Error('offline'));
    expect(await isSessionDead({ hasCode: false, jwt: 'j' })).toEqual({ dead: false, via: null, recheck: 'unknown' });
  });
});

test('reportLaunchToken reports once per launch: found vs none', () => {
  reportLaunchToken(true);
  reportLaunchToken(false);
  expect(mockTrack.mock.calls).toEqual([['auth_diag', { kind: 'launch_token_found' }]]);
});
