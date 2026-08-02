import React, { useState, useCallback } from "react";
import { View, ActivityIndicator, Text, Alert } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { RotateCcw } from "lucide-react-native";
import { COLORS, TYPE, RADIUS, SPACING, ELEVATION } from "@/constants/theme";
import { PressableScale } from "@/components/ui";
import { RefreshableScrollView } from "@/components/RefreshableScrollView";
import { FeedHeader } from "@/components/Feed/FeedHeader";
import { DailyPromptCard } from "@/components/Feed/DailyPromptCard";
import { LockedFeedOverlay, LockedFloatingCard } from "@/components/Feed/LockedFeedOverlay";
import { UnlockedFeed } from "@/components/Feed/UnlockedFeed";
import { PostComposerModal } from "@/components/Feed/PostComposerModal";
import { BarkModal } from "@/components/Feed/BarkModal";
import { PostDetailModal } from "@/components/Feed/PostDetailModal";
import { useFeedData } from "@/hooks/useFeedData";
import { useFeedSuggestions } from "@/hooks/useFeedSuggestions";
import { usePostingStreak, useUpdatePostCaption } from "@/hooks/useFeedPosts";

export default function FeedScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const {
    petProfile,
    petName,
    hasPostedToday,
    feedUnlocked,
    todayPostId,
    todayDailyUpdatePost,
    posts,
    likedPosts,
    handlePost,
    handleToggleLike,
    handleBarkAdded,
    handleDeletePost,
    refetchPosts,
    refetchTodayDailyUpdate,
    loadingPosts,
    postsError,
    uploading,
  } = useFeedData();

  // Posting streak for the active pet (ticket 2.37) — the 🔥 badge shows on its
  // own cards. Other pets' streaks aren't fetched (bounded to one query).
  const { streak: activeStreak } = usePostingStreak(petProfile?.id);
  const streakByPetId = petProfile?.id
    ? { [petProfile.id]: activeStreak }
    : {};

  // Phase 2 ticket 2.13 — public provider/adoption suggestion cards, interleaved into the
  // UNLOCKED feed at a capped cadence. Independent query from the posts feed (never disturbs the
  // BeReal lock or the Following/Suggested ordering).
  const { data: suggestions } = useFeedSuggestions();

  // Modal states — each isolated from the other
  const [composerVisible, setComposerVisible] = useState(false);
  const [barkPost, setBarkPost] = useState(null);
  const [detailPost, setDetailPost] = useState(null);

  // Height of the daily-prompt card, measured on layout. The locked floating
  // card is pinned just below it so they never overlap at rest; once the user
  // scrolls, the prompt slides away and the floating card stays put over the
  // blurred feed.
  const [promptHeight, setPromptHeight] = useState(0);

  // ── Navigate to pet profile ──
  const openProfile = useCallback(
    (post) => {
      router.push({
        pathname: "/pet-profile",
        params: {
          // Real identity of the tapped dog — the source of truth for the
          // separate Dog Social Profile data-fetch ticket.
          petId: String(post.pet_id ?? ""),
          petHandle: post.pet_handle || "",
          dogName: post.pet_name || post.dogName,
          ownerName: post.username || post.ownerName,
          avatar: post.pet_avatar || post.avatar || "",
          breed: post.breed || "",
          age: post.age || "",
          bio: post.bio || "",
          location: post.location || "",
          totalPosts: String(post.totalPosts || 0),
          totalPaws: String(post.totalPaws || 0),
          totalBarks: String(post.totalBarks || 0),
          friends: String(post.friends || 0),
        },
      });
    },
    [router],
  );

  // ── Open a provider's public profile (2.13 suggestion card tap) ──
  const openProvider = useCallback(
    (provider) => {
      if (!provider?.slug) return;
      router.push({
        pathname: "/service/provider",
        params: { slug: String(provider.slug) },
      });
    },
    [router],
  );

  // ── Open a SPECIFIC adoption listing (2.30 deep-link) — the "Adopt me" card opens
  //    that exact dog's detail, not the generic hub. Routes into the root-level service/
  //    stack (2.19), so the More tab is never buried. Falls back to the hub if the card
  //    lacks ids. ──
  const openAdoption = useCallback(
    (item) => {
      if (item?.id != null && item?.provider_id != null) {
        router.push({
          pathname: "/service/adoption",
          params: {
            listingId: String(item.id),
            providerId: String(item.provider_id),
          },
        });
      } else {
        router.push("/service/adoption");
      }
    },
    [router],
  );

  // ── View today's post ──
  // Open the real post. Prefer the copy already in the feed (own posts now appear
  // there, ticket 2.36); fall back to the today's-daily object from the API so it
  // opens even before the feed refetch lands.
  const handleViewTodayPost = useCallback(() => {
    if (!todayPostId) return;
    const post =
      posts.find((p) => p.id === todayPostId) || todayDailyUpdatePost || null;
    if (post) {
      setDetailPost(post);
    }
  }, [todayPostId, posts, todayDailyUpdatePost]);

  // ── Edit own post caption (ticket 2.65) ──
  const updateCaption = useUpdatePostCaption();

  // ── Delete own post (confirm first) ──
  const handleConfirmDelete = useCallback(
    (post) => {
      if (!post?.id) return;
      Alert.alert(
        "Delete post?",
        "This permanently removes the post. You can post a new daily photo afterwards.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              setDetailPost(null);
              await handleDeletePost(post.id);
            },
          },
        ],
      );
    },
    [handleDeletePost],
  );

  const handleBarkAddedWithUpdate = useCallback(
    (postId, newCount) => {
      handleBarkAdded(postId, newCount);
      // Also update detailPost if open
      setDetailPost((prev) =>
        prev && prev.id === postId ? { ...prev, bark_count: newCount } : prev,
      );
    },
    [handleBarkAdded],
  );

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.cream }}>
      <FeedHeader />

      {loadingPosts ? (
        <View
          style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
        >
          <ActivityIndicator size="large" color={COLORS.coral} />
          <Text style={[TYPE.callout, { color: COLORS.mutedBrown, marginTop: SPACING.md, fontWeight: "600" }]}>
            Loading posts...
          </Text>
        </View>
      ) : postsError && posts.length === 0 ? (
        // The feed FAILED to load (not just empty) and we have nothing cached —
        // show a real error + Retry so an outage never reads as "no posts yet".
        <View
          style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: SPACING.huge }}
        >
          <Text style={{ fontSize: 40 }}>🐾</Text>
          <Text
            style={[
              TYPE.headline,
              { color: COLORS.warmBrown, fontWeight: "800", marginTop: SPACING.md, textAlign: "center" },
            ]}
          >
            {t("common.somethingWrong")}
          </Text>
          <PressableScale
            onPress={() => refetchPosts()}
            accessibilityRole="button"
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: SPACING.sm,
              marginTop: SPACING.lg,
              paddingHorizontal: SPACING.xl,
              paddingVertical: SPACING.md,
              borderRadius: RADIUS.control,
              backgroundColor: COLORS.coral,
            }}
          >
            <RotateCcw size={16} color="#FFF" />
            <Text style={[TYPE.subhead, { color: "#FFF", fontWeight: "800" }]}>
              {t("common.retry")}
            </Text>
          </PressableScale>
        </View>
      ) : (
        // Relative container so the locked floating card can be an absolute
        // SIBLING of the ScrollView — pinned over the blurred feed while it
        // scrolls behind, rather than scrolling away inside the content.
        <View style={{ flex: 1 }}>
          <RefreshableScrollView
            testID="feed-scroll"
            // While locked the feed is a STATIC blurred backdrop behind the
            // floating card — no scroll and no pull-to-refresh. Both come back
            // fully once unlocked.
            scrollEnabled={feedUnlocked}
            refetch={feedUnlocked ? [refetchPosts, refetchTodayDailyUpdate] : []}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 60 }}
          >
            {/* ── Daily Prompt Card ── */}
            <View onLayout={(e) => setPromptHeight(e.nativeEvent.layout.height)}>
              <DailyPromptCard
                petName={petName}
                hasPostedToday={hasPostedToday}
                todayPostId={todayPostId}
                onPostPress={() => setComposerVisible(true)}
                onViewTodayPost={handleViewTodayPost}
              />
            </View>

            {/* ── Feed: locked or unlocked ──
                Lock is per-OWNER: unlocked once any of the user's dogs posted
                today. The DailyPromptCard above stays per-active-pet. While
                locked this renders the blurred, scrollable background; the
                floating lock card is pinned over it (below). */}
            {!feedUnlocked ? (
              <LockedFeedOverlay
                posts={posts}
                petName={petName}
                onPostPress={() => setComposerVisible(true)}
              />
            ) : (
              <UnlockedFeed
                posts={posts}
                likedPosts={likedPosts}
                onToggleLike={handleToggleLike}
                onOpenBarks={setBarkPost}
                onOpenDetail={setDetailPost}
                onOpenProfile={openProfile}
                suggestions={suggestions}
                onOpenProvider={openProvider}
                onOpenAdoption={openAdoption}
                streakByPetId={streakByPetId}
              />
            )}
          </RefreshableScrollView>

          {/* ── Locked: ONE floating lock card pinned over the blurred feed ──
              Only when there are posts to blur behind it (the zero-post state
              shows its own "be the first" card inside the scroll instead). */}
          {!feedUnlocked && posts?.length > 0 && (
            <LockedFloatingCard
              count={posts.length}
              petName={petName}
              onPostPress={() => setComposerVisible(true)}
              top={promptHeight}
            />
          )}
        </View>
      )}

      {/* ── POST COMPOSER MODAL ── */}
      <PostComposerModal
        visible={composerVisible}
        petName={petName}
        onClose={() => setComposerVisible(false)}
        onPost={handlePost}
      />

      {/* ── BARK MODAL ── */}
      <BarkModal
        visible={!!barkPost}
        post={barkPost}
        onClose={() => setBarkPost(null)}
        onBarkAdded={handleBarkAddedWithUpdate}
      />

      {/* ── POST DETAIL MODAL ── */}
      <PostDetailModal
        visible={!!detailPost}
        post={detailPost}
        liked={detailPost ? !!likedPosts[detailPost.id] : false}
        // The viewer can delete only their own active pet's post.
        canDelete={!!detailPost && detailPost.pet_id === petProfile?.id}
        canEdit={!!detailPost && detailPost.pet_id === petProfile?.id}
        onSaveCaption={(caption) =>
          updateCaption.mutateAsync({ postId: detailPost.id, caption })
        }
        onDelete={() => detailPost && handleConfirmDelete(detailPost)}
        onClose={() => setDetailPost(null)}
        onToggleLike={() => detailPost && handleToggleLike(detailPost.id)}
        onOpenBarks={() => {
          setBarkPost(detailPost);
          setDetailPost(null);
        }}
        onOpenProfile={() => {
          if (detailPost) {
            openProfile(detailPost);
            setDetailPost(null);
          }
        }}
      />

      {/* Upload indicator */}
      {uploading && (
        <View
          style={{
            position: "absolute",
            bottom: 80,
            left: 0,
            right: 0,
            alignItems: "center",
          }}
        >
          <View
            style={{
              backgroundColor: COLORS.warmBrown,
              paddingVertical: SPACING.md,
              paddingHorizontal: SPACING.xxl,
              borderRadius: RADIUS.chip,
              flexDirection: "row",
              alignItems: "center",
              gap: SPACING.md,
              ...ELEVATION.lg,
              shadowColor: COLORS.warmBrown,
            }}
          >
            <ActivityIndicator size="small" color="#FFF" />
            <Text style={[TYPE.callout, { color: "#FFF", fontWeight: "700" }]}>
              Uploading photo...
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}
