// Test helper (not shipped logic): a minimal stand-in for a react-navigation `navigation` object —
// enough for hooks/useHasBeenFocused (isFocused + a 'focus' listener) — so tab screens can be
// rendered "not yet opened" and then "opened" without a real navigator.
export function makeFakeNavigation({ focused = false } = {}) {
  let isFocused = focused;
  const listeners = new Set();
  return {
    navigation: {
      isFocused: () => isFocused,
      addListener: (event, cb) => {
        if (event !== "focus") return () => {};
        listeners.add(cb);
        return () => listeners.delete(cb);
      },
    },
    focus() {
      isFocused = true;
      [...listeners].forEach((cb) => cb());
    },
    listenerCount: () => listeners.size,
  };
}
