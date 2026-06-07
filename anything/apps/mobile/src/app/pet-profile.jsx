import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import {
  ChevronLeft,
  PawPrint,
  Megaphone,
  MapPin,
  Heart,
  Users,
  Grid3X3,
} from "lucide-react-native";
import { PetAvatar } from "@/components/Pets/PetAvatar";

const { width: SCREEN_W } = Dimensions.get("window");
const IMG_SIZE = (SCREEN_W - 32 - 8) / 3;

const C = {
  coral: "#FF6F61",
  apricot: "#FFB37A",
  peach: "#FFD9B3",
  honey: "#FFC857",
  terracotta: "#B75D32",
  sage: "#A7BFA3",
  sageDark: "#5A8A74",
  cream: "#FFF7EF",
  sand: "#F8EBDD",
  card: "#FFFCF8",
  warmBrown: "#3B241B",
  mutedBrown: "#7A6254",
};

export default function PetProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams();
  const [isFollowing, setIsFollowing] = useState(false);

  const {
    // Real identity of this dog. The stats/daily-moments data fetch keyed on
    // these is a separate Dog Social Profile ticket; passed through here so the
    // tap target carries the real pet_id/handle.
    petId = "",
    petHandle = "",
    dogName = "Buddy",
    ownerName = "Alice",
    avatar = "",
    breed = "Mixed Breed",
    age = "",
    bio = "",
    location = "",
    totalPosts = "0",
    totalPaws = "0",
    totalBarks = "0",
    friends = "0",
  } = params;

  // Real daily moments only — no stock/placeholder images. Until the data-fetch
  // ticket lands, none are passed and the empty state below is shown.
  let gridPosts = [];
  try {
    gridPosts = params.pastPosts ? JSON.parse(params.pastPosts) : [];
  } catch (e) {
    gridPosts = [];
  }

  const StatPill = ({ value, label, color }) => (
    <View style={{ alignItems: "center", flex: 1 }}>
      <Text
        style={{
          fontSize: 20,
          fontWeight: "800",
          color: color || C.warmBrown,
          letterSpacing: -0.5,
        }}
      >
        {value}
      </Text>
      <Text
        style={{
          fontSize: 11,
          color: C.mutedBrown,
          marginTop: 2,
          fontWeight: "600",
        }}
      >
        {label}
      </Text>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: C.cream }}>
      {/* Header */}
      <View
        style={{
          paddingTop: insets.top,
          paddingHorizontal: 16,
          paddingBottom: 14,
          backgroundColor: C.card,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottomWidth: 1,
          borderBottomColor: C.peach,
        }}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            padding: 6,
          }}
        >
          <ChevronLeft size={22} color={C.coral} />
          <Text style={{ color: C.coral, fontWeight: "700", fontSize: 15 }}>
            Back
          </Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 17, fontWeight: "800", color: C.warmBrown }}>
          Pet profile
        </Text>
        <View style={{ width: 70 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 30 }}
      >
        {/* ── Hero section ── */}
        <View
          style={{
            alignItems: "center",
            paddingTop: 30,
            paddingBottom: 24,
            paddingHorizontal: 24,
            backgroundColor: C.card,
            borderBottomWidth: 1,
            borderBottomColor: C.peach,
          }}
        >
          {/* Avatar with coral ring */}
          <View
            style={{
              borderWidth: 3.5,
              borderColor: C.coral,
              borderRadius: 62,
              padding: 3,
              marginBottom: 14,
              shadowColor: C.coral,
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.2,
              shadowRadius: 12,
            }}
          >
            <PetAvatar uri={avatar || undefined} size={110} />
          </View>

          {/* Name + breed */}
          <Text
            style={{
              fontSize: 26,
              fontWeight: "800",
              color: C.warmBrown,
              letterSpacing: -0.5,
            }}
          >
            {dogName}
          </Text>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              marginTop: 4,
            }}
          >
            <Text style={{ fontSize: 15, color: C.coral, fontWeight: "600" }}>
              {breed}
            </Text>
            {age ? (
              <>
                <Text style={{ color: C.peach }}>·</Text>
                <Text style={{ fontSize: 14, color: C.mutedBrown }}>{age}</Text>
              </>
            ) : null}
          </View>

          {/* Owner */}
          <Text
            style={{
              fontSize: 13,
              color: C.mutedBrown,
              marginTop: 4,
              fontWeight: "600",
            }}
          >
            with {ownerName}
          </Text>

          {/* Location */}
          {!!location && (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 5,
                marginTop: 8,
              }}
            >
              <MapPin size={13} color={C.mutedBrown} />
              <Text style={{ fontSize: 13, color: C.mutedBrown }}>
                {location}
              </Text>
            </View>
          )}

          {/* Bio */}
          {!!bio && (
            <View
              style={{
                backgroundColor: C.sand,
                borderRadius: 16,
                paddingHorizontal: 16,
                paddingVertical: 12,
                marginTop: 14,
                width: "100%",
                borderWidth: 1,
                borderColor: C.peach,
              }}
            >
              <Text
                style={{
                  fontSize: 14,
                  color: C.warmBrown,
                  textAlign: "center",
                  lineHeight: 21,
                  fontStyle: "italic",
                }}
              >
                "{bio}"
              </Text>
            </View>
          )}

          {/* Follow button */}
          <TouchableOpacity
            onPress={() => setIsFollowing((f) => !f)}
            style={{
              marginTop: 18,
              paddingVertical: 13,
              paddingHorizontal: 36,
              borderRadius: 18,
              backgroundColor: isFollowing ? C.sand : C.coral,
              borderWidth: isFollowing ? 1.5 : 0,
              borderColor: C.peach,
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              shadowColor: isFollowing ? "transparent" : C.coral,
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.3,
              shadowRadius: 8,
            }}
          >
            <PawPrint size={18} color={isFollowing ? C.mutedBrown : "#FFF"} />
            <Text
              style={{
                fontWeight: "800",
                fontSize: 15,
                color: isFollowing ? C.mutedBrown : "#FFF",
              }}
            >
              {isFollowing ? "Pet friend ✓" : "Pet friend +"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── Stats strip ── */}
        <View
          style={{
            backgroundColor: C.card,
            flexDirection: "row",
            paddingVertical: 18,
            paddingHorizontal: 12,
            borderBottomWidth: 1,
            borderBottomColor: C.peach,
            gap: 0,
          }}
        >
          <StatPill value={totalPosts} label="Daily posts" />
          <View style={{ width: 1, backgroundColor: C.peach }} />
          <StatPill value={totalPaws} label="Paws" color={C.coral} />
          <View style={{ width: 1, backgroundColor: C.peach }} />
          <StatPill value={totalBarks} label="Barks" />
          <View style={{ width: 1, backgroundColor: C.peach }} />
          <StatPill value={friends} label="Pet friends" color={C.sageDark} />
        </View>

        {/* ── Daily posts grid ── */}
        <View style={{ padding: 16 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              marginBottom: 14,
            }}
          >
            <Grid3X3 size={18} color={C.warmBrown} />
            <Text
              style={{
                fontSize: 16,
                fontWeight: "800",
                color: C.warmBrown,
                letterSpacing: -0.2,
              }}
            >
              Daily moments
            </Text>
          </View>

          {gridPosts.length > 0 ? (
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: 4,
              }}
            >
              {gridPosts.map((p) => (
                <TouchableOpacity
                  key={p.id}
                  activeOpacity={0.88}
                  style={{ position: "relative" }}
                >
                  <Image
                    source={{ uri: p.photo }}
                    style={{
                      width: IMG_SIZE,
                      height: IMG_SIZE,
                      borderRadius: 12,
                      backgroundColor: C.sand,
                    }}
                    resizeMode="cover"
                  />
                  {/* Paw count badge */}
                  <View
                    style={{
                      position: "absolute",
                      bottom: 6,
                      left: 6,
                      flexDirection: "row",
                      alignItems: "center",
                      backgroundColor: "rgba(59,36,27,0.6)",
                      borderRadius: 10,
                      paddingHorizontal: 7,
                      paddingVertical: 3,
                      gap: 3,
                    }}
                  >
                    <PawPrint size={10} color="#FFF" fill="#FFF" />
                    <Text
                      style={{ fontSize: 11, color: "#FFF", fontWeight: "700" }}
                    >
                      {p.paws}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <View
              style={{
                alignItems: "center",
                paddingVertical: 40,
                backgroundColor: C.card,
                borderRadius: 20,
                borderWidth: 1,
                borderColor: C.peach,
                borderStyle: "dashed",
              }}
            >
              <Text style={{ fontSize: 36 }}>🐾</Text>
              <Text
                style={{
                  color: C.mutedBrown,
                  fontSize: 15,
                  fontWeight: "600",
                  marginTop: 12,
                }}
              >
                No daily posts yet
              </Text>
              <Text
                style={{
                  color: C.mutedBrown,
                  fontSize: 13,
                  marginTop: 4,
                  textAlign: "center",
                  paddingHorizontal: 20,
                }}
              >
                {dogName}'s daily moments will appear here.
              </Text>
            </View>
          )}
        </View>

        {/* ── Pet info card ── */}
        <View
          style={{
            marginHorizontal: 16,
            backgroundColor: C.card,
            borderRadius: 22,
            padding: 18,
            borderWidth: 1,
            borderColor: C.peach,
            shadowColor: C.terracotta,
            shadowOffset: { width: 0, height: 3 },
            shadowOpacity: 0.06,
            shadowRadius: 12,
            marginBottom: 10,
          }}
        >
          <Text
            style={{
              fontSize: 15,
              fontWeight: "800",
              color: C.warmBrown,
              marginBottom: 14,
            }}
          >
            About {dogName}
          </Text>
          {[
            { label: "Breed", value: breed || "Unknown" },
            { label: "Age", value: age || "Unknown" },
            { label: "Owner", value: ownerName },
            location ? { label: "Location", value: location } : null,
          ]
            .filter(Boolean)
            .map((row) => (
              <View
                key={row.label}
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  paddingVertical: 10,
                  borderBottomWidth: 1,
                  borderBottomColor: C.peach,
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    color: C.mutedBrown,
                    fontWeight: "600",
                  }}
                >
                  {row.label}
                </Text>
                <Text
                  style={{
                    fontSize: 13,
                    color: C.warmBrown,
                    fontWeight: "700",
                  }}
                >
                  {row.value}
                </Text>
              </View>
            ))}
        </View>
      </ScrollView>
    </View>
  );
}
