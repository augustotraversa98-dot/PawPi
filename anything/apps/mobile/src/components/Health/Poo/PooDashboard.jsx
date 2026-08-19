import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { View, Text, TouchableOpacity } from "react-native";
import { Plus, AlertCircle, Camera } from "lucide-react-native";
import {
  getPooCountToday,
  getLastPooLog,
  getRecentConsistency,
  hasRecentConcerns,
  getConcernMessage,
  getShapeLabel,
  getColorIndicator,
} from "@/data/pooData";
import PooTrackerModal from "./PooTrackerModal";

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

export default function PooDashboard() {
  const { t } = useTranslation();
  const [modalVisible, setModalVisible] = useState(false);

  const countToday = getPooCountToday();
  const lastLog = getLastPooLog();
  const recentConsistency = getRecentConsistency();
  const concerns = hasRecentConcerns();
  const concernMessage = getConcernMessage(concerns);

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
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
          marginBottom: concernMessage ? 16 : 0,
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
              {t("trackers.poo.title")}
            </Text>
            <Text style={{ fontSize: 12, color: C.mutedBrown }}>
              {t("trackers.poo.subtitle")}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => setModalVisible(true)}
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

        {/* Last Logged */}
        {lastLog && (
          <View style={{ marginBottom: 16 }}>
            <Text
              style={{
                fontSize: 13,
                fontWeight: "600",
                color: C.mutedBrown,
                marginBottom: 8,
              }}
            >
              {t("trackers.poo.lastLogged")}
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
                <Text style={{ fontSize: 20 }}>💩</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "700",
                    color: C.warmBrown,
                    marginBottom: 2,
                  }}
                >
                  {formatTime(lastLog.timestamp)}
                </Text>
                <Text style={{ fontSize: 12, color: C.mutedBrown }}>
                  {getShapeLabel(lastLog.shape)} •{" "}
                  {getColorIndicator(lastLog.color)}{" "}
                  {lastLog.color.charAt(0).toUpperCase() +
                    lastLog.color.slice(1)}
                </Text>
              </View>
              {lastLog.photoUrl && (
                <Camera size={18} color={C.terracotta} opacity={0.6} />
              )}
            </View>
          </View>
        )}

        {/* Stats */}
        <View
          style={{
            flexDirection: "row",
            gap: 10,
          }}
        >
          {/* Today's Count */}
          <View
            style={{
              flex: 1,
              backgroundColor: C.sage + "10",
              borderRadius: 14,
              padding: 14,
              borderWidth: 1,
              borderColor: C.sage + "30",
            }}
          >
            <Text
              style={{
                fontSize: 11,
                fontWeight: "600",
                color: C.mutedBrown,
                marginBottom: 6,
              }}
            >
              {t("trackers.poo.todayCount")}
            </Text>
            <Text
              style={{
                fontSize: 24,
                fontWeight: "800",
                color: C.warmBrown,
              }}
            >
              {countToday}
            </Text>
            <Text style={{ fontSize: 10, color: C.mutedBrown, marginTop: 2 }}>
              {t("trackers.poo.loggedToday")}
            </Text>
          </View>

          {/* Consistency */}
          {recentConsistency && (
            <View
              style={{
                flex: 1,
                backgroundColor: "#FFB74D10",
                borderRadius: 14,
                padding: 14,
                borderWidth: 1,
                borderColor: "#FFB74D30",
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: "600",
                  color: C.mutedBrown,
                  marginBottom: 6,
                }}
              >
                {t("trackers.poo.mostRecent")}
              </Text>
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: "800",
                  color: C.warmBrown,
                  marginBottom: 4,
                }}
              >
                {getShapeLabel(recentConsistency)}
              </Text>
              <Text style={{ fontSize: 10, color: C.mutedBrown }}>
                {t("trackers.poo.consistency")}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Concern Warning */}
      {concernMessage && (
        <View
          style={{
            backgroundColor: "#FFF4E6",
            borderRadius: 18,
            padding: 16,
            borderWidth: 1.5,
            borderColor: "#FFE4C4",
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
              {t("trackers.poo.concernNotedTitle")}
            </Text>
            <Text
              style={{
                fontSize: 12,
                color: C.mutedBrown,
                lineHeight: 17,
                marginBottom: 6,
              }}
            >
              {concernMessage.issues.join(", ")}
            </Text>
            <Text
              style={{
                fontSize: 12,
                color: C.mutedBrown,
                lineHeight: 17,
              }}
            >
              {concernMessage.message}
            </Text>
          </View>
        </View>
      )}

      {/* Modal */}
      <PooTrackerModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
      />
    </View>
  );
}
