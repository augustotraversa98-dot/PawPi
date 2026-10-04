// navTrail — a tiny in-memory breadcrumb of the screens the app has shown this JS session.
//
// Purpose: when something that "should never happen" is detected (see utils/clientDiagnostics),
// the report can say HOW the user got there — which screens came before and how long the app
// session has been alive (a tiny session age right before the event means the app had just
// restarted; a large one means a navigation did it). Memory only: nothing is persisted, nothing is
// sent unless a diagnostic fires. Paths only — no params, no ids.

const BOOT_AT = Date.now();
const MAX_ENTRIES = 30;
const REPORT_ENTRIES = 15;
let trail = [];

/** Record the current pathname (consecutive duplicates collapse). Never throws. */
export function recordRoute(pathname, now = Date.now()) {
  try {
    if (typeof pathname !== "string" || !pathname) return;
    if (trail.length && trail[trail.length - 1].p === pathname) return;
    trail.push({ p: pathname.slice(0, 80), t: now });
    if (trail.length > MAX_ENTRIES) trail = trail.slice(-MAX_ENTRIES);
  } catch {
    // diagnostics must never affect the app
  }
}

/** The most recent screens, each with how many seconds ago it was shown. */
export function getNavTrail(now = Date.now()) {
  return trail
    .slice(-REPORT_ENTRIES)
    .map((e) => ({ p: e.p, ago_s: Math.max(0, Math.round((now - e.t) / 1000)) }));
}

/** Seconds since this JS session started (module load). */
export function sessionAgeSeconds(now = Date.now()) {
  return Math.max(0, Math.round((now - BOOT_AT) / 1000));
}

// Test-only.
export function __resetNavTrailForTests() {
  trail = [];
}
