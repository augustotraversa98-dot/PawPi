import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Camera, Sparkles, PawPrint } from "lucide-react-native";
import { COLORS } from "@/constants/colors";

export function DailyPromptCard({
  petName,
  hasPostedToday,
  todayPostId,
  onPostPress,
  onViewTodayPost,
}) {
  return (
    <View
      style={{
        margin: 16,
        backgroundColor: COLORS.card,
        borderRadius: 24,
        padding: 20,
        shadowColor: COLORS.terracotta,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 16,
        elevation: 3,
        borderWidth: 1,
        borderColor: COLORS.peach,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          marginBottom: 14,
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
          <Text
            style={{
              fontSize: 17,
              fontWeight: "800",
              color: COLORS.warmBrown,
              letterSpacing: -0.3,
            }}
          >
            Today's pet moment
          </Text>
          <Text
            style={{ fontSize: 13, color: COLORS.mutedBrown, marginTop: 2 }}
          >
            What is {petName} up to right now? 🐶
          </Text>
        </View>
      </View>

      {!hasPostedToday ? (
        <>
          <TouchableOpacity
            onPress={onPostPress}
            style={{
              borderRadius: 16,
              padding: 16,
              alignItems: "center",
              flexDirection: "row",
              justifyContent: "center",
              gap: 10,
              backgroundColor: COLORS.coral,
              shadowColor: COLORS.coral,
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.32,
              shadowRadius: 10,
              elevation: 5,
            }}
          >
            <Camera size={20} color="#FFF" />
            <Text style={{ color: "#FFF", fontWeight: "800", fontSize: 16 }}>
              Post today's photo
            </Text>
          </TouchableOpacity>
          <View
            style={{
              marginTop: 12,
              padding: 10,
              backgroundColor: COLORS.sand,
              borderRadius: 12,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            <PawPrint size={13} color={COLORS.terracotta} />
            <Text
              style={{
                color: COLORS.terracotta,
                fontSize: 12,
                fontWeight: "600",
              }}
            >
              Don't forget {petName}'s daily update!
            </Text>
          </View>
        </>
      ) : (
        <View
          style={{
            backgroundColor: "#E8F5E9",
            borderRadius: 16,
            padding: 16,
            alignItems: "center",
            gap: 4,
            borderWidth: 1,
            borderColor: "#C8E6C9",
          }}
        >
          <Text style={{ fontSize: 22 }}>✨</Text>
          <Text style={{ color: "#2E7D32", fontWeight: "800", fontSize: 15 }}>
            Today's update posted
          </Text>
          <Text
            style={{
              color: "#388E3C",
              fontSize: 12,
              textAlign: "center",
              marginBottom: 8,
            }}
          >
            Come back tomorrow for {petName}'s next daily moment.
          </Text>
          {todayPostId && onViewTodayPost && (
            <TouchableOpacity
              onPress={onViewTodayPost}
              style={{
                backgroundColor: COLORS.sage,
                borderRadius: 12,
                paddingVertical: 10,
                paddingHorizontal: 18,
              }}
            >
              <Text style={{ color: "#FFF", fontWeight: "700", fontSize: 13 }}>
                View today's post
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}
