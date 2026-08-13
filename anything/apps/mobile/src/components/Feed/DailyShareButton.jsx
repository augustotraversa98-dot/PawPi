import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, TouchableOpacity, Text } from "react-native";
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
// How long to wait for the photo to decode before giving up (ticket 2.62). A slow
// image must never hang the share forever — and we never snapshot a blank card.
const CAPTURE_TIMEOUT_MS = 5000;

export function DailyShareButton({ petName, photoUri, locked, size = 20, color, label }) {
  const cardRef = useRef(null);
  const [capturing, setCapturing] = useState(false);
  const doneRef = useRef(false); // guards against onReady/onError/timeout double-firing
  const timeoutRef = useRef(null);

  const clearTimer = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  // Tear down a pending capture without sharing — used on error/timeout.
  const abort = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    clearTimer();
    setCapturing(false);
  }, [clearTimer]);

  // Fires only once the hero image has actually decoded (ticket 2.62), so the
  // snapshot contains the real photo, not the blank cream center.
  const onReady = useCallback(async () => {
    if (doneRef.current) return;
    doneRef.current = true;
    clearTimer();
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
  }, [petName, clearTimer]);

  useEffect(() => clearTimer, [clearTimer]);

  const onPress = () => {
    if (locked || !photoUri) return;
    doneRef.current = false;
    clearTimer();
    timeoutRef.current = setTimeout(abort, CAPTURE_TIMEOUT_MS);
    setCapturing(true); // mounts the off-screen card; capture waits for image load
  };

  return (
    <>
      {label ? (
        <TouchableOpacity
          testID="daily-share"
          onPress={onPress}
          disabled={locked}
          accessibilityRole="button"
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            paddingVertical: 10,
            paddingHorizontal: 16,
            borderRadius: 999,
            backgroundColor: COLORS.coral,
          }}
        >
          <Share2 size={size} color="#FFF" />
          <Text style={{ color: "#FFF", fontWeight: "800", fontSize: 14 }}>{label}</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity testID="daily-share" onPress={onPress} disabled={locked}>
          <Share2 size={size} color={locked ? COLORS.peach : color || COLORS.mutedBrown} />
        </TouchableOpacity>
      )}

      {capturing && (
        <View
          testID="share-capture-card"
          pointerEvents="none"
          style={{ position: "absolute", left: -9999, top: -9999 }}
        >
          <ShareableDailyCard
            ref={cardRef}
            petName={petName}
            photoUri={photoUri}
            onReady={onReady}
            onError={abort}
          />
        </View>
      )}
    </>
  );
}

export default DailyShareButton;
