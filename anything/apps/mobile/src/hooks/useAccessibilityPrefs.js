// Accessibility preference hooks (ticket 2.77 — Liquid Glass foundation).
// The redesign leans on translucency + spring motion, both of which iOS lets the
// user dial back. These hooks expose the live OS settings so material/motion
// primitives can degrade cleanly:
//   • Reduce Transparency  → solid surfaces instead of blur
//   • Reduce Motion        → cross-fades instead of movement
// Both default to FALSE (full effect) and update live if the user toggles them.

import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

// Subscribe to one AccessibilityInfo boolean setting. `getter` is the query fn
// name and `event` the change-event name; both are guarded because Reduce
// Transparency is iOS-only (the getter/event are absent on Android).
function useA11yFlag(getterName, eventName) {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let mounted = true;
    const getter = AccessibilityInfo?.[getterName];

    if (typeof getter === "function") {
      // Promise.resolve() tolerates a getter that returns a plain value (or
      // nothing) on platforms with a thinner shim, not just a Promise.
      Promise.resolve(getter())
        .then((value) => {
          if (mounted) setEnabled(!!value);
        })
        .catch(() => {});
    }

    const sub = AccessibilityInfo?.addEventListener?.(eventName, (value) => {
      if (mounted) setEnabled(!!value);
    });

    return () => {
      mounted = false;
      // RN ≥0.65 returns a subscription with .remove(); guard for older shims.
      if (sub && typeof sub.remove === "function") sub.remove();
    };
  }, [getterName, eventName]);

  return enabled;
}

// True when the user has asked to minimize motion.
export function useReducedMotion() {
  return useA11yFlag("isReduceMotionEnabled", "reduceMotionChanged");
}

// True when the user has asked to reduce transparency (iOS). Always false on
// platforms without the setting, so glass effects stay on by default.
export function useReduceTransparency() {
  return useA11yFlag("isReduceTransparencyEnabled", "reduceTransparencyChanged");
}
