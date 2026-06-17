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
  Scissors,
} from "lucide-react-native";
import { useCurrentPet } from "@/hooks/usePetProfile";
import { useGroomSessions } from "@/hooks/useGroomSessions";
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
  const { data: currentPet, isLoading: loadingPet } = useCurrentPet();
  const { data: authUser } = useUser();
  // Grooming sessions for this pet (ticket 2.6) — before/after photos a groomer logged.
  const { data: groomSessions } = useGroomSessions(currentPet?.id);

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

          {/* Grooming (ticket 2.6) — before/after photos + coat notes a groomer logged.
              Owner-read; empty → empty state, no fake data. Coat/skin notes ALSO live in
              the pet's Health timeline (the existing health-log path). */}
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
            GROOMING
          </Text>
          <GroomingSection sessions={groomSessions} />
        </View>
      </ScrollView>
    </View>
  );
}

// Renders a pet's grooming sessions (ticket 2.6). Each card shows the groomer, date,
// the before/after photo strips, and the coat/skin note. Empty → a friendly empty state
// (no fake data); the coat/skin notes also appear in the pet's Health timeline.
function GroomingSection({ sessions }) {
  const list = Array.isArray(sessions) ? sessions : [];

  if (list.length === 0) {
    return (
      <View
        style={{
          backgroundColor: C.card,
          borderRadius: 18,
          padding: 18,
          borderWidth: 1,
          borderColor: C.peach,
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
        }}
      >
        <Scissors size={20} color={C.mutedBrown} />
        <Text
          style={{
            flex: 1,
            fontSize: 14,
            color: C.mutedBrown,
            lineHeight: 20,
          }}
        >
          No grooming sessions yet. Book a groomer from Services → Grooming; their
          before/after photos and coat notes will show up here.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ gap: 14 }}>
      {list.map((s) => (
        <GroomSessionCard key={s.id} session={s} />
      ))}
    </View>
  );
}

function formatSessionDate(dateString) {
  if (!dateString) return null;
  try {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return dateString;
  }
}

function GroomSessionCard({ session }) {
  const before = Array.isArray(session.before_urls) ? session.before_urls : [];
  const after = Array.isArray(session.after_urls) ? session.after_urls : [];
  const dateLabel = formatSessionDate(session.created_at);

  return (
    <View
      style={{
        backgroundColor: C.card,
        borderRadius: 18,
        padding: 16,
        borderWidth: 1,
        borderColor: C.peach,
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
        <Text
          style={{ fontSize: 15, fontWeight: "800", color: C.warmBrown }}
          numberOfLines={1}
        >
          {session.provider_name || "Groomer"}
        </Text>
        {dateLabel ? (
          <Text style={{ fontSize: 12, color: C.mutedBrown }}>{dateLabel}</Text>
        ) : null}
      </View>

      {before.length > 0 || after.length > 0 ? (
        <View style={{ flexDirection: "row", gap: 12 }}>
          <PhotoStrip label="Before" urls={before} />
          <PhotoStrip label="After" urls={after} />
        </View>
      ) : null}

      {session.coat_skin_notes ? (
        <Text
          style={{
            fontSize: 13,
            color: C.warmBrown,
            lineHeight: 19,
            marginTop: 12,
          }}
        >
          {session.coat_skin_notes}
        </Text>
      ) : null}

      {session.products_used ? (
        <Text style={{ fontSize: 12, color: C.mutedBrown, marginTop: 6 }}>
          Products: {session.products_used}
        </Text>
      ) : null}
    </View>
  );
}

function PhotoStrip({ label, urls }) {
  return (
    <View style={{ flex: 1 }}>
      <Text
        style={{
          fontSize: 11,
          fontWeight: "800",
          color: C.mutedBrown,
          marginBottom: 6,
          letterSpacing: 0.4,
        }}
      >
        {label.toUpperCase()}
      </Text>
      {urls.length > 0 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {urls.map((uri, i) => (
            <Image
              key={`${label}-${i}`}
              source={{ uri }}
              style={{
                width: 64,
                height: 64,
                borderRadius: 10,
                backgroundColor: C.sand,
              }}
              contentFit="cover"
            />
          ))}
        </View>
      ) : (
        <View
          style={{
            height: 64,
            borderRadius: 10,
            backgroundColor: C.sand,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Text style={{ fontSize: 11, color: C.mutedBrown }}>—</Text>
        </View>
      )}
    </View>
  );
}
