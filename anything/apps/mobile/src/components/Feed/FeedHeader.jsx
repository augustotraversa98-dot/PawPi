import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Bell, Search, MessageCircle } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { COLORS } from "@/constants/colors";
import useSocialPetStore from "@/store/socialPetStore";
import { PetSwitcher } from "@/components/Pets/PetSwitcher";

export function FeedHeader() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const unreadNotificationCount = useSocialPetStore(
    (state) => state.unreadNotificationCount,
  );

  return (
    <View
      style={{
        paddingTop: insets.top,
        paddingHorizontal: 20,
        paddingBottom: 14,
        backgroundColor: COLORS.card,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.peach,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text
          style={{
            fontSize: 26,
            fontWeight: "800",
            color: COLORS.coral,
            letterSpacing: -0.5,
          }}
        >
          Social Pet
        </Text>
        <Text style={{ fontSize: 22 }}>🐾</Text>
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <TouchableOpacity
          onPress={() => router.push("/search")}
          style={{
            padding: 9,
            backgroundColor: COLORS.sand,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: COLORS.peach,
          }}
        >
          <Search size={20} color={COLORS.terracotta} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => router.push("/messages")}
          style={{
            padding: 9,
            backgroundColor: COLORS.sand,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: COLORS.peach,
          }}
        >
          <MessageCircle size={20} color={COLORS.terracotta} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => router.push("/notifications")}
          style={{
            padding: 9,
            backgroundColor: COLORS.sand,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: COLORS.peach,
            position: "relative",
          }}
        >
          <Bell size={20} color={COLORS.terracotta} />
          {unreadNotificationCount > 0 && (
            <View
              style={{
                position: "absolute",
                top: 4,
                right: 4,
                backgroundColor: COLORS.coral,
                borderRadius: 10,
                minWidth: 18,
                height: 18,
                justifyContent: "center",
                alignItems: "center",
                borderWidth: 2,
                borderColor: COLORS.card,
              }}
            >
              <Text
                style={{
                  color: "#FFF",
                  fontSize: 10,
                  fontWeight: "800",
                }}
              >
                {unreadNotificationCount > 9 ? "9+" : unreadNotificationCount}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
      </View>

      <View style={{ marginTop: 12 }}>
        <PetSwitcher variant="pill" />
      </View>
    </View>
  );
}
