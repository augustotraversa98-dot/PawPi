// The telemetry core. PURE: every platform dependency (stores, fetch, clock, timers, uuid, device info) is
// injected, so the whole behaviour -- validation, queueing, sessions, kill switch, sampling, opt-out -- is unit
// tested without react-native. `runtime.js` wires the real dependencies; nothing here imports a native module.
//
// Guarantees:
//   - nothing in this file throws to its caller (every public method is wrapped);
//   - FAIL CLOSED: nothing is sent until GET /api/telemetry/config answered { enabled: true } and the user's
//     preference is known to be ON; until then events wait in the capped (200) in-memory queue;
//   - sampleRate is rolled once per session; a session that is not sampled records nothing;
//   - opt-out: capture stops at once, queue cleared, ONE opt_out event is sent, install_id is deleted;
//     opting back in creates a NEW random install_id.

import { durationSecondsBucket } from './bucket';
import { sanitizeEvent } from './validate';
import { createQueue } from './queue';
import { createSession } from './session';
import { buildEnvelope } from './envelope';

export const FUNNEL_ONCE_KEY = 'pawpi.telemetry.funnel_once';
export const CONFIG_REFRESH_MS = 5 * 60 * 1000;
const CONFIG_RETRY_MIN_MS = 10 * 1000;
const FUNNEL_ONCE_MAX = 64;

export function createTelemetry({
  prefs, // { getEnabled(), setEnabled(bool) }
  installIds, // { get(), peek(), clear() }
  sender, // { post(envelope), getConfig() }
  kv, // { getItem, setItem, removeItem } (funnel "once" markers)
  uuid,
  getContext = () => ({}), // -> { app_version, build, platform, os_major, locale } (raw values)
  now = () => Date.now(),
  random = () => Math.random(),
  setTimer,
  clearTimer,
  queueOptions = {},
}) {
  const state = {
    pref: null, // null = not loaded yet (events are buffered, nothing is sent)
    config: null, // { enabled, sampleRate } once fetched; null = unknown (fail closed)
    configAt: 0,
    lastConfigTry: 0,
    configInflight: null,
    roll: random(),
    hadSession: false,
    started: false,
    optOutSent: false,
  };

  const session = createSession({ now, uuid });

  const sampled = () => state.config !== null && state.roll < state.config.sampleRate;
  const canSend = () => state.pref === true && state.config !== null && state.config.enabled === true && sampled();

  const safeContext = () => {
    try {
      return getContext() || {};
    } catch {
      return {};
    }
  };

  async function sendBatch(batch) {
    if (state.pref !== true) return 'drop';
    const install_id = await installIds.get();
    if (state.pref !== true) return 'drop'; // opted out while we were waiting for the id
    const envelope = buildEnvelope({
      install_id,
      session_id: batch[0].session_id,
      events: batch.map(({ name, t, props }) => ({ name, t, props })),
      context: safeContext(),
      sent_at: now(),
    });
    if (!envelope) return 'drop';
    return sender.post(envelope);
  }

  async function refreshConfig() {
    if (state.configInflight) return state.configInflight;
    if (now() - state.lastConfigTry < CONFIG_RETRY_MIN_MS && state.lastConfigTry !== 0) return undefined;
    state.lastConfigTry = now();
    state.configInflight = (async () => {
      const cfg = await sender.getConfig();
      if (!cfg) return; // could not read it: keep what we had (fail closed when nothing)
      state.config = cfg;
      state.configAt = now();
      if (state.pref !== true) return;
      if (!cfg.enabled || !sampled()) queue.clear();
      else void queue.flush();
    })()
      .catch(() => {})
      .finally(() => {
        state.configInflight = null;
      });
    return state.configInflight;
  }

  const queue = createQueue({
    send: sendBatch,
    canSend,
    onBlocked: () => {
      if (state.pref === true && state.config === null) void refreshConfig();
    },
    ...(setTimer ? { setTimer } : {}),
    ...(clearTimer ? { clearTimer } : {}),
    ...queueOptions,
  });

  // Validate, apply the gates, stamp with the session and queue. Returns true when the event was queued.
  function enqueue(name, props) {
    const clean = sanitizeEvent(name, props);
    if (!clean) return false;
    if (state.pref === false) return false;
    if (state.config !== null && (!state.config.enabled || !sampled())) return false;
    if (session.ensure()) {
      const cold = !state.hadSession;
      state.hadSession = true;
      pushRaw('session_start', { cold });
    }
    return pushRaw(name, clean);
  }

  function pushRaw(name, props) {
    const clean = sanitizeEvent(name, props);
    if (!clean) return false;
    queue.push({ session_id: session.id(), name, t: session.elapsedMs(), props: clean });
    return true;
  }

  // ---- funnel "once per install" markers (persisted; cleared on opt-out) --------------------------------------
  let onceSet = null;
  let onceLoading = null;
  async function loadOnce() {
    if (onceSet) return onceSet;
    if (!onceLoading) {
      onceLoading = (async () => {
        let list = [];
        try {
          const parsed = JSON.parse(await kv.getItem(FUNNEL_ONCE_KEY));
          if (Array.isArray(parsed)) list = parsed.filter((x) => typeof x === 'string').slice(0, FUNNEL_ONCE_MAX);
        } catch {
          // none stored / unreadable
        }
        onceSet = new Set(list);
        return onceSet;
      })();
    }
    return onceLoading;
  }

  const api = {
    /** Record one event. Validated against the registry; unknown/PII-looking => silently dropped. Never throws. */
    track(name, props) {
      try {
        if (name === 'opt_out') return; // reserved: only optOut() sends it
        enqueue(name, props);
      } catch {
        // telemetry must never throw
      }
    },

    /** funnel_step, validated (funnel + step must be a registry pair). `once` = at most once per install. */
    trackFunnel(funnel, step, { once = false } = {}) {
      try {
        if (!sanitizeEvent('funnel_step', { funnel, step })) return;
        if (!once) {
          enqueue('funnel_step', { funnel, step });
          return;
        }
        void (async () => {
          try {
            const set = await loadOnce();
            const key = `${funnel}:${step}`;
            if (set.has(key)) return;
            if (!enqueue('funnel_step', { funnel, step })) return;
            set.add(key);
            try {
              await kv.setItem(FUNNEL_ONCE_KEY, JSON.stringify([...set].slice(-FUNNEL_ONCE_MAX)));
            } catch {
              // best effort
            }
          } catch {
            // ignore
          }
        })();
      } catch {
        // never throws
      }
    },

    /** Load the preference, start timed flushing, fetch the kill switch. Safe to call repeatedly. */
    async start() {
      try {
        if (state.started) return;
        state.started = true;
        const enabled = await prefs.getEnabled();
        state.pref = enabled === true;
        if (!state.pref) {
          queue.clear();
          queue.stop();
          session.reset();
          await installIds.clear(); // an opted-out device keeps no id (also heals a kill during opt-out)
          return;
        }
        queue.start();
        await refreshConfig();
      } catch {
        // never throws
      }
    },

    /** App went to background: close the foreground stretch (session_end) and flush now. */
    onBackground() {
      try {
        if (state.pref === false || !session.isStarted()) return;
        const bucket = durationSecondsBucket(session.background());
        if (bucket) enqueue('session_end', { duration_s_bucket: bucket });
        void queue.flush();
      } catch {
        // never throws
      }
    },

    /** App is active again; a new session_id after >= 30 min away. */
    onForeground() {
      try {
        if (state.pref === false) return;
        const { rotated } = session.foreground();
        if (rotated) {
          state.roll = random(); // sampleRate is honoured per session
          state.hadSession = true;
          if (state.config !== null && !sampled()) queue.clear();
          else enqueue('session_start', { cold: false });
        }
        if (state.config === null || now() - state.configAt > CONFIG_REFRESH_MS) void refreshConfig();
        else void queue.flush();
      } catch {
        // never throws
      }
    },

    flush() {
      return queue.flush();
    },

    /** Settings toggle OFF. Resolves when finished; never rejects. */
    async optOut() {
      try {
        if (state.pref === false && state.optOutSent) return;
        const wasActive = state.pref !== false;
        state.pref = false; // capture stops NOW
        state.optOutSent = true;
        queue.stop();
        queue.clear();
        await prefs.setEnabled(false); // persist before any network wait
        const notify = wasActive && canSendIgnoringPref();
        let install_id = null;
        if (notify) install_id = await installIds.peek();
        if (notify && install_id) {
          session.ensure();
          const envelope = buildEnvelope({
            install_id,
            session_id: session.id(),
            events: [{ name: 'opt_out', t: session.elapsedMs(), props: {} }],
            context: safeContext(),
            sent_at: now(),
          });
          if (envelope) await sender.post(envelope); // ONE attempt, no retry
        }
        await installIds.clear();
        session.reset();
        onceSet = null;
        onceLoading = null;
        try {
          await kv.removeItem(FUNNEL_ONCE_KEY);
        } catch {
          // ignore
        }
      } catch {
        // never throws
      }
    },

    /** Settings toggle ON again: a NEW random install_id, a new session. */
    async optIn() {
      try {
        state.pref = true;
        state.optOutSent = false;
        await installIds.clear();
        session.reset();
        state.hadSession = true; // the next session_start is not a cold start
        state.roll = random();
        await prefs.setEnabled(true);
        queue.start();
        void refreshConfig();
      } catch {
        // never throws
      }
    },

    /** The persisted user preference (default ON when unset). Never rejects. */
    async readPreference() {
      try {
        return (await prefs.getEnabled()) === true;
      } catch {
        return false;
      }
    },

    isEnabled: () => state.pref !== false,
    /** Test/diagnostic window into the internals (no secrets: ids are only returned by the stores). */
    _debug: () => ({ ...state, queued: queue.size(), dropped: queue.droppedCount(), sessionId: session.id() }),
    _queue: queue,
  };

  // Was the server config telling us events are being collected for this session? (opt_out is only worth sending
  // when events could have been sent.)
  function canSendIgnoringPref() {
    return state.config !== null && state.config.enabled === true && sampled();
  }

  return api;
}
