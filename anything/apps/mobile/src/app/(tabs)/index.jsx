import React, { useState, useCallback } from "react";
import { View, ScrollView, ActivityIndicator, Text } from "react-native";
import { useRouter } from "expo-router";
import { COLORS } from "@/constants/colors";
import { FeedHeader } from "@/components/Feed/FeedHeader";
import { DailyPromptCard } from "@/components/Feed/DailyPromptCard";
import { LockedFeedOverlay } from "@/components/Feed/LockedFeedOverlay";
import { UnlockedFeed } from "@/components/Feed/UnlockedFeed";
import { PostComposerModal } from "@/components/Feed/PostComposerModal";
import { BarkModal } from "@/components/Feed/BarkModal";
import { PostDetailModal } from "@/components/Feed/PostDetailModal";
import { useFeedData } from "@/hooks/useFeedData";

export default function FeedScreen() {
  const router = useRouter();
  const {
    petProfile,
    petName,
    hasPostedToday,
    feedUnlocked,
    todayPostId,
    posts,
    likedPosts,
    handlePost,
    handleToggleLike,
    handleBarkAdded,
    loadingPosts,
    uploading,
  } = useFeedData();

  // Modal states — each isolated from the other
  const [composerVisible, setComposerVisible] = useState(false);
  const [barkPost, setBarkPost] = useState(null);
  const [detailPost, setDetailPost] = useState(null);

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

  // ── View today's post ──
  const handleViewTodayPost = useCallback(() => {
    if (todayPostId) {
      const post = posts.find((p) => p.id === todayPostId);
      if (post) {
        setDetailPost(post);
      }
    }
  }, [todayPostId, posts]);

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
          <Text
            style={{
              color: COLORS.mutedBrown,
              marginTop: 12,
              fontSize: 14,
              fontWeight: "600",
            }}
          >
            Loading posts...
          </Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 60 }}
        >
          {/* ── Daily Prompt Card ── */}
          <DailyPromptCard
            petName={petName}
            hasPostedToday={hasPostedToday}
            todayPostId={todayPostId}
            onPostPress={() => setComposerVisible(true)}
            onViewTodayPost={handleViewTodayPost}
          />

          {/* ── Feed: locked or unlocked ──
              Lock is per-OWNER: unlocked once any of the user's dogs posted
              today. The DailyPromptCard above stays per-active-pet. */}
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
            />
          )}
        </ScrollView>
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
              paddingVertical: 12,
              paddingHorizontal: 24,
              borderRadius: 24,
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.3,
              shadowRadius: 8,
              elevation: 6,
            }}
          >
            <ActivityIndicator size="small" color="#FFF" />
            <Text style={{ color: "#FFF", fontWeight: "700", fontSize: 14 }}>
              Uploading photo...
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}
