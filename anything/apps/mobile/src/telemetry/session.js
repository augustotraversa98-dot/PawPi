// Foreground-session bookkeeping. PURE (clock + uuid injected).
//
//   - a session starts with the first event of the process (cold start);
//   - going to background ends a foreground STRETCH (its length feeds session_end);
//   - coming back after >= idleMs (30 min) in the background starts a NEW session (new session_id);
//     coming back sooner continues the same session_id.

export const SESSION_IDLE_MS = 30 * 60 * 1000;

export function createSession({ now = () => Date.now(), uuid, idleMs = SESSION_IDLE_MS }) {
  let id = null;
  let startedAt = 0;
  let stretchStart = 0;
  let backgroundedAt = null;

  const begin = () => {
    id = uuid();
    startedAt = now();
    stretchStart = startedAt;
    backgroundedAt = null;
  };

  return {
    /** True when no session exists yet (the caller emits session_start{cold:true} after ensure()). */
    isStarted: () => id !== null,
    /** Create the session if there is none. Returns true when it was created by this call. */
    ensure() {
      if (id !== null) return false;
      begin();
      return true;
    },
    id: () => id,
    /** ms since this session started (>= 0): the event `t`. */
    elapsedMs: () => (id === null ? 0 : Math.max(0, now() - startedAt)),
    /** App went to background. Returns the length (seconds) of the foreground stretch that just ended. */
    background() {
      if (id === null) return 0;
      const t = now();
      backgroundedAt = t;
      return Math.max(0, Math.round((t - stretchStart) / 1000));
    },
    /** App is active again. `rotated` = a brand-new session was started (old one idle >= idleMs). */
    foreground() {
      if (id === null) return { rotated: false };
      const t = now();
      const away = backgroundedAt === null ? 0 : t - backgroundedAt;
      backgroundedAt = null;
      if (away >= idleMs) {
        begin();
        return { rotated: true };
      }
      stretchStart = t;
      return { rotated: false };
    },
    /** Forget the session (opt-out). */
    reset() {
      id = null;
      backgroundedAt = null;
    },
  };
}
