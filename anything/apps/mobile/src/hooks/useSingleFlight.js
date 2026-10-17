import { useRef, useCallback } from "react";

// useSingleFlight() -> run(fn): runs `fn` unless a previous run is still pending (double-tap guard for
// Save/Send/Post handlers; general sweep 2026-10-17). The lock is a ref, so it survives re-renders
// (a per-render wrapper would be reset by the re-render a first tap causes). Ignored calls resolve to
// `undefined`; the lock is always released, even if `fn` throws.
export default function useSingleFlight() {
  const inFlight = useRef(false);
  return useCallback(async (fn) => {
    if (inFlight.current) return undefined;
    inFlight.current = true;
    try {
      return await fn();
    } finally {
      inFlight.current = false;
    }
  }, []);
}
