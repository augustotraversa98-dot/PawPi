import { useState, useEffect, useCallback } from "react";
import { useFeedPosts, useCreatePost, useTogglePaw } from "./useFeedPosts";
import { useCurrentPet } from "./usePetProfile";
import { useTodayDailyUpdate } from "./useTodayDailyUpdate";
import { useUpload } from "@/utils/useUpload";
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
    refetch: refetchPosts,
  } = useFeedPosts();

  // Use shared source of truth for today's daily update
  const {
    data: todayDailyUpdate,
    isLoading: loadingDailyUpdate,
    refetch: refetchTodayDailyUpdate,
  } = useTodayDailyUpdate(petId);

  // Create post mutation
  const createPostMutation = useCreatePost();

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

  // Use the API result if available, otherwise fall back to Feed post
  const effectiveTodayDailyUpdate = todayDailyUpdate || dailyPostInFeed || null;
  const hasPostedToday = !!effectiveTodayDailyUpdate;
  const todayPostId = effectiveTodayDailyUpdate?.id;

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
    async ({ photo, caption }) => {
      console.log("[useFeedData] ========================================");
      console.log("[useFeedData] Starting handlePost");
      console.log("[useFeedData] Photo URI:", photo);
      console.log("[useFeedData] Caption:", caption);
      console.log("[useFeedData] Current pet:", currentPet);
      console.log("[useFeedData] Has pet:", hasPet);
      console.log("[useFeedData] ========================================");

      // Step 1: Check if pet exists
      if (!currentPet?.id) {
        console.error("[useFeedData] ERROR: No pet profile found");
        console.error("[useFeedData] Current pet state:", currentPet);
        console.error("[useFeedData] Has pet:", hasPet);
        Alert.alert("Error", "Please create your pet profile first.");
        return;
      }

      console.log("[useFeedData] ✅ Pet profile ID:", currentPet.id);
      console.log("[useFeedData] ✅ Pet name:", currentPet.name);

      // Step 2: Check if daily update already exists (BEFORE upload)
      console.log(
        "[useFeedData] Step 2: Checking for existing daily update...",
      );
      const todayDate = getLocalPostDateString();
      console.log("[useFeedData] Today's date (local):", todayDate);
      console.log("[useFeedData] Current todayDailyUpdate:", todayDailyUpdate);
      console.log("[useFeedData] Current hasPostedToday:", hasPostedToday);

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

      console.log(
        "[useFeedData] ✅ No existing daily update found, proceeding...",
      );

      try {
        // Step 3: Upload the image
        console.log("[useFeedData] Step 3: Starting image upload...");
        console.log("[useFeedData] Upload input:", {
          uri: photo,
          name: `daily-${Date.now()}.jpg`,
          mimeType: "image/jpeg",
        });

        const uploadResult = await upload({
          reactNativeAsset: {
            uri: photo,
            name: `daily-${Date.now()}.jpg`,
            mimeType: "image/jpeg",
          },
        });

        console.log("[useFeedData] Upload result:", uploadResult);

        if (uploadResult.error) {
          console.error(
            "[useFeedData] ERROR: Upload failed:",
            uploadResult.error,
          );
          throw new Error(uploadResult.error);
        }

        if (!uploadResult.url) {
          console.error(
            "[useFeedData] ERROR: Upload succeeded but no URL returned",
          );
          console.error("[useFeedData] Upload result:", uploadResult);
          throw new Error("Upload succeeded but no URL was returned");
        }

        const imageUrl = uploadResult.url;
        console.log("[useFeedData] ✅ Image uploaded successfully");
        console.log("[useFeedData] Image URL:", imageUrl);

        // Step 4: Prepare post data
        const postData = {
          pet_id: currentPet.id,
          image_url: imageUrl,
          caption: caption || null,
          is_daily_update: true,
          post_date: todayDate, // Include explicit post_date
        };

        console.log("[useFeedData] Step 4: Creating post in database...");
        console.log(
          "[useFeedData] Post data payload:",
          JSON.stringify(postData, null, 2),
        );

        // Step 5: Create post in database
        const result = await createPostMutation.mutateAsync(postData);

        console.log("[useFeedData] ✅ Post created successfully");
        console.log("[useFeedData] Post result:", result);

        // Step 6: Refetch both posts and today's daily update
        console.log("[useFeedData] Step 6: Refetching data...");
        await Promise.all([refetchPosts(), refetchTodayDailyUpdate()]);

        console.log("[useFeedData] ✅ All data refetched successfully!");
        console.log("[useFeedData] ========================================");

        // Post saved successfully - Feed will update automatically
      } catch (error) {
        console.error("[useFeedData] ========================================");
        console.error("[useFeedData] ERROR in handlePost:");
        console.error("[useFeedData] Error message:", error.message);
        console.error("[useFeedData] Error stack:", error.stack);
        console.error("[useFeedData] Error object:", error);

        // Log detailed error info
        if (error.response) {
          console.error(
            "[useFeedData] Response status:",
            error.response.status,
          );
          console.error("[useFeedData] Response data:", error.response.data);
        }

        console.error("[useFeedData] ========================================");

        // Show detailed error message with the actual error
        Alert.alert("Error", `Could not save: ${error.message}`);
      }
    },
    [
      currentPet,
      hasPet,
      hasPostedToday,
      todayDailyUpdate,
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
    hasPostedToday,
    todayPostId,
    posts,
    likedPosts,
    handlePost,
    handleToggleLike,
    handleBarkAdded,
    loadingPosts: loadingPosts || loadingPet || loadingDailyUpdate,
    uploading,
    hasPet, // Add hasPet flag
  };
}
