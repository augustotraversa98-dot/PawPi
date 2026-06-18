import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, TouchableOpacity, Text } from "react-native";
import { Share2 } from "lucide-react-native";
import { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import { COLORS } from "@/constants/colors";
import ShareableMemoryCard from "./ShareableMemoryCard";

// Share a Memory / Wrapped slide to IG/X (ticket 2.49). REUSES the 2.28 capture+share flow:
// mounts an off-screen ShareableMemoryCard, snapshots it, opens the system share sheet. Any
// failure (capture or sharing unavailable) is a graceful no-op — never a crash.
// Give a slow photo slide up to this long to decode before giving up (ticket 2.62).
const CAPTURE_TIMEOUT_MS = 5000;

export function MemoryShareButton({ card, label = "Share", petName }) {
  const cardRef = useRef(null);
  const [capturing, setCapturing] = useState(false);
  const doneRef = useRef(false);
  const timeoutRef = useRef(null);

  const clearTimer = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const abort = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    clearTimer();
    setCapturing(false);
  }, [clearTimer]);

  // Fires once the slide is ready: image decoded (photo slide) or laid out
  // (stat/emoji slide). Never snapshots a half-loaded photo card (ticket 2.62).
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
          dialogTitle: `${petName || "My pup"} on PawPi 🐾`,
          UTI: "public.png",
        });
      }
    } catch (e) {
      // graceful
    } finally {
      setCapturing(false);
    }
  }, [petName, clearTimer]);

  useEffect(() => clearTimer, [clearTimer]);

  const onPress = () => {
    doneRef.current = false;
    clearTimer();
    timeoutRef.current = setTimeout(abort, CAPTURE_TIMEOUT_MS);
    setCapturing(true);
  };

  return (
    <>
      <TouchableOpacity
        testID="memory-share"
        onPress={onPress}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          backgroundColor: COLORS.coral,
          borderRadius: 14,
          paddingHorizontal: 16,
          paddingVertical: 10,
        }}
      >
        <Share2 size={16} color="#FFF" />
        <Text style={{ fontSize: 14, fontWeight: "800", color: "#FFF" }}>{label}</Text>
      </TouchableOpacity>

      {capturing && (
        <View
          testID="memory-capture-card"
          pointerEvents="none"
          style={{ position: "absolute", left: -9999, top: -9999 }}
        >
          <ShareableMemoryCard
            ref={cardRef}
            petName={petName}
            {...card}
            onReady={onReady}
            onError={abort}
          />
        </View>
      )}
    </>
  );
}

export default MemoryShareButton;
