import React, { useCallback, useRef, useState } from "react";
import { View, TouchableOpacity, Text } from "react-native";
import { Share2 } from "lucide-react-native";
import { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import { COLORS } from "@/constants/colors";
import ShareableMemoryCard from "./ShareableMemoryCard";

// Share a Memory / Wrapped slide to IG/X (ticket 2.49). REUSES the 2.28 capture+share flow:
// mounts an off-screen ShareableMemoryCard, snapshots it, opens the system share sheet. Any
// failure (capture or sharing unavailable) is a graceful no-op — never a crash.
export function MemoryShareButton({ card, label = "Share", petName }) {
  const cardRef = useRef(null);
  const [capturing, setCapturing] = useState(false);

  const onCardReady = useCallback(async () => {
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
  }, [petName]);

  return (
    <>
      <TouchableOpacity
        testID="memory-share"
        onPress={() => setCapturing(true)}
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
          onLayout={onCardReady}
          pointerEvents="none"
          style={{ position: "absolute", left: -9999, top: -9999 }}
        >
          <ShareableMemoryCard ref={cardRef} petName={petName} {...card} />
        </View>
      )}
    </>
  );
}

export default MemoryShareButton;
