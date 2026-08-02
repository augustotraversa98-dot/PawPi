import { useState, useEffect, useCallback } from "react";
import {
  useFeedPosts,
  useCreatePost,
  useDeletePost,
  useTogglePaw,
} from "./useFeedPosts";
import { useCurrentPet } from "./usePetProfile";
import { useTodayDailyUpdate } from "./useTodayDailyUpdate";
import { useOwnerPostedToday } from "./useOwnerPostedToday";
import { useUpload } from "@/utils/useUpload";
import * as VideoThumbnails from "expo-video-thumbnails";
import { Alert, Platform } from "react-native";
import { getLocalPostDateString, normalizePostDate } from "@/utils/dateUtils";
import useUser from "@/utils/auth/useUser";

export function useFeedData() {
  // Load current pet from database instead of AsyncStorage
  const { data: currentPet, isLoading: loadingPet, hasPet } = useCurrentPet();
  const [upload, { loading: uploading }] = useUpload();

  const petId = currentPet?.id;
  const petName = currentPet?.name || "your pup";

  // Fetch posts from database
  const {
    data: posts = [],
    isLoading: loadingPosts,
    isError: postsError,
    refetch: refetchPosts,
  } = useFeedPosts();

  // Use shared source of truth for today's daily update
  const {
    data: todayDailyUpdate,
    isLoading: loadingDailyUpdate,
    refetch: refetchTodayDailyUpdate,
  } = useTodayDailyUpdate(petId);

  // Create / delete post mutations
  const createPostMutation = useCreatePost();
  const deletePostMutation = useDeletePost();

  // Get auth user for logging
  const { data: authUser } = useUser();

  // DERIVED STATE: Check both API and Feed posts for today's daily update
  // This provides a fallback in case of cache/timing issues
  const today = getLocalPostDateString();

  // Check if any post in the Feed is today's daily update for this pet
  const dailyPostInFeed = posts.find((post) => {
    const normalizedDate = normalizePostDate(post.post_date);
    const matches =
      post.pet_id === petId &&
      post.is_daily_update === true &&
      normalizedDate === today;
    return matches;
  });

  // Use the API result if available, otherwise fall back to Feed post.
  // hasPostedToday is PER ACTIVE PET — drives the DailyPromptCard prompt.
  const effectiveTodayDailyUpdate = todayDailyUpdate || dailyPostInFeed || null;
  const hasPostedToday = !!effectiveTodayDailyUpdate;
  const todayPostId = effectiveTodayDailyUpdate?.id;

  // Owner-level lock: the feed unlocks once ANY of the user's dogs has posted
  // today, and stays unlocked regardless of which dog is active. OR-ing in the
  // active pet's own status unlocks instantly (before the owner query resolves)
  // when it was the active dog that just posted.
  const { data: ownerPostedToday = false, isLoading: loadingOwnerPosted } =
    useOwnerPostedToday(hasPet);
  const feedUnlocked = ownerPostedToday || hasPostedToday;

  // Debug logging on mount and when key values change
  useEffect(() => {
    console.log("[useFeedData] ========================================");
    console.log("[useFeedData] Feed State Update:");
    console.log("[useFeedData] ========================================");
    console.log("[useFeedData] Auth & User Info:");
    console.log("[useFeedData]   - Auth user ID:", authUser?.id);
    console.log("[useFeedData]   - Auth user email:", authUser?.email);
    console.log("[useFeedData] ----------------------------------------");
    console.log("[useFeedData] Pet Info:");
    console.log("[useFeedData]   - Current pet:", currentPet);
    console.log("[useFeedData]   - Pet ID:", petId);
    console.log("[useFeedData]   - Pet name:", petName);
    console.log("[useFeedData]   - Has pet:", hasPet);
    console.log("[useFeedData]   - Loading pet:", loadingPet);
    console.log("[useFeedData] ----------------------------------------");
    console.log("[useFeedData] Daily Update State:");
    console.log("[useFeedData]   - Today's date (local):", today);
    console.log(
      "[useFeedData]   - Today's daily update (API):",
      todayDailyUpdate,
    );
    console.log(
      "[useFeedData]   - Daily post in Feed (fallback):",
      dailyPostInFeed,
    );
    console.log(
      "[useFeedData]   - Effective today's daily update:",
      effectiveTodayDailyUpdate,
    );
    console.log("[useFeedData]   - Today's post ID:", todayPostId);
    console.log("[useFeedData]   - Has posted today (FINAL):", hasPostedToday);
    console.log("[useFeedData]   - Loading daily update:", loadingDailyUpdate);
    console.log("[useFeedData] ----------------------------------------");
    console.log("[useFeedData] Posts State:");
    console.log("[useFeedData]   - Total posts fetched:", posts.length);
    console.log("[useFeedData]   - Loading posts:", loadingPosts);
    if (posts.length > 0 && petId) {
      const userPetPosts = posts.filter((p) => p.pet_id === petId);
      console.log(
        "[useFeedData]   - Current pet's posts:",
        userPetPosts.length,
      );
      const dailyPosts = userPetPosts.filter((p) => p.is_daily_update);
      console.log(
        "[useFeedData]   - Current pet's daily posts:",
        dailyPosts.length,
      );
    }
    console.log("[useFeedData] ========================================");
  }, [
    authUser,
    currentPet,
    petId,
    petName,
    hasPet,
    loadingPet,
    today,
    todayDailyUpdate,
    dailyPostInFeed,
    effectiveTodayDailyUpdate,
    todayPostId,
    hasPostedToday,
    loadingDailyUpdate,
    posts.length,
    loadingPosts,
  ]);

  // Convert database posts to liked posts object
  const likedPosts = posts.reduce((acc, post) => {
    if (post.user_has_pawed) {
      acc[post.id] = true;
    }
    return acc;
  }, {});

  const handlePost = useCallback(
    async ({ uri, caption, mediaType = "image" }) => {
      const isVideo = mediaType === "video";
      console.log("[useFeedData] ========================================");
      console.log("[useFeedData] Starting handlePost");
      console.log("[useFeedData] Media URI:", uri);
      console.log("[useFeedData] Media type:", mediaType);
      console.log("[useFeedData] Caption:", caption);
      console.log("[useFeedData] ========================================");

      // Step 1: Check if pet exists
      if (!currentPet?.id) {
        console.error("[useFeedData] ERROR: No pet profile found");
        Alert.alert("Error", "Please create your pet profile first.");
        return;
      }

      // Step 2: Check if daily update already exists (BEFORE upload)
      const todayDate = getLocalPostDateString();

      if (hasPostedToday && effectiveTodayDailyUpdate) {
        console.log(
          "[useFeedData] ERROR: Daily update already exists:",
          effectiveTodayDailyUpdate,
        );
        Alert.alert(
          "Already Posted",
          "You've already posted a daily update today!",
        );
        return;
      }

      try {
        // Step 3: Upload the captured media. /api/upload is mime-agnostic and
        // useUpload streams the file straight from its uri (works for video).
        const ext = (uri.split(".").pop() || "").toLowerCase();
        const mediaUpload = await upload({
          reactNativeAsset: {
            uri,
            name: isVideo
              ? `daily-${Date.now()}.${ext || "mp4"}`
              : `daily-${Date.now()}.jpg`,
            mimeType: isVideo
              ? ext === "mov"
                ? "video/quicktime"
                : "video/mp4"
              : "image/jpeg",
          },
        });

        if (mediaUpload.error) {
          throw new Error(mediaUpload.error);
        }
        if (!mediaUpload.url) {
          throw new Error("Upload succeeded but no URL was returned");
        }

        const mediaUrl = mediaUpload.url;
        console.log("[useFeedData] ✅ Media uploaded:", mediaUrl);

        // Step 4: Build the post payload. Image posts are unchanged (image_url);
        // video posts send media_type + video_url (+ thumbnail when we can make one).
        let postData;
        if (isVideo) {
          // Generate a poster frame for the feed + locked-blur. If thumbnail
          // generation OR its upload fails, post with a null thumbnail rather
          // than blocking the daily moment.
          let videoThumbnailUrl = null;
          try {
            const { uri: thumbUri } = await VideoThumbnails.getThumbnailAsync(
              uri,
              { time: 0, quality: 0.7 },
            );
            const thumbUpload = await upload({
              reactNativeAsset: {
                uri: thumbUri,
                name: `daily-thumb-${Date.now()}.jpg`,
                mimeType: "image/jpeg",
              },
            });
            if (!thumbUpload.error && thumbUpload.url) {
              videoThumbnailUrl = thumbUpload.url;
            } else {
              console.warn(
                "[useFeedData] Thumbnail upload failed, posting without one:",
                thumbUpload.error,
              );
            }
          } catch (thumbErr) {
            console.warn(
              "[useFeedData] Thumbnail generation failed, posting without one:",
              thumbErr?.message,
            );
          }

          postData = {
            pet_id: currentPet.id,
            media_type: "video",
            video_url: mediaUrl,
            video_thumbnail_url: videoThumbnailUrl,
            caption: caption || null,
            is_daily_update: true,
            post_date: todayDate,
          };
        } else {
          postData = {
            pet_id: currentPet.id,
            image_url: mediaUrl,
            caption: caption || null,
            is_daily_update: true,
            post_date: todayDate, // Include explicit post_date
          };
        }

        // Step 5: Create post in database
        await createPostMutation.mutateAsync(postData);
        console.log("[useFeedData] ✅ Post created successfully");

        // Step 6: Refetch both posts and today's daily update
        await Promise.all([refetchPosts(), refetchTodayDailyUpdate()]);
        console.log("[useFeedData] ✅ All data refetched successfully!");
      } catch (error) {
        console.error("[useFeedData] ERROR in handlePost:", error.message);

        // Surface the server's daily video gate (403) as a friendly message
        // instead of a raw "Could not save: ..." crash line.
        if (/available for you today/i.test(error.message || "")) {
          Alert.alert(
            "Daily video",
            "Video posting isn't available for you today 🐾 — share a photo instead!",
          );
          return;
        }

        Alert.alert("Error", `Could not save: ${error.message}`);
      }
    },
    [
      currentPet,
      hasPostedToday,
      effectiveTodayDailyUpdate,
      upload,
      createPostMutation,
      refetchPosts,
      refetchTodayDailyUpdate,
    ],
  );

  const handleToggleLike = useCallback((postId) => {
    // Handled directly in PostCard using useTogglePaw
  }, []);

  // Delete one of the viewer's own posts, then refresh the feed + daily lock so a
  // deleted daily reopens the composer for a re-upload (ticket 2.36).
  const handleDeletePost = useCallback(
    async (postId) => {
      if (!postId) return;
      try {
        await deletePostMutation.mutateAsync(postId);
        await Promise.all([refetchPosts(), refetchTodayDailyUpdate()]);
      } catch (error) {
        Alert.alert("Error", `Could not delete: ${error.message}`);
      }
    },
    [deletePostMutation, refetchPosts, refetchTodayDailyUpdate],
  );

  const handleBarkAdded = useCallback(
    (postId, newCount) => {
      // Refetch posts to update bark count
      refetchPosts();
    },
    [refetchPosts],
  );

  return {
    petProfile: currentPet, // Return database pet instead of AsyncStorage
    petName,
    hasPostedToday, // per active pet (DailyPromptCard prompt)
    feedUnlocked, // per owner (feed lock)
    todayPostId,
    todayDailyUpdatePost: effectiveTodayDailyUpdate, // full post for "view today"
    posts,
    likedPosts,
    handlePost,
    handleToggleLike,
    handleBarkAdded,
    handleDeletePost,
    refetchPosts,
    refetchTodayDailyUpdate,
    // A real fetch failure (distinct from an empty feed) so the screen can show an
    // error + Retry instead of silently rendering as "nothing here".
    postsError,
    loadingPosts:
      loadingPosts || loadingPet || loadingDailyUpdate || loadingOwnerPosted,
    uploading,
    hasPet, // Add hasPet flag
  };
}
