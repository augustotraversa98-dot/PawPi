import React from "react";
import { View, Text } from "react-native";
import { Bell, Search, MessageCircle } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { COLORS, TYPE, RADIUS, SPACING, MATERIALS, BLUR } from "@/constants/theme";
import { GlassSurface, PressableScale } from "@/components/ui";
import useSocialPetStore from "@/store/socialPetStore";
import { PetSwitcher } from "@/components/Pets/PetSwitcher";
import { useAllCareAccessGrants } from "@/hooks/useCareAccessGrants";
import { useCurrentPet } from "@/hooks/usePetProfile";
import { StreakChip } from "@/components/Health/StreakChip";

// A small glassy icon button used for the header actions (search/messages/bell).
function HeaderIconButton({ onPress, children }) {
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      style={{
        padding: 9,
        backgroundColor: MATERIALS.glassTintLight,
        borderRadius: RADIUS.control,
        borderWidth: 1,
        borderColor: MATERIALS.hairline,
        position: "relative",
      }}
    >
      {children}
    </PressableScale>
  );
}

export function FeedHeader() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const unreadReminderCount = useSocialPetStore(
    (state) => state.unreadNotificationCount,
  );
  // Pending care-access requests also live in the bell (see notifications.jsx),
  // so they count toward the badge — an access request should never go unseen.
  const { data: currentPet } = useCurrentPet();
  const { data: careGrants } = useAllCareAccessGrants();
  const pendingAccessCount = (careGrants || []).filter(
    (g) => g.status === "pending",
  ).length;
  const unreadNotificationCount = unreadReminderCount + pendingAccessCount;

  return (
    <GlassSurface
      intensity={BLUR.thick}
      style={{
        borderBottomWidth: 1,
        borderColor: MATERIALS.glassBorder,
      }}
      contentStyle={{
        paddingTop: insets.top,
        paddingHorizontal: SPACING.xl,
        paddingBottom: SPACING.md,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: SPACING.sm }}>
          <Text style={[TYPE.largeTitle, { color: COLORS.coral }]}>
            Social Pet
          </Text>
          <Text style={{ fontSize: 22 }}>🐾</Text>
          {/* Ring-close streak (E2) — renders nothing at 0 */}
          <StreakChip petId={currentPet?.id} />
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", gap: SPACING.sm }}>
          <HeaderIconButton onPress={() => router.push("/search")}>
            <Search size={20} color={COLORS.terracotta} />
          </HeaderIconButton>

          <HeaderIconButton onPress={() => router.push("/messages")}>
            <MessageCircle size={20} color={COLORS.terracotta} />
          </HeaderIconButton>

          <HeaderIconButton onPress={() => router.push("/notifications")}>
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
                <Text style={{ color: "#FFF", fontSize: 10, fontWeight: "800" }}>
                  {unreadNotificationCount > 9 ? "9+" : unreadNotificationCount}
                </Text>
              </View>
            )}
          </HeaderIconButton>
        </View>
      </View>

      <View style={{ marginTop: SPACING.md }}>
        <PetSwitcher variant="pill" />
      </View>
    </GlassSurface>
  );
}
