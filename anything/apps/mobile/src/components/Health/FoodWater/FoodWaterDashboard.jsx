import React, { useState } from "react";
import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import {
  UtensilsCrossed,
  Droplet,
  TrendingDown,
  Clock,
  Calendar,
  AlertCircle,
  Plus,
} from "lucide-react-native";
import {
  getMealsToday,
  getSnacksToday,
  getTodayWaterLogs,
  getLastMeal,
  getRecentAppetiteTrend,
  getNextFeedingTime,
} from "@/data/foodWaterData";
import FoodWaterTrackerModal from "./FoodWaterTrackerModal";

const C = {
  cream: "#FFF7EF",
  card: "#FFFBF7",
  coral: "#FF6F61",
  peach: "#FFE5D9",
  terracotta: "#B75D32",
  warmBrown: "#3B241B",
  mutedBrown: "#8B7355",
  sage: "#A7BFA3",
  sand: "#F5EDE4",
};

export default function FoodWaterDashboard() {
  const [modalVisible, setModalVisible] = useState(false);
  const [modalType, setModalType] = useState("food");

  const mealsToday = getMealsToday();
  const snacksToday = getSnacksToday();
  const waterLogsToday = getTodayWaterLogs();
  const lastMeal = getLastMeal();
  const appetiteTrend = getRecentAppetiteTrend();
  const nextFeeding = getNextFeedingTime();

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const getMealTypeEmoji = (mealType) => {
    const emojis = {
      breakfast: "🌅",
      lunch: "☀️",
      dinner: "🌙",
      snack: "🍪",
      treat: "🦴",
    };
    return emojis[mealType] || "🍽️";
  };

  const openModal = (type) => {
    setModalType(type);
    setModalVisible(true);
  };

  return (
    <View>
      {/* Main Dashboard Card */}
      <View
        style={{
          backgroundColor: C.card,
          borderRadius: 20,
          padding: 20,
          borderWidth: 1.5,
          borderColor: C.peach,
          shadowColor: C.terracotta,
          shadowOffset: { width: 0, height: 3 },
          shadowOpacity: 0.08,
          shadowRadius: 12,
          elevation: 3,
          marginBottom: 16,
        }}
      >
        {/* Header */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 18,
            paddingBottom: 14,
            borderBottomWidth: 1,
            borderBottomColor: C.peach,
          }}
        >
          <View>
            <Text
              style={{
                fontSize: 18,
                fontWeight: "800",
                color: C.warmBrown,
                marginBottom: 2,
              }}
            >
              Food & Water
            </Text>
            <Text style={{ fontSize: 12, color: C.mutedBrown }}>
              Today's nutrition tracking
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => openModal("food")}
            style={{
              backgroundColor: C.sage,
              borderRadius: 12,
              width: 40,
              height: 40,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <Plus size={20} color="#FFF" />
          </TouchableOpacity>
        </View>

        {/* Last Meal */}
        {lastMeal && (
          <View style={{ marginBottom: 16 }}>
            <Text
              style={{
                fontSize: 13,
                fontWeight: "600",
                color: C.mutedBrown,
                marginBottom: 8,
              }}
            >
              Last meal
            </Text>
            <View
              style={{
                backgroundColor: C.sand,
                borderRadius: 14,
                padding: 14,
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
              }}
            >
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: C.sage + "20",
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <Text style={{ fontSize: 20 }}>
                  {getMealTypeEmoji(lastMeal.mealType)}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "700",
                    color: C.warmBrown,
                    marginBottom: 2,
                    textTransform: "capitalize",
                  }}
                >
                  {lastMeal.mealType}
                </Text>
                <Text style={{ fontSize: 12, color: C.mutedBrown }}>
                  {formatTime(lastMeal.timestamp)} •{" "}
                  {lastMeal.foodName || "Meal"}
                </Text>
              </View>
              <View
                style={{
                  backgroundColor:
                    lastMeal.appetite === "low"
                      ? C.coral + "20"
                      : lastMeal.appetite === "high"
                        ? "#FFB74D20"
                        : C.sage + "20",
                  borderRadius: 8,
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                }}
              >
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: "700",
                    color:
                      lastMeal.appetite === "low"
                        ? C.coral
                        : lastMeal.appetite === "high"
                          ? "#FFB74D"
                          : C.sage,
                    textTransform: "capitalize",
                  }}
                >
                  {lastMeal.appetite}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Stats Grid */}
        <View
          style={{
            flexDirection: "row",
            gap: 10,
            marginBottom: 16,
          }}
        >
          {/* Meals */}
          <TouchableOpacity
            onPress={() => openModal("food")}
            style={{
              flex: 1,
              backgroundColor: C.sage + "10",
              borderRadius: 14,
              padding: 14,
              borderWidth: 1,
              borderColor: C.sage + "30",
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                marginBottom: 6,
              }}
            >
              <UtensilsCrossed size={16} color={C.sage} />
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: "600",
                  color: C.mutedBrown,
                }}
              >
                Meals
              </Text>
            </View>
            <Text
              style={{
                fontSize: 24,
                fontWeight: "800",
                color: C.warmBrown,
              }}
            >
              {mealsToday.length}
            </Text>
            <Text style={{ fontSize: 10, color: C.mutedBrown, marginTop: 2 }}>
              logged today
            </Text>
          </TouchableOpacity>

          {/* Snacks */}
          <TouchableOpacity
            onPress={() => openModal("food")}
            style={{
              flex: 1,
              backgroundColor: "#FFB74D10",
              borderRadius: 14,
              padding: 14,
              borderWidth: 1,
              borderColor: "#FFB74D30",
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                marginBottom: 6,
              }}
            >
              <Text style={{ fontSize: 16 }}>🍪</Text>
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: "600",
                  color: C.mutedBrown,
                }}
              >
                Snacks
              </Text>
            </View>
            <Text
              style={{
                fontSize: 24,
                fontWeight: "800",
                color: C.warmBrown,
              }}
            >
              {snacksToday.length}
            </Text>
            <Text style={{ fontSize: 10, color: C.mutedBrown, marginTop: 2 }}>
              logged today
            </Text>
          </TouchableOpacity>

          {/* Water */}
          <TouchableOpacity
            onPress={() => openModal("water")}
            style={{
              flex: 1,
              backgroundColor: "#64B5F610",
              borderRadius: 14,
              padding: 14,
              borderWidth: 1,
              borderColor: "#64B5F630",
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                marginBottom: 6,
              }}
            >
              <Droplet size={16} color="#64B5F6" />
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: "600",
                  color: C.mutedBrown,
                }}
              >
                Water
              </Text>
            </View>
            <Text
              style={{
                fontSize: 24,
                fontWeight: "800",
                color: C.warmBrown,
              }}
            >
              {waterLogsToday.length}
            </Text>
            <Text style={{ fontSize: 10, color: C.mutedBrown, marginTop: 2 }}>
              logged today
            </Text>
          </TouchableOpacity>
        </View>

        {/* Next Feeding */}
        <View
          style={{
            backgroundColor: C.sand,
            borderRadius: 14,
            padding: 14,
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
          }}
        >
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: C.terracotta + "20",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <Clock size={18} color={C.terracotta} />
          </View>
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: 12,
                fontWeight: "600",
                color: C.mutedBrown,
                marginBottom: 2,
              }}
            >
              Next feeding reminder
            </Text>
            <Text
              style={{ fontSize: 14, fontWeight: "700", color: C.warmBrown }}
            >
              {nextFeeding.label} at {nextFeeding.time}
            </Text>
          </View>
        </View>
      </View>

      {/* Appetite Trend Warning */}
      {appetiteTrend === "low" && (
        <View
          style={{
            backgroundColor: "#FFF4E6",
            borderRadius: 18,
            padding: 16,
            borderWidth: 1.5,
            borderColor: "#FFE4C4",
            marginBottom: 16,
            flexDirection: "row",
            alignItems: "flex-start",
            gap: 12,
          }}
        >
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: "#FFB74D30",
              justifyContent: "center",
              alignItems: "center",
              marginTop: 2,
            }}
          >
            <AlertCircle size={18} color="#FFB74D" />
          </View>
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: 14,
                fontWeight: "700",
                color: C.warmBrown,
                marginBottom: 6,
              }}
            >
              Reduced appetite pattern
            </Text>
            <Text
              style={{
                fontSize: 12,
                color: C.mutedBrown,
                lineHeight: 17,
              }}
            >
              Your pet's appetite has been lower than usual in recent meals. This
              may be worth monitoring. Contact your vet if it continues or comes
              with other symptoms.
            </Text>
          </View>
        </View>
      )}

      {/* Appetite Trend Monitoring */}
      {appetiteTrend === "monitoring" && (
        <View
          style={{
            backgroundColor: C.sand,
            borderRadius: 16,
            padding: 14,
            borderWidth: 1,
            borderColor: C.peach,
            marginBottom: 16,
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
          }}
        >
          <TrendingDown size={16} color={C.mutedBrown} />
          <Text
            style={{
              fontSize: 12,
              color: C.mutedBrown,
              lineHeight: 17,
              flex: 1,
            }}
          >
            Appetite dip noted in recent meals. Keep tracking to see if this
            continues.
          </Text>
        </View>
      )}

      {/* Modal */}
      <FoodWaterTrackerModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        initialType={modalType}
      />
    </View>
  );
}
