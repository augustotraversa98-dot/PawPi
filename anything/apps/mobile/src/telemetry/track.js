// Public telemetry API for app code. Every function is a no-op when telemetry is disabled/opted out and NEVER
// throws (callers wrap nothing). Unknown event / prop / value => silently dropped (registry allowlist).

import { getTelemetry } from './runtime';
import { getCurrentScreen } from './screenState';
import { tapTargetKey } from './tapTarget';
import { errorCodeOf } from './apiCall';

/** track(name, props): the generic entry point. */
export function track(name, props) {
  try {
    getTelemetry().track(name, props);
  } catch {
    // never throws
  }
}

/** A tap on a registered control. `target` must be a TAP_TARGETS key (anything else is dropped); screen is automatic. */
export function trackTap(target) {
  try {
    const key = tapTargetKey({ trackId: target });
    if (key) getTelemetry().track('tap', { target: key, screen: getCurrentScreen() });
  } catch {
    // never throws
  }
}

/** funnel_step; `step` must belong to `funnel` (registry FUNNELS). once = at most once per install. */
export function trackFunnel(funnel, step, options) {
  try {
    getTelemetry().trackFunnel(funnel, step, options);
  } catch {
    // never throws
  }
}

/** feature_used {feature}; must be a registry FEATURES key. */
export function trackFeature(feature) {
  track('feature_used', { feature });
}

/** form_step {form, step, action}. */
export function trackForm(form, step, action) {
  track('form_step', { form, step, action });
}

/** error {kind, screen, code}: only the error CLASS name is sent (never message/stack). */
export function trackError(kind, err, fallbackCode) {
  try {
    const code = errorCodeOf(err, fallbackCode ?? 'Error');
    getTelemetry().track('error', { kind, screen: getCurrentScreen(), code });
  } catch {
    // never throws
  }
}

/** Render error (ErrorBoundary): additive, never throws. */
export function trackRenderError(err) {
  trackError('render', err, 'RenderError');
}

/** A health log was saved: health_logging/log_saved, activation/first_health_log (once per install), feature. */
export function trackHealthLogSaved() {
  trackFunnel('health_logging', 'log_saved');
  trackFunnel('activation', 'first_health_log', { once: true });
  trackFeature('health_log');
}
