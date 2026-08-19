import React, { useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, Image } from "react-native";
import {
  Camera,
  Clock,
  FileText,
  ChevronDown,
  ChevronUp,
} from "lucide-react-native";
import { useTranslation } from "react-i18next";
import {
  getPhotoHistoryGrouped,
  BODY_AREA_LABELS,
} from "@/data/photoCheckData";

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

const BODY_AREA_COLORS = {
  paws: "#FFB74D",
  ears: "#9575CD",
  eyes: "#64B5F6",
  teeth: "#4DB6AC",
  skin_fur: "#FF8A65",
  face: "#FF6F61",
  full_body: "#A7BFA3",
  other: "#B75D32",
};

function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(dateString) {
  const date = new Date(dateString);
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function PhotoHistory() {
  const { t } = useTranslation();
  const photoHistory = getPhotoHistoryGrouped();
  const [expandedAreas, setExpandedAreas] = useState([]);

  const toggleArea = (area) => {
    setExpandedAreas((prev) =>
      prev.includes(area) ? prev.filter((a) => a !== area) : [...prev, area],
    );
  };

  const bodyAreasWithPhotos = Object.keys(photoHistory);

  return (
    <ScrollView style={{ flex: 1 }}>
      <View style={{ padding: 16 }}>
        {/* Section Title */}
        <View style={{ marginBottom: 20 }}>
          <Text
            style={{
              fontSize: 20,
              fontWeight: "800",
              color: C.warmBrown,
              marginBottom: 4,
            }}
          >
            {t("health.photoCheck.historyTitle")}
          </Text>
          <Text style={{ fontSize: 14, color: C.mutedBrown, lineHeight: 20 }}>
            {t("health.photoCheck.historySubtitle")}
          </Text>
        </View>

        {/* Photo History by Area */}
        {bodyAreasWithPhotos.length === 0 ? (
          <View
            style={{
              backgroundColor: C.card,
              borderRadius: 20,
              padding: 24,
              borderWidth: 1.5,
              borderColor: C.peach,
              alignItems: "center",
            }}
          >
            <Camera
              size={48}
              color={C.mutedBrown}
              style={{ marginBottom: 12 }}
            />
            <Text
              style={{
                fontSize: 15,
                fontWeight: "700",
                color: C.warmBrown,
                marginBottom: 6,
                textAlign: "center",
              }}
            >
              {t("health.photoCheck.noPhotosTitle")}
            </Text>
            <Text
              style={{
                fontSize: 13,
                color: C.mutedBrown,
                textAlign: "center",
                lineHeight: 19,
              }}
            >
              {t("health.photoCheck.noPhotosBody")}
            </Text>
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            {bodyAreasWithPhotos.map((area) => {
              const photos = photoHistory[area];
              const isExpanded = expandedAreas.includes(area);
              const color = BODY_AREA_COLORS[area] || C.terracotta;

              return (
                <View
                  key={area}
                  style={{
                    backgroundColor: C.card,
                    borderRadius: 18,
                    borderWidth: 1.5,
                    borderColor: C.peach,
                    overflow: "hidden",
                  }}
                >
                  {/* Area Header */}
                  <TouchableOpacity
                    onPress={() => toggleArea(area)}
                    style={{
                      padding: 16,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 14,
                    }}
                  >
                    <View
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: 24,
                        backgroundColor: color + "20",
                        justifyContent: "center",
                        alignItems: "center",
                      }}
                    >
                      <Camera size={22} color={color} />
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
                        {BODY_AREA_LABELS[area] || area}
                      </Text>
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 12,
                            color: C.mutedBrown,
                          }}
                        >
                          {t("health.photoCheck.photoCount", { count: photos.length })}
                        </Text>
                        <Text
                          style={{
                            fontSize: 12,
                            color: C.mutedBrown,
                          }}
                        >
                          •
                        </Text>
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          <Clock size={12} color={C.mutedBrown} />
                          <Text
                            style={{
                              fontSize: 12,
                              color: C.mutedBrown,
                            }}
                          >
                            {t("health.photoCheck.last", { date: formatDate(photos[0].createdAt) })}
                          </Text>
                        </View>
                      </View>
                    </View>
                    {isExpanded ? (
                      <ChevronUp size={20} color={C.mutedBrown} />
                    ) : (
                      <ChevronDown size={20} color={C.mutedBrown} />
                    )}
                  </TouchableOpacity>

                  {/* Expanded Photo Grid */}
                  {isExpanded && (
                    <View
                      style={{
                        borderTopWidth: 1,
                        borderTopColor: C.peach,
                        padding: 12,
                      }}
                    >
                      <View
                        style={{
                          flexDirection: "row",
                          flexWrap: "wrap",
                          gap: 8,
                        }}
                      >
                        {photos.map((photo, idx) => (
                          <View
                            key={photo.id}
                            style={{
                              width: "48%",
                              backgroundColor: C.sand,
                              borderRadius: 12,
                              padding: 8,
                              borderWidth: 1,
                              borderColor: C.peach,
                            }}
                          >
                            <Image
                              source={{ uri: photo.imageUrl }}
                              style={{
                                width: "100%",
                                height: 120,
                                borderRadius: 8,
                                marginBottom: 8,
                              }}
                              resizeMode="cover"
                            />
                            <Text
                              style={{
                                fontSize: 11,
                                fontWeight: "600",
                                color: C.warmBrown,
                                marginBottom: 2,
                              }}
                            >
                              {formatDate(photo.createdAt)}
                            </Text>
                            <Text
                              style={{
                                fontSize: 10,
                                color: C.mutedBrown,
                                marginBottom: 6,
                              }}
                            >
                              {formatTime(photo.createdAt)}
                            </Text>
                            {photo.notes && (
                              <Text
                                style={{
                                  fontSize: 11,
                                  color: C.mutedBrown,
                                  lineHeight: 15,
                                }}
                                numberOfLines={2}
                              >
                                {photo.notes}
                              </Text>
                            )}
                            {photo.includedInVetSummary && (
                              <View
                                style={{
                                  marginTop: 6,
                                  backgroundColor: C.sage + "20",
                                  borderRadius: 6,
                                  paddingHorizontal: 6,
                                  paddingVertical: 3,
                                  alignSelf: "flex-start",
                                }}
                              >
                                <Text
                                  style={{
                                    fontSize: 9,
                                    fontWeight: "700",
                                    color: C.sage,
                                  }}
                                >
                                  {t("health.photoCheck.inVetSummary")}
                                </Text>
                              </View>
                            )}
                          </View>
                        ))}
                      </View>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* Compare Placeholder */}
        {bodyAreasWithPhotos.length > 0 && (
          <View
            style={{
              marginTop: 20,
              backgroundColor: C.sand,
              borderRadius: 18,
              padding: 18,
              borderWidth: 1.5,
              borderColor: C.peach,
              alignItems: "center",
            }}
          >
            <FileText
              size={32}
              color={C.mutedBrown}
              style={{ marginBottom: 10 }}
            />
            <Text
              style={{
                fontSize: 14,
                fontWeight: "700",
                color: C.warmBrown,
                marginBottom: 6,
              }}
            >
              {t("health.photoCheck.compareTitle")}
            </Text>
            <Text
              style={{
                fontSize: 12,
                color: C.mutedBrown,
                textAlign: "center",
                lineHeight: 18,
              }}
            >
              {t("health.photoCheck.compareBody")}
            </Text>
          </View>
        )}

        {/* Info Box */}
        <View
          style={{
            marginTop: 20,
            backgroundColor: C.sand,
            borderRadius: 16,
            padding: 16,
            borderWidth: 1,
            borderColor: C.peach,
          }}
        >
          <Text
            style={{
              fontSize: 13,
              color: C.mutedBrown,
              lineHeight: 19,
              textAlign: "center",
            }}
          >
            {t("health.photoCheck.historyInfo")}
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}
