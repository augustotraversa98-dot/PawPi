// "The launch gate is open" = the EntryPoint has not yet made its first routing decision for this
// launch. While it is open, the fetch wrapper does NOT act on a session-expired 401: the EntryPoint's
// own pets read hits the same dead token, and it is the one place that decides — exactly once —
// whether to clear the stored session and show Welcome. Without this, a stale token at cold launch
// was handled twice (wrapper + EntryPoint): two sign-outs, two navigations to Welcome.
//
// Dependency-free on purpose: fetch.ts pulls it in at startup. The gate also lapses on its own
// after LAUNCH_GATE_MAX_MS so a launch that never mounts the EntryPoint (deep link straight into a
// screen) can never make the app ignore a dead session for good.

export const LAUNCH_GATE_MAX_MS = 20000;

const startedAt = Date.now();
let closed = false;

export function isLaunchGateOpen() {
  return !closed && Date.now() - startedAt < LAUNCH_GATE_MAX_MS;
}

export function closeLaunchGate() {
  closed = true;
}

// Test-only.
export function __resetLaunchGateForTests() {
  closed = false;
}
