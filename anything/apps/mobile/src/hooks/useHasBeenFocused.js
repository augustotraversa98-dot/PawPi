import { useContext, useEffect, useState } from "react";
import { NavigationContext } from "@react-navigation/native";

// true once the screen this hook is called from has been focused at least once — and stays true.
//
// Why: a tab screen may be mounted at app launch (the iOS native tab bar mounts every tab up front)
// even though nobody has opened it. Everything it fetches then fires in the launch burst — and the
// API pool (10 connections, ~1.4 s per round trip) is shared with the Feed the user IS looking at.
// Screens use this to render nothing (and so fetch nothing) until the user first opens them.
//
// Outside a navigator (unit tests, a screen rendered on its own) there is no navigation context and
// the screen counts as focused, so nothing is ever withheld there.
//
// The 'focus' event is the fast path. A cheap in-memory poll of `isFocused()` is the backstop, so a
// navigator that did not emit the event could delay a tab by at most POLL_MS — never leave it blank.
const POLL_MS = 400;

export function useHasBeenFocused() {
  const navigation = useContext(NavigationContext);
  const [hasBeenFocused, setHasBeenFocused] = useState(
    () => !navigation || navigation.isFocused(),
  );

  useEffect(() => {
    if (hasBeenFocused || !navigation) return undefined;
    if (navigation.isFocused()) {
      setHasBeenFocused(true);
      return undefined;
    }
    const unsubscribe = navigation.addListener("focus", () => setHasBeenFocused(true));
    const poll = setInterval(() => {
      if (navigation.isFocused()) setHasBeenFocused(true);
    }, POLL_MS);
    return () => {
      clearInterval(poll);
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, [navigation, hasBeenFocused]);

  return hasBeenFocused;
}

export default useHasBeenFocused;
