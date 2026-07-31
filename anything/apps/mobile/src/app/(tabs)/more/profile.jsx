import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
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
import { getDisplayAge } from "@/utils/petAge";
import useUser from "@/utils/auth/useUser";
import {
  COLORS,
  TYPE,
  RADIUS,
  SPACING,
  MATERIALS,
} from "@/constants/theme";
import { Card, PressableScale } from "@/components/ui";

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
        paddingVertical: SPACING.md + 2,
        borderBottomWidth: 1,
        borderBottomColor: MATERIALS.hairline,
      }}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: RADIUS.control,
          backgroundColor: MATERIALS.surfaceSunken,
          justifyContent: "center",
          alignItems: "center",
          marginRight: SPACING.md + 2,
          borderWidth: 1,
          borderColor: MATERIALS.hairline,
        }}
      >
        <Icon size={18} color={COLORS.coral} />
      </View>
      <View>
        <Text style={[TYPE.footnote, { color: COLORS.mutedBrown, fontWeight: "600" }]}>
          {label}
        </Text>
        <Text
          style={[
            TYPE.body,
            { fontWeight: "700", color: value ? COLORS.warmBrown : COLORS.mutedBrown, marginTop: 1 },
          ]}
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
          backgroundColor: COLORS.cream,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <ActivityIndicator size="large" color={COLORS.coral} />
        <Text style={[TYPE.callout, { marginTop: SPACING.md, color: COLORS.mutedBrown }]}>
          Loading profile...
        </Text>
      </View>
    );
  }

  // Use database values instead of AsyncStorage
  const petName = currentPet?.name || "My Dog";
  const petBreed = currentPet?.breed;
  const petAge = getDisplayAge(currentPet);
  const petGender = formatGender(currentPet?.gender);
  const petWeight = formatWeight(currentPet?.weight, currentPet?.weight_unit);
  const petBirthday = formatDate(currentPet?.birthday);
  const petAdoptionDate = formatDate(currentPet?.adoption_date);
  const petDate = petBirthday || petAdoptionDate;
  const petNotes = currentPet?.notes;
  const petAvatar = currentPet?.avatar_url;

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.cream }}>
      <View
        style={{
          paddingTop: insets.top,
          paddingHorizontal: SPACING.xl,
          paddingBottom: SPACING.md + 2,
          backgroundColor: MATERIALS.surface,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottomWidth: 1,
          borderBottomColor: MATERIALS.hairline,
        }}
      >
        <PressableScale onPress={() => router.back()}>
          <ArrowLeft size={22} color={COLORS.warmBrown} />
        </PressableScale>
        <Text style={[TYPE.headline, { fontWeight: "800", color: COLORS.warmBrown }]}>
          Dog Profile 🐾
        </Text>
        <PressableScale
          onPress={() => {
            console.log("[Dog Profile] Edit button tapped");
            router.push("/more/profile-edit");
          }}
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: MATERIALS.surfaceSunken,
            justifyContent: "center",
            alignItems: "center",
            borderWidth: 1,
            borderColor: MATERIALS.hairline,
          }}
        >
          <Edit size={16} color={COLORS.coral} />
        </PressableScale>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        {/* Hero Section */}
        <View
          style={{
            alignItems: "center",
            paddingVertical: SPACING.xxxl,
            backgroundColor: COLORS.apricot,
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
              <Dog size={70} color={COLORS.warmBrown} />
            </View>
          )}
          <Text
            style={[TYPE.largeTitle, { color: COLORS.warmBrown, marginTop: SPACING.md + 2 }]}
          >
            {petName}
          </Text>
          {petBreed && (
            <Text
              style={[TYPE.body, { color: COLORS.terracotta, fontWeight: "700", marginTop: 3 }]}
            >
              {petBreed}
            </Text>
          )}
        </View>

        <View style={{ padding: SPACING.lg + 2 }}>
          <Text
            style={[TYPE.overline, { color: COLORS.mutedBrown, marginBottom: SPACING.md }]}
          >
            PET INFORMATION
          </Text>
          <Card level="sm" style={{ paddingHorizontal: SPACING.lg }}>
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
          </Card>

          <Text
            style={[
              TYPE.overline,
              { color: COLORS.mutedBrown, marginTop: SPACING.xxl - 2, marginBottom: SPACING.md },
            ]}
          >
            NOTES & PREFERENCES
          </Text>
          <Card level="none" style={{ padding: SPACING.lg + 2 }}>
            <Text
              style={[TYPE.callout, { color: petNotes ? COLORS.warmBrown : COLORS.mutedBrown, lineHeight: 22 }]}
            >
              {petNotes ||
                "No extra notes yet. Add information about allergies, food preferences, or medical conditions."}
            </Text>
          </Card>

          {/* Grooming (ticket 2.6) — before/after photos + coat notes a groomer logged.
              Owner-read; empty → empty state, no fake data. Coat/skin notes ALSO live in
              the pet's Health timeline (the existing health-log path). */}
          <Text
            style={[
              TYPE.overline,
              { color: COLORS.mutedBrown, marginTop: SPACING.xxl - 2, marginBottom: SPACING.md },
            ]}
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
      <Card
        level="none"
        style={{
          padding: SPACING.lg + 2,
          flexDirection: "row",
          alignItems: "center",
          gap: SPACING.md,
        }}
      >
        <Scissors size={20} color={COLORS.mutedBrown} />
        <Text style={[TYPE.callout, { flex: 1, color: COLORS.mutedBrown, lineHeight: 20 }]}>
          No grooming sessions yet. Book a groomer from Services → Grooming; their
          before/after photos and coat notes will show up here.
        </Text>
      </Card>
    );
  }

  return (
    <View style={{ gap: SPACING.md + 2 }}>
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
    <Card level="none" style={{ padding: SPACING.lg }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: SPACING.md,
        }}
      >
        <Text
          style={[TYPE.body, { fontWeight: "800", color: COLORS.warmBrown }]}
          numberOfLines={1}
        >
          {session.provider_name || "Groomer"}
        </Text>
        {dateLabel ? (
          <Text style={[TYPE.footnote, { color: COLORS.mutedBrown }]}>{dateLabel}</Text>
        ) : null}
      </View>

      {before.length > 0 || after.length > 0 ? (
        <View style={{ flexDirection: "row", gap: SPACING.md }}>
          <PhotoStrip label="Before" urls={before} />
          <PhotoStrip label="After" urls={after} />
        </View>
      ) : null}

      {session.coat_skin_notes ? (
        <Text
          style={[TYPE.subhead, { color: COLORS.warmBrown, fontWeight: "500", lineHeight: 19, marginTop: SPACING.md }]}
        >
          {session.coat_skin_notes}
        </Text>
      ) : null}

      {session.products_used ? (
        <Text style={[TYPE.footnote, { color: COLORS.mutedBrown, marginTop: SPACING.xs + 2 }]}>
          Products: {session.products_used}
        </Text>
      ) : null}
    </Card>
  );
}

function PhotoStrip({ label, urls }) {
  return (
    <View style={{ flex: 1 }}>
      <Text
        style={[TYPE.overline, { color: COLORS.mutedBrown, marginBottom: SPACING.xs + 2, letterSpacing: 0.4 }]}
      >
        {label.toUpperCase()}
      </Text>
      {urls.length > 0 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: SPACING.xs + 2 }}>
          {urls.map((uri, i) => (
            <Image
              key={`${label}-${i}`}
              source={{ uri }}
              style={{
                width: 64,
                height: 64,
                borderRadius: RADIUS.control,
                backgroundColor: MATERIALS.surfaceSunken,
              }}
              contentFit="cover"
            />
          ))}
        </View>
      ) : (
        <View
          style={{
            height: 64,
            borderRadius: RADIUS.control,
            backgroundColor: MATERIALS.surfaceSunken,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Text style={[TYPE.caption, { color: COLORS.mutedBrown, letterSpacing: 0 }]}>—</Text>
        </View>
      )}
    </View>
  );
}
