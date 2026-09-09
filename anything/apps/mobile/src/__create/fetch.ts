import * as SecureStore from 'expo-secure-store';
import { fetch as expoFetch } from 'expo/fetch';
import { authKey, secureStoreOptions } from '@/utils/auth/secureStore';

const originalFetch = fetch;

const getURLFromArgs = (...args: Parameters<typeof fetch>) => {
  const [urlArg] = args;
  let url: string | null;
  if (typeof urlArg === 'string') {
    url = urlArg;
  } else if (typeof urlArg === 'object' && urlArg !== null) {
    url = urlArg.url;
  } else {
    url = null;
  }
  return url;
};

const isFileURL = (url: string) => {
  // blob: included so picked-file reads (URL.createObjectURL on web) use the
  // browser's native fetch — expo/fetch can't read blob: URLs and fails with
  // "Failed to fetch", which broke web photo uploads (useUpload reads asset.uri).
  return url.startsWith('file://') || url.startsWith('data:') || url.startsWith('blob:');
};

const isFirstPartyURL = (url: string) => {
  return (
    url.startsWith('/') ||
    (process.env.EXPO_PUBLIC_BASE_URL && url.startsWith(process.env.EXPO_PUBLIC_BASE_URL))
  );
};

const isSecondPartyURL = (url: string) => {
  return url.startsWith('/_create/');
};

// An /api route on our own backend (relative "/api/…" or the absolute base-URL form). Used only
// by the misrouted-API guard below.
const isApiURL = (url: string) => {
  const base = process.env.EXPO_PUBLIC_BASE_URL;
  const path = base && url.startsWith(base) ? url.slice(base.length) : url;
  return path.startsWith('/api/') || path === '/api';
};

// Fail-closed deadline for first-party requests (AUDIT_2026-09 A-02). Every React-Query
// queryFn in the app calls this wrapper with no AbortSignal, so a request that stalls at the
// TCP level (captive Wi-Fi, half-open socket, backend cold start) used to never settle:
// `isFetching` stayed true forever and the screen showed an endless spinner — the class of
// bug that got App Store build 16 rejected. When the caller supplies no signal we attach our
// own and abort after FIRST_PARTY_TIMEOUT_MS, which turns the hang into a normal rejection
// that React-Query retries once and then surfaces through the screens' existing error
// states. The timer is cleared as soon as the response HEADERS arrive, so a slow body
// download or a streaming (SSE) response is never cut off mid-way. A caller-supplied
// signal is respected as-is (no deadline is added on top of it).
export const FIRST_PARTY_TIMEOUT_MS = 15_000;

const withDeadline = (init: Params[1] | undefined) => {
  if (init?.signal) {
    return { signal: init.signal, clear: () => {} };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FIRST_PARTY_TIMEOUT_MS);
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
};

// The sign-in bridge routes 401 as part of their normal protocol; never treat those as an
// expired session.
const isAuthBridgeURL = (url: string) => {
  const base = process.env.EXPO_PUBLIC_BASE_URL;
  const path = base && url.startsWith(base) ? url.slice(base.length) : url;
  return path.startsWith('/api/auth/');
};

let sessionExpiryInFlight = false;
const handleSessionExpired = () => {
  // Several queries usually fail together; sign out once.
  if (sessionExpiryInFlight) return;
  sessionExpiryInFlight = true;
  try {
    const { useAuthStore } = require('@/utils/auth/store');
    if (useAuthStore.getState().auth) {
      useAuthStore.getState().setAuth(null);
    }
    const { router } = require('expo-router');
    router.replace('/welcome');
  } catch {
    // Never let session handling break the request itself.
  } finally {
    // Allow a later, genuinely new session to be handled again.
    setTimeout(() => {
      sessionExpiryInFlight = false;
    }, 1000);
  }
};

// Test-only: clear the one-shot guard between cases.
export const __resetSessionExpiryForTests = () => {
  sessionExpiryInFlight = false;
};

type Params = Parameters<typeof expoFetch>;
const fetchToWeb = async function fetchWithHeaders(...args: Params) {
  const firstPartyURL = process.env.EXPO_PUBLIC_BASE_URL;
  const secondPartyURL = process.env.EXPO_PUBLIC_PROXY_BASE_URL;
  const [input, init] = args;
  const url = getURLFromArgs(input, init);
  if (!url) {
    return expoFetch(input, init);
  }

  if (isFileURL(url)) {
    return originalFetch(input, init);
  }

  const isExternalFetch = !isFirstPartyURL(url);
  // we should not add headers to requests that don't go to our own server
  if (isExternalFetch) {
    return expoFetch(input, init);
  }

  let finalInput = input;
  const baseURL = isSecondPartyURL(url) ? secondPartyURL : firstPartyURL;
  if (typeof input === 'string') {
    finalInput = input.startsWith('/') ? `${baseURL}${input}` : input;
  } else {
    return expoFetch(input, init);
  }

  const initHeaders = init?.headers ?? {};
  const finalHeaders = new Headers(initHeaders);

  const headers = {
    'x-createxyz-project-group-id': process.env.EXPO_PUBLIC_PROJECT_GROUP_ID,
    host: process.env.EXPO_PUBLIC_HOST,
    'x-forwarded-host': process.env.EXPO_PUBLIC_HOST,
    'x-createxyz-host': process.env.EXPO_PUBLIC_HOST,
  };

  for (const [key, value] of Object.entries(headers)) {
    if (value) {
      finalHeaders.set(key, value);
    }
  }

  // Must pass the same options the auth store writes with — a bare read hits a
  // different Keychain service and silently returns null, stripping the
  // Authorization header off every first-party request. See ./auth/secureStore.
  const auth = await SecureStore.getItemAsync(authKey, secureStoreOptions)
    .then((auth) => {
      return auth ? JSON.parse(auth) : null;
    })
    .catch(() => {
      return null;
    });

  if (auth) {
    finalHeaders.set('authorization', `Bearer ${auth.jwt}`);
  }

  // expo/fetch can't serialize a multipart FormData body on any platform: on web it
  // omits the multipart boundary (server sees 400 "file is required"); on native it
  // rejects RN's { uri, name, type } file part ("Unsupported FormDataPart
  // implementation"). The platform-native fetch handles both correctly, so route all
  // FormData bodies through it. Non-FormData requests stay on expo/fetch so
  // streaming/SSE is unaffected.
  const isFormDataBody =
    typeof FormData !== 'undefined' && init?.body instanceof FormData;
  const fetchImpl = isFormDataBody ? originalFetch : expoFetch;

  const deadline = withDeadline(init);
  let response: Awaited<ReturnType<typeof fetchImpl>>;
  try {
    response = await fetchImpl(finalInput, {
      ...init,
      headers: finalHeaders,
      signal: deadline.signal,
    });
  } finally {
    deadline.clear();
  }

  // Expired / revoked session (AUDIT_2026-09 A-07). A 401 on an /api route while we were
  // sending a bearer means the stored JWT is dead. Before this, nothing reacted: every query
  // and mutation kept failing until the user force-quit so the EntryPoint could notice.
  // Drop the session (which also clears the React-Query cache) and send the user to Welcome.
  // Guards: only first-party /api URLs, only when a bearer was actually attached (an
  // unauthenticated 401 is the caller's business), and never for the auth bridge itself
  // (/api/auth/*), which legitimately 401s during sign-in. The auth store + router are
  // required lazily so this entry-file module keeps zustand/expo-router out of its import
  // graph (see utils/auth/secureStore).
  if (auth && response.status === 401 && isApiURL(url) && !isAuthBridgeURL(url)) {
    handleSessionExpired();
  }

  // Misrouted-API guard: a backend that is MISSING an /api route serves the SPA app-shell —
  // HTTP 200 with an HTML body. Callers do `if (!res.ok) throw; await res.json()`, so res.ok is
  // true and res.json() then throws a cryptic SyntaxError, surfacing as confusing failures
  // app-wide. When an /api route returns an OK status but an HTML content-type, fail cleanly here
  // with a clear message instead. Left untouched: legitimate JSON, non-OK responses (the existing
  // error path — the guard only runs when res.ok), and intentionally non-JSON endpoints
  // (text/calendar ICS, etc. — only text/html trips this).
  if (isApiURL(url) && response.ok) {
    const contentType = response.headers?.get?.('content-type') ?? '';
    if (contentType.includes('text/html')) {
      throw new Error(
        `Unexpected HTML response from API route "${url}" (status ${response.status}). ` +
          'The backend is likely missing this endpoint.',
      );
    }
  }

  return response;
};

export default fetchToWeb;
