import { useState, useRef, useEffect, useCallback } from "react";

/**
 * Drive a single pull-to-refresh cycle. Exported separately from the hook so the
 * state machine can be unit-tested without a React renderer.
 *
 * Sets refreshing true, awaits every refetch, then ALWAYS clears refreshing —
 * even when a refetch rejects — so the spinner can never get stuck. Individual
 * refetch failures are swallowed here; each query/store logs its own error.
 *
 * @param {Function|Array<Function>} refetch one refetch fn or an array of them
 * @param {(value: boolean) => void} setRefreshing
 */
export async function runRefresh(refetch, setRefreshing) {
  setRefreshing(true);
  try {
    const fns = Array.isArray(refetch) ? refetch : [refetch];
    await Promise.all(fns.filter(Boolean).map((fn) => fn()));
  } catch {
    // Swallow: the spinner must clear regardless of refetch outcome.
  } finally {
    setRefreshing(false);
  }
}

/**
 * Pull-to-refresh state for a ScrollView/RefreshControl. Pass the screen's
 * refetch fn (or an array of them); `onRefresh` awaits them all then stops the
 * spinner. `onRefresh` is stable, so callers may pass an inline array.
 *
 * @param {Function|Array<Function>} refetch
 * @returns {{ refreshing: boolean, onRefresh: () => Promise<void> }}
 */
export function useRefresh(refetch) {
  const [refreshing, setRefreshing] = useState(false);
  const refetchRef = useRef(refetch);
  useEffect(() => {
    refetchRef.current = refetch;
  });
  const onRefresh = useCallback(
    () => runRefresh(refetchRef.current, setRefreshing),
    [],
  );
  return { refreshing, onRefresh };
}
