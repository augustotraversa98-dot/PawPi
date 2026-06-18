import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  Dimensions,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { ChevronLeft, PawPrint, Grid3X3, MessageCircle } from "lucide-react-native";
import { PetAvatar } from "@/components/Pets/PetAvatar";
import { OwnerMenu } from "@/components/More/OwnerMenu";
import { RefreshableScrollView } from "@/components/RefreshableScrollView";
import { BarkModal } from "@/components/Feed/BarkModal";
import { PostDetailModal } from "@/components/Feed/PostDetailModal";
import { useCurrentPet } from "@/hooks/usePetProfile";
import { useTogglePaw, useUpdatePostCaption } from "@/hooks/useFeedPosts";
import {
  usePetSocialProfile,
  useToggleFollow,
} from "@/hooks/usePetSocialProfile";
import { useStartDM } from "@/hooks/useDMs";

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

// Friendly age from the structured age_years / age_months columns.
function formatAge(years, months) {
  const y = Number(years) || 0;
  const m = Number(months) || 0;
  const parts = [];
  if (y > 0) parts.push(`${y} ${y === 1 ? "yr" : "yrs"}`);
  if (m > 0) parts.push(`${m} ${m === 1 ? "mo" : "mos"}`);
  return parts.join(" ");
}

export default function PetProfileScreen({ embedded = false }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams();

  // The real pet whose profile this is, plus the viewer's active pet (drives
  // isFollowing and gates the follow button).
  const { data: currentPet } = useCurrentPet();
  const viewerPetId = currentPet?.id;
  // In the Profile TAB (embedded, ticket 2.60) there's no route param — show the
  // viewer's own active pet. As a pushed route, use the param pet.
  const petId = params.petId || (embedded ? String(currentPet?.id ?? "") : "");
  const updateCaption = useUpdatePostCaption();

  const { data: profile, isLoading, refetch } = usePetSocialProfile(
    petId,
    viewerPetId,
  );
  const toggleFollow = useToggleFollow(petId);

  // Identity params are instant placeholders only while the fetch is in flight;
  // once data arrives we render entirely from the server. No fake defaults.
  const pet = profile?.pet;
  const owner = profile?.owner;
  const stats = profile?.stats;

  const name = pet?.name || params.dogName || "";
  const handle = pet?.handle || params.petHandle || "";
  const avatarUrl = pet?.avatar_url || params.avatar || "";
  const ownerName = pet
    ? owner?.full_name || owner?.username || ""
    : params.ownerName || "";
  const breed = pet?.breed ?? params.breed ?? "";
  const ageText = pet ? formatAge(pet.age_years, pet.age_months) : params.age || "";

  const posts = profile?.posts || [];
  const isFollowing = !!profile?.isFollowing;

  // You can't follow your own pet (the server rejects it too), and there's
  // nothing to follow with when you have no active pet.
  const canFollow = !!viewerPetId && String(viewerPetId) !== String(petId);

  // Message the OWNER (ticket 2.27) — same gate; needs the owner's user id. Starts
  // (or reuses) a 1:1 DM thread, then opens the conversation.
  const startDM = useStartDM();
  const canMessage = canFollow && !!owner?.id;
  const handleMessage = useCallback(async () => {
    if (!owner?.id) return;
    try {
      const { thread } = await startDM.mutateAsync({ otherUserId: owner.id });
      router.push({
        pathname: "/chat",
        params: {
          threadId: String(thread.id),
          otherUserId: String(owner.id),
          otherName: owner.full_name || owner.username || "Pet parent",
          otherAvatar: owner.avatar_url || "",
        },
      });
    } catch (e) {
      // Non-fatal: the button just no-ops on failure.
    }
  }, [owner, startDM, router]);

  // ── Post detail / bark modals (mirror the feed) ──
  const [detailPost, setDetailPost] = useState(null);
  const [barkPost, setBarkPost] = useState(null);
  const [likedPosts, setLikedPosts] = useState({});
  const togglePaw = useTogglePaw(detailPost?.id);

  // Compose the post object the modal expects from a grid item + this pet's
  // fetched identity.
  const openMoment = useCallback(
    (post) => {
      setDetailPost({
        ...post,
        pet_name: pet?.name,
        pet_handle: pet?.handle,
        pet_avatar: pet?.avatar_url,
        username: owner?.username,
      });
    },
    [pet, owner],
  );

  const handleToggleLike = useCallback(() => {
    if (!detailPost) return;
    const isPawed = !!likedPosts[detailPost.id];
    togglePaw.mutate({ isPawed });
    setLikedPosts((m) => ({ ...m, [detailPost.id]: !isPawed }));
    setDetailPost((prev) =>
      prev
        ? {
            ...prev,
            paw_count: isPawed
              ? Math.max(0, (prev.paw_count ?? 0) - 1)
              : (prev.paw_count ?? 0) + 1,
          }
        : prev,
    );
  }, [detailPost, likedPosts, togglePaw]);

  const handleToggleFollow = useCallback(() => {
    if (!canFollow) return;
    toggleFollow.mutate({ isFollowing, viewerPetId });
  }, [canFollow, isFollowing, viewerPetId, toggleFollow]);

  // Tapping Followers / Following opens the searchable list (ticket 2.61).
  // Resolve the pet robustly (ticket 2.67): the route param, else — in the
  // embedded Profile tab — the viewer's active pet. Never navigate with an empty
  // petId (that dead-taps and lands the list on no pet). The `follows` route is
  // a ROOT-stack screen, so an ABSOLUTE href string targets it reliably from
  // inside the (tabs) group (no relative-resolution surprise on device).
  const resolvedFollowsPetId = petId || (viewerPetId ? String(viewerPetId) : "");
  const openFollows = useCallback(
    (rel) => {
      if (!resolvedFollowsPetId) return; // currentPet still loading — graceful no-op
      router.navigate(
        `/follows?petId=${encodeURIComponent(resolvedFollowsPetId)}` +
          `&rel=${rel}&petName=${encodeURIComponent(name || "")}`,
      );
    },
    [resolvedFollowsPetId, name, router],
  );

  const StatPill = ({ value, label, color, onPress }) => {
    const inner = (
      <>
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
      </>
    );
    if (onPress) {
      return (
        <TouchableOpacity
          testID={`stat-${label}`}
          onPress={onPress}
          activeOpacity={0.7}
          style={{ alignItems: "center", flex: 1 }}
        >
          {inner}
        </TouchableOpacity>
      );
    }
    return <View style={{ alignItems: "center", flex: 1 }}>{inner}</View>;
  };

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
        {embedded ? (
          // Profile TAB (2.60): no back — the burger holds the former More menu
          // + the My Dogs switcher, so nothing owner-level is orphaned.
          <View style={{ width: 70 }} />
        ) : (
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
        )}
        <Text style={{ fontSize: 17, fontWeight: "800", color: C.warmBrown }}>
          {embedded ? "Profile" : "Pet profile"}
        </Text>
        {embedded ? (
          <OwnerMenu />
        ) : (
          <View style={{ width: 70 }} />
        )}
      </View>

      <RefreshableScrollView
        refetch={refetch}
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
            <PetAvatar uri={avatarUrl || undefined} size={110} />
          </View>

          {/* Name */}
          {!!name && (
            <Text
              style={{
                fontSize: 26,
                fontWeight: "800",
                color: C.warmBrown,
                letterSpacing: -0.5,
              }}
            >
              {name}
            </Text>
          )}

          {/* Handle */}
          {!!handle && (
            <Text
              style={{
                fontSize: 14,
                color: C.coral,
                fontWeight: "700",
                marginTop: 2,
              }}
            >
              @{handle}
            </Text>
          )}

          {/* Breed + age */}
          {(!!breed || !!ageText) && (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                marginTop: 4,
              }}
            >
              {!!breed && (
                <Text
                  style={{ fontSize: 15, color: C.coral, fontWeight: "600" }}
                >
                  {breed}
                </Text>
              )}
              {!!breed && !!ageText && <Text style={{ color: C.peach }}>·</Text>}
              {!!ageText && (
                <Text style={{ fontSize: 14, color: C.mutedBrown }}>
                  {ageText}
                </Text>
              )}
            </View>
          )}

          {/* Owner */}
          {!!ownerName && (
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
          )}

          {/* Follow + Message — hidden on your own pet and when you have no
              active pet (the server rejects both too). */}
          {canFollow && (
            <View
              style={{
                marginTop: 18,
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
              }}
            >
              <TouchableOpacity
                onPress={handleToggleFollow}
                style={{
                  paddingVertical: 13,
                  paddingHorizontal: 30,
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
                  {isFollowing ? "Following ✓" : "Follow +"}
                </Text>
              </TouchableOpacity>

              {canMessage && (
                <TouchableOpacity
                  onPress={handleMessage}
                  disabled={startDM.isPending}
                  testID="message-owner"
                  style={{
                    paddingVertical: 13,
                    paddingHorizontal: 22,
                    borderRadius: 18,
                    backgroundColor: C.sand,
                    borderWidth: 1.5,
                    borderColor: C.peach,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <MessageCircle size={18} color={C.terracotta} />
                  <Text
                    style={{ fontWeight: "800", fontSize: 15, color: C.terracotta }}
                  >
                    Message
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}
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
          <StatPill value={stats?.totalPosts ?? 0} label="Daily posts" />
          <View style={{ width: 1, backgroundColor: C.peach }} />
          <StatPill
            value={stats?.totalPaws ?? 0}
            label="Paws"
            color={C.coral}
          />
          <View style={{ width: 1, backgroundColor: C.peach }} />
          <StatPill value={stats?.totalBarks ?? 0} label="Barks" />
          <View style={{ width: 1, backgroundColor: C.peach }} />
          <StatPill
            value={stats?.followers ?? 0}
            label="Followers"
            color={C.sageDark}
            onPress={
              resolvedFollowsPetId ? () => openFollows("followers") : undefined
            }
          />
          <View style={{ width: 1, backgroundColor: C.peach }} />
          <StatPill
            value={stats?.following ?? 0}
            label="Following"
            onPress={
              resolvedFollowsPetId ? () => openFollows("following") : undefined
            }
          />
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

          {isLoading && posts.length === 0 ? (
            <View style={{ alignItems: "center", paddingVertical: 40 }}>
              <ActivityIndicator size="large" color={C.coral} />
            </View>
          ) : posts.length > 0 ? (
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: 4,
              }}
            >
              {posts.map((p) => (
                <TouchableOpacity
                  key={p.id}
                  activeOpacity={0.88}
                  onPress={() => openMoment(p)}
                  style={{ position: "relative" }}
                >
                  <Image
                    source={{ uri: p.image_url }}
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
                      {p.paw_count}
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
                {name ? `${name}'s` : "These"} daily moments will appear here.
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
            About {name}
          </Text>
          {[
            breed ? { label: "Breed", value: breed } : null,
            ageText ? { label: "Age", value: ageText } : null,
            ownerName ? { label: "Owner", value: ownerName } : null,
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
      </RefreshableScrollView>

      {/* ── POST DETAIL MODAL ── */}
      <PostDetailModal
        visible={!!detailPost}
        post={detailPost}
        liked={detailPost ? !!likedPosts[detailPost.id] : false}
        canEdit={!!detailPost && detailPost.pet_id === viewerPetId}
        onSaveCaption={(caption) =>
          updateCaption.mutateAsync({ postId: detailPost.id, caption })
        }
        onClose={() => setDetailPost(null)}
        onToggleLike={handleToggleLike}
        onOpenBarks={() => {
          setBarkPost(detailPost);
          setDetailPost(null);
        }}
        onOpenProfile={() => setDetailPost(null)}
      />

      {/* ── BARK MODAL ── */}
      <BarkModal
        visible={!!barkPost}
        post={barkPost}
        onClose={() => setBarkPost(null)}
        onBarkAdded={() => refetch()}
      />
    </View>
  );
}
