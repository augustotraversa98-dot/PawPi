import React, { useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Plus, CheckCircle, AlertTriangle, Clock } from "lucide-react-native";
import {
  getLastGeneralCheck,
  getAreasWithChanges,
  getChangedAreasCount,
  getOverallStatusMessage,
  formatCheckDate,
  formatCheckTime,
  getChangeLabel,
  getChangeEmoji,
} from "@/data/generalCheckData";
import GeneralCheckModal from "./GeneralCheckModal";

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

export default function GeneralCheckDashboard() {
  const [modalVisible, setModalVisible] = useState(false);

  const lastCheck = getLastGeneralCheck();
  const areasWithChanges = lastCheck ? getAreasWithChanges(lastCheck) : [];
  const changedCount = lastCheck ? getChangedAreasCount(lastCheck) : 0;

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
              General Check
            </Text>
            <Text style={{ fontSize: 12, color: C.mutedBrown }}>
              Quick visual health review
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

        {/* Last Check Summary */}
        {lastCheck ? (
          <View>
            {/* Status Banner */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                marginBottom: 14,
                backgroundColor: changedCount > 0 ? "#FFF4E6" : C.sage + "10",
                borderRadius: 12,
                padding: 12,
                borderWidth: 1,
                borderColor: changedCount > 0 ? "#FFE4C4" : C.sage + "30",
              }}
            >
              {changedCount > 0 ? (
                <AlertTriangle size={20} color="#FFB74D" />
              ) : (
                <CheckCircle size={20} color={C.sage} />
              )}
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: "700",
                  color: C.warmBrown,
                  flex: 1,
                }}
              >
                {getOverallStatusMessage(lastCheck)}
              </Text>
            </View>

            {/* Last Check Time */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                marginBottom: areasWithChanges.length > 0 ? 14 : 0,
              }}
            >
              <Clock size={14} color={C.mutedBrown} />
              <Text style={{ fontSize: 12, color: C.mutedBrown }}>
                Last check: {formatCheckDate(lastCheck.timestamp)} at{" "}
                {formatCheckTime(lastCheck.timestamp)}
              </Text>
            </View>

            {/* Areas with Changes */}
            {areasWithChanges.length > 0 && (
              <View style={{ gap: 10 }}>
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: "600",
                    color: C.mutedBrown,
                    marginBottom: 4,
                  }}
                >
                  Areas with changes
                </Text>
                {areasWithChanges.map((area, idx) => (
                  <View
                    key={idx}
                    style={{
                      backgroundColor: C.sand,
                      borderRadius: 12,
                      padding: 12,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                        marginBottom:
                          area.notes || area.changes.length > 0 ? 8 : 0,
                      }}
                    >
                      <Text style={{ fontSize: 18 }}>{area.emoji}</Text>
                      <Text
                        style={{
                          fontSize: 14,
                          fontWeight: "700",
                          color: C.warmBrown,
                          flex: 1,
                        }}
                      >
                        {area.label}
                      </Text>
                    </View>

                    {/* Changes */}
                    {area.changes.length > 0 && (
                      <View
                        style={{
                          flexDirection: "row",
                          flexWrap: "wrap",
                          gap: 6,
                          marginBottom: area.notes ? 8 : 0,
                        }}
                      >
                        {area.changes.map((change, changeIdx) => (
                          <View
                            key={changeIdx}
                            style={{
                              backgroundColor: "#FFB74D20",
                              borderRadius: 8,
                              paddingHorizontal: 10,
                              paddingVertical: 5,
                              borderWidth: 1,
                              borderColor: "#FFB74D30",
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 4,
                            }}
                          >
                            <Text style={{ fontSize: 12 }}>
                              {getChangeEmoji(change)}
                            </Text>
                            <Text
                              style={{
                                fontSize: 11,
                                fontWeight: "600",
                                color: C.warmBrown,
                              }}
                            >
                              {getChangeLabel(change)}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}

                    {/* Notes */}
                    {area.notes && (
                      <Text
                        style={{
                          fontSize: 12,
                          color: C.mutedBrown,
                          fontStyle: "italic",
                        }}
                      >
                        "{area.notes}"
                      </Text>
                    )}
                  </View>
                ))}
              </View>
            )}
          </View>
        ) : (
          <View style={{ alignItems: "center", paddingVertical: 20 }}>
            <Text
              style={{
                fontSize: 14,
                color: C.mutedBrown,
                textAlign: "center",
                marginBottom: 12,
              }}
            >
              No general checks logged yet
            </Text>
            <Text
              style={{
                fontSize: 12,
                color: C.mutedBrown,
                textAlign: "center",
                lineHeight: 17,
              }}
            >
              Tap the + button to start a quick visual check
            </Text>
          </View>
        )}
      </View>

      {/* Modal */}
      <GeneralCheckModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
      />
    </View>
  );
}
