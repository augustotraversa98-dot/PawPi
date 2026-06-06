import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { fetch as expoFetch } from 'expo/fetch';

const originalFetch = fetch;
const authKey = `${process.env.EXPO_PUBLIC_PROJECT_GROUP_ID}-jwt`;

// Backend base URL. Prefer EXPO_PUBLIC_API_URL (set per-environment, e.g. your
// LAN IP for a device dev build: http://<lan-ip>:4000). Falls back to the legacy
// EXPO_PUBLIC_BASE_URL, then to a sensible local default for simulator/web.
const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ??
  process.env.EXPO_PUBLIC_BASE_URL ??
  'http://localhost:4000';

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
    (API_BASE_URL && url.startsWith(API_BASE_URL))
  );
};

const isSecondPartyURL = (url: string) => {
  return url.startsWith('/_create/');
};

type Params = Parameters<typeof expoFetch>;
const fetchToWeb = async function fetchWithHeaders(...args: Params) {
  const firstPartyURL = API_BASE_URL;
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

  const auth = await SecureStore.getItemAsync(authKey)
    .then((auth) => {
      return auth ? JSON.parse(auth) : null;
    })
    .catch(() => {
      return null;
    });

  if (auth) {
    finalHeaders.set('authorization', `Bearer ${auth.jwt}`);
  }

  // expo/fetch cannot serialize a multipart FormData body on either platform:
  //  - web: it omits the boundary, so the server gets no file (400 "file is required").
  //  - native: its encoder can't read RN's uri-based file part { uri, name, type }
  //    and throws "Unsupported FormDataPart implementation" (see expo's
  //    convertFormData.ts: "uri is not supported for React Native's FormData").
  // The platform-native fetch handles both correctly — the browser encodes the
  // multipart boundary, and RN's fetch streams the file straight from its file://
  // uri — so route all FormData uploads through originalFetch.
  const isFormDataBody =
    typeof FormData !== 'undefined' && init?.body instanceof FormData;
  const fetchImpl = isFormDataBody ? originalFetch : expoFetch;

  return fetchImpl(finalInput, {
    ...init,
    headers: finalHeaders,
  });
};

export default fetchToWeb;
