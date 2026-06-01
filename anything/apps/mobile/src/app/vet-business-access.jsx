import React, { useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { X, ChevronRight } from "lucide-react-native";

const C = {
  coral: "#FF6F61",
  cream: "#FFF7EF",
  warmBrown: "#3B241B",
  mutedBrown: "#7A6254",
  sand: "#F8EBDD",
  peach: "#FFD9B3",
};

const ACCESS_TYPES = [
  {
    id: "vet",
    icon: "🩺",
    title: "Vet clinic",
    description: "Access patient records and health data",
  },
  {
    id: "shelter",
    icon: "🏠",
    title: "Shelter",
    description: "Manage adoptions and animal profiles",
  },
  {
    id: "business",
    icon: "🛍️",
    title: "Pet business",
    description: "Shops, groomers, and pet services",
  },
];

export default function VetBusinessAccessScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [selectedType, setSelectedType] = useState(null);

  const handleRequestAccess = () => {
    if (!selectedType) {
      Alert.alert(
        "Please select an option",
        "Choose your business type to continue.",
      );
      return;
    }

    Alert.alert(
      "Early Access Request",
      `Thanks for your interest! We'll notify you when ${selectedType.title} access is available.`,
      [{ text: "OK" }],
    );
  };

  const handleBackToLogin = () => {
    router.back();
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.cream }}>
      {/* Close Button */}
      <TouchableOpacity
        onPress={handleBackToLogin}
        style={{
          position: "absolute",
          top: insets.top + 16,
          right: 20,
          zIndex: 10,
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: "#FFF",
          alignItems: "center",
          justifyContent: "center",
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.1,
          shadowRadius: 4,
          elevation: 3,
        }}
      >
        <X size={24} color={C.warmBrown} />
      </TouchableOpacity>

      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 80,
          paddingBottom: insets.bottom + 40,
          paddingHorizontal: 24,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={{ marginBottom: 40 }}>
          <Text
            style={{
              fontSize: 32,
              fontWeight: "900",
              color: C.warmBrown,
              marginBottom: 12,
              letterSpacing: -0.5,
            }}
          >
            Access for vets & businesses
          </Text>
          <Text
            style={{
              fontSize: 16,
              color: C.mutedBrown,
              lineHeight: 24,
            }}
          >
            Soon, veterinary clinics, shelters, and pet businesses will have
            dedicated tools inside Social Pet.
          </Text>
        </View>

        {/* Access Type Options */}
        <View style={{ gap: 16, marginBottom: 40 }}>
          {ACCESS_TYPES.map((type) => (
            <TouchableOpacity
              key={type.id}
              onPress={() => setSelectedType(type)}
              style={{
                backgroundColor: selectedType?.id === type.id ? "#FFF" : C.sand,
                borderRadius: 20,
                padding: 20,
                borderWidth: 2,
                borderColor:
                  selectedType?.id === type.id ? C.coral : "transparent",
                shadowColor: selectedType?.id === type.id ? C.coral : "#000",
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: selectedType?.id === type.id ? 0.2 : 0.05,
                shadowRadius: 8,
                elevation: selectedType?.id === type.id ? 4 : 2,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Text style={{ fontSize: 36, marginRight: 16 }}>
                  {type.icon}
                </Text>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: 18,
                      fontWeight: "800",
                      color: C.warmBrown,
                      marginBottom: 4,
                    }}
                  >
                    {type.title}
                  </Text>
                  <Text
                    style={{
                      fontSize: 14,
                      color: C.mutedBrown,
                      lineHeight: 20,
                    }}
                  >
                    {type.description}
                  </Text>
                </View>
                <ChevronRight
                  size={24}
                  color={selectedType?.id === type.id ? C.coral : C.mutedBrown}
                />
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Request Early Access Button */}
        <TouchableOpacity
          onPress={handleRequestAccess}
          style={{
            backgroundColor: C.coral,
            borderRadius: 18,
            paddingVertical: 18,
            alignItems: "center",
            marginBottom: 16,
            shadowColor: C.coral,
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.3,
            shadowRadius: 12,
            elevation: 6,
          }}
        >
          <Text
            style={{
              fontSize: 17,
              fontWeight: "800",
              color: "#FFF",
            }}
          >
            Request early access
          </Text>
        </TouchableOpacity>

        {/* Back to Login Button */}
        <TouchableOpacity
          onPress={handleBackToLogin}
          style={{
            backgroundColor: C.sand,
            borderRadius: 18,
            paddingVertical: 18,
            alignItems: "center",
            borderWidth: 2,
            borderColor: C.peach,
          }}
        >
          <Text
            style={{
              fontSize: 17,
              fontWeight: "800",
              color: C.mutedBrown,
            }}
          >
            Back to user login
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}
