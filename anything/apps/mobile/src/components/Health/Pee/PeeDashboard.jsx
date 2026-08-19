import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { View, Text, TouchableOpacity } from "react-native";
import { Plus, AlertCircle, AlertTriangle } from "lucide-react-native";
import {
  getPeeCountToday,
  getLastPeeLog,
  getTodayAccidents,
  getRecentVolume,
  getRecentColor,
  hasRecentConcerns,
  getConcernMessage,
  getVolumeLabel,
  getColorIndicator,
  getColorLabel,
} from "@/data/peeData";
import PeeTrackerModal from "./PeeTrackerModal";

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

export default function PeeDashboard() {
  const { t } = useTranslation();
  const [modalVisible, setModalVisible] = useState(false);

  const countToday = getPeeCountToday();
  const lastLog = getLastPeeLog();
  const accidentsToday = getTodayAccidents();
  const recentVolume = getRecentVolume();
  const recentColor = getRecentColor();
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
              {t("trackers.pee.title")}
            </Text>
            <Text style={{ fontSize: 12, color: C.mutedBrown }}>
              {t("trackers.pee.subtitle")}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => setModalVisible(true)}
            style={{
              backgroundColor: "#64B5F6",
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
              {t("trackers.pee.lastLogged")}
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
                  backgroundColor: "#64B5F620",
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <Text style={{ fontSize: 20 }}>💧</Text>
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
                  {getVolumeLabel(lastLog.volume)} •{" "}
                  {getColorIndicator(lastLog.color)}{" "}
                  {getColorLabel(lastLog.color)}
                </Text>
              </View>
              {lastLog.accident && (
                <View
                  style={{
                    backgroundColor: "#FFB74D20",
                    borderRadius: 8,
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 10,
                      fontWeight: "700",
                      color: "#FFB74D",
                    }}
                  >
                    {t("trackers.pee.accidentTag")}
                  </Text>
                </View>
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
              backgroundColor: "#64B5F610",
              borderRadius: 14,
              padding: 14,
              borderWidth: 1,
              borderColor: "#64B5F630",
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
              {t("trackers.pee.todayCount")}
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
              {t("trackers.pee.loggedToday")}
            </Text>
          </View>

          {/* Accidents */}
          <View
            style={{
              flex: 1,
              backgroundColor: accidentsToday > 0 ? "#FFB74D10" : C.sage + "10",
              borderRadius: 14,
              padding: 14,
              borderWidth: 1,
              borderColor: accidentsToday > 0 ? "#FFB74D30" : C.sage + "30",
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
              {t("trackers.pee.accidents")}
            </Text>
            <Text
              style={{
                fontSize: 24,
                fontWeight: "800",
                color: C.warmBrown,
              }}
            >
              {accidentsToday}
            </Text>
            <Text style={{ fontSize: 10, color: C.mutedBrown, marginTop: 2 }}>
              {accidentsToday === 0 ? t("trackers.pee.noneToday") : t("trackers.pee.today")}
            </Text>
          </View>
        </View>
      </View>

      {/* Concern Warning */}
      {concernMessage && (
        <View
          style={{
            backgroundColor: concernMessage.urgent ? "#FFF0F0" : "#FFF4E6",
            borderRadius: 18,
            padding: 16,
            borderWidth: 1.5,
            borderColor: concernMessage.urgent ? "#FFCCCC" : "#FFE4C4",
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
              backgroundColor: concernMessage.urgent
                ? "#FF573330"
                : "#FFB74D30",
              justifyContent: "center",
              alignItems: "center",
              marginTop: 2,
            }}
          >
            {concernMessage.urgent ? (
              <AlertTriangle size={18} color="#FF5733" />
            ) : (
              <AlertCircle size={18} color="#FFB74D" />
            )}
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
              {concernMessage.urgent
                ? t("trackers.pee.concernUrgentTitle")
                : t("trackers.pee.concernNotedTitle")}
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
      <PeeTrackerModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
      />
    </View>
  );
}
