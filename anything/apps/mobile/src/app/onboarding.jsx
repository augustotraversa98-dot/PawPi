import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  KeyboardAvoidingView,
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ChevronLeft, Check } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import AsyncStorage from "@react-native-async-storage/async-storage";
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

// The first required onboarding step whose field is still missing/invalid, or
// null when every required field (name, @handle, breed, age, gender, weight) is
// filled. Kept pure + exported so the gating is unit-testable and so the review
// step's "Create profile" guard and the per-step Next gate agree. Mirrors
// isProfileComplete() in utils/gettingStarted.js.
export function firstIncompleteRequiredStep(formData) {
  if (!formData.name.trim()) return 0;
  if (!isHandleAcceptable(formData.handle)) return 1;
  if (!formData.breed.trim()) return 2;
  // Approximate age is enough — years OR months OR a birthday.
  if (
    formData.ageYears.trim() === "" &&
    formData.ageMonths.trim() === "" &&
    !formData.birthday
  ) {
    return 3;
  }
  if (formData.gender !== "male" && formData.gender !== "female") return 4;
  if (!(parseFloat(formData.weight) > 0)) return 5;
  return null;
}

// age_years to persist. A months-only puppy (e.g. "6 months", no years entered)
// still resolves to 0 — not null — so isProfileComplete()'s `age_years != null`
// check passes and the profile checklist item completes. "" years + "" months
// (birthday-only path) stays null and lets `birthday` satisfy the age signal.
export function computeAgeYears(formData) {
  if (formData.ageYears !== "") return parseInt(formData.ageYears, 10);
  if (formData.ageMonths !== "") return 0;
  return null;
}

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();
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
    // Every required step is gated by canGoNext(); the Next button is disabled
    // while invalid, and this guard blocks programmatic advances (e.g. Skip) too
    // so we never silently create an incomplete profile.
    if (!canGoNext()) {
      // Surface the handle's specific inline error on the handle step.
      if (currentStep === 1) checkHandleUniqueness(formData.handle);
      return;
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
    // The review step lets the user jump back and edit any field, so re-check
    // every required field here and route to the first gap instead of creating
    // an incomplete profile.
    const firstGap = firstIncompleteRequiredStep(formData);
    if (firstGap != null) {
      setCurrentStep(firstGap);
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
        age_years: computeAgeYears(formData),
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
      alert(error.message || t("onboarding.saveProfileError"));
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

  // Required steps aligned with isProfileComplete() so a new dog completes the
  // "Set up your dog's profile" checklist item at creation: name, @handle, breed,
  // age (approx years OR a birthday), a real gender (male/female), and a weight.
  const canGoNext = () => {
    switch (currentStep) {
      case 0:
        return formData.name.trim().length > 0;
      case 1:
        return isHandleAcceptable(formData.handle);
      case 2:
        return formData.breed.trim().length > 0;
      case 3:
        // Approximate age is enough — years OR months OR a birthday. This lets
        // rescue/adopted dogs with an unknown exact birthday still complete it.
        return (
          formData.ageYears.trim() !== "" ||
          formData.ageMonths.trim() !== "" ||
          !!formData.birthday
        );
      case 4:
        return formData.gender === "male" || formData.gender === "female";
      case 5:
        return parseFloat(formData.weight) > 0;
      default:
        return true;
    }
  };

  // Inline validation copy for the current step (EN+ES) — shown above the CTA
  // while the required field is missing/invalid. Empty string = nothing to show.
  const validationMessage = () => {
    if (canGoNext()) return "";
    switch (currentStep) {
      case 0:
        return t("onboarding.validation.name");
      case 2:
        return t("onboarding.validation.breed");
      case 3:
        return t("onboarding.validation.age");
      case 4:
        return t("onboarding.validation.gender");
      case 5:
        return t("onboarding.validation.weight");
      // Step 1 (handle) renders its own specific inline error inside StepHandle.
      default:
        return "";
    }
  };

  // Only the birthday (6) and notes (7) steps are optional now.
  const isOptionalStep = currentStep === 6 || currentStep === 7;

  if (currentStep === TOTAL_STEPS) {
    // Success screen - full screen, no navigation
    return renderStep();
  }

  return (
    // Full-screen route (not a pageSheet), so RN's standard KeyboardAvoidingView
    // reliably shrinks the container to lift the footer's "Continue" above the
    // keyboard. The inner KeyboardAwareScrollView then scrolls the focused field
    // into view within that shortened viewport (it's built to cooperate with an
    // ancestor keyboard-avoider).
    <KeyboardAvoidingView
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
              {t("onboarding.stepOf", {
                current: currentStep + 1,
                total: TOTAL_STEPS,
              })}
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
            paddingBottom: SPACING.xxl,
          }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {renderStep()}
        </KeyboardAwareScrollView>

        {/* Bottom buttons — a normal flex-column child (NOT absolutely pinned) so
            the outer KeyboardAvoidingView lifts the whole footer, keeping
            "Continue" reachable above the keyboard while a field is focused. */}
        <View
          style={{
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
                    {t("onboarding.createProfile", {
                      name: formData.name || t("onboarding.yourDog"),
                    })}
                  </Text>
                  <Check size={22} color="#FFF" />
                </>
              )}
            </PressableScale>
          ) : (
            <>
              {/* Inline validation — explains what's missing before the CTA. */}
              {validationMessage() ? (
                <Text
                  testID="onboarding-validation"
                  style={[
                    TYPE.callout,
                    {
                      color: COLORS.coral,
                      fontWeight: "700",
                      textAlign: "center",
                      marginBottom: SPACING.md,
                    },
                  ]}
                >
                  {validationMessage()}
                </Text>
              ) : null}

              {/* Next button */}
              <PressableScale
                testID="onboarding-next"
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
                  {t("onboarding.next")}
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
                    {t("onboarding.skip")}
                  </Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

// Step 1: Dog Name (Required)
const StepName = ({ formData, setFormData }) => {
  const { t } = useTranslation();
  const inputRef = useRef(null);

  // Ticket 2.63: no auto-focus — the field is tappable; the keyboard opens on tap.

  return (
    <View style={{ flex: 1, paddingTop: SPACING.md }}>
      <Text
        style={{
          fontSize: 44,
          textAlign: "center",
          marginBottom: SPACING.md,
        }}
      >
        🐕
      </Text>
      <Text
        style={[
          TYPE.largeTitle,
          { color: COLORS.warmBrown, marginBottom: SPACING.sm, lineHeight: 34 },
        ]}
      >
        {t("onboarding.nameTitle")}
      </Text>
      <Text
        style={[
          TYPE.headline,
          {
            color: COLORS.mutedBrown,
            fontWeight: "500",
            marginBottom: SPACING.lg,
            lineHeight: 22,
          },
        ]}
      >
        {t("onboarding.nameSubtitle")}
      </Text>
      <TextInput
        ref={inputRef}
        testID="onboarding-name"
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
        placeholder={t("onboarding.namePlaceholder")}
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
  const { t } = useTranslation();
  const dogName = formData.name || t("onboarding.yourDog");

  return (
    <View style={{ flex: 1, paddingTop: SPACING.md }}>
      <Text style={{ fontSize: 44, textAlign: "center", marginBottom: SPACING.md }}>
        @
      </Text>
      <Text
        style={[
          TYPE.largeTitle,
          { color: COLORS.warmBrown, marginBottom: SPACING.sm, lineHeight: 34 },
        ]}
      >
        {t("onboarding.handleTitle", { name: dogName })}
      </Text>
      <Text
        style={[
          TYPE.headline,
          {
            color: COLORS.mutedBrown,
            fontWeight: "500",
            marginBottom: SPACING.lg,
            lineHeight: 22,
          },
        ]}
      >
        {t("onboarding.handleSubtitle", { name: dogName })}
      </Text>

      {/* Suggested handles — compact rows so all suggestions AND the
          "Or create your own" input stay visible on one screen (iPhone SE). */}
      {suggestedHandles.length > 0 && (
        <View style={{ marginBottom: SPACING.lg }}>
          <Text
            style={[
              TYPE.callout,
              { fontWeight: "700", color: COLORS.mutedBrown, marginBottom: SPACING.sm },
            ]}
          >
            {t("onboarding.handleSuggested")}
          </Text>
          <View style={{ gap: SPACING.xs }}>
            {suggestedHandles.map((handle, index) => {
              const selected = formData.handle === handle;
              return (
                <PressableScale
                  key={index}
                  onPress={() => {
                    setFormData((prev) => ({ ...prev, handle }));
                    checkHandleUniqueness(handle);
                  }}
                  style={{
                    backgroundColor: selected ? COLORS.coral : MATERIALS.surfaceSunken,
                    paddingVertical: 9,
                    paddingHorizontal: SPACING.lg,
                    borderRadius: RADIUS.control,
                    borderWidth: 2,
                    borderColor: selected ? COLORS.coral : MATERIALS.hairline,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <Text
                    style={[
                      TYPE.callout,
                      {
                        fontWeight: "600",
                        color: selected ? "#FFF" : COLORS.warmBrown,
                      },
                    ]}
                  >
                    @{handle}
                  </Text>
                  {/* Check makes the selected row unambiguous beyond the fill. */}
                  {selected ? <Check size={18} color="#FFF" /> : null}
                </PressableScale>
              );
            })}
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
        {t("onboarding.handleCreateOwn")}
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
        placeholder={t("onboarding.handlePlaceholder")}
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
  const { t } = useTranslation();
  const dogName = formData.name || t("onboarding.yourDog");

  // Canonical breed values persist to the backend in English (comparisons rely on
  // them); only the button label is localized.
  const quickBreeds = [
    { value: "Mixed Breed", label: t("onboarding.breedMixed") },
    { value: "I'm not sure", label: t("onboarding.breedNotSure") },
  ];
  const quickBreedValues = quickBreeds.map((b) => b.value);

  return (
    <View style={{ flex: 1, paddingTop: SPACING.md }}>
      <Text style={{ fontSize: 44, textAlign: "center", marginBottom: SPACING.md }}>
        🐾
      </Text>
      <Text
        style={[
          TYPE.largeTitle,
          { color: COLORS.warmBrown, marginBottom: SPACING.sm, lineHeight: 34 },
        ]}
      >
        {t("onboarding.breedTitle", { name: dogName })}
      </Text>
      <Text
        style={[
          TYPE.headline,
          {
            color: COLORS.mutedBrown,
            fontWeight: "500",
            marginBottom: SPACING.lg,
            lineHeight: 22,
          },
        ]}
      >
        {t("onboarding.breedSubtitle")}
      </Text>

      {/* Quick options */}
      <View style={{ gap: SPACING.sm, marginBottom: SPACING.xl }}>
        {quickBreeds.map(({ value, label }) => (
          <PressableScale
            key={value}
            onPress={() => setFormData((prev) => ({ ...prev, breed: value }))}
            style={{
              backgroundColor:
                formData.breed === value ? COLORS.coral : MATERIALS.surfaceSunken,
              paddingVertical: 14,
              paddingHorizontal: SPACING.lg,
              borderRadius: RADIUS.control,
              borderWidth: 2,
              borderColor:
                formData.breed === value ? COLORS.coral : MATERIALS.hairline,
            }}
          >
            <Text
              style={[
                TYPE.headline,
                { color: formData.breed === value ? "#FFF" : COLORS.warmBrown },
              ]}
            >
              {label}
            </Text>
          </PressableScale>
        ))}
      </View>

      {/* Custom breed input */}
      <TextInput
        testID="onboarding-breed"
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
              formData.breed && !quickBreedValues.includes(formData.breed)
                ? COLORS.coral
                : MATERIALS.hairline,
          },
        ]}
        placeholder={t("onboarding.breedPlaceholder")}
        placeholderTextColor={COLORS.mutedBrown}
        value={quickBreedValues.includes(formData.breed) ? "" : formData.breed}
        onChangeText={(text) =>
          setFormData((prev) => ({ ...prev, breed: text }))
        }
        autoCapitalize="words"
      />
    </View>
  );
};

// Step 4: Age (Required — approximate years OR months OR a birthday).
const StepAge = ({ formData, setFormData }) => {
  const { t } = useTranslation();
  const dogName = formData.name || t("onboarding.yourDog");

  return (
    <View style={{ flex: 1, paddingTop: SPACING.md }}>
      <Text style={{ fontSize: 44, textAlign: "center", marginBottom: SPACING.md }}>
        🎂
      </Text>
      <Text
        style={[
          TYPE.largeTitle,
          { color: COLORS.warmBrown, marginBottom: SPACING.sm, lineHeight: 34 },
        ]}
      >
        {t("onboarding.ageTitle", { name: dogName })}
      </Text>
      <Text
        style={[
          TYPE.headline,
          {
            color: COLORS.mutedBrown,
            fontWeight: "500",
            marginBottom: SPACING.lg,
            lineHeight: 22,
          },
        ]}
      >
        {t("onboarding.ageSubtitle")}
      </Text>

      <View style={{ gap: SPACING.lg }}>
        <View>
          <Text
            style={[
              TYPE.callout,
              { fontWeight: "700", color: COLORS.warmBrown, marginBottom: SPACING.sm },
            ]}
          >
            {t("onboarding.ageYearsLabel")}
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
            testID="onboarding-age-years"
          />
        </View>

        <View>
          <Text
            style={[
              TYPE.callout,
              { fontWeight: "700", color: COLORS.warmBrown, marginBottom: SPACING.sm },
            ]}
          >
            {t("onboarding.ageMonthsLabel")}
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
            testID="onboarding-age-months"
          />
        </View>

        {/* Rescue/adopted dogs: an approximate age is enough to continue. */}
        <Text
          style={[
            TYPE.callout,
            { color: COLORS.mutedBrown, textAlign: "center" },
          ]}
        >
          {t("onboarding.ageApprox")}
        </Text>
      </View>
    </View>
  );
};

// Step 5: Gender (Optional)
const StepGender = ({ formData, setFormData }) => {
  const { t } = useTranslation();
  const dogName = formData.name || t("onboarding.yourDog");

  // Gender must be a real value — the "Set up your dog's profile" checklist
  // excludes "unknown", so onboarding offers only male/female.
  const genderOptions = [
    { value: "female", label: t("onboarding.genderFemale"), emoji: "♀️" },
    { value: "male", label: t("onboarding.genderMale"), emoji: "♂️" },
  ];

  return (
    <View style={{ flex: 1, paddingTop: SPACING.md }}>
      <Text style={{ fontSize: 44, textAlign: "center", marginBottom: SPACING.md }}>
        💙
      </Text>
      <Text
        style={[
          TYPE.largeTitle,
          { color: COLORS.warmBrown, marginBottom: SPACING.sm, lineHeight: 34 },
        ]}
      >
        {t("onboarding.genderTitle", { name: dogName })}
      </Text>
      <Text
        style={[
          TYPE.headline,
          {
            color: COLORS.mutedBrown,
            fontWeight: "500",
            marginBottom: SPACING.lg,
            lineHeight: 22,
          },
        ]}
      >
        {t("onboarding.genderSubtitle")}
      </Text>

      <View style={{ gap: SPACING.md }}>
        {genderOptions.map((option) => {
          const selected = formData.gender === option.value;
          return (
            <PressableScale
              key={option.value}
              testID={`onboarding-gender-${option.value}`}
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
  const { t } = useTranslation();
  const dogName = formData.name || t("onboarding.yourDog");
  const inputRef = useRef(null);

  // Ticket 2.63: no auto-focus — the field is tappable; the keyboard opens on tap.

  return (
    <View style={{ flex: 1, paddingTop: SPACING.md }}>
      <Text style={{ fontSize: 44, textAlign: "center", marginBottom: SPACING.md }}>
        ⚖️
      </Text>
      <Text
        style={[
          TYPE.largeTitle,
          { color: COLORS.warmBrown, marginBottom: SPACING.sm, lineHeight: 34 },
        ]}
      >
        {t("onboarding.weightTitle", { name: dogName })}
      </Text>
      <Text
        style={[
          TYPE.headline,
          {
            color: COLORS.mutedBrown,
            fontWeight: "500",
            marginBottom: SPACING.lg,
            lineHeight: 22,
          },
        ]}
      >
        {t("onboarding.weightSubtitle")}
      </Text>

      <TextInput
        ref={inputRef}
        testID="onboarding-weight"
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
  const { t } = useTranslation();
  const dogName = formData.name || t("onboarding.yourDog");

  // Only one inline calendar may be open at a time — opening Gotcha collapses
  // Birthday and vice-versa, so the two pickers never overlap/sprawl.
  const [openField, setOpenField] = useState(null); // "birthday" | "gotcha" | null

  const dateFieldStyle = (filled) => ({
    backgroundColor: MATERIALS.surfaceSunken,
    borderRadius: RADIUS.control,
    padding: SPACING.lg,
    borderWidth: 2,
    borderColor: filled ? COLORS.coral : MATERIALS.hairline,
  });

  return (
    <View style={{ flex: 1, paddingTop: SPACING.md }}>
      <Text style={{ fontSize: 44, textAlign: "center", marginBottom: SPACING.md }}>
        📅
      </Text>
      <Text
        style={[
          TYPE.largeTitle,
          { color: COLORS.warmBrown, marginBottom: SPACING.sm, lineHeight: 34 },
        ]}
      >
        {t("onboarding.birthdayTitle", { name: dogName })}
      </Text>
      <Text
        style={[
          TYPE.headline,
          {
            color: COLORS.mutedBrown,
            fontWeight: "500",
            marginBottom: SPACING.lg,
            lineHeight: 22,
          },
        ]}
      >
        {t("onboarding.birthdaySubtitle")}
      </Text>

      <View style={{ gap: SPACING.lg }}>
        <View>
          <Text
            style={[
              TYPE.callout,
              { fontWeight: "700", color: COLORS.warmBrown, marginBottom: SPACING.sm },
            ]}
          >
            {t("onboarding.birthdayLabel")}
          </Text>
          <DateField
            value={formData.birthday}
            placeholder={t("onboarding.birthdayPlaceholder")}
            onChange={(birthday) => setFormData((prev) => ({ ...prev, birthday }))}
            maximumDate={new Date()}
            fieldStyle={dateFieldStyle(!!formData.birthday)}
            textStyle={[TYPE.title2, { fontWeight: "600" }]}
            open={openField === "birthday"}
            onToggle={(next) => setOpenField(next ? "birthday" : null)}
          />
        </View>

        <View>
          <Text
            style={[
              TYPE.callout,
              { fontWeight: "700", color: COLORS.warmBrown, marginBottom: SPACING.sm },
            ]}
          >
            {t("onboarding.gotchaLabel")}
          </Text>
          <DateField
            value={formData.adoptionDate}
            placeholder={t("onboarding.gotchaPlaceholder")}
            onChange={(adoptionDate) => setFormData((prev) => ({ ...prev, adoptionDate }))}
            maximumDate={new Date()}
            fieldStyle={dateFieldStyle(!!formData.adoptionDate)}
            textStyle={[TYPE.title2, { fontWeight: "600" }]}
            open={openField === "gotcha"}
            onToggle={(next) => setOpenField(next ? "gotcha" : null)}
          />
        </View>
      </View>

      {/* When a calendar is open, reserve extra scroll room so its last week
          row + the fixed footer stay reachable (the inline iOS calendar is
          ~320pt tall and would otherwise sit behind the footer). */}
      {openField ? <View style={{ height: 340 }} /> : null}
    </View>
  );
};

// Step 8: Notes (Optional)
const StepNotes = ({ formData, setFormData }) => {
  const { t } = useTranslation();
  const dogName = formData.name || t("onboarding.yourDog");

  return (
    <View style={{ flex: 1, paddingTop: SPACING.md }}>
      <Text style={{ fontSize: 44, textAlign: "center", marginBottom: SPACING.md }}>
        📝
      </Text>
      <Text
        style={[
          TYPE.largeTitle,
          { color: COLORS.warmBrown, marginBottom: SPACING.sm, lineHeight: 34 },
        ]}
      >
        {t("onboarding.notesTitle", { name: dogName })}
      </Text>
      <Text
        style={[
          TYPE.headline,
          {
            color: COLORS.mutedBrown,
            fontWeight: "500",
            marginBottom: SPACING.lg,
            lineHeight: 22,
          },
        ]}
      >
        {t("onboarding.notesSubtitle")}
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
        placeholder={t("onboarding.notesPlaceholder")}
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
  const { t } = useTranslation();
  const dogName = formData.name || t("onboarding.yourDogCap");

  const ageValue =
    formData.ageYears || formData.ageMonths
      ? `${formData.ageYears || 0} ${t("onboarding.reviewYearsUnit")}${
          formData.ageMonths
            ? `, ${formData.ageMonths} ${t("onboarding.reviewMonthsUnit")}`
            : ""
        }`
      : t("onboarding.reviewNotSpecified");

  const genderValue =
    formData.gender === "male"
      ? t("onboarding.genderMale")
      : formData.gender === "female"
        ? t("onboarding.genderFemale")
        : t("onboarding.reviewNotSpecified");

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
        {t("onboarding.reviewTitle", { name: dogName })}
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
        {t("onboarding.reviewSubtitle")}
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
          label={t("onboarding.reviewName")}
          value={formData.name}
          onEdit={() => goToStep(0)}
        />
        <ReviewRow
          label={t("onboarding.reviewHandle")}
          value={
            formData.handle ? `@${formData.handle}` : t("onboarding.reviewNotSet")
          }
          onEdit={() => goToStep(1)}
        />
        <ReviewRow
          label={t("onboarding.reviewBreed")}
          value={formData.breed || t("onboarding.reviewNotSpecified")}
          onEdit={() => goToStep(2)}
        />
        <ReviewRow
          label={t("onboarding.reviewAge")}
          value={ageValue}
          onEdit={() => goToStep(3)}
        />
        <ReviewRow
          label={t("onboarding.reviewGender")}
          value={genderValue}
          onEdit={() => goToStep(4)}
        />
        <ReviewRow
          label={t("onboarding.reviewWeight")}
          value={
            formData.weight
              ? `${formData.weight} ${formData.weightUnit}`
              : t("onboarding.reviewNotSpecified")
          }
          onEdit={() => goToStep(5)}
        />
        <ReviewRow
          label={t("onboarding.reviewSpecialDays")}
          value={
            [
              formData.birthday ? `🎂 ${formatDisplayDate(formData.birthday)}` : null,
              formData.adoptionDate ? `💝 ${formatDisplayDate(formData.adoptionDate)}` : null,
            ]
              .filter(Boolean)
              .join("   ") || t("onboarding.reviewNotSpecified")
          }
          onEdit={() => goToStep(6)}
        />
        <ReviewRow
          label={t("onboarding.reviewNotes")}
          value={formData.notes || t("onboarding.reviewNone")}
          onEdit={() => goToStep(7)}
          multiline
        />
      </Card>
    </View>
  );
};

const ReviewRow = ({ label, value, onEdit, multiline }) => {
  const { t } = useTranslation();
  return (
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
          {t("onboarding.reviewEdit")}
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
};

// Success Screen — E6: the first session ends with the Care Ring STARTED. If the first moment was
// posted, we show the day-1 streak + the labelled "PawPi Welcome" paw; otherwise a gentle nudge to
// take the first photo to close today's ring. Never shames.
const StepSuccess = ({ formData, welcome, goToRoutines, goToFeed }) => {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const dogName = formData.name || t("onboarding.yourDogCap");
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
          {t("onboarding.successReady", { name: dogName })}
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
          {t("onboarding.successSubtitle")}
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
          <Text style={[TYPE.headline, { color: "#FFF" }]}>
            {t("onboarding.successSetRoutine")}
          </Text>
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
          <Text style={[TYPE.headline, { color: COLORS.coral }]}>
            {t("onboarding.successGoToFeed")}
          </Text>
        </PressableScale>
      </View>
    </View>
  );
};
