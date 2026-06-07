import * as SecureStore from 'expo-secure-store';
import { fetch as expoFetch } from 'expo/fetch';

const originalFetch = fetch;
const authKey = `${process.env.EXPO_PUBLIC_PROJECT_GROUP_ID}-jwt`;

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

  // expo/fetch can't serialize a multipart FormData body on any platform: on web it
  // omits the multipart boundary (server sees 400 "file is required"); on native it
  // rejects RN's { uri, name, type } file part ("Unsupported FormDataPart
  // implementation"). The platform-native fetch handles both correctly, so route all
  // FormData bodies through it. Non-FormData requests stay on expo/fetch so
  // streaming/SSE is unaffected.
  const isFormDataBody =
    typeof FormData !== 'undefined' && init?.body instanceof FormData;
  const fetchImpl = isFormDataBody ? originalFetch : expoFetch;

  return fetchImpl(finalInput, {
    ...init,
    headers: finalHeaders,
  });
};

export default fetchToWeb;
