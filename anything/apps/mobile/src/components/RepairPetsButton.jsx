import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from "react-native";
import { Wrench } from "lucide-react-native";
import { useRepairPets } from "@/hooks/usePetProfile";
import { COLORS } from "@/constants/colors";

/**
 * Debug button to manually trigger pet ownership repair
 * This can be temporarily added to any screen for testing
 *
 * Usage:
 * import { RepairPetsButton } from "@/components/RepairPetsButton";
 *
 * <RepairPetsButton />
 */
export function RepairPetsButton() {
  const [showDetails, setShowDetails] = useState(false);
  const repairMutation = useRepairPets();

  const handleRepair = () => {
    Alert.alert(
      "Repair Pet Ownership",
      "This will check for pets with incorrect owner_user_id and fix them.\n\nContinue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Repair",
          style: "destructive",
          onPress: async () => {
            try {
              const result = await repairMutation.mutateAsync();

              Alert.alert(
                "Repair Complete",
                `✅ Repaired ${result.repaired} pet(s)\n\n` +
                  `Auth user ID: ${result.details.auth_user_id}\n` +
                  `User profile ID: ${result.details.user_profiles_id}\n` +
                  `Repaired pet IDs: ${result.details.repaired_pet_ids.join(", ") || "none"}`,
              );

              setShowDetails(true);
            } catch (error) {
              Alert.alert("Error", error.message);
            }
          },
        },
      ],
    );
  };

  return (
    <View
      style={{
        padding: 16,
        backgroundColor: COLORS.apricot,
        borderRadius: 12,
        margin: 16,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          marginBottom: 8,
        }}
      >
        <Wrench size={18} color={COLORS.terracotta} />
        <Text
          style={{ fontSize: 14, fontWeight: "700", color: COLORS.warmBrown }}
        >
          Debug: Pet Ownership Repair
        </Text>
      </View>

      <Text
        style={{ fontSize: 12, color: COLORS.mutedBrown, marginBottom: 12 }}
      >
        If you're not seeing your existing pet, tap this button to repair pet
        ownership data.
      </Text>

      <TouchableOpacity
        onPress={handleRepair}
        disabled={repairMutation.isPending}
        style={{
          backgroundColor: COLORS.coral,
          borderRadius: 10,
          padding: 12,
          alignItems: "center",
          opacity: repairMutation.isPending ? 0.6 : 1,
        }}
      >
        {repairMutation.isPending ? (
          <ActivityIndicator color="#FFF" />
        ) : (
          <Text style={{ color: "#FFF", fontSize: 14, fontWeight: "700" }}>
            Repair Pet Ownership
          </Text>
        )}
      </TouchableOpacity>

      {showDetails && repairMutation.data && (
        <View
          style={{
            marginTop: 12,
            padding: 10,
            backgroundColor: COLORS.sand,
            borderRadius: 8,
          }}
        >
          <Text
            style={{
              fontSize: 11,
              color: COLORS.mutedBrown,
              fontFamily: "monospace",
            }}
          >
            ✅ Repaired: {repairMutation.data.repaired} pet(s){"\n"}
            Auth ID: {repairMutation.data.details.auth_user_id}
            {"\n"}
            Profile ID: {repairMutation.data.details.user_profiles_id}
            {"\n"}
            Pet IDs:{" "}
            {repairMutation.data.details.repaired_pet_ids.join(", ") || "none"}
          </Text>
        </View>
      )}
    </View>
  );
}
