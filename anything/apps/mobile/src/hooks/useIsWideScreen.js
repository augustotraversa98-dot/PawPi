import { useWindowDimensions } from "react-native";

// A screen is "wide" (tablet landscape / web) when it can comfortably show a
// side-by-side split. Used by the Services Hub discovery screen (P3) to pick the
// split layout vs the mobile toggle+bottom-sheet. Kept as its own hook so screens
// read one boolean and tests can mock the breakpoint deterministically.
export const WIDE_BREAKPOINT = 900;

export function useIsWideScreen() {
  const { width } = useWindowDimensions();
  return width >= WIDE_BREAKPOINT;
}
