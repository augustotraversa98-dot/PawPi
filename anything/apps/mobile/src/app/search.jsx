import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  X,
  Search,
  PawPrint,
  Megaphone,
  MapPin,
  UserPlus,
  Sparkles,
} from "lucide-react-native";
import { useRouter } from "expo-router";
import { COLORS } from "@/constants/colors";
import useSocialPetStore from "@/store/socialPetStore";
import {
  mockPopularProfiles,
  mockPopularPetMoments,
} from "@/data/mockDiscoveryData";

export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");

  const popularProfiles = useSocialPetStore((state) => state.popularProfiles);
  const setPopularProfiles = useSocialPetStore(
    (state) => state.setPopularProfiles,
  );
  const popularPetMoments = useSocialPetStore(
    (state) => state.popularPetMoments,
  );
  const setPopularPetMoments = useSocialPetStore(
    (state) => state.setPopularPetMoments,
  );

  // Load mock data on first render
  useEffect(() => {
    if (popularProfiles.length === 0) {
      setPopularProfiles(mockPopularProfiles);
    }
    if (popularPetMoments.length === 0) {
      setPopularPetMoments(mockPopularPetMoments);
    }
  }, []);

  // Filter profiles based on search
  const filteredProfiles = searchQuery.trim()
    ? popularProfiles.filter((profile) => {
        const query = searchQuery.toLowerCase();
        return (
          profile.petName.toLowerCase().includes(query) ||
          profile.ownerName.toLowerCase().includes(query) ||
          profile.breed.toLowerCase().includes(query) ||
          (profile.location && profile.location.toLowerCase().includes(query))
        );
      })
    : popularProfiles;

  const handleProfileTap = (profile) => {
    router.push({
      pathname: "/pet-profile",
      params: {
        dogName: profile.petName,
        ownerName: profile.ownerName,
        avatar: profile.avatar,
        breed: profile.breed || "",
        age: profile.age || "",
        bio: profile.bio || "",
        location: profile.location || "",
        totalPosts: String(profile.dailyPosts || 0),
        totalPaws: String(profile.paws || 0),
        totalBarks: String(profile.barks || 0),
        friends: String(0),
        pastPosts: JSON.stringify([]),
      },
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.cream }}>
      {/* Header */}
      <View
        style={{
          paddingTop: insets.top + 6,
          paddingHorizontal: 20,
          paddingBottom: 14,
          backgroundColor: COLORS.card,
          borderBottomWidth: 1,
          borderBottomColor: COLORS.peach,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 14,
          }}
        >
          <TouchableOpacity onPress={() => router.back()}>
            <X size={22} color={COLORS.mutedBrown} />
          </TouchableOpacity>
          <Text
            style={{
              fontSize: 18,
              fontWeight: "800",
              color: COLORS.warmBrown,
              letterSpacing: -0.3,
            }}
          >
            Search & Discover
          </Text>
          <View style={{ width: 22 }} />
        </View>

        {/* Search input */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: COLORS.sand,
            borderRadius: 16,
            paddingHorizontal: 14,
            paddingVertical: 12,
            borderWidth: 1,
            borderColor: COLORS.peach,
            gap: 10,
          }}
        >
          <Search size={18} color={COLORS.mutedBrown} />
          <TextInput
            style={{
              flex: 1,
              fontSize: 15,
              color: COLORS.warmBrown,
              padding: 0,
            }}
            placeholder="Search dogs, breeds, or pet parents…"
            placeholderTextColor={COLORS.mutedBrown}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoFocus
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery("")}>
              <X size={16} color={COLORS.mutedBrown} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
      >
        {/* Popular Profiles */}
        <View style={{ paddingTop: 20 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 20,
              paddingBottom: 14,
              gap: 6,
            }}
          >
            <PawPrint size={14} color={COLORS.terracotta} />
            <Text
              style={{
                fontSize: 12,
                fontWeight: "800",
                color: COLORS.mutedBrown,
                letterSpacing: 0.7,
              }}
            >
              {searchQuery.trim() ? "SEARCH RESULTS" : "POPULAR PROFILES"}
            </Text>
          </View>

          {filteredProfiles.length === 0 ? (
            <View style={{ alignItems: "center", paddingVertical: 50 }}>
              <Text style={{ fontSize: 40 }}>🔍</Text>
              <Text
                style={{
                  fontSize: 15,
                  fontWeight: "600",
                  color: COLORS.mutedBrown,
                  marginTop: 12,
                }}
              >
                No profiles found
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  color: COLORS.mutedBrown,
                  marginTop: 4,
                }}
              >
                Try a different search term
              </Text>
            </View>
          ) : (
            filteredProfiles.map((profile) => (
              <TouchableOpacity
                key={profile.id}
                onPress={() => handleProfileTap(profile)}
                style={{
                  marginHorizontal: 16,
                  marginBottom: 12,
                  backgroundColor: COLORS.card,
                  borderRadius: 20,
                  padding: 16,
                  flexDirection: "row",
                  gap: 14,
                  borderWidth: 1,
                  borderColor: COLORS.peach,
                  shadowColor: COLORS.terracotta,
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.06,
                  shadowRadius: 8,
                  elevation: 2,
                }}
              >
                <Image
                  source={{ uri: profile.avatar }}
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 32,
                    borderWidth: 2.5,
                    borderColor: COLORS.coral,
                  }}
                  transition={100}
                />

                <View style={{ flex: 1, justifyContent: "center" }}>
                  <Text
                    style={{
                      fontSize: 16,
                      fontWeight: "800",
                      color: COLORS.warmBrown,
                      marginBottom: 2,
                    }}
                  >
                    {profile.petName}
                  </Text>
                  <Text
                    style={{
                      fontSize: 13,
                      color: COLORS.mutedBrown,
                      marginBottom: 6,
                    }}
                  >
                    {profile.breed} • by {profile.ownerName}
                  </Text>
                  {profile.location && (
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 4,
                        marginBottom: 8,
                      }}
                    >
                      <MapPin size={11} color={COLORS.sage} />
                      <Text
                        style={{
                          fontSize: 11,
                          color: COLORS.sageDark,
                          fontWeight: "600",
                        }}
                      >
                        {profile.location}
                      </Text>
                    </View>
                  )}
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 12,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <PawPrint
                        size={12}
                        color={COLORS.coral}
                        fill={COLORS.coral}
                      />
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: "700",
                          color: COLORS.mutedBrown,
                        }}
                      >
                        {profile.paws}
                      </Text>
                    </View>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <Megaphone size={11} color={COLORS.terracotta} />
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: "700",
                          color: COLORS.mutedBrown,
                        }}
                      >
                        {profile.barks}
                      </Text>
                    </View>
                    <Text
                      style={{
                        fontSize: 11,
                        color: COLORS.mutedBrown,
                      }}
                    >
                      {profile.dailyPosts} posts
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={{
                    backgroundColor: COLORS.coral,
                    borderRadius: 14,
                    width: 36,
                    height: 36,
                    justifyContent: "center",
                    alignItems: "center",
                    alignSelf: "center",
                  }}
                >
                  <UserPlus size={18} color="#FFF" />
                </TouchableOpacity>
              </TouchableOpacity>
            ))
          )}
        </View>

        {/* Pet Moments Near You */}
        {!searchQuery.trim() && popularPetMoments.length > 0 && (
          <View style={{ paddingTop: 24 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: 20,
                paddingBottom: 14,
                gap: 6,
              }}
            >
              <Sparkles size={14} color={COLORS.honey} />
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: "800",
                  color: COLORS.mutedBrown,
                  letterSpacing: 0.7,
                }}
              >
                POPULAR PET MOMENTS
              </Text>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{
                paddingHorizontal: 16,
                gap: 12,
              }}
              style={{ flexGrow: 0 }}
            >
              {popularPetMoments.map((moment) => (
                <TouchableOpacity
                  key={moment.id}
                  style={{
                    width: 200,
                    backgroundColor: COLORS.card,
                    borderRadius: 18,
                    overflow: "hidden",
                    borderWidth: 1,
                    borderColor: COLORS.peach,
                    shadowColor: COLORS.terracotta,
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.08,
                    shadowRadius: 8,
                    elevation: 2,
                  }}
                >
                  <Image
                    source={{ uri: moment.photo }}
                    style={{ width: "100%", height: 140 }}
                    contentFit="cover"
                    transition={100}
                  />
                  <View style={{ padding: 12 }}>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                        marginBottom: 8,
                      }}
                    >
                      <Image
                        source={{ uri: moment.petAvatar }}
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 14,
                          borderWidth: 1.5,
                          borderColor: COLORS.coral,
                        }}
                        transition={100}
                      />
                      <View style={{ flex: 1 }}>
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: "800",
                            color: COLORS.warmBrown,
                          }}
                        >
                          {moment.petName}
                        </Text>
                        <Text
                          style={{
                            fontSize: 10,
                            color: COLORS.mutedBrown,
                          }}
                        >
                          {moment.timestamp}
                        </Text>
                      </View>
                    </View>
                    <Text
                      style={{
                        fontSize: 12,
                        color: COLORS.warmBrown,
                        lineHeight: 17,
                        marginBottom: 10,
                      }}
                      numberOfLines={2}
                    >
                      {moment.caption}
                    </Text>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 14,
                      }}
                    >
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        <PawPrint
                          size={13}
                          color={COLORS.coral}
                          fill={COLORS.coral}
                        />
                        <Text
                          style={{
                            fontSize: 12,
                            fontWeight: "700",
                            color: COLORS.mutedBrown,
                          }}
                        >
                          {moment.paws}
                        </Text>
                      </View>
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        <Megaphone size={12} color={COLORS.terracotta} />
                        <Text
                          style={{
                            fontSize: 12,
                            fontWeight: "700",
                            color: COLORS.mutedBrown,
                          }}
                        >
                          {moment.barks}
                        </Text>
                      </View>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
