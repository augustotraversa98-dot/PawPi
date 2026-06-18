import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { ChevronLeft, PawPrint, Search } from "lucide-react-native";
import { PetAvatar } from "@/components/Pets/PetAvatar";
import { useCurrentPet } from "@/hooks/usePetProfile";
import { useFollowList } from "@/hooks/usePetSocialProfile";

const C = {
  coral: "#FF6F61",
  peach: "#FFD9B3",
  cream: "#FFF7EF",
  sand: "#F8EBDD",
  card: "#FFFCF8",
  warmBrown: "#3B241B",
  mutedBrown: "#7A6254",
};

// Followers / Following list (ticket 2.61): a searchable list of pets with a paw
// follow/unfollow toggle; each row opens that pet's social profile. Real data +
// empty states; the toggle is optimistic and reverts on error. Reached from the
// tappable counts on the pet social profile (pet-profile.jsx) via the root stack
// so the 2.19 nav isn't corrupted.
export default function FollowsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams();
  const petId = params.petId || "";
  const rel = params.rel === "following" ? "following" : "followers";
  const title = rel === "following" ? "Following" : "Followers";

  const { data: currentPet } = useCurrentPet();
  const viewerPetId = currentPet?.id ?? null;

  const { data: pets = [], isLoading } = useFollowList(petId, rel, viewerPetId);

  const [query, setQuery] = useState("");
  // Local follow-state map seeded from the server flag; lets the toggle update
  // optimistically (and revert on error) without refetching the whole list.
  const [followState, setFollowState] = useState({});
  useEffect(() => {
    const seed = {};
    for (const p of pets) seed[p.id] = !!p.is_following;
    setFollowState(seed);
  }, [pets]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return pets;
    return pets.filter(
      (p) =>
        (p.name || "").toLowerCase().includes(q) ||
        (p.handle || "").toLowerCase().includes(q),
    );
  }, [pets, query]);

  const toggleFollow = async (row) => {
    if (!viewerPetId || row.id === viewerPetId) return; // can't follow yourself
    const wasFollowing = !!followState[row.id];
    setFollowState((s) => ({ ...s, [row.id]: !wasFollowing }));
    try {
      const res = await fetch(`/api/pets/${row.id}/follow`, {
        method: wasFollowing ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ followerPetId: viewerPetId }),
      });
      if (!res.ok) throw new Error("toggle failed");
    } catch (e) {
      // Revert the optimistic flip on failure.
      setFollowState((s) => ({ ...s, [row.id]: wasFollowing }));
    }
  };

  const openProfile = (row) => {
    router.push({
      pathname: "/pet-profile",
      params: {
        petId: String(row.id),
        dogName: row.name || "",
        petHandle: row.handle || "",
        avatar: row.avatar_url || "",
        ownerName: row.owner_name || "",
      },
    });
  };

  const renderRow = ({ item }) => {
    const isSelf = item.id === viewerPetId;
    const following = !!followState[item.id];
    return (
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingVertical: 10,
          paddingHorizontal: 16,
          gap: 12,
        }}
      >
        <TouchableOpacity
          testID={`follow-row-${item.id}`}
          onPress={() => openProfile(item)}
          activeOpacity={0.85}
          style={{ flexDirection: "row", alignItems: "center", gap: 12, flex: 1 }}
        >
          <PetAvatar uri={item.avatar_url || undefined} name={item.name} size={46} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: "800", color: C.warmBrown }}>
              {item.name || "Pet"}
            </Text>
            {!!item.handle && (
              <Text style={{ fontSize: 13, color: C.mutedBrown }}>
                @{item.handle}
              </Text>
            )}
          </View>
        </TouchableOpacity>

        {!isSelf && !!viewerPetId && (
          <TouchableOpacity
            testID={`follow-toggle-${item.id}`}
            onPress={() => toggleFollow(item)}
            activeOpacity={0.85}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 14,
              backgroundColor: following ? C.sand : C.coral,
              borderWidth: following ? 1.5 : 0,
              borderColor: C.peach,
            }}
          >
            <PawPrint size={15} color={following ? C.mutedBrown : "#FFF"} />
            <Text
              style={{
                fontSize: 13,
                fontWeight: "800",
                color: following ? C.mutedBrown : "#FFF",
              }}
            >
              {following ? "Following" : "Follow"}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const emptyText =
    query.trim().length > 0
      ? "No matches"
      : rel === "following"
        ? "Not following anyone yet"
        : "No followers yet";

  return (
    <View style={{ flex: 1, backgroundColor: C.cream }}>
      {/* Header */}
      <View
        style={{
          paddingTop: insets.top,
          paddingHorizontal: 16,
          paddingBottom: 12,
          backgroundColor: C.card,
          flexDirection: "row",
          alignItems: "center",
          borderBottomWidth: 1,
          borderBottomColor: C.peach,
        }}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          style={{ flexDirection: "row", alignItems: "center", gap: 4, padding: 6 }}
        >
          <ChevronLeft size={22} color={C.coral} />
          <Text style={{ color: C.coral, fontWeight: "700", fontSize: 15 }}>
            Back
          </Text>
        </TouchableOpacity>
        <Text
          style={{
            flex: 1,
            textAlign: "center",
            fontSize: 17,
            fontWeight: "800",
            color: C.warmBrown,
            marginRight: 70,
          }}
        >
          {title}
        </Text>
      </View>

      {/* Search */}
      <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            backgroundColor: C.sand,
            borderRadius: 14,
            paddingHorizontal: 12,
            paddingVertical: 10,
          }}
        >
          <Search size={18} color={C.mutedBrown} />
          <TextInput
            testID="follows-search"
            value={query}
            onChangeText={setQuery}
            placeholder="Search by name or @handle"
            placeholderTextColor={C.mutedBrown}
            style={{ flex: 1, fontSize: 15, color: C.warmBrown }}
          />
        </View>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderRow}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        ListEmptyComponent={
          isLoading ? null : (
            <Text
              testID="follows-empty"
              style={{
                textAlign: "center",
                color: C.mutedBrown,
                marginTop: 40,
                fontSize: 14,
              }}
            >
              {emptyText}
            </Text>
          )
        }
      />
    </View>
  );
}
