// api_call + error(api|network) recording for the patched fetch (src/__create/fetch.ts). Pure decision logic
// lives in apiCall.js; this is the glue. NEVER throws, never reads a response body, never touches the request.
//
// Rules: /api/telemetry/* is skipped (no feedback loop); only first-party /api routes are recorded; a 5xx is an
// `error{kind:"api", code:<status>}`; a request that got no response is `error{kind:"network", code:<ErrorName>}`
// (rate limited to one per NETWORK_ERROR_GAP_MS so an offline phone cannot flood the queue).

import { buildApiCallProps, apiPathFromUrl, isTelemetryPath } from './apiCall';
import { track, trackError } from './track';
import { getCurrentScreen } from './screenState';

export const NETWORK_ERROR_GAP_MS = 5000;
let lastNetworkErrorAt = null;

/** @param {{ url: any, status: number|null, startedAt: number, error?: any, now?: number, baseUrl?: string }} call */
export function recordApiCall({
  url,
  status,
  startedAt,
  error,
  now = Date.now(),
  baseUrl = process.env.EXPO_PUBLIC_BASE_URL,
} = {}) {
  try {
    const path = apiPathFromUrl(url, baseUrl);
    if (!path || isTelemetryPath(path)) return;
    const props = buildApiCallProps({ url, status, ms: now - startedAt, baseUrl });
    if (!props) return;
    track('api_call', props);
    if (status === null || status === undefined) {
      if (lastNetworkErrorAt === null || now - lastNetworkErrorAt >= NETWORK_ERROR_GAP_MS) {
        lastNetworkErrorAt = now;
        trackError('network', error, 'NetworkError');
      }
    } else if (status >= 500) {
      track('error', { kind: 'api', screen: getCurrentScreen(), code: String(status) });
    }
  } catch {
    // never throws
  }
}

/** Test helper. */
export function __resetApiTelemetryForTests() {
  lastNetworkErrorAt = null;
}
