import React, { useCallback, useRef, useState } from "react";
import { View, TouchableOpacity } from "react-native";
import { Share2 } from "lucide-react-native";
import { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import { COLORS } from "@/constants/colors";
import ShareableDailyCard from "./ShareableDailyCard";

// The enhanced default text for X / the share sheet (ticket 2.28).
export function shareCaption(petName) {
  const name = petName || "my pup";
  return `Meet ${name} 🐾 today's daily on PawPi — one honest moment a day.`;
}

// A Share affordance for a daily photo (ticket 2.28). Tapping mounts an off-screen
// ShareableDailyCard, snapshots it to an image (react-native-view-shot), and opens the
// system share sheet (expo-sharing → Instagram Stories / X / etc.). Optional + graceful:
// any failure (capture or sharing unavailable) is a no-op, never a crash. The daily-post
// flow + BeReal lock are untouched.
export function DailyShareButton({ petName, photoUri, locked, size = 20, color }) {
  const cardRef = useRef(null);
  const [capturing, setCapturing] = useState(false);

  const onCardReady = useCallback(async () => {
    try {
      const uri = await captureRef(cardRef, { format: "png", quality: 1 });
      const available = await Sharing.isAvailableAsync().catch(() => false);
      if (available && uri) {
        await Sharing.shareAsync(uri, {
          mimeType: "image/png",
          dialogTitle: shareCaption(petName),
          UTI: "public.png",
        });
      }
    } catch (e) {
      // Graceful: capture/sharing not available → do nothing (no crash).
    } finally {
      setCapturing(false);
    }
  }, [petName]);

  const onPress = () => {
    if (locked || !photoUri) return;
    setCapturing(true); // mounts the off-screen card; capture fires on its layout
  };

  return (
    <>
      <TouchableOpacity testID="daily-share" onPress={onPress} disabled={locked}>
        <Share2 size={size} color={locked ? COLORS.peach : color || COLORS.mutedBrown} />
      </TouchableOpacity>

      {capturing && (
        <View
          testID="share-capture-card"
          onLayout={onCardReady}
          pointerEvents="none"
          style={{ position: "absolute", left: -9999, top: -9999 }}
        >
          <ShareableDailyCard ref={cardRef} petName={petName} photoUri={photoUri} />
        </View>
      )}
    </>
  );
}

export default DailyShareButton;
