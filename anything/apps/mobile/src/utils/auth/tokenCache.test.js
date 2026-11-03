import {
  getCachedAuth,
  setCachedAuth,
  setCachedAuthIfUnset,
  loadCachedAuth,
  resetCachedAuthForTests,
} from './tokenCache';

const A = { jwt: 'jwt-A', user: { id: 1 } };
const B = { jwt: 'jwt-B', user: { id: 2 } };

// A Keychain read we resolve by hand.
const deferredRead = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  const read = jest.fn(() => promise);
  return { read, resolve, reject };
};

beforeEach(() => resetCachedAuthForTests());

describe('loadCachedAuth', () => {
  test('concurrent first requests share ONE Keychain read', async () => {
    const d = deferredRead();
    const calls = [loadCachedAuth(d.read), loadCachedAuth(d.read), loadCachedAuth(d.read)];
    d.resolve(A);
    expect(await Promise.all(calls)).toEqual([A, A, A]);
    expect(d.read).toHaveBeenCalledTimes(1);
    expect(getCachedAuth()).toEqual(A);
  });

  test('once cached, no further read', async () => {
    setCachedAuth(A);
    const read = jest.fn();
    expect(await loadCachedAuth(read)).toEqual(A);
    expect(read).not.toHaveBeenCalled();
  });

  test('an empty or failed read is not cached, so the next request tries again', async () => {
    expect(await loadCachedAuth(async () => null)).toBeNull();
    expect(getCachedAuth()).toBeUndefined();
    expect(await loadCachedAuth(async () => { throw new Error('keychain locked'); })).toBeNull();
    expect(getCachedAuth()).toBeUndefined();
    expect(await loadCachedAuth(async () => A)).toEqual(A);
    expect(getCachedAuth()).toEqual(A);
  });

  test('a slow read can NOT resurrect a session that was signed out while it was in flight', async () => {
    const d = deferredRead();
    const pending = loadCachedAuth(d.read);
    setCachedAuth(null); // setAuth(null): logout lands first
    d.resolve(A); // the old Keychain value arrives late
    expect(await pending).toBeNull();
    expect(getCachedAuth()).toBeNull();
  });

  test('a slow read can NOT overwrite a newer sign-in or refresh', async () => {
    const d = deferredRead();
    const pending = loadCachedAuth(d.read);
    setCachedAuth(B);
    d.resolve(A);
    expect(await pending).toEqual(B);
    expect(getCachedAuth()).toEqual(B);
  });

  test('after a settled read the next miss starts a fresh read (no stuck shared promise)', async () => {
    await loadCachedAuth(async () => null);
    const read = jest.fn(async () => A);
    await loadCachedAuth(read);
    expect(read).toHaveBeenCalledTimes(1);
  });
});

describe('setCachedAuthIfUnset', () => {
  test('writes only a real session, and only while the cache is still unknown', () => {
    setCachedAuthIfUnset(null);
    expect(getCachedAuth()).toBeUndefined();
    setCachedAuthIfUnset(A);
    expect(getCachedAuth()).toEqual(A);
    setCachedAuthIfUnset(B);
    expect(getCachedAuth()).toEqual(A);
    setCachedAuth(null);
    setCachedAuthIfUnset(B);
    expect(getCachedAuth()).toBeNull();
  });
});
