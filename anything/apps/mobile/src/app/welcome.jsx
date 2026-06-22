import React from "react";
import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuthModal } from "@/utils/auth/store";

const C = {
  coral: "#FF6F61",
  cream: "#FFF7EF",
  warmBrown: "#3B241B",
  mutedBrown: "#7A6254",
  sand: "#F8EBDD",
};

export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { open } = useAuthModal();

  const handleCreateAccount = () => {
    open({ mode: "signup" });
  };

  const handleLogin = () => {
    open({ mode: "signin" });
  };

  const handleVetAccess = () => {
    router.push("/vet-business-access");
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.cream }}>
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: insets.top + 20,
          paddingBottom: insets.bottom + 40,
          paddingHorizontal: 24,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Vet/Business Access Link */}
        <TouchableOpacity
          onPress={handleVetAccess}
          style={{
            alignSelf: "flex-end",
            marginBottom: 40,
          }}
        >
          <Text
            style={{
              fontSize: 13,
              fontWeight: "600",
              color: C.coral,
              textDecorationLine: "underline",
            }}
          >
            Access for vets & businesses
          </Text>
        </TouchableOpacity>

        {/* Logo/Icon */}
        <View style={{ alignItems: "center", marginTop: 60, marginBottom: 40 }}>
          <Text style={{ fontSize: 80, marginBottom: 20 }}>🐾</Text>
          <Text
            style={{
              fontSize: 36,
              fontWeight: "900",
              color: C.warmBrown,
              letterSpacing: -1,
            }}
          >
            Social Pet
          </Text>
        </View>

        {/* Tagline */}
        <Text
          style={{
            fontSize: 18,
            fontWeight: "500",
            color: C.mutedBrown,
            textAlign: "center",
            lineHeight: 28,
            marginBottom: 60,
            paddingHorizontal: 20,
          }}
        >
          Your pet's daily care, moments, and community — all in one place.
        </Text>

        {/* Spacer to push buttons down */}
        <View style={{ flex: 1 }} />

        {/* Buttons */}
        <View style={{ gap: 16, marginTop: 20 }}>
          {/* Create Account Button */}
          <TouchableOpacity
            onPress={handleCreateAccount}
            accessibilityLabel="Create account"
            style={{
              backgroundColor: C.coral,
              borderRadius: 18,
              paddingVertical: 18,
              alignItems: "center",
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
              Create account
            </Text>
          </TouchableOpacity>

          {/* Log In Button */}
          <TouchableOpacity
            onPress={handleLogin}
            style={{
              backgroundColor: C.sand,
              borderRadius: 18,
              paddingVertical: 18,
              alignItems: "center",
              borderWidth: 2,
              borderColor: C.coral,
            }}
          >
            <Text
              style={{
                fontSize: 17,
                fontWeight: "800",
                color: C.coral,
              }}
            >
              Log in
            </Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </View>
  );
}
