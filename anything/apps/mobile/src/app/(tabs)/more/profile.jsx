import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  ArrowLeft,
  Edit,
  Dog,
  Calendar,
  Weight,
  Info,
  User,
} from "lucide-react-native";
import { useCurrentPet } from "@/hooks/useCurrentPet";
import useUser from "@/utils/auth/useUser";

const C = {
  coral: "#FF6F61",
  apricot: "#FFB37A",
  peach: "#FFD9B3",
  terracotta: "#B75D32",
  cream: "#FFF7EF",
  sand: "#F8EBDD",
  card: "#FFFCF8",
  warmBrown: "#3B241B",
  mutedBrown: "#7A6254",
};

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  // Fetch pet from database instead of AsyncStorage
  const { data: currentPet, isLoading: loadingPet, refetch } = useCurrentPet();
  const { data: authUser } = useUser();

  // Debug logging
  useEffect(() => {
    console.log("[Dog Profile] ========================================");
    console.log("[Dog Profile] Screen loaded");
    console.log("[Dog Profile] Auth user:", authUser);
    console.log("[Dog Profile] Current pet:", currentPet);
    console.log("[Dog Profile] Loading:", loadingPet);
    console.log("[Dog Profile] ========================================");
  }, [authUser, currentPet, loadingPet]);

  // Helper to format age
  const formatAge = (ageYears, ageMonths) => {
    if (!ageYears && !ageMonths) return null;

    const years = ageYears || 0;
    const months = ageMonths || 0;

    const parts = [];
    if (years > 0) parts.push(`${years} year${years > 1 ? "s" : ""}`);
    if (months > 0) parts.push(`${months} month${months > 1 ? "s" : ""}`);

    return parts.join(", ");
  };

  // Helper to format weight
  const formatWeight = (weight, weightUnit) => {
    if (!weight) return null;
    return `${weight} ${weightUnit || "lbs"}`;
  };

  // Helper to format date
  const formatDate = (dateString) => {
    if (!dateString) return null;
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch (error) {
      return dateString;
    }
  };

  // Helper to format gender
  const formatGender = (gender) => {
    if (!gender) return null;
    return gender.charAt(0).toUpperCase() + gender.slice(1);
  };

  const InfoRow = ({ label, value, icon: Icon }) => (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: C.peach,
      }}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 13,
          backgroundColor: C.sand,
          justifyContent: "center",
          alignItems: "center",
          marginRight: 14,
          borderWidth: 1,
          borderColor: C.peach,
        }}
      >
        <Icon size={18} color={C.coral} />
      </View>
      <View>
        <Text style={{ fontSize: 12, color: C.mutedBrown, fontWeight: "600" }}>
          {label}
        </Text>
        <Text
          style={{
            fontSize: 15,
            fontWeight: "700",
            color: value ? C.warmBrown : C.mutedBrown,
            marginTop: 1,
          }}
        >
          {value || "Not set"}
        </Text>
      </View>
    </View>
  );

  if (loadingPet) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: C.cream,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <ActivityIndicator size="large" color={C.coral} />
        <Text style={{ marginTop: 12, fontSize: 14, color: C.mutedBrown }}>
          Loading profile...
        </Text>
      </View>
    );
  }

  // Use database values instead of AsyncStorage
  const petName = currentPet?.name || "My Dog";
  const petBreed = currentPet?.breed;
  const petAge = formatAge(currentPet?.age_years, currentPet?.age_months);
  const petGender = formatGender(currentPet?.gender);
  const petWeight = formatWeight(currentPet?.weight, currentPet?.weight_unit);
  const petBirthday = formatDate(currentPet?.birthday);
  const petAdoptionDate = formatDate(currentPet?.adoption_date);
  const petDate = petBirthday || petAdoptionDate;
  const petNotes = currentPet?.notes;
  const petAvatar = currentPet?.avatar_url;

  return (
    <View style={{ flex: 1, backgroundColor: C.cream }}>
      <View
        style={{
          paddingTop: insets.top,
          paddingHorizontal: 20,
          paddingBottom: 14,
          backgroundColor: C.card,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottomWidth: 1,
          borderBottomColor: C.peach,
        }}
      >
        <TouchableOpacity onPress={() => router.back()}>
          <ArrowLeft size={22} color={C.warmBrown} />
        </TouchableOpacity>
        <Text style={{ fontSize: 18, fontWeight: "800", color: C.warmBrown }}>
          Dog Profile 🐾
        </Text>
        <TouchableOpacity
          onPress={() => {
            console.log("[Dog Profile] Edit button tapped");
            router.push("/more/profile-edit");
          }}
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: C.sand,
            justifyContent: "center",
            alignItems: "center",
            borderWidth: 1,
            borderColor: C.peach,
          }}
        >
          <Edit size={16} color={C.coral} />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        {/* Hero Section */}
        <View
          style={{
            alignItems: "center",
            paddingVertical: 32,
            backgroundColor: C.apricot,
          }}
        >
          {petAvatar ? (
            <Image
              source={{ uri: petAvatar }}
              style={{
                width: 140,
                height: 140,
                borderRadius: 70,
                borderWidth: 4,
                borderColor: "#FFF",
              }}
              contentFit="cover"
            />
          ) : (
            <View
              style={{
                width: 140,
                height: 140,
                borderRadius: 70,
                backgroundColor: "rgba(255,255,255,0.35)",
                justifyContent: "center",
                alignItems: "center",
                borderWidth: 4,
                borderColor: "#FFF",
              }}
            >
              <Dog size={70} color={C.warmBrown} />
            </View>
          )}
          <Text
            style={{
              fontSize: 28,
              fontWeight: "800",
              color: C.warmBrown,
              marginTop: 14,
              letterSpacing: -0.3,
            }}
          >
            {petName}
          </Text>
          {petBreed && (
            <Text
              style={{
                fontSize: 15,
                color: C.terracotta,
                fontWeight: "700",
                marginTop: 3,
              }}
            >
              {petBreed}
            </Text>
          )}
        </View>

        <View style={{ padding: 18 }}>
          <Text
            style={{
              fontSize: 13,
              fontWeight: "800",
              color: C.mutedBrown,
              marginBottom: 12,
              letterSpacing: 0.6,
            }}
          >
            PET INFORMATION
          </Text>
          <View
            style={{
              backgroundColor: C.card,
              borderRadius: 20,
              paddingHorizontal: 16,
              borderWidth: 1,
              borderColor: C.peach,
              shadowColor: C.terracotta,
              shadowOffset: { width: 0, height: 3 },
              shadowOpacity: 0.06,
              shadowRadius: 10,
            }}
          >
            <InfoRow label="Breed" value={petBreed} icon={Dog} />
            <InfoRow label="Age" value={petAge} icon={Calendar} />
            <InfoRow label="Gender" value={petGender} icon={User} />
            <InfoRow label="Weight" value={petWeight} icon={Weight} />
            <InfoRow
              label={
                petBirthday
                  ? "Birthday"
                  : petAdoptionDate
                    ? "Adoption Date"
                    : "Birthday / Adoption Date"
              }
              value={petDate}
              icon={Calendar}
            />
          </View>

          <Text
            style={{
              fontSize: 13,
              fontWeight: "800",
              color: C.mutedBrown,
              marginTop: 22,
              marginBottom: 12,
              letterSpacing: 0.6,
            }}
          >
            NOTES & PREFERENCES
          </Text>
          <View
            style={{
              backgroundColor: C.card,
              borderRadius: 18,
              padding: 18,
              borderWidth: 1,
              borderColor: C.peach,
            }}
          >
            <Text
              style={{
                fontSize: 14,
                color: petNotes ? C.warmBrown : C.mutedBrown,
                lineHeight: 22,
              }}
            >
              {petNotes ||
                "No extra notes yet. Add information about allergies, food preferences, or medical conditions."}
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
