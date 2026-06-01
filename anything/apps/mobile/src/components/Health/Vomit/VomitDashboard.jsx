import React, { useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Plus, AlertCircle, AlertTriangle } from "lucide-react-native";
import {
  getVomitCountToday,
  getTotalEpisodesToday,
  getLastVomitLog,
  getRecentSymptoms,
  hasRecentConcerns,
  getConcernMessage,
  getAppearanceIndicator,
  formatRelationToFood,
  getEnergyLabel,
  getEnergyColor,
} from "@/data/vomitData";
import VomitTrackerModal from "./VomitTrackerModal";

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

export default function VomitDashboard() {
  const [modalVisible, setModalVisible] = useState(false);

  const countToday = getVomitCountToday();
  const totalEpisodesToday = getTotalEpisodesToday();
  const lastLog = getLastVomitLog();
  const symptoms = getRecentSymptoms();
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

  const formatDate = (timestamp) => {
    const date = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return "Today";
    } else if (date.toDateString() === yesterday.toDateString()) {
      return "Yesterday";
    } else {
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
    }
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
              Vomit / Digestive Events
            </Text>
            <Text style={{ fontSize: 12, color: C.mutedBrown }}>
              Track vomiting and related symptoms
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => setModalVisible(true)}
            style={{
              backgroundColor: "#FFB74D",
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

        {/* Last Event */}
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
              Last event
            </Text>
            <View
              style={{
                backgroundColor: C.sand,
                borderRadius: 14,
                padding: 14,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  marginBottom: 10,
                }}
              >
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 22,
                    backgroundColor: "#FFB74D20",
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <Text style={{ fontSize: 20 }}>🤮</Text>
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
                    {formatDate(lastLog.timestamp)} •{" "}
                    {formatTime(lastLog.timestamp)}
                  </Text>
                  <Text style={{ fontSize: 12, color: C.mutedBrown }}>
                    {lastLog.episodes}{" "}
                    {lastLog.episodes === 1 ? "episode" : "episodes"} •{" "}
                    {getAppearanceIndicator(lastLog.appearance)}{" "}
                    {lastLog.appearance}
                  </Text>
                </View>
              </View>
              {lastLog.notes && (
                <View
                  style={{
                    backgroundColor: C.card,
                    borderRadius: 10,
                    padding: 10,
                    borderWidth: 1,
                    borderColor: C.peach,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      color: C.mutedBrown,
                      lineHeight: 17,
                    }}
                  >
                    "{lastLog.notes}"
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
          {/* Events Today */}
          <View
            style={{
              flex: 1,
              backgroundColor: countToday > 0 ? "#FFB74D10" : C.sage + "10",
              borderRadius: 14,
              padding: 14,
              borderWidth: 1,
              borderColor: countToday > 0 ? "#FFB74D30" : C.sage + "30",
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
              Events today
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
              {totalEpisodesToday} total{" "}
              {totalEpisodesToday === 1 ? "episode" : "episodes"}
            </Text>
          </View>

          {/* Related Symptoms */}
          <View
            style={{
              flex: 1,
              backgroundColor:
                symptoms.lowEnergy || symptoms.diarrhea
                  ? "#FF573320"
                  : C.sage + "10",
              borderRadius: 14,
              padding: 14,
              borderWidth: 1,
              borderColor:
                symptoms.lowEnergy || symptoms.diarrhea
                  ? "#FF573340"
                  : C.sage + "30",
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
              Related symptoms
            </Text>
            {symptoms.lowEnergy || symptoms.diarrhea || symptoms.refusedFood ? (
              <View style={{ gap: 3 }}>
                {symptoms.lowEnergy && (
                  <Text style={{ fontSize: 11, color: C.warmBrown }}>
                    • Low energy
                  </Text>
                )}
                {symptoms.diarrhea && (
                  <Text style={{ fontSize: 11, color: C.warmBrown }}>
                    • Diarrhea
                  </Text>
                )}
                {symptoms.refusedFood && (
                  <Text style={{ fontSize: 11, color: C.warmBrown }}>
                    • Refused food
                  </Text>
                )}
              </View>
            ) : (
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: "700",
                  color: C.sage,
                  marginTop: 4,
                }}
              >
                None noted
              </Text>
            )}
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
                ? "May need veterinary attention"
                : "Worth monitoring"}
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
      <VomitTrackerModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
      />
    </View>
  );
}
