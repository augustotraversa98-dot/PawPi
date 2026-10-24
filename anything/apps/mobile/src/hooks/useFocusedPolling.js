import { useContext, useEffect, useRef, useState } from "react";
import { NavigationContext } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";

// Screen-focused polling (perf audit 2026-10-23, section 5.6 / finding B5).
//
// React Query already pauses `refetchInterval` while the APP is backgrounded (focusManager is wired to
// AppState in utils/connectivity.js). It does NOT know about NAVIGATION focus: the iOS native tab bar mounts
// all five tabs, and a stack keeps the screens underneath a pushed one mounted, so a hidden screen's polling
// hook kept firing every 8-30 s for a screen nobody was looking at (the chat unread count ran 32,364 times).
//
// useFocusedPolling(ms) returns `ms` while the calling screen is focused and `false` while it is not, which
// is exactly what `refetchInterval` accepts. Outside a navigator (unit tests, a component rendered on its
// own) there is no navigation context and it counts as focused, so nothing is ever withheld there.
export function useFocusedPolling(intervalMs) {
  return useIsScreenFocused() ? intervalMs : false;
}

export function useIsScreenFocused() {
  const navigation = useContext(NavigationContext);
  const [focused, setFocused] = useState(() => !navigation || navigation.isFocused());

  useEffect(() => {
    if (!navigation) return undefined;
    setFocused(navigation.isFocused());
    const offFocus = navigation.addListener("focus", () => setFocused(true));
    const offBlur = navigation.addListener("blur", () => setFocused(false));
    return () => {
      offFocus();
      offBlur();
    };
  }, [navigation]);

  return focused;
}

// useQuery + focus-aware polling. While the screen is hidden the interval is off; the moment it is focused
// again a stale query is refetched right away (the interval alone would wait a full period), so a badge or
// list is never left old after a tab switch. `options.staleTime` (default 0) decides what "stale" means.
export function useFocusedQuery(options, intervalMs) {
  const focused = useIsScreenFocused();
  const query = useQuery({ ...options, refetchInterval: focused ? intervalMs : false });
  const wasFocused = useRef(focused);
  const { refetch, isStale } = query;

  useEffect(() => {
    const regained = focused && !wasFocused.current;
    wasFocused.current = focused;
    if (regained && isStale && options.enabled !== false) refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused]);

  return query;
}
