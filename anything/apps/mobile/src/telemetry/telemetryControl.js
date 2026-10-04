// What the Settings screen needs: read the "Help improve PawPi (anonymous)" preference and change it.
// OFF = opt-out flow (queue cleared, ONE opt_out event, install_id deleted, everything stops);
// ON  = a NEW random install_id and capture resumes. Both resolve and never reject.

import { getTelemetry } from './runtime';

/** true = telemetry on (the default when nothing is stored). */
export async function readTelemetryEnabled() {
  try {
    return await getTelemetry().readPreference();
  } catch {
    return false;
  }
}

export async function setTelemetryEnabled(enabled) {
  try {
    const t = getTelemetry();
    if (enabled) await t.optIn();
    else await t.optOut();
  } catch {
    // never throws
  }
}
