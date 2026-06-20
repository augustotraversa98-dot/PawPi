import React, { useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, Linking, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Check } from "lucide-react-native";
import { useAuthModal } from "@/utils/auth/store";
import { PRIVACY_POLICY_URL, TERMS_OF_SERVICE_URL } from "@/constants/legal";

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
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  const handleCreateAccount = () => {
    // EULA gate (Guideline 1.2) — can't create an account without accepting the Terms.
    if (!agreedToTerms) {
      Alert.alert(
        "One more step",
        "Please agree to the Terms of Service and Privacy Policy to create an account.",
      );
      return;
    }
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

        {/* Terms acceptance gate (Guideline 1.2) — required, unchecked by default. */}
        <TouchableOpacity
          onPress={() => setAgreedToTerms((v) => !v)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: agreedToTerms }}
          accessibilityLabel="I agree to the Terms of Service and Privacy Policy"
          activeOpacity={0.8}
          style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, marginTop: 32 }}
        >
          <View
            style={{
              width: 24,
              height: 24,
              borderRadius: 7,
              borderWidth: 2,
              borderColor: C.coral,
              backgroundColor: agreedToTerms ? C.coral : "transparent",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {agreedToTerms ? <Check size={16} color="#FFF" /> : null}
          </View>
          <Text style={{ flex: 1, fontSize: 13, color: C.mutedBrown, lineHeight: 19 }}>
            I agree to the{" "}
            <Text
              style={{ fontWeight: "800", color: C.coral }}
              onPress={
                TERMS_OF_SERVICE_URL ? () => Linking.openURL(TERMS_OF_SERVICE_URL) : undefined
              }
            >
              Terms of Service
            </Text>{" "}
            and{" "}
            <Text
              style={{ fontWeight: "800", color: C.coral }}
              onPress={
                PRIVACY_POLICY_URL ? () => Linking.openURL(PRIVACY_POLICY_URL) : undefined
              }
            >
              Privacy Policy
            </Text>
            , including PawPi's zero-tolerance policy for objectionable content and abusive behavior.
          </Text>
        </TouchableOpacity>

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
              opacity: agreedToTerms ? 1 : 0.5,
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
