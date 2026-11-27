import { useContext, useEffect, useRef } from "react";
import { QueryClientContext, focusManager } from "@tanstack/react-query";
import { useIsScreenFocused } from "@/hooks/useFocusedPolling";
import { refreshSharing, refreshWaiting, sharingIsWaiting } from "@/utils/sharingRefresh";

export const SHARING_POLL_MS = 5000;

// For a screen that shows sharing: reads the lists again when the screen is returned to and when the app comes back to
// the front, and every few seconds while the screen is in view with something waiting for an answer.
export function useSharingLive() {
  // Read from the context so that a component rendered without a client (a test of its wording) simply has none.
  const queryClient = useContext(QueryClientContext);
  const focused = useIsScreenFocused();
  const wasFocused = useRef(focused);

  useEffect(() => {
    const regained = focused && !wasFocused.current;
    wasFocused.current = focused;
    if (regained && queryClient) refreshSharing(queryClient);
  }, [focused, queryClient]);

  useEffect(() => {
    if (!focused || !queryClient) return undefined;
    let wasActive = focusManager.isFocused();
    const unsubscribe = focusManager.subscribe(() => {
      const active = focusManager.isFocused();
      if (active && !wasActive) refreshSharing(queryClient);
      wasActive = active;
    });
    const timer = setInterval(() => {
      if (focusManager.isFocused() && sharingIsWaiting(queryClient)) refreshWaiting(queryClient);
    }, SHARING_POLL_MS);
    return () => {
      unsubscribe();
      clearInterval(timer);
    };
  }, [focused, queryClient]);
}
