import React, { useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Plus, MapPin, Clock, Users, AlertCircle } from "lucide-react-native";
import {
  getWalkCountToday,
  getTotalDurationToday,
  getTotalDistanceToday,
  getLastWalkLog,
  getLastMobilityCheck,
  getNextSocialWalk,
  hasRecentMobilityIssues,
  getMobilityWarningMessage,
  getMobilityIssueSummary,
  formatDuration,
  formatDistance,
  getPaceEmoji,
  getPaceLabel,
  getEnergyEmoji,
  formatPottyEvents,
  walkHasPottyEvents,
  formatSocialWalkDate,
} from "@/data/walkActivityData";
import WalkActivityModal from "./WalkActivityModal";

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

export default function WalkActivityDashboard() {
  const [modalVisible, setModalVisible] = useState(false);

  const walksToday = getWalkCountToday();
  const totalDuration = getTotalDurationToday();
  const totalDistance = getTotalDistanceToday();
  const lastWalk = getLastWalkLog();
  const lastMobility = getLastMobilityCheck();
  const nextSocial = getNextSocialWalk();
  const mobilityIssues = hasRecentMobilityIssues();
  const mobilityWarning = getMobilityWarningMessage(mobilityIssues);

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
          marginBottom: mobilityWarning || nextSocial ? 16 : 0,
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
              Walk & Activity
            </Text>
            <Text style={{ fontSize: 12, color: C.mutedBrown }}>
              Track walks, mobility, and social outings
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => setModalVisible(true)}
            style={{
              backgroundColor: C.coral,
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

        {/* Stats Row */}
        <View
          style={{
            flexDirection: "row",
            gap: 10,
            marginBottom: 16,
          }}
        >
          {/* Walks Today */}
          <View
            style={{
              flex: 1,
              backgroundColor: walksToday > 0 ? C.coral + "10" : C.sage + "10",
              borderRadius: 14,
              padding: 14,
              borderWidth: 1,
              borderColor: walksToday > 0 ? C.coral + "30" : C.sage + "30",
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
              Walks today
            </Text>
            <Text
              style={{
                fontSize: 24,
                fontWeight: "800",
                color: C.warmBrown,
              }}
            >
              {walksToday}
            </Text>
          </View>

          {/* Total Duration */}
          <View
            style={{
              flex: 1,
              backgroundColor:
                totalDuration > 0 ? C.coral + "10" : C.sage + "10",
              borderRadius: 14,
              padding: 14,
              borderWidth: 1,
              borderColor: totalDuration > 0 ? C.coral + "30" : C.sage + "30",
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
              Duration
            </Text>
            <Text
              style={{
                fontSize: 24,
                fontWeight: "800",
                color: C.warmBrown,
              }}
            >
              {formatDuration(totalDuration)}
            </Text>
          </View>

          {/* Total Distance */}
          <View
            style={{
              flex: 1,
              backgroundColor:
                totalDistance > 0 ? C.coral + "10" : C.sage + "10",
              borderRadius: 14,
              padding: 14,
              borderWidth: 1,
              borderColor: totalDistance > 0 ? C.coral + "30" : C.sage + "30",
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
              Distance
            </Text>
            <Text
              style={{
                fontSize: 20,
                fontWeight: "800",
                color: C.warmBrown,
              }}
            >
              {formatDistance(totalDistance)}
            </Text>
          </View>
        </View>

        {/* Last Walk */}
        {lastWalk && (
          <View style={{ marginBottom: lastMobility ? 16 : 0 }}>
            <Text
              style={{
                fontSize: 13,
                fontWeight: "600",
                color: C.mutedBrown,
                marginBottom: 8,
              }}
            >
              Last walk
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
                  marginBottom: 8,
                }}
              >
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 22,
                    backgroundColor: C.coral + "20",
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <Text style={{ fontSize: 20 }}>🚶</Text>
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
                    {formatDate(lastWalk.timestamp)} •{" "}
                    {formatTime(lastWalk.timestamp)}
                  </Text>
                  <Text style={{ fontSize: 12, color: C.mutedBrown }}>
                    {formatDuration(lastWalk.duration)} •{" "}
                    {formatDistance(lastWalk.distance)} •{" "}
                    {getPaceEmoji(lastWalk.pace)} {getPaceLabel(lastWalk.pace)}
                  </Text>
                </View>
              </View>

              {/* Walk Details */}
              <View style={{ gap: 6 }}>
                {lastWalk.location && (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <MapPin size={14} color={C.mutedBrown} />
                    <Text style={{ fontSize: 12, color: C.mutedBrown }}>
                      {lastWalk.location}
                    </Text>
                  </View>
                )}
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <Text style={{ fontSize: 12, color: C.mutedBrown }}>
                    {getEnergyEmoji(lastWalk.energyAfter)}{" "}
                    {lastWalk.energyAfter} energy after
                  </Text>
                  {walkHasPottyEvents(lastWalk) && (
                    <Text style={{ fontSize: 12, color: C.mutedBrown }}>
                      {formatPottyEvents(lastWalk.pottyEvents)}
                    </Text>
                  )}
                </View>
              </View>

              {lastWalk.notes && (
                <View
                  style={{
                    backgroundColor: C.card,
                    borderRadius: 10,
                    padding: 10,
                    borderWidth: 1,
                    borderColor: C.peach,
                    marginTop: 10,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      color: C.mutedBrown,
                      lineHeight: 17,
                    }}
                  >
                    "{lastWalk.notes}"
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Last Mobility Check */}
        {lastMobility && (
          <View>
            <Text
              style={{
                fontSize: 13,
                fontWeight: "600",
                color: C.mutedBrown,
                marginBottom: 8,
              }}
            >
              Recent mobility
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
                }}
              >
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 22,
                    backgroundColor: mobilityWarning
                      ? "#FFB74D20"
                      : C.sage + "20",
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <Text style={{ fontSize: 20 }}>🦴</Text>
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
                    {formatDate(lastMobility.timestamp)}
                  </Text>
                  <Text style={{ fontSize: 12, color: C.mutedBrown }}>
                    {getMobilityIssueSummary(lastMobility) ||
                      "All movement normal"}
                  </Text>
                </View>
              </View>
              {lastMobility.notes && (
                <View
                  style={{
                    backgroundColor: C.card,
                    borderRadius: 10,
                    padding: 10,
                    borderWidth: 1,
                    borderColor: C.peach,
                    marginTop: 10,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      color: C.mutedBrown,
                      lineHeight: 17,
                    }}
                  >
                    "{lastMobility.notes}"
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}
      </View>

      {/* Mobility Warning */}
      {mobilityWarning && (
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
            marginBottom: nextSocial ? 16 : 0,
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
              Mobility change noted
            </Text>
            <Text
              style={{
                fontSize: 12,
                color: C.mutedBrown,
                lineHeight: 17,
              }}
            >
              {mobilityWarning.message}
            </Text>
          </View>
        </View>
      )}

      {/* Upcoming Social Walk */}
      {nextSocial && (
        <View
          style={{
            backgroundColor: "#E3F2FD",
            borderRadius: 18,
            padding: 16,
            borderWidth: 1.5,
            borderColor: "#BBDEFB",
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              marginBottom: 12,
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
              <Users size={22} color="#64B5F6" />
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 15,
                  fontWeight: "700",
                  color: C.warmBrown,
                  marginBottom: 3,
                }}
              >
                Upcoming social walk
              </Text>
              <Text
                style={{
                  fontSize: 12,
                  color: C.mutedBrown,
                }}
              >
                {formatSocialWalkDate(nextSocial.date)} at {nextSocial.time}
              </Text>
            </View>
          </View>

          {/* Social Walk Details */}
          <View
            style={{
              backgroundColor: "#FFF",
              borderRadius: 12,
              padding: 12,
              gap: 6,
            }}
          >
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
            >
              <MapPin size={14} color="#64B5F6" />
              <Text style={{ fontSize: 12, color: C.warmBrown }}>
                {nextSocial.meetingLocation}
              </Text>
            </View>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
            >
              <Clock size={14} color="#64B5F6" />
              <Text style={{ fontSize: 12, color: C.warmBrown }}>
                {formatDuration(nextSocial.duration)} •{" "}
                {getPaceEmoji(nextSocial.pace)} {getPaceLabel(nextSocial.pace)}
              </Text>
            </View>
            {nextSocial.attendees && nextSocial.attendees.length > 0 && (
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
              >
                <Users size={14} color="#64B5F6" />
                <Text style={{ fontSize: 12, color: C.warmBrown }}>
                  {nextSocial.attendees.length}{" "}
                  {nextSocial.attendees.length === 1 ? "pet" : "pets"} joining
                </Text>
              </View>
            )}
          </View>
        </View>
      )}

      {/* Modal */}
      <WalkActivityModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
      />
    </View>
  );
}
