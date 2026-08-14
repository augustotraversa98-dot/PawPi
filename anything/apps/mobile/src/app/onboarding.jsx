import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ChevronLeft, Check } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import AsyncStorage from "@react-native-async-storage/async-storage";
import KeyboardAvoidingAnimatedView from "@/components/KeyboardAvoidingAnimatedView";
import KeyboardAwareScrollView from "@/components/KeyboardAwareScrollView";
import DateField from "@/components/DateField";
import { formatDisplayDate } from "@/utils/canonicalDateTime";
import useUser from "@/utils/auth/useUser";
import useUpload from "@/utils/useUpload";
import { useQueryClient } from "@tanstack/react-query";
import { getLocalPostDateString } from "@/utils/dateUtils";
import { postOnboardingWelcome } from "@/utils/onboardingWelcome";
import {
  TAKEN_HANDLES,
  validateHandleFormat,
  handleErrorMessage,
  isHandleAcceptable,
} from "@/utils/validateHandle";
import {
  COLORS,
  TYPE,
  RADIUS,
  SPACING,
  MATERIALS,
  ELEVATION,
} from "@/constants/theme";
import { Card, PressableScale } from "@/components/ui";

const TOTAL_STEPS = 9;

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data: user } = useUser();
  const [upload, { loading: uploading }] = useUpload();
  const queryClient = useQueryClient();

  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState({
    photo: null,
    name: "",
    handle: "",
    breed: "",
    ageYears: "",
    ageMonths: "",
    gender: "",
    weight: "",
    weightUnit: "lbs",
    // E6: capture BOTH the birthday and the gotcha/adoption day inline (both optional) so E3
    // milestone moments can fire for either later.
    birthday: "",
    adoptionDate: "",
    notes: "",
  });
  const [suggestedHandles, setSuggestedHandles] = useState([]);
  const [handleError, setHandleError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  // E6: the "ring started" payoff shown on the success screen (streak day 1 + welcome paw).
  const [welcome, setWelcome] = useState(null);

  // Load saved photo from photo onboarding step
  useEffect(() => {
    async function loadSavedData() {
      try {
        const savedPhoto = await AsyncStorage.getItem("onboarding_pet_photo");
        if (savedPhoto) {
          setFormData((prev) => ({ ...prev, photo: savedPhoto }));
        }

        // Check for partially completed profile
        const savedProfile = await AsyncStorage.getItem("onboarding_progress");
        if (savedProfile) {
          const parsed = JSON.parse(savedProfile);
          // onboarding_pet_photo is the source of truth for the photo (a data:
          // URL on web, a file:// uri on native). Don't let a stale photo in
          // onboarding_progress — e.g. a revoked blob: URL from an earlier
          // session — overwrite it.
          const { photo: _ignore, ...rest } = parsed;
          setFormData((prev) => ({ ...prev, ...rest }));
        }
      } catch (error) {
        console.error("Error loading saved data:", error);
      }
    }
    loadSavedData();
  }, []);

  // Save progress on every step change
  useEffect(() => {
    if (currentStep > 0 && formData.name) {
      AsyncStorage.setItem("onboarding_progress", JSON.stringify(formData));
    }
  }, [currentStep, formData]);

  // Generate handle suggestions when name changes
  useEffect(() => {
    if (formData.name && currentStep === 1) {
      generateHandleSuggestions(formData.name);
    }
  }, [formData.name, currentStep]);

  const generateHandleSuggestions = (name) => {
    const cleanName = name.toLowerCase().trim().replace(/\s+/g, "");
    const suggestions = [
      cleanName,
      `${cleanName}.paws`,
      `${cleanName}_daily`,
      `the_real_${cleanName}`,
      `${cleanName}_adventures`,
    ].filter((handle) => !TAKEN_HANDLES.includes(handle));

    setSuggestedHandles(suggestions.slice(0, 5));
  };

  // Validate the handle's FORMAT and uniqueness together (ticket 2.35). Sets the
  // inline error and returns whether it's acceptable.
  const checkHandleUniqueness = (handle) => {
    const error = handleErrorMessage(handle);
    setHandleError(error);
    return error === "";
  };

  const goToStep = (step) => {
    setCurrentStep(step);
  };

  const nextStep = () => {
    // Validation for required fields
    if (currentStep === 0 && !formData.name.trim()) {
      return; // Name is required
    }

    if (currentStep === 1) {
      // Handle is REQUIRED now — block until it's a valid, available @handle.
      if (!checkHandleUniqueness(formData.handle)) {
        return;
      }
    }

    if (currentStep < TOTAL_STEPS - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const skipStep = () => {
    nextStep();
  };

  const handleComplete = async () => {
    if (!formData.name.trim()) {
      return;
    }

    setIsSubmitting(true);

    try {
      console.log("[Onboarding] ========================================");
      console.log("[Onboarding] Starting onboarding completion...");
      console.log("[Onboarding] Form data:", formData);

      let uploadedAvatarUrl = null;

      // Step 1: Upload photo if exists
      if (formData.photo) {
        console.log("[Onboarding] Step 1: Uploading pet photo...");
        console.log("[Onboarding] Photo URI:", formData.photo);

        const uploadResult = await upload({
          reactNativeAsset: {
            uri: formData.photo,
            name: `pet-avatar-${Date.now()}.jpg`,
            mimeType: "image/jpeg",
          },
        });

        console.log("[Onboarding] Upload result:", uploadResult);

        if (uploadResult.error) {
          console.error(
            "[Onboarding] ERROR: Photo upload failed:",
            uploadResult.error,
          );
          throw new Error(`Photo upload failed: ${uploadResult.error}`);
        }

        if (!uploadResult.url) {
          console.error(
            "[Onboarding] ERROR: Upload succeeded but no URL returned",
          );
          throw new Error("Photo upload succeeded but no URL was returned");
        }

        uploadedAvatarUrl = uploadResult.url;
        console.log("[Onboarding] ✅ Photo uploaded successfully");
        console.log("[Onboarding] Uploaded URL:", uploadedAvatarUrl);
      } else {
        console.log("[Onboarding] No photo to upload, skipping...");
      }

      // Step 2: Create pet profile
      console.log("[Onboarding] Step 2: Creating pet profile...");

      const finalProfile = {
        name: formData.name,
        handle: formData.handle || suggestedHandles[0] || `user${Date.now()}`,
        avatar_url: uploadedAvatarUrl,
        species: "dog",
        breed: formData.breed || null,
        age_years: formData.ageYears ? parseInt(formData.ageYears) : null,
        age_months: formData.ageMonths ? parseInt(formData.ageMonths) : null,
        gender: formData.gender || null,
        weight: formData.weight ? parseFloat(formData.weight) : null,
        weight_unit: formData.weightUnit || "lbs",
        birthday: formData.birthday || null,
        adoption_date: formData.adoptionDate || null,
        notes: formData.notes || null,
      };

      console.log(
        "[Onboarding] Pet profile payload:",
        JSON.stringify(finalProfile, null, 2),
      );

      const petResponse = await fetch("/api/pets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(finalProfile),
      });

      if (!petResponse.ok) {
        const errorData = await petResponse.json();
        console.error("[Onboarding] ERROR: Failed to create pet:", errorData);
        throw new Error(errorData.error || "Failed to create pet profile");
      }

      const { pet } = await petResponse.json();
      console.log("[Onboarding] ✅ Pet profile created successfully");
      console.log("[Onboarding] Pet ID:", pet.id);
      console.log("[Onboarding] Pet name:", pet.name);

      // Invalidate pets query so Feed will fetch the newly created pet
      console.log("[Onboarding] Invalidating pets query...");
      await queryClient.invalidateQueries({ queryKey: ["pets"] });
      await queryClient.refetchQueries({ queryKey: ["pets"] });
      console.log("[Onboarding] ✅ Pets query invalidated and refetched");

      // Step 3: Mark onboarding as completed
      console.log("[Onboarding] Step 3: Marking onboarding as completed...");

      const profileResponse = await fetch("/api/user-profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onboarding_completed: true }),
      });

      if (!profileResponse.ok) {
        console.error("[Onboarding] WARNING: Failed to update user profile");
      } else {
        console.log("[Onboarding] ✅ User profile updated");
      }

      // Step 4: Save to AsyncStorage as backup/cache
      console.log("[Onboarding] Step 4: Saving to AsyncStorage...");
      await AsyncStorage.setItem("pet_profile", JSON.stringify(pet));
      await AsyncStorage.setItem("has_completed_onboarding", "true");
      console.log("[Onboarding] ✅ AsyncStorage updated");

      // Step 5: Create first daily moment if user chose to post
      const shouldCreateMoment = await AsyncStorage.getItem(
        "create_first_moment",
      );
      console.log(
        "[Onboarding] Step 5: Checking if should create first moment...",
      );
      console.log("[Onboarding] create_first_moment flag:", shouldCreateMoment);
      console.log("[Onboarding] Has uploaded avatar:", !!uploadedAvatarUrl);

      if (shouldCreateMoment === "true" && uploadedAvatarUrl) {
        console.log("[Onboarding] Creating first daily moment post...");

        const today = new Date().toISOString().split("T")[0];
        console.log("[Onboarding] Today's date:", today);

        // Check if daily post already exists
        console.log("[Onboarding] Checking for existing daily post...");
        const checkResponse = await fetch("/api/posts?limit=50");
        const checkData = await checkResponse.json();
        const existingDailyPost = checkData.posts?.find(
          (p) =>
            p.pet_id === pet.id && p.is_daily_update && p.post_date === today,
        );

        if (existingDailyPost) {
          console.log(
            "[Onboarding] ⚠️ Daily post already exists, skipping creation",
          );
          console.log("[Onboarding] Existing post ID:", existingDailyPost.id);
        } else {
          console.log(
            "[Onboarding] No existing daily post, creating new one...",
          );

          const postPayload = {
            pet_id: pet.id,
            image_url: uploadedAvatarUrl,
            caption: `Meet ${formData.name}! 🐾`,
            is_daily_update: true,
          };

          console.log(
            "[Onboarding] Post payload:",
            JSON.stringify(postPayload, null, 2),
          );

          const postResponse = await fetch("/api/posts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(postPayload),
          });

          if (!postResponse.ok) {
            const errorData = await postResponse.json();
            console.error(
              "[Onboarding] WARNING: Failed to create first post:",
              errorData,
            );
          } else {
            const postData = await postResponse.json();
            console.log(
              "[Onboarding] ✅ First daily moment created successfully",
            );
            console.log("[Onboarding] Post ID:", postData.post?.id);

            // E6: the moment closed today's Moment segment — now START THE RING: seed the day-1
            // streak + the labelled "PawPi Welcome" first paw. Honest, idempotent, never blocks.
            const welcomeResult = await postOnboardingWelcome({
              postId: postData.post?.id,
              petId: pet.id,
            });
            if (welcomeResult) setWelcome(welcomeResult);

            // Refetch query caches and wait for completion to ensure Feed sees the new post
            console.log("[Onboarding] Refetching feed query caches...");
            await queryClient.refetchQueries({ queryKey: ["posts"] });
            await queryClient.refetchQueries({
              queryKey: ["today-daily-update"],
            });
            console.log("[Onboarding] ✅ Query caches refetched and updated");
          }
        }

        await AsyncStorage.removeItem("create_first_moment");
      } else {
        console.log("[Onboarding] Skipping first moment creation");
        console.log("[Onboarding]   - shouldCreateMoment:", shouldCreateMoment);
        console.log("[Onboarding]   - uploadedAvatarUrl:", uploadedAvatarUrl);
      }

      // Step 6: Clean up progress
      console.log("[Onboarding] Step 6: Cleaning up...");
      await AsyncStorage.removeItem("onboarding_progress");
      await AsyncStorage.removeItem("onboarding_pet_photo");
      console.log("[Onboarding] ✅ Cleanup complete");

      console.log("[Onboarding] ========================================");
      console.log("[Onboarding] ✅ ONBOARDING COMPLETE!");
      console.log("[Onboarding] ========================================");

      // Show success screen
      setCurrentStep(TOTAL_STEPS);
    } catch (error) {
      console.error("[Onboarding] ========================================");
      console.error("[Onboarding] FATAL ERROR:");
      console.error("[Onboarding] Error message:", error.message);
      console.error("[Onboarding] Error stack:", error.stack);
      console.error("[Onboarding] ========================================");
      alert(error.message || "Could not save profile. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const goToRoutines = () => {
    router.replace("/(tabs)/health");
  };

  const goToFeed = async () => {
    try {
      // Reset all queries (clears cache and forces fresh fetch)
      console.log("[Onboarding] Resetting all queries before navigation...");
      await Promise.all([
        queryClient.resetQueries({ queryKey: ["pets"] }),
        queryClient.resetQueries({ queryKey: ["posts"] }),
        queryClient.resetQueries({ queryKey: ["today-daily-update"] }),
      ]);

      // Add small delay to ensure queries complete
      await new Promise((resolve) => setTimeout(resolve, 500));

      console.log("[Onboarding] ✅ All queries reset, navigating to feed...");
      router.replace("/(tabs)");
    } catch (error) {
      console.error("[Onboarding] Error resetting queries:", error);
      router.replace("/(tabs)"); // Navigate anyway
    }
  };

  const progressPercent = ((currentStep + 1) / TOTAL_STEPS) * 100;

  // Render different steps
  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return <StepName formData={formData} setFormData={setFormData} />;
      case 1:
        return (
          <StepHandle
            formData={formData}
            setFormData={setFormData}
            suggestedHandles={suggestedHandles}
            handleError={handleError}
            checkHandleUniqueness={checkHandleUniqueness}
          />
        );
      case 2:
        return <StepBreed formData={formData} setFormData={setFormData} />;
      case 3:
        return <StepAge formData={formData} setFormData={setFormData} />;
      case 4:
        return <StepGender formData={formData} setFormData={setFormData} />;
      case 5:
        return <StepWeight formData={formData} setFormData={setFormData} />;
      case 6:
        return <StepBirthday formData={formData} setFormData={setFormData} />;
      case 7:
        return <StepNotes formData={formData} setFormData={setFormData} />;
      case 8:
        return <StepReview formData={formData} goToStep={goToStep} />;
      case TOTAL_STEPS:
        return (
          <StepSuccess
            formData={formData}
            welcome={welcome}
            goToRoutines={goToRoutines}
            goToFeed={goToFeed}
          />
        );
      default:
        return null;
    }
  };

  const canGoNext = () => {
    // Required: pet name (step 0) and a valid, available @handle (step 1).
    if (currentStep === 0) return formData.name.trim().length > 0;
    if (currentStep === 1) return isHandleAcceptable(formData.handle);
    return true;
  };

  const isOptionalStep = currentStep > 1 && currentStep < 8;

  if (currentStep === TOTAL_STEPS) {
    // Success screen - full screen, no navigation
    return renderStep();
  }

  return (
    <KeyboardAvoidingAnimatedView
      style={{ flex: 1, backgroundColor: COLORS.cream }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={{ flex: 1, paddingTop: insets.top + 10 }}>
        {/* Header with progress */}
        <View style={{ paddingHorizontal: SPACING.xxl, marginBottom: SPACING.xl }}>
          {/* Back button and step counter */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: SPACING.md,
            }}
          >
            <PressableScale
              onPress={prevStep}
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: MATERIALS.surfaceSunken,
                justifyContent: "center",
                alignItems: "center",
              }}
              disabled={currentStep === 0}
            >
              <ChevronLeft
                size={24}
                color={currentStep === 0 ? COLORS.mutedBrown : COLORS.warmBrown}
              />
            </PressableScale>

            <Text style={[TYPE.subhead, { color: COLORS.mutedBrown }]}>
              Step {currentStep + 1} of {TOTAL_STEPS}
            </Text>
          </View>

          {/* Progress bar */}
          <View
            style={{
              height: 6,
              backgroundColor: MATERIALS.surfaceSunken,
              borderRadius: 3,
              overflow: "hidden",
            }}
          >
            <View
              style={{
                height: "100%",
                backgroundColor: COLORS.coral,
                width: `${progressPercent}%`,
              }}
            />
          </View>
        </View>

        {/* Step content — KeyboardAwareScrollView keeps the focused input above
            the keyboard so no field is hidden behind it (ticket 2.35). */}
        <KeyboardAwareScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingHorizontal: SPACING.xxl,
            paddingBottom: insets.bottom + 180, // room for the pinned button + keyboard
          }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {renderStep()}
        </KeyboardAwareScrollView>

        {/* Bottom buttons */}
        <View
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            backgroundColor: COLORS.cream,
            paddingHorizontal: SPACING.xxl,
            paddingTop: SPACING.lg,
            paddingBottom: insets.bottom + SPACING.lg,
            borderTopWidth: 1,
            borderTopColor: MATERIALS.hairline,
          }}
        >
          {currentStep === 8 ? (
            // Review step - show "Create Profile" button
            <PressableScale
              onPress={handleComplete}
              disabled={isSubmitting}
              style={{
                backgroundColor: COLORS.coral,
                borderRadius: RADIUS.control,
                height: 56,
                flexDirection: "row",
                justifyContent: "center",
                alignItems: "center",
                shadowColor: COLORS.coral,
                ...ELEVATION.sm,
                gap: SPACING.sm,
              }}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <>
                  <Text style={[TYPE.headline, { color: "#FFF" }]}>
                    Create {formData.name || "your dog"}'s profile
                  </Text>
                  <Check size={22} color="#FFF" />
                </>
              )}
            </PressableScale>
          ) : (
            <>
              {/* Next button */}
              <PressableScale
                onPress={nextStep}
                disabled={!canGoNext()}
                style={{
                  backgroundColor: canGoNext()
                    ? COLORS.coral
                    : MATERIALS.surfaceSunken,
                  borderRadius: RADIUS.control,
                  height: 56,
                  justifyContent: "center",
                  alignItems: "center",
                  shadowColor: canGoNext() ? COLORS.coral : "transparent",
                  ...(canGoNext() ? ELEVATION.sm : ELEVATION.none),
                  marginBottom: isOptionalStep ? SPACING.md : 0,
                }}
              >
                <Text
                  style={[
                    TYPE.headline,
                    { color: canGoNext() ? "#FFF" : COLORS.mutedBrown },
                  ]}
                >
                  Next
                </Text>
              </PressableScale>

              {/* Skip button for optional steps */}
              {isOptionalStep && (
                <TouchableOpacity
                  onPress={skipStep}
                  style={{
                    paddingVertical: 14,
                    alignItems: "center",
                  }}
                >
                  <Text
                    style={[
                      TYPE.headline,
                      {
                        color: COLORS.mutedBrown,
                        textDecorationLine: "underline",
                      },
                    ]}
                  >
                    Skip
                  </Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
      </View>
    </KeyboardAvoidingAnimatedView>
  );
}

// Step 1: Dog Name (Required)
const StepName = ({ formData, setFormData }) => {
  const inputRef = useRef(null);

  // Ticket 2.63: no auto-focus — the field is tappable; the keyboard opens on tap.

  return (
    <View style={{ flex: 1, paddingTop: SPACING.huge }}>
      <Text
        style={{
          fontSize: 72,
          textAlign: "center",
          marginBottom: SPACING.xxxl,
        }}
      >
        🐕
      </Text>
      <Text
        style={[
          TYPE.largeTitle,
          { color: COLORS.warmBrown, marginBottom: SPACING.md, lineHeight: 40 },
        ]}
      >
        What's your dog's name?
      </Text>
      <Text
        style={[
          TYPE.headline,
          {
            color: COLORS.mutedBrown,
            fontWeight: "500",
            marginBottom: SPACING.huge,
            lineHeight: 24,
          },
        ]}
      >
        This is the only required field. Everything else is optional!
      </Text>
      <TextInput
        ref={inputRef}
        style={[
          TYPE.title,
          {
            backgroundColor: MATERIALS.surfaceSunken,
            borderRadius: RADIUS.control,
            padding: SPACING.xl,
            fontWeight: "600",
            color: COLORS.warmBrown,
            borderWidth: 2,
            borderColor: formData.name ? COLORS.coral : MATERIALS.hairline,
          },
        ]}
        placeholder="e.g. Buddy"
        placeholderTextColor={COLORS.mutedBrown}
        value={formData.name}
        onChangeText={(text) =>
          setFormData((prev) => ({ ...prev, name: text }))
        }
        autoCapitalize="words"
      />
    </View>
  );
};

// Step 2: Pet Handle (Suggested)
const StepHandle = ({
  formData,
  setFormData,
  suggestedHandles,
  handleError,
  checkHandleUniqueness,
}) => {
  const dogName = formData.name || "your dog";

  return (
    <View style={{ flex: 1, paddingTop: SPACING.huge }}>
      <Text style={{ fontSize: 72, textAlign: "center", marginBottom: SPACING.xxxl }}>
        @
      </Text>
      <Text
        style={[
          TYPE.largeTitle,
          { color: COLORS.warmBrown, marginBottom: SPACING.md, lineHeight: 40 },
        ]}
      >
        Choose {dogName}'s pet handle
      </Text>
      <Text
        style={[
          TYPE.headline,
          {
            color: COLORS.mutedBrown,
            fontWeight: "500",
            marginBottom: 30,
            lineHeight: 24,
          },
        ]}
      >
        This is how other pets will find {dogName}
      </Text>

      {/* Suggested handles */}
      {suggestedHandles.length > 0 && (
        <View style={{ marginBottom: SPACING.xxl }}>
          <Text
            style={[
              TYPE.callout,
              { fontWeight: "700", color: COLORS.mutedBrown, marginBottom: SPACING.md },
            ]}
          >
            Suggested handles:
          </Text>
          <View style={{ gap: SPACING.sm }}>
            {suggestedHandles.map((handle, index) => (
              <PressableScale
                key={index}
                onPress={() => {
                  setFormData((prev) => ({ ...prev, handle }));
                  checkHandleUniqueness(handle);
                }}
                style={{
                  backgroundColor:
                    formData.handle === handle ? COLORS.coral : MATERIALS.surfaceSunken,
                  paddingVertical: 14,
                  paddingHorizontal: SPACING.lg,
                  borderRadius: RADIUS.control,
                  borderWidth: 2,
                  borderColor:
                    formData.handle === handle ? COLORS.coral : MATERIALS.hairline,
                }}
              >
                <Text
                  style={[
                    TYPE.headline,
                    {
                      color: formData.handle === handle ? "#FFF" : COLORS.warmBrown,
                    },
                  ]}
                >
                  @{handle}
                </Text>
              </PressableScale>
            ))}
          </View>
        </View>
      )}

      {/* Custom handle input */}
      <Text
        style={[
          TYPE.callout,
          { fontWeight: "700", color: COLORS.mutedBrown, marginBottom: SPACING.sm },
        ]}
      >
        Or create your own:
      </Text>
      <TextInput
        style={[
          TYPE.title2,
          {
            backgroundColor: MATERIALS.surfaceSunken,
            borderRadius: RADIUS.control,
            padding: SPACING.lg,
            fontWeight: "600",
            color: COLORS.warmBrown,
            borderWidth: 2,
            borderColor: handleError
              ? "#FF4444"
              : formData.handle
                ? COLORS.coral
                : MATERIALS.hairline,
          },
        ]}
        placeholder="custom_handle"
        placeholderTextColor={COLORS.mutedBrown}
        value={formData.handle}
        onChangeText={(text) => {
          const cleanText = text.toLowerCase().replace(/[^a-z0-9_.]/g, "");
          setFormData((prev) => ({ ...prev, handle: cleanText }));
          checkHandleUniqueness(cleanText);
        }}
        autoCapitalize="none"
      />
      {handleError ? (
        <Text style={[TYPE.callout, { color: "#FF4444", marginTop: SPACING.sm }]}>
          {handleError}
        </Text>
      ) : null}
    </View>
  );
};

// Step 3: Breed (Optional)
const StepBreed = ({ formData, setFormData }) => {
  const dogName = formData.name || "your dog";

  return (
    <View style={{ flex: 1, paddingTop: SPACING.huge }}>
      <Text style={{ fontSize: 72, textAlign: "center", marginBottom: SPACING.xxxl }}>
        🐾
      </Text>
      <Text
        style={[
          TYPE.largeTitle,
          { color: COLORS.warmBrown, marginBottom: SPACING.md, lineHeight: 40 },
        ]}
      >
        What breed is {dogName}?
      </Text>
      <Text
        style={[
          TYPE.headline,
          {
            color: COLORS.mutedBrown,
            fontWeight: "500",
            marginBottom: 30,
            lineHeight: 24,
          },
        ]}
      >
        This helps us personalize care recommendations
      </Text>

      {/* Quick options */}
      <View style={{ gap: SPACING.sm, marginBottom: SPACING.xl }}>
        {["Mixed Breed", "I'm not sure"].map((option) => (
          <PressableScale
            key={option}
            onPress={() => setFormData((prev) => ({ ...prev, breed: option }))}
            style={{
              backgroundColor:
                formData.breed === option ? COLORS.coral : MATERIALS.surfaceSunken,
              paddingVertical: 14,
              paddingHorizontal: SPACING.lg,
              borderRadius: RADIUS.control,
              borderWidth: 2,
              borderColor:
                formData.breed === option ? COLORS.coral : MATERIALS.hairline,
            }}
          >
            <Text
              style={[
                TYPE.headline,
                { color: formData.breed === option ? "#FFF" : COLORS.warmBrown },
              ]}
            >
              {option}
            </Text>
          </PressableScale>
        ))}
      </View>

      {/* Custom breed input */}
      <TextInput
        style={[
          TYPE.title2,
          {
            backgroundColor: MATERIALS.surfaceSunken,
            borderRadius: RADIUS.control,
            padding: SPACING.lg,
            fontWeight: "600",
            color: COLORS.warmBrown,
            borderWidth: 2,
            borderColor:
              formData.breed &&
              !["Mixed Breed", "I'm not sure"].includes(formData.breed)
                ? COLORS.coral
                : MATERIALS.hairline,
          },
        ]}
        placeholder="e.g. Golden Retriever"
        placeholderTextColor={COLORS.mutedBrown}
        value={
          ["Mixed Breed", "I'm not sure"].includes(formData.breed)
            ? ""
            : formData.breed
        }
        onChangeText={(text) =>
          setFormData((prev) => ({ ...prev, breed: text }))
        }
        autoCapitalize="words"
      />
    </View>
  );
};

// Step 4: Age (Optional)
const StepAge = ({ formData, setFormData }) => {
  const dogName = formData.name || "your dog";

  return (
    <View style={{ flex: 1, paddingTop: SPACING.huge }}>
      <Text style={{ fontSize: 72, textAlign: "center", marginBottom: SPACING.xxxl }}>
        🎂
      </Text>
      <Text
        style={[
          TYPE.largeTitle,
          { color: COLORS.warmBrown, marginBottom: SPACING.md, lineHeight: 40 },
        ]}
      >
        How old is {dogName}?
      </Text>
      <Text
        style={[
          TYPE.headline,
          {
            color: COLORS.mutedBrown,
            fontWeight: "500",
            marginBottom: 30,
            lineHeight: 24,
          },
        ]}
      >
        Age helps us suggest the right activities and health checks
      </Text>

      <View style={{ gap: SPACING.lg }}>
        <View>
          <Text
            style={[
              TYPE.callout,
              { fontWeight: "700", color: COLORS.warmBrown, marginBottom: SPACING.sm },
            ]}
          >
            Years
          </Text>
          <TextInput
            style={[
              TYPE.title,
              {
                backgroundColor: MATERIALS.surfaceSunken,
                borderRadius: RADIUS.control,
                padding: SPACING.lg,
                fontWeight: "600",
                color: COLORS.warmBrown,
                borderWidth: 2,
                borderColor: formData.ageYears ? COLORS.coral : MATERIALS.hairline,
              },
            ]}
            placeholder="0"
            placeholderTextColor={COLORS.mutedBrown}
            value={formData.ageYears}
            onChangeText={(text) =>
              setFormData((prev) => ({
                ...prev,
                ageYears: text.replace(/[^0-9]/g, ""),
              }))
            }
            keyboardType="number-pad"
          />
        </View>

        <View>
          <Text
            style={[
              TYPE.callout,
              { fontWeight: "700", color: COLORS.warmBrown, marginBottom: SPACING.sm },
            ]}
          >
            Months
          </Text>
          <TextInput
            style={[
              TYPE.title,
              {
                backgroundColor: MATERIALS.surfaceSunken,
                borderRadius: RADIUS.control,
                padding: SPACING.lg,
                fontWeight: "600",
                color: COLORS.warmBrown,
                borderWidth: 2,
                borderColor: formData.ageMonths ? COLORS.coral : MATERIALS.hairline,
              },
            ]}
            placeholder="0"
            placeholderTextColor={COLORS.mutedBrown}
            value={formData.ageMonths}
            onChangeText={(text) =>
              setFormData((prev) => ({
                ...prev,
                ageMonths: text.replace(/[^0-9]/g, ""),
              }))
            }
            keyboardType="number-pad"
          />
        </View>

        <PressableScale
          onPress={() =>
            setFormData((prev) => ({ ...prev, ageYears: "", ageMonths: "" }))
          }
          style={{
            paddingVertical: 14,
            alignItems: "center",
            backgroundColor: MATERIALS.surfaceSunken,
            borderRadius: RADIUS.control,
          }}
        >
          <Text
            style={[TYPE.headline, { fontWeight: "700", color: COLORS.mutedBrown }]}
          >
            I don't know exactly
          </Text>
        </PressableScale>
      </View>
    </View>
  );
};

// Step 5: Gender (Optional)
const StepGender = ({ formData, setFormData }) => {
  const dogName = formData.name || "your dog";

  const genderOptions = [
    { value: "female", label: "Female", emoji: "♀️" },
    { value: "male", label: "Male", emoji: "♂️" },
    { value: "unknown", label: "Unknown / Prefer not to say", emoji: "❓" },
  ];

  return (
    <View style={{ flex: 1, paddingTop: SPACING.huge }}>
      <Text style={{ fontSize: 72, textAlign: "center", marginBottom: SPACING.xxxl }}>
        💙
      </Text>
      <Text
        style={[
          TYPE.largeTitle,
          { color: COLORS.warmBrown, marginBottom: SPACING.md, lineHeight: 40 },
        ]}
      >
        What's {dogName}'s gender?
      </Text>
      <Text
        style={[
          TYPE.headline,
          {
            color: COLORS.mutedBrown,
            fontWeight: "500",
            marginBottom: SPACING.huge,
            lineHeight: 24,
          },
        ]}
      >
        Select one option below
      </Text>

      <View style={{ gap: SPACING.md }}>
        {genderOptions.map((option) => {
          const selected = formData.gender === option.value;
          return (
            <PressableScale
              key={option.value}
              onPress={() =>
                setFormData((prev) => ({ ...prev, gender: option.value }))
              }
            >
              <Card
                level={selected ? "none" : "sm"}
                radius={RADIUS.control}
                color={selected ? COLORS.coral : MATERIALS.surface}
                borderColor={selected ? COLORS.coral : MATERIALS.hairline}
                style={{
                  paddingVertical: SPACING.xl,
                  paddingHorizontal: SPACING.xl,
                  borderWidth: 2,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <View
                  style={{ flexDirection: "row", alignItems: "center", gap: 14 }}
                >
                  <Text style={{ fontSize: 32 }}>{option.emoji}</Text>
                  <Text
                    style={[
                      TYPE.title2,
                      { fontWeight: "700", color: selected ? "#FFF" : COLORS.warmBrown },
                    ]}
                  >
                    {option.label}
                  </Text>
                </View>
                {selected && <Check size={24} color="#FFF" />}
              </Card>
            </PressableScale>
          );
        })}
      </View>
    </View>
  );
};

// Step 6: Weight (Optional)
const StepWeight = ({ formData, setFormData }) => {
  const dogName = formData.name || "your dog";
  const inputRef = useRef(null);

  // Ticket 2.63: no auto-focus — the field is tappable; the keyboard opens on tap.

  return (
    <View style={{ flex: 1, paddingTop: SPACING.huge }}>
      <Text style={{ fontSize: 72, textAlign: "center", marginBottom: SPACING.xxxl }}>
        ⚖️
      </Text>
      <Text
        style={[
          TYPE.largeTitle,
          { color: COLORS.warmBrown, marginBottom: SPACING.md, lineHeight: 40 },
        ]}
      >
        How much does {dogName} weigh?
      </Text>
      <Text
        style={[
          TYPE.headline,
          {
            color: COLORS.mutedBrown,
            fontWeight: "500",
            marginBottom: 30,
            lineHeight: 24,
          },
        ]}
      >
        This helps track their health over time
      </Text>

      <TextInput
        ref={inputRef}
        style={[
          TYPE.largeTitle,
          {
            backgroundColor: MATERIALS.surfaceSunken,
            borderRadius: RADIUS.control,
            padding: SPACING.lg,
            color: COLORS.warmBrown,
            borderWidth: 2,
            borderColor: formData.weight ? COLORS.coral : MATERIALS.hairline,
            marginBottom: SPACING.lg,
            textAlign: "center",
          },
        ]}
        placeholder="0"
        placeholderTextColor={COLORS.mutedBrown}
        value={formData.weight}
        onChangeText={(text) =>
          setFormData((prev) => ({
            ...prev,
            weight: text.replace(/[^0-9.]/g, ""),
          }))
        }
        keyboardType="decimal-pad"
      />

      {/* Unit toggle */}
      <View
        style={{
          flexDirection: "row",
          gap: SPACING.md,
          justifyContent: "center",
        }}
      >
        {["lbs", "kg"].map((unit) => (
          <PressableScale
            key={unit}
            onPress={() =>
              setFormData((prev) => ({ ...prev, weightUnit: unit }))
            }
            style={{
              paddingVertical: SPACING.md,
              paddingHorizontal: SPACING.xxxl,
              borderRadius: RADIUS.control,
              backgroundColor:
                formData.weightUnit === unit ? COLORS.coral : MATERIALS.surfaceSunken,
              borderWidth: 2,
              borderColor:
                formData.weightUnit === unit ? COLORS.coral : MATERIALS.hairline,
            }}
          >
            <Text
              style={[
                TYPE.headline,
                { color: formData.weightUnit === unit ? "#FFF" : COLORS.warmBrown },
              ]}
            >
              {unit}
            </Text>
          </PressableScale>
        ))}
      </View>
    </View>
  );
};

// Step 7: Birthday + Gotcha/Adoption day (both optional).
// E6: we capture BOTH dates inline (not one-or-the-other) so E3 milestone moments can celebrate a
// birthday AND a gotcha day later. Both are optional — nothing is required to finish onboarding.
const StepBirthday = ({ formData, setFormData }) => {
  const dogName = formData.name || "your dog";

  const dateFieldStyle = (filled) => ({
    backgroundColor: MATERIALS.surfaceSunken,
    borderRadius: RADIUS.control,
    padding: SPACING.lg,
    borderWidth: 2,
    borderColor: filled ? COLORS.coral : MATERIALS.hairline,
  });

  return (
    <View style={{ flex: 1, paddingTop: SPACING.huge }}>
      <Text style={{ fontSize: 72, textAlign: "center", marginBottom: SPACING.xxxl }}>
        📅
      </Text>
      <Text
        style={[
          TYPE.largeTitle,
          { color: COLORS.warmBrown, marginBottom: SPACING.md, lineHeight: 40 },
        ]}
      >
        When are {dogName}'s special days?
      </Text>
      <Text
        style={[
          TYPE.headline,
          {
            color: COLORS.mutedBrown,
            fontWeight: "500",
            marginBottom: 30,
            lineHeight: 24,
          },
        ]}
      >
        We'll help you celebrate — add either or both, or skip for now.
      </Text>

      <View style={{ gap: SPACING.lg }}>
        <View>
          <Text
            style={[
              TYPE.callout,
              { fontWeight: "700", color: COLORS.warmBrown, marginBottom: SPACING.sm },
            ]}
          >
            🎂 Birthday (optional)
          </Text>
          <DateField
            value={formData.birthday}
            placeholder="Add a birthday"
            onChange={(birthday) => setFormData((prev) => ({ ...prev, birthday }))}
            maximumDate={new Date()}
            fieldStyle={dateFieldStyle(!!formData.birthday)}
            textStyle={[TYPE.title2, { fontWeight: "600" }]}
          />
        </View>

        <View>
          <Text
            style={[
              TYPE.callout,
              { fontWeight: "700", color: COLORS.warmBrown, marginBottom: SPACING.sm },
            ]}
          >
            💝 Gotcha day (optional)
          </Text>
          <DateField
            value={formData.adoptionDate}
            placeholder="Add an adoption / gotcha day"
            onChange={(adoptionDate) => setFormData((prev) => ({ ...prev, adoptionDate }))}
            maximumDate={new Date()}
            fieldStyle={dateFieldStyle(!!formData.adoptionDate)}
            textStyle={[TYPE.title2, { fontWeight: "600" }]}
          />
        </View>
      </View>
    </View>
  );
};

// Step 8: Notes (Optional)
const StepNotes = ({ formData, setFormData }) => {
  const dogName = formData.name || "your dog";

  return (
    <View style={{ flex: 1, paddingTop: SPACING.huge }}>
      <Text style={{ fontSize: 72, textAlign: "center", marginBottom: SPACING.xxxl }}>
        📝
      </Text>
      <Text
        style={[
          TYPE.largeTitle,
          { color: COLORS.warmBrown, marginBottom: SPACING.md, lineHeight: 40 },
        ]}
      >
        Anything important we should remember about {dogName}?
      </Text>
      <Text
        style={[
          TYPE.headline,
          {
            color: COLORS.mutedBrown,
            fontWeight: "500",
            marginBottom: 30,
            lineHeight: 24,
          },
        ]}
      >
        This can include allergies, food preferences, medical conditions,
        behavior notes, or anything useful
      </Text>

      <TextInput
        style={[
          TYPE.body,
          {
            backgroundColor: MATERIALS.surfaceSunken,
            borderRadius: RADIUS.control,
            padding: SPACING.lg,
            color: COLORS.warmBrown,
            borderWidth: 2,
            borderColor: formData.notes ? COLORS.coral : MATERIALS.hairline,
            minHeight: 160,
            textAlignVertical: "top",
          },
        ]}
        placeholder="e.g. Allergic to chicken, loves long walks, nervous around loud noises..."
        placeholderTextColor={COLORS.mutedBrown}
        value={formData.notes}
        onChangeText={(text) =>
          setFormData((prev) => ({ ...prev, notes: text }))
        }
        multiline
      />
    </View>
  );
};

// Step 9: Review
const StepReview = ({ formData, goToStep }) => {
  const dogName = formData.name || "Your dog";

  return (
    <View style={{ flex: 1, paddingTop: SPACING.xl }}>
      <Text style={{ fontSize: 72, textAlign: "center", marginBottom: SPACING.xxl }}>
        ✨
      </Text>
      <Text
        style={[
          TYPE.largeTitle,
          {
            color: COLORS.warmBrown,
            marginBottom: SPACING.md,
            lineHeight: 40,
            textAlign: "center",
          },
        ]}
      >
        {dogName}'s profile
      </Text>
      <Text
        style={[
          TYPE.headline,
          {
            color: COLORS.mutedBrown,
            fontWeight: "500",
            marginBottom: SPACING.xxxl,
            lineHeight: 24,
            textAlign: "center",
          },
        ]}
      >
        Review and edit before creating the profile
      </Text>

      {/* Profile card */}
      <Card
        level="md"
        radius={RADIUS.card}
        style={{
          padding: SPACING.xxl,
          gap: SPACING.xl,
        }}
      >
        {/* Photo */}
        <View style={{ alignItems: "center", marginBottom: SPACING.sm }}>
          {formData.photo ? (
            <Image
              source={{ uri: formData.photo }}
              style={{ width: 120, height: 120, borderRadius: 60 }}
              contentFit="cover"
            />
          ) : (
            <View
              style={{
                width: 120,
                height: 120,
                borderRadius: 60,
                backgroundColor: MATERIALS.surfaceSunken,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Text style={{ fontSize: 60 }}>🐕</Text>
            </View>
          )}
        </View>

        {/* Profile details */}
        <ReviewRow
          label="Name"
          value={formData.name}
          onEdit={() => goToStep(0)}
        />
        <ReviewRow
          label="Handle"
          value={formData.handle ? `@${formData.handle}` : "Not set"}
          onEdit={() => goToStep(1)}
        />
        <ReviewRow
          label="Breed"
          value={formData.breed || "Not specified"}
          onEdit={() => goToStep(2)}
        />
        <ReviewRow
          label="Age"
          value={
            formData.ageYears || formData.ageMonths
              ? `${formData.ageYears || 0} years${
                  formData.ageMonths ? `, ${formData.ageMonths} months` : ""
                }`
              : "Not specified"
          }
          onEdit={() => goToStep(3)}
        />
        <ReviewRow
          label="Gender"
          value={
            formData.gender
              ? formData.gender.charAt(0).toUpperCase() +
                formData.gender.slice(1)
              : "Not specified"
          }
          onEdit={() => goToStep(4)}
        />
        <ReviewRow
          label="Weight"
          value={
            formData.weight
              ? `${formData.weight} ${formData.weightUnit}`
              : "Not specified"
          }
          onEdit={() => goToStep(5)}
        />
        <ReviewRow
          label="Special days"
          value={
            [
              formData.birthday ? `🎂 ${formatDisplayDate(formData.birthday)}` : null,
              formData.adoptionDate ? `💝 ${formatDisplayDate(formData.adoptionDate)}` : null,
            ]
              .filter(Boolean)
              .join("   ") || "Not specified"
          }
          onEdit={() => goToStep(6)}
        />
        <ReviewRow
          label="Notes"
          value={formData.notes || "None"}
          onEdit={() => goToStep(7)}
          multiline
        />
      </Card>
    </View>
  );
};

const ReviewRow = ({ label, value, onEdit, multiline }) => (
  <View
    style={{
      borderBottomWidth: 1,
      borderBottomColor: MATERIALS.hairline,
      paddingBottom: SPACING.lg,
    }}
  >
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "flex-start",
        marginBottom: 6,
      }}
    >
      <Text
        style={[
          TYPE.subhead,
          {
            fontWeight: "700",
            color: COLORS.mutedBrown,
            textTransform: "uppercase",
          },
        ]}
      >
        {label}
      </Text>
      <TouchableOpacity onPress={onEdit}>
        <Text style={[TYPE.callout, { fontWeight: "700", color: COLORS.coral }]}>
          Edit
        </Text>
      </TouchableOpacity>
    </View>
    <Text
      style={[
        TYPE.headline,
        {
          fontWeight: "600",
          color: COLORS.warmBrown,
          lineHeight: multiline ? 22 : undefined,
        },
      ]}
      numberOfLines={multiline ? undefined : 1}
    >
      {value}
    </Text>
  </View>
);

// Success Screen — E6: the first session ends with the Care Ring STARTED. If the first moment was
// posted, we show the day-1 streak + the labelled "PawPi Welcome" paw; otherwise a gentle nudge to
// take the first photo to close today's ring. Never shames.
const StepSuccess = ({ formData, welcome, goToRoutines, goToFeed }) => {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const dogName = formData.name || "Your dog";
  const started = !!welcome?.streak;

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: COLORS.cream,
        paddingTop: insets.top + 60,
        paddingBottom: insets.bottom + SPACING.huge,
        paddingHorizontal: SPACING.xxl,
        justifyContent: "space-between",
      }}
    >
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <Text style={{ fontSize: 100, marginBottom: SPACING.xxl }}>🎉</Text>
        <Text
          style={[
            TYPE.largeTitle,
            {
              fontSize: 36,
              fontWeight: "900",
              color: COLORS.warmBrown,
              textAlign: "center",
              marginBottom: SPACING.lg,
              letterSpacing: -0.5,
            },
          ]}
        >
          {dogName} is ready!
        </Text>

        {started ? (
          <View
            style={{
              backgroundColor: "#FFE7D6",
              borderRadius: RADIUS.control,
              paddingVertical: SPACING.lg,
              paddingHorizontal: SPACING.xl,
              alignItems: "center",
              marginBottom: SPACING.lg,
              alignSelf: "stretch",
            }}
          >
            <Text style={[TYPE.title2, { fontWeight: "800", color: COLORS.terracotta }]}>
              {t("onboarding.streakStarted", { name: dogName })}
            </Text>
            <Text
              style={[
                TYPE.callout,
                { color: COLORS.mutedBrown, textAlign: "center", marginTop: 4 },
              ]}
            >
              {t("onboarding.welcomePaw", { name: dogName })}
            </Text>
          </View>
        ) : (
          <Text
            style={[
              TYPE.title2,
              {
                fontWeight: "600",
                color: COLORS.terracotta,
                textAlign: "center",
                lineHeight: 28,
                paddingHorizontal: SPACING.xl,
                marginBottom: SPACING.lg,
              },
            ]}
          >
            {t("onboarding.ringPrompt", { name: dogName })}
          </Text>
        )}

        <Text
          style={[
            TYPE.title2,
            {
              fontWeight: "500",
              color: COLORS.mutedBrown,
              textAlign: "center",
              lineHeight: 28,
              paddingHorizontal: SPACING.xl,
            },
          ]}
        >
          Now you can start tracking care, sharing moments, and meeting pet
          friends.
        </Text>
      </View>

      <View style={{ gap: SPACING.md }}>
        <PressableScale
          onPress={goToRoutines}
          style={{
            backgroundColor: COLORS.coral,
            borderRadius: RADIUS.control,
            paddingVertical: SPACING.lg,
            alignItems: "center",
            shadowColor: COLORS.coral,
            ...ELEVATION.sm,
          }}
        >
          <Text style={[TYPE.headline, { color: "#FFF" }]}>Set care routine</Text>
        </PressableScale>

        <PressableScale
          onPress={goToFeed}
          style={{
            backgroundColor: MATERIALS.surfaceSunken,
            borderRadius: RADIUS.control,
            paddingVertical: SPACING.lg,
            alignItems: "center",
            borderWidth: 2,
            borderColor: MATERIALS.hairline,
          }}
        >
          <Text style={[TYPE.headline, { color: COLORS.coral }]}>Go to Feed</Text>
        </PressableScale>
      </View>
    </View>
  );
};
