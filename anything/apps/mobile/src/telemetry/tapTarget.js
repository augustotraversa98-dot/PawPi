// Tap target keys. PURE. A target is a registry key (never visible text): an explicit `trackId`, or a testID /
// accessibilityLabel that, lower-cased with "-" turned into "_", IS a registry key. Anything else is null (not
// emitted), and the server drops unknown targets as well.

import { TAP_TARGETS, TAP_TARGET_PATTERN } from './registry';

const TARGET_SET = new Set(TAP_TARGETS);
const TARGET_RE = new RegExp(TAP_TARGET_PATTERN);

function normalise(value) {
  if (typeof value !== 'string' || value.length > 60) return null;
  const key = value.trim().toLowerCase().replace(/-/g, '_');
  return TARGET_RE.test(key) && TARGET_SET.has(key) ? key : null;
}

/** An explicit trackId wins (and is never second-guessed by testID/label); otherwise testID, then label. */
export function tapTargetKey({ trackId, testID, accessibilityLabel } = {}) {
  try {
    if (trackId !== undefined && trackId !== null) return normalise(trackId);
    return normalise(testID) ?? normalise(accessibilityLabel);
  } catch {
    return null;
  }
}
