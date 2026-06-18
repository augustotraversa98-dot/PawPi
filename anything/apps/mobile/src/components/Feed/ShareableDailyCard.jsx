import React, { forwardRef } from "react";
import { View, Text } from "react-native";
import { Image } from "expo-image";
import { PawPrint } from "lucide-react-native";
import { COLORS } from "@/constants/colors";

// A story-sized (9:16) branded frame for sharing a pet's daily photo (ticket 2.28).
// Rendered OFF-SCREEN and snapshotted with react-native-view-shot. Tasteful + on-brand;
// the photo is the hero, wrapped in the warm PawPi palette with "[name] is part of PawPi".
// forwardRef so the capture target is this view. The exact art is a judgment call — Tats
// will eyeball + tweak on device.
const ShareableDailyCard = forwardRef(function ShareableDailyCard(
  { petName, photoUri, onReady, onError },
  ref,
) {
  const name = petName || "My pup";
  // The card is "ready" to capture only once the hero image has decoded. When
  // there's no photo, it's ready as soon as it lays out (nothing to wait for).
  return (
    <View
      ref={ref}
      collapsable={false}
      onLayout={!photoUri && onReady ? () => onReady() : undefined}
      style={{
        width: 360,
        height: 640, // 9:16
        backgroundColor: COLORS.coral,
        padding: 20,
        justifyContent: "space-between",
      }}
    >
      {/* Brand header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          paddingVertical: 8,
        }}
      >
        <PawPrint size={22} color="#FFF" fill="#FFF" />
        <Text style={{ fontSize: 22, fontWeight: "900", color: "#FFF", letterSpacing: 0.5 }}>
          PawPi
        </Text>
      </View>

      {/* Photo in a soft rounded card */}
      <View
        style={{
          flex: 1,
          marginVertical: 16,
          borderRadius: 28,
          overflow: "hidden",
          backgroundColor: COLORS.cream,
          borderWidth: 6,
          borderColor: "#FFF",
        }}
      >
        {photoUri ? (
          <Image
            testID="share-card-image"
            source={{ uri: photoUri }}
            style={{ width: "100%", height: "100%" }}
            contentFit="cover"
            cachePolicy="memory-disk"
            priority="high"
            onLoad={onReady}
            onError={onError}
          />
        ) : (
          <View
            style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
          >
            <PawPrint size={64} color={COLORS.peach} />
          </View>
        )}
      </View>

      {/* Tagline */}
      <View style={{ alignItems: "center", paddingBottom: 10 }}>
        <Text
          style={{
            fontSize: 20,
            fontWeight: "900",
            color: "#FFF",
            textAlign: "center",
          }}
        >
          {name} is part of PawPi 🐾
        </Text>
        <Text
          style={{
            fontSize: 13,
            fontWeight: "600",
            color: "#FFF",
            opacity: 0.9,
            marginTop: 6,
          }}
        >
          one honest moment, every day
        </Text>
      </View>
    </View>
  );
});

export default ShareableDailyCard;
