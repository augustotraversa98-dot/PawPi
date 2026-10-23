// Accessibility preference hooks (ticket 2.77 — Liquid Glass foundation).
// The redesign leans on translucency + spring motion, both of which iOS lets the
// user dial back. These hooks expose the live OS settings so material/motion
// primitives can degrade cleanly:
//   • Reduce Transparency  → solid surfaces instead of blur
//   • Reduce Motion        → cross-fades instead of movement
// Both default to FALSE (full effect) and update live if the user toggles them.

import { useSyncExternalStore } from "react";
import { AccessibilityInfo } from "react-native";

// ONE shared store per OS setting (perf audit 2026-10-23, F6.1). These hooks used to give every component instance its
// own AccessibilityInfo.is…Enabled() native call plus its own change listener plus its own setState: PressableScale
// alone has 735 usages and a 20-card feed mounts ~4-5 per card, i.e. ~100 async native calls and ~100 state
// updates on the first frame. Now the first subscriber starts the single read + the single listener, every other
// component reads the current value synchronously (so later mounts never flash the wrong value), and the last
// unsubscribe tears it down.
//
// `getter` is the query fn name and `event` the change-event name; both are guarded because Reduce Transparency is
// iOS-only (the getter/event are absent on Android).
function createA11yFlagStore(getterName, eventName) {
  let value = false;
  let sub = null;
  let started = false;
  let generation = 0;
  const listeners = new Set();

  function emit(next) {
    if (next === value) return;
    value = next;
    listeners.forEach((listener) => listener());
  }

  function start() {
    started = true;
    const current = ++generation;
    const getter = AccessibilityInfo?.[getterName];
    if (typeof getter === "function") {
      // Promise.resolve() tolerates a getter that returns a plain value (or nothing) on platforms with a
      // thinner shim, not just a Promise.
      Promise.resolve(getter())
        .then((v) => {
          // Ignore an answer that arrives after the store was stopped (or restarted).
          if (started && current === generation) emit(!!v);
        })
        .catch(() => {});
    }
    sub = AccessibilityInfo?.addEventListener?.(eventName, (v) => {
      if (started) emit(!!v);
    });
  }

  function stop() {
    started = false;
    // RN >=0.65 returns a subscription with .remove(); guard for older shims.
    if (sub && typeof sub.remove === "function") sub.remove();
    sub = null;
    value = false;
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      if (!started) start();
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) stop();
      };
    },
    getSnapshot: () => value,
  };
}

const reduceMotionStore = createA11yFlagStore("isReduceMotionEnabled", "reduceMotionChanged");
const reduceTransparencyStore = createA11yFlagStore(
  "isReduceTransparencyEnabled",
  "reduceTransparencyChanged",
);
const serverSnapshot = () => false;

// True when the user has asked to minimize motion.
export function useReducedMotion() {
  return useSyncExternalStore(reduceMotionStore.subscribe, reduceMotionStore.getSnapshot, serverSnapshot);
}

// True when the user has asked to reduce transparency (iOS). Always false on
// platforms without the setting, so glass effects stay on by default.
export function useReduceTransparency() {
  return useSyncExternalStore(
    reduceTransparencyStore.subscribe,
    reduceTransparencyStore.getSnapshot,
    serverSnapshot,
  );
}
