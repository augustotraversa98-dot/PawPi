// The user's "Help improve PawPi (anonymous)" choice. Default ON when unset.
//
// Stored under `pawpi.telemetry.enabled` in AsyncStorage ("1" / "0"). An OPT-OUT is also mirrored into the
// secure store, because other parts of the app call AsyncStorage.clear() (sign-out, account deletion) and that
// must not silently turn telemetry back on for someone who switched it off. Reading fails CLOSED: if neither
// store can be read, telemetry stays off for the session.
//
// PURE (kv adapters injected, see storage.js).

export const PREF_KEY = 'pawpi.telemetry.enabled';
export const OPT_OUT_MIRROR_KEY = 'pawpi.telemetry.optout';

export function createPrefStore({ kv, mirror }) {
  return {
    /** true = telemetry allowed. Never rejects. */
    async getEnabled() {
      let kvOk = true;
      let kvVal = null;
      try {
        kvVal = await kv.getItem(PREF_KEY);
      } catch {
        kvOk = false;
      }
      if (kvOk && kvVal === '0') return false;
      if (kvOk && kvVal === '1') return true;
      let mirrorOk = true;
      let mirrorVal = null;
      try {
        mirrorVal = await mirror.getItem(OPT_OUT_MIRROR_KEY);
      } catch {
        mirrorOk = false;
      }
      if (mirrorOk && mirrorVal === '1') return false;
      if (!kvOk && !mirrorOk) return false; // fail closed
      return true;
    },

    /** Persist the choice. An opt-out is written to BOTH stores. Never rejects. */
    async setEnabled(enabled) {
      if (enabled) {
        try {
          await mirror.removeItem(OPT_OUT_MIRROR_KEY);
        } catch {
          // ignore
        }
        try {
          await kv.setItem(PREF_KEY, '1');
        } catch {
          // ignore
        }
      } else {
        try {
          await mirror.setItem(OPT_OUT_MIRROR_KEY, '1');
        } catch {
          // ignore
        }
        try {
          await kv.setItem(PREF_KEY, '0');
        } catch {
          // ignore
        }
      }
    },
  };
}
