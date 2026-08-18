import React, { useState } from "react";
import { View, Text, TouchableOpacity, Alert } from "react-native";
import { useTranslation } from "react-i18next";
import { Check, Heart, Watch, Edit3, ChevronRight } from "lucide-react-native";
import {
  isHealthKitAvailable,
  isAppleWatchConnected,
  requestHealthKitPermission,
  getTrackingPreference,
  setTrackingPreference,
} from "@/utils/healthKitIntegration";

const C = {
  cream: "#FFF7EF",
  card: "#FFFBF7",
  coral: "#FF6F61",
  peach: "#FFE5D9",
  warmBrown: "#3B241B",
  mutedBrown: "#8B7355",
  sage: "#A7BFA3",
  sand: "#F5EDE4",
};

export default function WalkTrackingSettings() {
  const { t } = useTranslation();
  const [selectedTracking, setSelectedTracking] = useState("manual");
  const [healthKitAvailable, setHealthKitAvailable] = useState(false);
  const [watchConnected, setWatchConnected] = useState(false);

  React.useEffect(() => {
    checkAvailability();
    loadPreference();
  }, []);

  const checkAvailability = async () => {
    const healthKit = await isHealthKitAvailable();
    const watch = await isAppleWatchConnected();
    setHealthKitAvailable(healthKit);
    setWatchConnected(watch);
  };

  const loadPreference = () => {
    const pref = getTrackingPreference();
    setSelectedTracking(pref);
  };

  const handleSelectTracking = async (option) => {
    // STRUCTURAL guard first: an unavailable (coming-soon) integration is display-
    // only — it must NOT be selected or persisted. Show honest feedback and return
    // before any setSelectedTracking / setTrackingPreference write.
    const unavailable =
      (option === "apple_health" && !healthKitAvailable) ||
      (option === "apple_watch" && !watchConnected);
    if (unavailable) {
      const name = option === "apple_watch" ? "Apple Watch" : "Apple Health";
      Alert.alert(
        t("health.connectedTrackingSoonTitle", { name }),
        t("health.connectedTrackingSoonBody", { name }),
      );
      return;
    }

    setSelectedTracking(option);
    await setTrackingPreference(option);
  };

  const trackingOptions = [
    {
      id: "apple_health",
      name: "Apple Health",
      description: "Automatic distance and step tracking",
      icon: Heart,
      available: true, // Always show, but indicate if not yet implemented
      comingSoon: !healthKitAvailable,
    },
    {
      id: "apple_watch",
      name: "Apple Watch",
      description: "Real-time pace and heart rate",
      icon: Watch,
      available: true,
      comingSoon: !watchConnected,
    },
    {
      id: "manual",
      name: "Manual tracking",
      description: "Enter walk details yourself",
      icon: Edit3,
      available: true,
      comingSoon: false,
    },
  ];

  return (
    <View>
      <View style={{ marginBottom: 16 }}>
        <Text
          style={{
            fontSize: 16,
            fontWeight: "700",
            color: C.warmBrown,
            marginBottom: 6,
          }}
        >
          Connected tracking
        </Text>
        <Text style={{ fontSize: 13, color: C.mutedBrown, lineHeight: 18 }}>
          Connect Apple Health or Apple Watch to make walk distance and pace
          more accurate.
        </Text>
      </View>

      <View style={{ gap: 12 }}>
        {trackingOptions.map((option) => {
          const Icon = option.icon;
          const isSelected = selectedTracking === option.id;

          return (
            <TouchableOpacity
              key={option.id}
              onPress={() => handleSelectTracking(option.id)}
              disabled={!option.available}
              style={{
                backgroundColor: isSelected ? C.sage + "15" : C.card,
                borderRadius: 16,
                padding: 16,
                borderWidth: 2,
                borderColor: isSelected ? C.sage : C.peach,
                flexDirection: "row",
                alignItems: "center",
                gap: 14,
                opacity: option.available ? 1 : 0.5,
              }}
            >
              {/* Icon */}
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: isSelected ? C.sage + "20" : C.sand,
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <Icon size={22} color={isSelected ? C.sage : C.mutedBrown} />
              </View>

              {/* Content */}
              <View style={{ flex: 1 }}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 4,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 15,
                      fontWeight: "700",
                      color: C.warmBrown,
                    }}
                  >
                    {option.name}
                  </Text>
                  {option.comingSoon && (
                    <View
                      style={{
                        backgroundColor: C.coral + "20",
                        paddingHorizontal: 8,
                        paddingVertical: 3,
                        borderRadius: 8,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 10,
                          fontWeight: "700",
                          color: C.coral,
                        }}
                      >
                        COMING SOON
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={{ fontSize: 12, color: C.mutedBrown }}>
                  {option.description}
                </Text>
              </View>

              {/* Selection indicator */}
              {isSelected && (
                <View
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    backgroundColor: C.sage,
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <Check size={14} color="#FFF" />
                </View>
              )}

              {!isSelected && option.comingSoon && (
                <ChevronRight size={18} color={C.mutedBrown} />
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Info Box */}
      <View
        style={{
          backgroundColor: C.sand,
          borderRadius: 12,
          padding: 14,
          marginTop: 16,
          borderWidth: 1,
          borderColor: C.peach,
        }}
      >
        <Text
          style={{
            fontSize: 12,
            color: C.warmBrown,
            lineHeight: 18,
          }}
        >
          💡 <Text style={{ fontWeight: "600" }}>Tip:</Text> Apple Health and
          Watch tracking will be available soon. For now, manual tracking works
          great!
        </Text>
      </View>
    </View>
  );
}
