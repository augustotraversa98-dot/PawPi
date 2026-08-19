import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import {
  Scale,
  TrendingUp,
  TrendingDown,
  Minus,
  Plus,
  Target,
  ChevronRight,
  Info,
  Calendar,
} from "lucide-react-native";
import {
  getCurrentWeight,
  getPreviousWeight,
  getWeightChange,
  getTargetWeight,
  getWeightTrendDirection,
  getCurrentBCS,
  getBCSInterpretation,
  isAtTargetWeight,
  formatDate,
  getDaysBetween,
  getBodyShapeEmoji,
  getBodyShapeLabel,
} from "@/data/weightData";
import WeightModal from "./WeightModal";

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

export default function WeightDashboard() {
  const { t } = useTranslation();
  const [modalVisible, setModalVisible] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const currentWeight = getCurrentWeight();
  const previousWeight = getPreviousWeight();
  const weightChange = getWeightChange();
  const targetWeight = getTargetWeight();
  const trendDirection = getWeightTrendDirection();
  const currentBCS = getCurrentBCS();
  const bcsInfo = getBCSInterpretation(currentBCS);
  const targetStatus = isAtTargetWeight();

  const handleOpenModal = () => {
    setModalVisible(true);
  };

  const handleCloseModal = () => {
    setModalVisible(false);
    setRefreshKey((k) => k + 1);
  };

  // Calculate days since last weigh-in
  const daysSinceLastWeighIn = currentWeight
    ? getDaysBetween(Date.now(), currentWeight.timestamp)
    : null;

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
              {t("trackers.weight.title")}
            </Text>
            <Text style={{ fontSize: 12, color: C.mutedBrown }}>
              {t("trackers.weight.subtitle")}
            </Text>
          </View>
          <TouchableOpacity
            onPress={handleOpenModal}
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

        {currentWeight ? (
          <>
            {/* Current Weight Display */}
            <View
              style={{
                backgroundColor: C.sage + "10",
                borderRadius: 16,
                padding: 18,
                marginBottom: 16,
                borderWidth: 1,
                borderColor: C.sage + "30",
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 12,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <Scale size={20} color={C.sage} />
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "700",
                      color: C.mutedBrown,
                    }}
                  >
                    {t("trackers.weight.currentWeight")}
                  </Text>
                </View>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <Calendar size={12} color={C.mutedBrown} />
                  <Text style={{ fontSize: 11, color: C.mutedBrown }}>
                    {formatDate(currentWeight.timestamp)}
                  </Text>
                </View>
              </View>

              <View
                style={{
                  flexDirection: "row",
                  alignItems: "flex-end",
                  justifyContent: "space-between",
                }}
              >
                <View>
                  <Text
                    style={{
                      fontSize: 36,
                      fontWeight: "800",
                      color: C.warmBrown,
                      lineHeight: 38,
                    }}
                  >
                    {currentWeight.weight}
                    <Text
                      style={{
                        fontSize: 18,
                        fontWeight: "600",
                        color: C.mutedBrown,
                      }}
                    >
                      {" "}
                      {currentWeight.weightUnit}
                    </Text>
                  </Text>
                  {currentWeight.bodyShape && (
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 6,
                        marginTop: 6,
                      }}
                    >
                      <Text style={{ fontSize: 16 }}>
                        {getBodyShapeEmoji(currentWeight.bodyShape)}
                      </Text>
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: "600",
                          color: C.mutedBrown,
                        }}
                      >
                        {getBodyShapeLabel(currentWeight.bodyShape)}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Weight Change */}
                {weightChange && (
                  <View
                    style={{
                      backgroundColor:
                        weightChange.direction === "up"
                          ? "#FFB74D20"
                          : weightChange.direction === "down"
                            ? "#64B5F620"
                            : "#E0E0E020",
                      borderRadius: 12,
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    {weightChange.direction === "up" ? (
                      <TrendingUp size={16} color="#FFB74D" />
                    ) : weightChange.direction === "down" ? (
                      <TrendingDown size={16} color="#64B5F6" />
                    ) : (
                      <Minus size={16} color="#9E9E9E" />
                    )}
                    <View>
                      <Text
                        style={{
                          fontSize: 14,
                          fontWeight: "800",
                          color:
                            weightChange.direction === "up"
                              ? "#FFB74D"
                              : weightChange.direction === "down"
                                ? "#64B5F6"
                                : "#9E9E9E",
                        }}
                      >
                        {weightChange.direction === "up" ? "+" : ""}
                        {weightChange.change} {currentWeight.weightUnit}
                      </Text>
                      <Text
                        style={{
                          fontSize: 10,
                          fontWeight: "600",
                          color: C.mutedBrown,
                        }}
                      >
                        {weightChange.percentChange}%
                      </Text>
                    </View>
                  </View>
                )}
              </View>
            </View>

            {/* Target Weight (if available) */}
            {targetWeight && (
              <View
                style={{
                  backgroundColor: "#E8F5E9",
                  borderRadius: 14,
                  padding: 14,
                  marginBottom: 16,
                  borderWidth: 1,
                  borderColor: "#C8E6C9",
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <Target size={18} color="#66BB6A" />
                    <View>
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: "700",
                          color: C.mutedBrown,
                          marginBottom: 2,
                        }}
                      >
                        {t("trackers.weight.vetTarget")}
                      </Text>
                      <Text
                        style={{
                          fontSize: 16,
                          fontWeight: "800",
                          color: C.warmBrown,
                        }}
                      >
                        {targetWeight} {currentWeight.weightUnit}
                      </Text>
                    </View>
                  </View>

                  {targetStatus && (
                    <View
                      style={{
                        backgroundColor: targetStatus.color + "20",
                        borderRadius: 10,
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: "700",
                          color: targetStatus.color,
                        }}
                      >
                        {targetStatus.label}
                      </Text>
                    </View>
                  )}
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
              {/* Previous Weight */}
              {previousWeight && (
                <View
                  style={{
                    flex: 1,
                    backgroundColor: C.sand,
                    borderRadius: 12,
                    padding: 12,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: "700",
                      color: C.mutedBrown,
                      marginBottom: 6,
                    }}
                  >
                    {t("trackers.weight.previous")}
                  </Text>
                  <Text
                    style={{
                      fontSize: 16,
                      fontWeight: "800",
                      color: C.warmBrown,
                      marginBottom: 2,
                    }}
                  >
                    {previousWeight.weight}
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: "600",
                        color: C.mutedBrown,
                      }}
                    >
                      {" "}
                      {previousWeight.weightUnit}
                    </Text>
                  </Text>
                  <Text style={{ fontSize: 10, color: C.mutedBrown }}>
                    {formatDate(previousWeight.timestamp)}
                  </Text>
                </View>
              )}

              {/* Trend */}
              <View
                style={{
                  flex: 1,
                  backgroundColor: C.sand,
                  borderRadius: 12,
                  padding: 12,
                }}
              >
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: "700",
                    color: C.mutedBrown,
                    marginBottom: 6,
                  }}
                >
                  {t("trackers.weight.threeMonthTrend")}
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <Text style={{ fontSize: 18 }}>{trendDirection.emoji}</Text>
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "800",
                      color: C.warmBrown,
                    }}
                  >
                    {trendDirection.label}
                  </Text>
                </View>
              </View>
            </View>

            {/* BCS (if available) */}
            {currentBCS && bcsInfo && (
              <View
                style={{
                  backgroundColor: bcsInfo.color + "20",
                  borderRadius: 14,
                  padding: 14,
                  marginBottom: 16,
                  borderWidth: 1,
                  borderColor: bcsInfo.color + "40",
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 8,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "700",
                      color: C.mutedBrown,
                    }}
                  >
                    {t("trackers.weight.bcsTitle")}
                  </Text>
                  <View
                    style={{
                      backgroundColor: bcsInfo.color,
                      borderRadius: 8,
                      width: 32,
                      height: 32,
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 16,
                        fontWeight: "800",
                        color: "#FFF",
                      }}
                    >
                      {currentBCS}
                    </Text>
                  </View>
                </View>
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: "600",
                    color: C.warmBrown,
                    marginBottom: 2,
                  }}
                >
                  {bcsInfo.label}
                </Text>
                <Text style={{ fontSize: 11, color: C.mutedBrown }}>
                  {bcsInfo.description}
                </Text>
              </View>
            )}

            {/* Weight Trend Chart Placeholder */}
            <TouchableOpacity
              onPress={handleOpenModal}
              style={{
                backgroundColor: C.sand,
                borderRadius: 14,
                padding: 16,
                marginBottom: 16,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 10,
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: "700",
                    color: C.warmBrown,
                  }}
                >
                  {t("trackers.weight.weightHistory")}
                </Text>
                <ChevronRight size={18} color={C.mutedBrown} />
              </View>

              {/* Simple visual placeholder for chart */}
              <View
                style={{
                  height: 60,
                  backgroundColor: C.cream,
                  borderRadius: 10,
                  justifyContent: "center",
                  alignItems: "center",
                  borderWidth: 1,
                  borderColor: C.peach,
                }}
              >
                <Text
                  style={{
                    fontSize: 11,
                    color: C.mutedBrown,
                    fontStyle: "italic",
                  }}
                >
                  {t("trackers.weight.tapToView")}
                </Text>
              </View>
            </TouchableOpacity>

            {/* Info Footer */}
            <View
              style={{
                backgroundColor: C.sand,
                borderRadius: 12,
                padding: 12,
                flexDirection: "row",
                alignItems: "flex-start",
                gap: 10,
              }}
            >
              <Info size={14} color={C.mutedBrown} style={{ marginTop: 1 }} />
              <Text
                style={{
                  fontSize: 11,
                  color: C.mutedBrown,
                  lineHeight: 16,
                  flex: 1,
                }}
              >
                {t("trackers.weight.footerInfo")}
              </Text>
            </View>
          </>
        ) : (
          /* Empty State */
          <View style={{ alignItems: "center", paddingVertical: 20 }}>
            <View
              style={{
                width: 60,
                height: 60,
                borderRadius: 30,
                backgroundColor: C.sage + "20",
                justifyContent: "center",
                alignItems: "center",
                marginBottom: 14,
              }}
            >
              <Scale size={28} color={C.sage} />
            </View>
            <Text
              style={{
                fontSize: 14,
                fontWeight: "700",
                color: C.warmBrown,
                textAlign: "center",
                marginBottom: 8,
              }}
            >
              {t("trackers.weight.emptyTitle")}
            </Text>
            <Text
              style={{
                fontSize: 12,
                color: C.mutedBrown,
                textAlign: "center",
                lineHeight: 17,
                marginBottom: 16,
              }}
            >
              {t("trackers.weight.emptyBody")}
            </Text>
            <TouchableOpacity
              onPress={handleOpenModal}
              style={{
                backgroundColor: C.coral,
                borderRadius: 12,
                paddingHorizontal: 20,
                paddingVertical: 10,
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Plus size={16} color="#FFF" />
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "700",
                  color: "#FFF",
                }}
              >
                {t("trackers.weight.addFirst")}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Modal */}
      <WeightModal visible={modalVisible} onClose={handleCloseModal} />
    </View>
  );
}
