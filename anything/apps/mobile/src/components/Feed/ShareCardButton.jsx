// ShareCardButton (unit E4) — one-tap share of a ShareableStatCard. Same capture+share path as the
// 2.62 DailyShareButton: mount the branded card off-screen, wait for the hero image to decode (load-
// gated, with a timeout so a slow image never hangs), snapshot it at story size (1080×1920) with
// react-native-view-shot, then open the OS share sheet (Instagram Stories / WhatsApp / Save). Any
// failure is a graceful no-op, never a crash.

import React, { useCallback, useRef, useState } from "react";
import { View, TouchableOpacity, Text } from "react-native";
import { Share2 } from "lucide-react-native";
import { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import { COLORS } from "@/constants/colors";
import ShareableStatCard from "./ShareableStatCard";
import { petShareUrl } from "@/utils/shareLinks";

const CAPTURE_TIMEOUT_MS = 5000;

export function ShareCardButton({ card, pet, label, disabled }) {
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

  const onReady = useCallback(async () => {
    if (doneRef.current) return;
    doneRef.current = true;
    clearTimer();
    try {
      // Snapshot at story resolution (9:16 → 1080×1920).
      const uri = await captureRef(cardRef, { format: "png", quality: 1, width: 1080, height: 1920 });
      const available = await Sharing.isAvailableAsync().catch(() => false);
      if (available && uri) {
        await Sharing.shareAsync(uri, {
          mimeType: "image/png",
          dialogTitle: petShareUrl(pet?.handle),
          UTI: "public.png",
        });
      }
    } catch {
      // graceful no-op
    } finally {
      setCapturing(false);
    }
  }, [clearTimer, pet]);

  const onPress = () => {
    if (disabled) return;
    doneRef.current = false;
    clearTimer();
    timeoutRef.current = setTimeout(abort, CAPTURE_TIMEOUT_MS);
    setCapturing(true);
  };

  return (
    <>
      <TouchableOpacity
        testID="share-card-button"
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          paddingVertical: 10,
          paddingHorizontal: 16,
          borderRadius: 999,
          backgroundColor: disabled ? COLORS.sand : COLORS.coral,
        }}
      >
        <Share2 size={18} color={disabled ? COLORS.mutedBrown : "#FFF"} />
        {label ? (
          <Text style={{ color: disabled ? COLORS.mutedBrown : "#FFF", fontWeight: "800", fontSize: 14 }}>
            {label}
          </Text>
        ) : null}
      </TouchableOpacity>

      {capturing && (
        <View testID="stat-card-capture" pointerEvents="none" style={{ position: "absolute", left: -9999, top: -9999 }}>
          <ShareableStatCard ref={cardRef} card={card} pet={pet} onReady={onReady} onError={abort} />
        </View>
      )}
    </>
  );
}

export default ShareCardButton;
