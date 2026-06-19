import React from "react";
import { View, Text } from "react-native";
import { Camera, Sparkles, PawPrint } from "lucide-react-native";
import {
  COLORS,
  TYPE,
  RADIUS,
  SPACING,
  MATERIALS,
  ELEVATION,
} from "@/constants/theme";
import { Card, PressableScale } from "@/components/ui";

export function DailyPromptCard({
  petName,
  hasPostedToday,
  todayPostId,
  onPostPress,
  onViewTodayPost,
}) {
  return (
    <Card
      level="md"
      radius={RADIUS.card}
      style={{ margin: SPACING.lg, padding: SPACING.xl }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          marginBottom: SPACING.md,
        }}
      >
        <View
          style={{
            width: 46,
            height: 46,
            borderRadius: 23,
            backgroundColor: COLORS.coral,
            justifyContent: "center",
            alignItems: "center",
            marginRight: 13,
            shadowColor: COLORS.coral,
            shadowOffset: { width: 0, height: 3 },
            shadowOpacity: 0.3,
            shadowRadius: 6,
          }}
        >
          <Sparkles size={22} color="#FFF" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[TYPE.headline, { color: COLORS.warmBrown }]}>
            Today's pet moment
          </Text>
          <Text style={[TYPE.subhead, { color: COLORS.mutedBrown, marginTop: 2 }]}>
            What is {petName} up to right now? 🐶
          </Text>
        </View>
      </View>

      {!hasPostedToday ? (
        <>
          <PressableScale
            onPress={onPostPress}
            accessibilityRole="button"
            style={{
              borderRadius: RADIUS.control,
              padding: SPACING.lg,
              alignItems: "center",
              flexDirection: "row",
              justifyContent: "center",
              gap: SPACING.sm,
              backgroundColor: COLORS.coral,
              shadowColor: COLORS.coral,
              ...ELEVATION.sm,
            }}
          >
            <Camera size={20} color="#FFF" />
            <Text style={[TYPE.headline, { color: "#FFF" }]}>
              Post today's photo
            </Text>
          </PressableScale>
          <View
            style={{
              marginTop: SPACING.md,
              padding: SPACING.sm,
              backgroundColor: COLORS.sand,
              borderRadius: RADIUS.sm,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            <PawPrint size={13} color={COLORS.terracotta} />
            <Text style={[TYPE.footnote, { color: COLORS.terracotta, fontWeight: "600" }]}>
              Don't forget {petName}'s daily update!
            </Text>
          </View>
        </>
      ) : (
        <View
          style={{
            backgroundColor: "#E8F5E9",
            borderRadius: RADIUS.control,
            padding: SPACING.lg,
            alignItems: "center",
            gap: SPACING.xs,
            borderWidth: 1,
            borderColor: "#C8E6C9",
          }}
        >
          <Text style={{ fontSize: 22 }}>✨</Text>
          <Text style={[TYPE.body, { color: "#2E7D32", fontWeight: "800" }]}>
            Today's update posted
          </Text>
          <Text
            style={[
              TYPE.footnote,
              { color: "#388E3C", textAlign: "center", marginBottom: SPACING.sm },
            ]}
          >
            Come back tomorrow for {petName}'s next daily moment.
          </Text>
          {todayPostId && onViewTodayPost && (
            <PressableScale
              onPress={onViewTodayPost}
              accessibilityRole="button"
              style={{
                backgroundColor: COLORS.sage,
                borderRadius: RADIUS.sm,
                paddingVertical: SPACING.sm,
                paddingHorizontal: SPACING.lg,
              }}
            >
              <Text style={[TYPE.subhead, { color: "#FFF" }]}>
                View today's post
              </Text>
            </PressableScale>
          )}
        </View>
      )}
    </Card>
  );
}
