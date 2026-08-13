import React, { useState, useCallback } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter, useLocalSearchParams } from "expo-router";
import { ChevronLeft, PawPrint, Grid3X3, MessageCircle, Share2 } from "lucide-react-native";
import { PetAvatar } from "@/components/Pets/PetAvatar";
import { OwnerMenu } from "@/components/More/OwnerMenu";
import { RefreshableScrollView } from "@/components/RefreshableScrollView";
import { BarkModal } from "@/components/Feed/BarkModal";
import { PostDetailModal } from "@/components/Feed/PostDetailModal";
import { ModerationMenu } from "@/components/moderation/ModerationMenu";
import { SocialStatRow } from "@/components/social/SocialStatRow";
import { MomentsGrid } from "@/components/social/MomentsGrid";
import { useCurrentPet } from "@/hooks/usePetProfile";
import { CareRing } from "@/components/Health/CareRing";
import { StreakChip } from "@/components/Health/StreakChip";
import { MilestoneCountdownBanner } from "@/components/Feed/MilestoneCountdownBanner";
import { ShareCardDeck } from "@/components/Feed/ShareCardDeck";
import { useCareRing } from "@/hooks/useCareRing";
import { useTogglePaw, useUpdatePostCaption } from "@/hooks/useFeedPosts";
import {
  usePetSocialProfile,
  useToggleFollow,
} from "@/hooks/usePetSocialProfile";
import { useStartDM } from "@/hooks/useDMs";
import { getDisplayAge } from "@/utils/petAge";
import {
  COLORS,
  TYPE,
  RADIUS,
  SPACING,
  MATERIALS,
  ELEVATION,
} from "@/constants/theme";
import { Card, PressableScale } from "@/components/ui";

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
  const ageText = pet ? getDisplayAge(pet) || "" : params.age || "";

  const posts = profile?.posts || [];
  const isFollowing = !!profile?.isFollowing;

  // You can't follow your own pet (the server rejects it too), and there's
  // nothing to follow with when you have no active pet.
  const canFollow = !!viewerPetId && String(viewerPetId) !== String(petId);
  // The Care Ring on the header is the OWNER's own private ring — only for their own pet.
  const isOwnPet = !!petId && String(viewerPetId) === String(petId);
  const { data: careRing } = useCareRing(isOwnPet ? Number(petId) : null);

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
  const [shareDeckVisible, setShareDeckVisible] = useState(false);
  const { t } = useTranslation();
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

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.cream }}>
      {/* Header */}
      <View
        style={{
          paddingTop: insets.top,
          paddingHorizontal: SPACING.lg,
          paddingBottom: SPACING.md,
          backgroundColor: MATERIALS.surface,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottomWidth: 1,
          borderBottomColor: MATERIALS.hairline,
        }}
      >
        {embedded ? (
          // Profile TAB (2.60): no back — the burger holds the former More menu
          // + the My Dogs switcher, so nothing owner-level is orphaned.
          <View style={{ width: 70 }} />
        ) : (
          <PressableScale
            onPress={() => router.back()}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: SPACING.xs,
              padding: SPACING.xs + 2,
            }}
          >
            <ChevronLeft size={22} color={COLORS.coral} />
            <Text style={[TYPE.headline, { color: COLORS.coral }]}>
              Back
            </Text>
          </PressableScale>
        )}
        <Text style={[TYPE.headline, { color: COLORS.warmBrown, fontWeight: "800" }]}>
          {embedded ? "Profile" : "Pet profile"}
        </Text>
        {embedded ? (
          <OwnerMenu />
        ) : (
          // Report this pet profile / block its owner (T4). Hidden on your own pet.
          <View style={{ width: 70, alignItems: "flex-end" }}>
            <ModerationMenu
              targetType="pet_profile"
              targetId={petId ? Number(petId) : null}
              authorUserId={owner?.id}
              isOwn={!canFollow}
              onBlocked={() => router.back()}
            />
          </View>
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
            paddingTop: SPACING.xxxl,
            paddingBottom: SPACING.xxl,
            paddingHorizontal: SPACING.xxl,
            backgroundColor: MATERIALS.surface,
            borderBottomWidth: 1,
            borderBottomColor: MATERIALS.hairline,
          }}
        >
          {/* Avatar — the owner's own pet gets the live Care Ring (E1); others keep the coral ring */}
          {isOwnPet ? (
            <View
              style={{
                width: 128,
                height: 128,
                alignItems: "center",
                justifyContent: "center",
                marginBottom: SPACING.md + 2,
              }}
            >
              <View style={{ position: "absolute" }}>
                <CareRing
                  state={careRing}
                  size={128}
                  strokeWidth={7}
                  showCenter={false}
                  onPressSegment={(seg) =>
                    router.push(seg === "moment" ? "/(tabs)" : "/(tabs)/health")
                  }
                />
              </View>
              <PetAvatar uri={avatarUrl || undefined} size={104} />
            </View>
          ) : (
            <View
              style={{
                borderWidth: 3.5,
                borderColor: COLORS.coral,
                borderRadius: 62,
                padding: 3,
                marginBottom: SPACING.md + 2,
                shadowColor: COLORS.coral,
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.2,
                shadowRadius: 12,
              }}
            >
              <PetAvatar uri={avatarUrl || undefined} size={110} />
            </View>
          )}

          {/* Name */}
          {!!name && (
            <Text style={[TYPE.title, { color: COLORS.warmBrown }]}>
              {name}
            </Text>
          )}

          {/* Handle */}
          {!!handle && (
            <Text
              style={[TYPE.callout, { color: COLORS.coral, fontWeight: "700", marginTop: 2 }]}
            >
              @{handle}
            </Text>
          )}

          {/* Ring-close streak (E2) — own pet only; renders nothing at 0 */}
          {isOwnPet && (
            <StreakChip petId={Number(petId)} style={{ marginTop: SPACING.sm }} />
          )}

          {/* Milestone countdown (E3) — the 3 days before a birthday / gotcha day */}
          {isOwnPet && (
            <MilestoneCountdownBanner
              birthday={pet?.birthday}
              adoptionDate={pet?.adoption_date}
              petName={name}
              style={{ marginTop: SPACING.sm }}
            />
          )}

          {/* Share-card deck entry (E4) — own pet only */}
          {isOwnPet && (
            <TouchableOpacity
              onPress={() => setShareDeckVisible(true)}
              accessibilityRole="button"
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                marginTop: SPACING.md,
                paddingVertical: 8,
                paddingHorizontal: 16,
                borderRadius: 999,
                backgroundColor: COLORS.coral,
              }}
            >
              <Share2 size={16} color="#FFF" />
              <Text style={{ color: "#FFF", fontWeight: "800", fontSize: 13 }}>
                {t("share.openDeck")}
              </Text>
            </TouchableOpacity>
          )}

          {/* Breed + age */}
          {(!!breed || !!ageText) && (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: SPACING.xs + 2,
                marginTop: SPACING.xs,
              }}
            >
              {!!breed && (
                <Text style={[TYPE.body, { color: COLORS.coral, fontWeight: "600" }]}>
                  {breed}
                </Text>
              )}
              {!!breed && !!ageText && <Text style={{ color: COLORS.peach }}>·</Text>}
              {!!ageText && (
                <Text style={[TYPE.callout, { color: COLORS.mutedBrown }]}>
                  {ageText}
                </Text>
              )}
            </View>
          )}

          {/* Owner */}
          {!!ownerName && (
            <Text
              style={[TYPE.subhead, { color: COLORS.mutedBrown, marginTop: SPACING.xs }]}
            >
              with {ownerName}
            </Text>
          )}

          {/* Follow + Message — hidden on your own pet and when you have no
              active pet (the server rejects both too). */}
          {canFollow && (
            <View
              style={{
                marginTop: SPACING.lg + 2,
                flexDirection: "row",
                alignItems: "center",
                gap: SPACING.sm + 2,
              }}
            >
              <PressableScale
                onPress={handleToggleFollow}
                accessibilityRole="button"
                style={{
                  paddingVertical: SPACING.md + 1,
                  paddingHorizontal: SPACING.xxxl - 2,
                  borderRadius: RADIUS.control,
                  backgroundColor: isFollowing ? MATERIALS.surfaceSunken : COLORS.coral,
                  borderWidth: isFollowing ? 1.5 : 0,
                  borderColor: COLORS.peach,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: SPACING.sm,
                  ...(isFollowing ? {} : { shadowColor: COLORS.coral, ...ELEVATION.sm }),
                }}
              >
                <PawPrint size={18} color={isFollowing ? COLORS.mutedBrown : "#FFF"} />
                <Text
                  style={[
                    TYPE.headline,
                    { fontWeight: "800", color: isFollowing ? COLORS.mutedBrown : "#FFF" },
                  ]}
                >
                  {isFollowing ? "Following ✓" : "Follow +"}
                </Text>
              </PressableScale>

              {canMessage && (
                <PressableScale
                  onPress={handleMessage}
                  disabled={startDM.isPending}
                  testID="message-owner"
                  accessibilityRole="button"
                  style={{
                    paddingVertical: SPACING.md + 1,
                    paddingHorizontal: SPACING.xxl - 2,
                    borderRadius: RADIUS.control,
                    backgroundColor: MATERIALS.surfaceSunken,
                    borderWidth: 1.5,
                    borderColor: COLORS.peach,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: SPACING.sm,
                    opacity: startDM.isPending ? 0.6 : 1,
                  }}
                >
                  <MessageCircle size={18} color={COLORS.terracotta} />
                  <Text
                    style={[TYPE.headline, { fontWeight: "800", color: COLORS.terracotta }]}
                  >
                    Message
                  </Text>
                </PressableScale>
              )}
            </View>
          )}
        </View>

        {/* ── Stats strip (shared SocialStatRow — same row as the business storefront) ── */}
        <SocialStatRow
          stats={[
            { key: "posts", value: stats?.totalPosts ?? 0, label: "Daily posts" },
            {
              key: "paws",
              value: stats?.totalPaws ?? 0,
              label: "Paws",
              color: COLORS.coral,
            },
            { key: "barks", value: stats?.totalBarks ?? 0, label: "Barks" },
            {
              key: "followers",
              value: stats?.followers ?? 0,
              label: "Followers",
              color: COLORS.sageDark,
              onPress: resolvedFollowsPetId
                ? () => openFollows("followers")
                : undefined,
            },
            {
              key: "following",
              value: stats?.following ?? 0,
              label: "Following",
              onPress: resolvedFollowsPetId
                ? () => openFollows("following")
                : undefined,
            },
          ]}
        />

        {/* ── Daily posts grid ── */}
        <View style={{ padding: SPACING.lg }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: SPACING.sm,
              marginBottom: SPACING.md + 2,
            }}
          >
            <Grid3X3 size={18} color={COLORS.warmBrown} />
            <Text style={[TYPE.headline, { color: COLORS.warmBrown, fontWeight: "800" }]}>
              Daily moments
            </Text>
          </View>

          <MomentsGrid
            isLoading={isLoading}
            moments={posts.map((p) => ({
              id: p.id,
              imageUri: p.image_url,
              post: p,
              badge: {
                icon: <PawPrint size={10} color="#FFF" fill="#FFF" />,
                count: p.paw_count,
              },
            }))}
            onOpen={(m) => openMoment(m.post)}
            empty={
              <View
                style={{
                  alignItems: "center",
                  paddingVertical: SPACING.huge,
                  backgroundColor: MATERIALS.surface,
                  borderRadius: RADIUS.card,
                  borderWidth: 1,
                  borderColor: COLORS.peach,
                  borderStyle: "dashed",
                }}
              >
                <Text style={{ fontSize: 36 }}>🐾</Text>
                <Text
                  style={[TYPE.body, { color: COLORS.mutedBrown, fontWeight: "600", marginTop: SPACING.md }]}
                >
                  No daily posts yet
                </Text>
                <Text
                  style={[
                    TYPE.subhead,
                    {
                      color: COLORS.mutedBrown,
                      marginTop: SPACING.xs,
                      textAlign: "center",
                      paddingHorizontal: SPACING.xl,
                    },
                  ]}
                >
                  {name ? `${name}'s` : "These"} daily moments will appear here.
                </Text>
              </View>
            }
          />
        </View>

        {/* ── Pet info card ── */}
        <Card
          level="sm"
          style={{
            marginHorizontal: SPACING.lg,
            padding: SPACING.lg + 2,
            marginBottom: SPACING.sm + 2,
          }}
        >
          <Text
            style={[TYPE.headline, { color: COLORS.warmBrown, fontWeight: "800", marginBottom: SPACING.md + 2 }]}
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
                  paddingVertical: SPACING.sm + 2,
                  borderBottomWidth: 1,
                  borderBottomColor: MATERIALS.hairline,
                }}
              >
                <Text style={[TYPE.subhead, { color: COLORS.mutedBrown }]}>
                  {row.label}
                </Text>
                <Text style={[TYPE.subhead, { color: COLORS.warmBrown, fontWeight: "700" }]}>
                  {row.value}
                </Text>
              </View>
            ))}
        </Card>
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

      {/* ── SHARE-CARD DECK (E4) — own pet only ── */}
      {isOwnPet && (
        <ShareCardDeck
          visible={shareDeckVisible}
          onClose={() => setShareDeckVisible(false)}
          petId={Number(petId)}
          petDates={{ birthday: pet?.birthday, adoption_date: pet?.adoption_date }}
        />
      )}
    </View>
  );
}
