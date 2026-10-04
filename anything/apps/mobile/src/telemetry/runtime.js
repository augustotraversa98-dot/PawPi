// Wires the real platform dependencies into the telemetry core (client.js) and owns the process-wide instance.
// Every native/expo module is required LAZILY inside a function and every call is guarded, so merely importing
// this file (or anything that imports track.js) is safe in jest and can never break app startup.

import { createTelemetry } from './client';
import { createInstallIdStore } from './installId';
import { createPrefStore } from './telemetryPref';
import { createSender } from './sender';
import { asyncStorageKv, secureStoreKv } from './storage';
import { uuidv4 } from './uuid';

/**
 * The ORIGINAL platform fetch (captured by src/__create/fetch.ts BEFORE it patches globalThis.fetch).
 * Deliberately NO fallback to globalThis.fetch: that one attaches the user's Bearer token and project/host
 * headers, and telemetry must stay anonymous. If it cannot be resolved, nothing is sent.
 */
export function getRawFetch() {
  try {
    // eslint-disable-next-line global-require
    const mod = require('../__create/fetch');
    const f = mod?.nativeFetch;
    return typeof f === 'function' ? f : null;
  } catch {
    return null;
  }
}

/** Raw (un-normalised) device/app context; envelope.js normalises it to the server's patterns. */
export function readContext() {
  const ctx = { app_version: undefined, build: undefined, platform: undefined, os_major: undefined, locale: undefined };
  try {
    // eslint-disable-next-line global-require
    const { Platform } = require('react-native');
    ctx.platform = Platform.OS;
    ctx.os_major = Platform.Version;
  } catch {
    // leave undefined
  }
  try {
    // eslint-disable-next-line global-require
    const mod = require('expo-constants');
    const Constants = mod?.default ?? mod;
    ctx.app_version = Constants?.expoConfig?.version;
    ctx.build = Constants?.nativeBuildVersion ?? Constants?.expoConfig?.ios?.buildNumber ?? Constants?.expoConfig?.android?.versionCode;
  } catch {
    // leave undefined
  }
  try {
    // eslint-disable-next-line global-require
    const loc = require('expo-localization');
    ctx.locale = loc?.getLocales?.()?.[0]?.languageTag;
  } catch {
    // fall through
  }
  if (!ctx.locale) {
    try {
      ctx.locale = Intl.DateTimeFormat().resolvedOptions().locale;
    } catch {
      // leave undefined -> "en"
    }
  }
  return ctx;
}

let instance = null;

export function getTelemetry() {
  if (!instance) {
    const secure = secureStoreKv('pawpi-telemetry');
    const kv = asyncStorageKv();
    instance = createTelemetry({
      prefs: createPrefStore({ kv, mirror: secure }),
      installIds: createInstallIdStore({ store: secure, uuid: uuidv4 }),
      sender: createSender({
        getFetch: getRawFetch,
        getBaseUrl: () => process.env.EXPO_PUBLIC_BASE_URL,
      }),
      kv,
      uuid: uuidv4,
      getContext: readContext,
    });
  }
  return instance;
}

/** Test hook: install a fake instance (or null to rebuild the real one lazily). */
export function __setTelemetryForTests(t) {
  instance = t;
}
