import React, { useState, useRef } from "react";
import { View, Text, TouchableOpacity, Alert } from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Check, RefreshCw, Image as ImageIcon, X } from "lucide-react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import * as ExpoCamera from "expo-camera";

const C = {
  coral: "#FF6F61",
  cream: "#FFF7EF",
  sand: "#F8EBDD",
  warmBrown: "#3B241B",
  mutedBrown: "#7A6254",
  peach: "#FFD9B3",
};

export default function OnboardingPhotoPreviewScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams();
  const [photoUri, setPhotoUri] = useState(params.photoUri);
  const isPickingImage = useRef(false);

  const handleUsePhoto = async (shouldCreatePost) => {
    try {
      console.log("[PhotoPreview] Saving photo, createPost:", shouldCreatePost);

      // Save photo URI to be used in main onboarding
      await AsyncStorage.setItem("onboarding_pet_photo", photoUri);

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
        backgroundColor: C.cream,
        paddingTop: insets.top + 20,
        paddingBottom: insets.bottom + 40,
        paddingHorizontal: 24,
      }}
    >
      {/* Photo Preview */}
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        {/* Title */}
        <Text
          style={{
            fontSize: 28,
            fontWeight: "900",
            color: C.warmBrown,
            textAlign: "center",
            marginBottom: 8,
            letterSpacing: -0.5,
          }}
        >
          Cute! Use this photo?
        </Text>

        <Text
          style={{
            fontSize: 15,
            color: C.mutedBrown,
            textAlign: "center",
            marginBottom: 40,
          }}
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
            borderColor: C.coral,
            shadowColor: C.coral,
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
      <View style={{ gap: 12 }}>
        {/* Post as daily + use as profile photo - Primary */}
        <TouchableOpacity
          onPress={() => handleUsePhoto(true)}
          style={{
            backgroundColor: C.coral,
            borderRadius: 18,
            paddingVertical: 18,
            alignItems: "center",
            shadowColor: C.coral,
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.3,
            shadowRadius: 12,
            elevation: 6,
          }}
        >
          <Text
            style={{
              fontSize: 17,
              fontWeight: "800",
              color: "#FFF",
              marginBottom: 4,
            }}
          >
            Post as daily + use as profile photo
          </Text>
          <Text
            style={{
              fontSize: 13,
              fontWeight: "600",
              color: "#FFF",
              opacity: 0.9,
            }}
          >
            Share this moment with friends
          </Text>
        </TouchableOpacity>

        {/* Only use as profile photo - Secondary */}
        <TouchableOpacity
          onPress={() => handleUsePhoto(false)}
          style={{
            backgroundColor: C.sand,
            borderRadius: 18,
            paddingVertical: 18,
            alignItems: "center",
            borderWidth: 2,
            borderColor: C.peach,
          }}
        >
          <Text
            style={{
              fontSize: 17,
              fontWeight: "800",
              color: C.coral,
            }}
          >
            Only use as profile photo
          </Text>
          <Text
            style={{
              fontSize: 13,
              fontWeight: "600",
              color: C.mutedBrown,
            }}
          >
            Don't post to feed
          </Text>
        </TouchableOpacity>

        {/* Secondary Actions Row */}
        <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
          {/* Retake */}
          <TouchableOpacity
            onPress={handleRetake}
            disabled={isPickingImage.current}
            style={{
              flex: 1,
              backgroundColor: C.sand,
              borderRadius: 16,
              paddingVertical: 16,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              borderWidth: 2,
              borderColor: C.peach,
              opacity: isPickingImage.current ? 0.5 : 1,
            }}
          >
            <RefreshCw size={20} color={C.mutedBrown} />
            <Text
              style={{
                fontSize: 15,
                fontWeight: "700",
                color: C.mutedBrown,
              }}
            >
              Retake
            </Text>
          </TouchableOpacity>

          {/* Choose Another */}
          <TouchableOpacity
            onPress={handleChooseAnother}
            disabled={isPickingImage.current}
            style={{
              flex: 1,
              backgroundColor: C.sand,
              borderRadius: 16,
              paddingVertical: 16,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              borderWidth: 2,
              borderColor: C.peach,
              opacity: isPickingImage.current ? 0.5 : 1,
            }}
          >
            <ImageIcon size={20} color={C.mutedBrown} />
            <Text
              style={{
                fontSize: 15,
                fontWeight: "700",
                color: C.mutedBrown,
              }}
            >
              Choose
            </Text>
          </TouchableOpacity>
        </View>

        {/* Skip Photo */}
        <TouchableOpacity
          onPress={handleSkip}
          style={{
            paddingVertical: 14,
            alignItems: "center",
          }}
        >
          <Text
            style={{
              fontSize: 15,
              fontWeight: "700",
              color: C.mutedBrown,
              textDecorationLine: "underline",
            }}
          >
            Skip photo
          </Text>
        </TouchableOpacity>
      </View>

      {/* Footer Helper Text */}
      <Text
        style={{
          fontSize: 13,
          color: C.mutedBrown,
          textAlign: "center",
          marginTop: 24,
          opacity: 0.8,
        }}
      >
        Don't worry, you can change this later.
      </Text>
    </View>
  );
}
