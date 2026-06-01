import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Camera, ChevronDown, ChevronUp } from "lucide-react-native";
import PhotoHistory from "../PhotoCheck/PhotoHistory";
import { healthColors } from "@/constants/healthColors";

export function PhotoHistorySection({ showPhotoHistory, onToggle }) {
  return (
    <View style={{ marginBottom: 24 }}>
      <TouchableOpacity
        onPress={onToggle}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Camera size={18} color={healthColors.warmBrown} />
          <Text
            style={{
              fontSize: 15,
              fontWeight: "700",
              color: healthColors.warmBrown,
            }}
          >
            Photo History
          </Text>
        </View>
        {showPhotoHistory ? (
          <ChevronUp size={20} color={healthColors.mutedBrown} />
        ) : (
          <ChevronDown size={20} color={healthColors.mutedBrown} />
        )}
      </TouchableOpacity>
      {showPhotoHistory && (
        <View
          style={{
            backgroundColor: healthColors.card,
            borderRadius: 18,
            padding: 12,
            borderWidth: 1.5,
            borderColor: healthColors.peach,
          }}
        >
          <PhotoHistory />
        </View>
      )}
    </View>
  );
}
