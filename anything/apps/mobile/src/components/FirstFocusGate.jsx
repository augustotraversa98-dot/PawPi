import React from "react";
import { View } from "react-native";
import { useHasBeenFocused } from "@/hooks/useHasBeenFocused";

// Renders `children` only after the surrounding screen has been focused once; until then a blank
// placeholder holds the place. The children are not even mounted, so none of their queries run —
// see hooks/useHasBeenFocused. `backgroundColor` should match the screen so the first open never
// flashes a different colour.
export function FirstFocusGate({ children, backgroundColor }) {
  const hasBeenFocused = useHasBeenFocused();
  if (!hasBeenFocused) {
    return <View testID="first-focus-placeholder" style={{ flex: 1, backgroundColor }} />;
  }
  return <>{children}</>;
}

export default FirstFocusGate;
