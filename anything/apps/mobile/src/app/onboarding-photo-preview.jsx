import React, { useState, useRef } from "react";
import { View, Text, Alert, Platform } from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { RefreshCw, Image as ImageIcon } from "lucide-react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import * as ExpoCamera from "expo-camera";
import { COLORS, TYPE, RADIUS, SPACING, ELEVATION } from "@/constants/theme";
import { PressableScale } from "@/components/ui";

// On web, expo-image-picker returns a transient blob: URL (URL.createObjectURL)
// that is revoked on page reload and can't be turned into an upload file. Convert
// it to a self-contained base64 data URL so it survives AsyncStorage + reloads,
// renders in previews, and can be uploaded. Native file:// uris persist fine and
// are returned unchanged.
async function toPersistentPhotoUri(uri) {
  if (Platform.OS !== "web" || !uri || uri.startsWith("data:")) {
    return uri;
  }
  const blob = await fetch(uri).then((r) => r.blob());
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read photo"));
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}

export default function OnboardingPhotoPreviewScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams();
  const [photoUri, setPhotoUri] = useState(params.photoUri);
  const isPickingImage = useRef(false);

  const handleUsePhoto = async (shouldCreatePost) => {
    try {
      console.log("[PhotoPreview] Saving photo, createPost:", shouldCreatePost);

      // Save photo URI to be used in main onboarding. On web, persist a data URL
      // (the picker's blob: URL would be dead by the time onboarding reads it).
      const persistentUri = await toPersistentPhotoUri(photoUri);
      await AsyncStorage.setItem("onboarding_pet_photo", persistentUri);

      // Set flag for whether to create first daily moment post
      if (shouldCreatePost) {
        await AsyncStorage.setItem("create_first_moment", "true");
      } else {
        await AsyncStorage.removeItem("create_first_moment");
      }

      console.log("[PhotoPreview] Navigating to onboarding");
      router.push("/onboarding");
    } catch (error) {
      console.error("[PhotoPreview] Error saving photo:", error);
      Alert.alert("Error", "Could not save photo. Please try again.");
    }
  };

  const handleRetake = async () => {
    // Prevent multiple simultaneous picker calls
    if (isPickingImage.current) {
      console.log("[PhotoPreview] Camera picker already open, ignoring");
      return;
    }

    try {
      console.log("[PhotoPreview] Retaking photo");

      // Check camera permission
      const { status: currentStatus } =
        await ExpoCamera.Camera.getCameraPermissionsAsync();
      let permissionStatus = currentStatus;

      // Request permission if not granted (shouldn't happen since we already had it)
      if (permissionStatus !== "granted") {
        const { status } =
          await ExpoCamera.Camera.requestCameraPermissionsAsync();
        permissionStatus = status;

        if (status !== "granted") {
          Alert.alert(
            "Camera Permission Required",
            "Please enable camera access to take photos.",
          );
          return;
        }
      }

      isPickingImage.current = true;

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      isPickingImage.current = false;

      if (!result.canceled && result.assets && result.assets.length > 0) {
        console.log("[PhotoPreview] New photo captured");
        setPhotoUri(result.assets[0].uri);
      } else {
        console.log("[PhotoPreview] Camera cancelled");
      }
    } catch (error) {
      isPickingImage.current = false;
      console.error("[PhotoPreview] Camera error:", error);
      Alert.alert("Camera Error", "Could not open camera. Please try again.");
    }
  };

  const handleChooseAnother = async () => {
    // Prevent multiple simultaneous picker calls
    if (isPickingImage.current) {
      console.log("[PhotoPreview] Gallery picker already open, ignoring");
      return;
    }

    try {
      console.log("[PhotoPreview] Choosing another photo");

      // Check gallery permission
      const { status: currentStatus } =
        await ImagePicker.getMediaLibraryPermissionsAsync();
      let permissionStatus = currentStatus;

      // Request permission if not granted (shouldn't happen since we already had it)
      if (permissionStatus !== "granted" && permissionStatus !== "limited") {
        const { status } =
          await ImagePicker.requestMediaLibraryPermissionsAsync();
        permissionStatus = status;

        if (status !== "granted" && status !== "limited") {
          Alert.alert(
            "Photo Library Permission Required",
            "Please enable photo library access to choose photos.",
          );
          return;
        }
      }

      isPickingImage.current = true;

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      isPickingImage.current = false;

      if (!result.canceled && result.assets && result.assets.length > 0) {
        console.log("[PhotoPreview] New photo selected");
        setPhotoUri(result.assets[0].uri);
      } else {
        console.log("[PhotoPreview] Gallery cancelled");
      }
    } catch (error) {
      isPickingImage.current = false;
      console.error("[PhotoPreview] Gallery error:", error);
      Alert.alert("Gallery Error", "Could not open gallery. Please try again.");
    }
  };

  const handleSkip = () => {
    console.log("[PhotoPreview] Skipping photo");
    router.push("/onboarding");
  };

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: COLORS.cream,
        paddingTop: insets.top + SPACING.xl,
        paddingBottom: insets.bottom + SPACING.huge,
        paddingHorizontal: SPACING.xxl,
      }}
    >
      {/* Photo Preview */}
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        {/* Title */}
        <Text
          style={[
            TYPE.title,
            {
              fontSize: 28,
              color: COLORS.warmBrown,
              textAlign: "center",
              marginBottom: SPACING.sm,
              letterSpacing: -0.5,
            },
          ]}
        >
          Cute! Use this photo?
        </Text>

        <Text
          style={[
            TYPE.body,
            {
              color: COLORS.mutedBrown,
              textAlign: "center",
              marginBottom: SPACING.huge,
            },
          ]}
        >
          Choose how you'd like to use it
        </Text>

        {/* Photo */}
        <View
          style={{
            width: 280,
            height: 280,
            borderRadius: 140,
            overflow: "hidden",
            borderWidth: 4,
            borderColor: COLORS.coral,
            shadowColor: COLORS.coral,
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.3,
            shadowRadius: 16,
            elevation: 8,
            marginBottom: 50,
          }}
        >
          <Image
            source={{ uri: photoUri }}
            style={{ width: "100%", height: "100%" }}
            contentFit="cover"
          />
        </View>
      </View>

      {/* Action Buttons */}
      <View style={{ gap: SPACING.md }}>
        {/* Post as daily + use as profile photo - Primary */}
        <PressableScale
          onPress={() => handleUsePhoto(true)}
          accessibilityRole="button"
          style={{
            backgroundColor: COLORS.coral,
            borderRadius: RADIUS.control,
            paddingVertical: SPACING.lg,
            alignItems: "center",
            shadowColor: COLORS.coral,
            ...ELEVATION.sm,
          }}
        >
          <Text
            style={[
              TYPE.headline,
              {
                fontSize: 17,
                color: "#FFF",
                marginBottom: SPACING.xs,
              },
            ]}
          >
            Post as daily + use as profile photo
          </Text>
          <Text
            style={[
              TYPE.subhead,
              {
                color: "#FFF",
                opacity: 0.9,
              },
            ]}
          >
            Share this moment with friends
          </Text>
        </PressableScale>

        {/* Only use as profile photo - Secondary */}
        <PressableScale
          onPress={() => handleUsePhoto(false)}
          accessibilityRole="button"
          style={{
            backgroundColor: COLORS.sand,
            borderRadius: RADIUS.control,
            paddingVertical: SPACING.lg,
            alignItems: "center",
            borderWidth: 2,
            borderColor: COLORS.peach,
          }}
        >
          <Text
            style={[
              TYPE.headline,
              {
                fontSize: 17,
                color: COLORS.coral,
              },
            ]}
          >
            Only use as profile photo
          </Text>
          <Text
            style={[
              TYPE.subhead,
              {
                color: COLORS.mutedBrown,
              },
            ]}
          >
            Don't post to feed
          </Text>
        </PressableScale>

        {/* Secondary Actions Row */}
        <View style={{ flexDirection: "row", gap: SPACING.md, marginTop: SPACING.sm }}>
          {/* Retake */}
          <PressableScale
            onPress={handleRetake}
            disabled={isPickingImage.current}
            accessibilityRole="button"
            style={{
              flex: 1,
              backgroundColor: COLORS.sand,
              borderRadius: RADIUS.control,
              paddingVertical: SPACING.lg,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: SPACING.sm,
              borderWidth: 2,
              borderColor: COLORS.peach,
              opacity: isPickingImage.current ? 0.5 : 1,
            }}
          >
            <RefreshCw size={20} color={COLORS.mutedBrown} />
            <Text
              style={[
                TYPE.body,
                {
                  fontWeight: "700",
                  color: COLORS.mutedBrown,
                },
              ]}
            >
              Retake
            </Text>
          </PressableScale>

          {/* Choose Another */}
          <PressableScale
            onPress={handleChooseAnother}
            disabled={isPickingImage.current}
            accessibilityRole="button"
            style={{
              flex: 1,
              backgroundColor: COLORS.sand,
              borderRadius: RADIUS.control,
              paddingVertical: SPACING.lg,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: SPACING.sm,
              borderWidth: 2,
              borderColor: COLORS.peach,
              opacity: isPickingImage.current ? 0.5 : 1,
            }}
          >
            <ImageIcon size={20} color={COLORS.mutedBrown} />
            <Text
              style={[
                TYPE.body,
                {
                  fontWeight: "700",
                  color: COLORS.mutedBrown,
                },
              ]}
            >
              Choose
            </Text>
          </PressableScale>
        </View>

        {/* Skip Photo */}
        <PressableScale
          onPress={handleSkip}
          style={{
            paddingVertical: SPACING.md,
            alignItems: "center",
          }}
        >
          <Text
            style={[
              TYPE.body,
              {
                fontWeight: "700",
                color: COLORS.mutedBrown,
                textDecorationLine: "underline",
              },
            ]}
          >
            Skip photo
          </Text>
        </PressableScale>
      </View>

      {/* Footer Helper Text */}
      <Text
        style={[
          TYPE.subhead,
          {
            color: COLORS.mutedBrown,
            textAlign: "center",
            marginTop: SPACING.xxl,
            opacity: 0.8,
          },
        ]}
      >
        Don't worry, you can change this later.
      </Text>
    </View>
  );
}
