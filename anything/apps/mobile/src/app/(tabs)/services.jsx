import React, { useState } from "react";
import { View, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { COLORS } from "@/constants/colors";
import { TYPE, RADIUS, SPACING, MATERIALS, BLUR } from "@/constants/theme";
import { PressableScale, GlassSurface } from "@/components/ui";
import ServicesDiscovery from "@/components/Services/ServicesDiscovery";
import MyActivity from "@/components/Services/MyActivity";
import { useUnreadCount } from "@/hooks/useProviders";

// Services TAB SHELL: a two-pane surface with a segmented [Discover | My Activity] toggle
// pinned in a safe-area header. Discover = the unified provider discovery (headerless — the
// toggle replaces its internal header). My Activity = the consolidated owner surface
// (bookings, reservations, appointments, messages, shopping). Default pane = Discover; the
// My Activity segment carries the owner's unread-message badge.
export default function ServicesScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [pane, setPane] = useState("discover"); // "discover" | "activity"
  const { data: unreadCount = 0 } = useUnreadCount();

  const segments = [
    { key: "discover", label: t("services.segDiscover") },
    { key: "activity", label: t("services.segActivity"), badge: unreadCount },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.cream }}>
      <GlassSurface
        intensity={BLUR.thick}
        style={{ borderBottomWidth: 1, borderColor: MATERIALS.glassBorder }}
        contentStyle={{
          paddingTop: insets.top,
          paddingHorizontal: SPACING.lg,
          paddingBottom: SPACING.md,
        }}
      >
        <View
          testID="services-segments"
          style={{
            flexDirection: "row",
            backgroundColor: COLORS.sand,
            borderRadius: RADIUS.chip,
            padding: 3,
          }}
        >
          {segments.map((s) => {
            const active = pane === s.key;
            return (
              <PressableScale
                key={s.key}
                testID={`services-seg-${s.key}`}
                onPress={() => setPane(s.key)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={{
                  flex: 1,
                  flexDirection: "row",
                  gap: 6,
                  paddingVertical: SPACING.sm + 1,
                  borderRadius: RADIUS.chip - 2,
                  backgroundColor: active ? COLORS.card : "transparent",
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <Text
                  style={[
                    TYPE.subhead,
                    {
                      fontWeight: "800",
                      color: active ? COLORS.warmBrown : COLORS.mutedBrown,
                    },
                  ]}
                >
                  {s.label}
                </Text>
                {s.badge > 0 ? (
                  <View
                    testID={`services-seg-${s.key}-badge`}
                    style={{
                      minWidth: 18,
                      height: 18,
                      paddingHorizontal: 4,
                      borderRadius: 9,
                      backgroundColor: COLORS.coral,
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                  >
                    <Text
                      style={[
                        TYPE.caption,
                        { color: "#fff", fontWeight: "800", fontSize: 10 },
                      ]}
                    >
                      {s.badge}
                    </Text>
                  </View>
                ) : null}
              </PressableScale>
            );
          })}
        </View>
      </GlassSurface>

      <View style={{ flex: 1 }}>
        {pane === "discover" ? (
          <ServicesDiscovery variant="landing" showHeader={false} />
        ) : (
          <MyActivity />
        )}
      </View>
    </View>
  );
}
