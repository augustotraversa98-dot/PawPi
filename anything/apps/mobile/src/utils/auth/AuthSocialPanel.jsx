// The Apple and Google buttons under the sign-in / sign-up web page. The page itself cannot offer them (Google refuses
// sign-in inside an embedded browser), so without this the only way back to them is the Welcome screen. Signing in here
// only stores the session: the sign-in window then closes and routes exactly as it does after email and password.
import React, { useEffect, useState } from "react";
import { Keyboard, Platform, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS, SPACING } from "@/constants/theme";
import { SocialSignInButtons } from "@/components/auth/SocialSignInButtons";
import { useAuthStore } from "./store";
import { useSocialProviders } from "./useSocialProviders";

// While someone is typing, the form needs the room.
function useKeyboardOpen() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const [shown, hidden] =
      Platform.OS === "ios" ? ["keyboardWillShow", "keyboardWillHide"] : ["keyboardDidShow", "keyboardDidHide"];
    const subscriptions = [
      Keyboard.addListener(shown, () => setOpen(true)),
      Keyboard.addListener(hidden, () => setOpen(false)),
    ];
    return () => subscriptions.forEach((s) => s.remove());
  }, []);
  return open;
}

export function AuthSocialPanel() {
  const { showGoogle, showApple } = useSocialProviders();
  const setAuth = useAuthStore((s) => s.setAuth);
  const insets = useSafeAreaInsets();
  const keyboardOpen = useKeyboardOpen();

  if (!showGoogle && !showApple) return null;

  return (
    <View
      testID="auth-social-panel"
      style={{
        // Hidden, not removed: a keyboard shown by the Google sheet must not reset a sign-in that is under way.
        display: keyboardOpen ? "none" : "flex",
        backgroundColor: COLORS.cream,
        paddingHorizontal: SPACING.xxl,
        paddingTop: SPACING.xs,
        paddingBottom: insets.bottom + SPACING.sm,
      }}
    >
      <SocialSignInButtons showGoogle={showGoogle} showApple={showApple} onAuthenticated={setAuth} />
    </View>
  );
}
