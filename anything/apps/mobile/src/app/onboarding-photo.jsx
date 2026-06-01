import React, { useState, useEffect, useRef } from "react";
import { View, Text, TouchableOpacity, Alert, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Camera as CameraIcon, Image as ImageIcon } from "lucide-react-native";
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

export default function OnboardingPhotoScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [cameraPermission, setCameraPermission] = useState(null);
  const [galleryPermission, setGalleryPermission] = useState(null);
  const isPickingImage = useRef(false);

  useEffect(() => {
    // Check existing permissions on mount
    (async () => {
      const cameraStatus = await ExpoCamera.Camera.getCameraPermissionsAsync();
      const galleryStatus = await ImagePicker.getMediaLibraryPermissionsAsync();
      setCameraPermission(cameraStatus.status);
      setGalleryPermission(galleryStatus.status);
      console.log(
        "[OnboardingPhoto] Initial permissions - Camera:",
        cameraStatus.status,
        "Gallery:",
        galleryStatus.status,
      );
    })();
  }, []);

  const showPermissionDeniedAlert = (type) => {
    const isCamera = type === "camera";
    Alert.alert(
      isCamera ? "Camera Access Required" : "Photo Library Access Required",
      isCamera
        ? "Photo access is turned off. You can enable it in Settings or skip for now."
        : "Photo access is turned off. You can enable it in Settings or skip for now.",
      [
        {
          text: "Skip for now",
          style: "cancel",
        },
        {
          text: "Open Settings",
          onPress: () => {
            Linking.openSettings();
          },
        },
      ],
    );
  };

  const openCamera = async () => {
    // Prevent multiple simultaneous picker calls
    if (isPickingImage.current) {
      console.log("[OnboardingPhoto] Camera picker already open, ignoring");
      return;
    }

    try {
      console.log(
        "[OnboardingPhoto] Opening camera, current permission:",
        cameraPermission,
      );

      // Check current permission status
      let permissionStatus = cameraPermission;

      // If permission is not granted, request it
      if (permissionStatus !== "granted") {
        console.log("[OnboardingPhoto] Requesting camera permission");
        const { status } =
          await ExpoCamera.Camera.requestCameraPermissionsAsync();
        permissionStatus = status;
        setCameraPermission(status);
        console.log("[OnboardingPhoto] Camera permission result:", status);

        if (status !== "granted") {
          console.log("[OnboardingPhoto] Camera permission denied");
          showPermissionDeniedAlert("camera");
          return;
        }
      }

      // Permission granted, open camera
      isPickingImage.current = true;
      console.log("[OnboardingPhoto] Launching camera");

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      isPickingImage.current = false;

      if (!result.canceled && result.assets && result.assets.length > 0) {
        console.log("[OnboardingPhoto] Photo captured, navigating to preview");
        router.push({
          pathname: "/onboarding-photo-preview",
          params: { photoUri: result.assets[0].uri },
        });
      } else {
        console.log("[OnboardingPhoto] Camera cancelled");
      }
    } catch (error) {
      isPickingImage.current = false;
      console.error("[OnboardingPhoto] Camera error:", error);
      Alert.alert("Camera Error", "Could not open camera. Please try again.");
    }
  };

  const openGallery = async () => {
    // Prevent multiple simultaneous picker calls
    if (isPickingImage.current) {
      console.log("[OnboardingPhoto] Gallery picker already open, ignoring");
      return;
    }

    try {
      console.log(
        "[OnboardingPhoto] Opening gallery, current permission:",
        galleryPermission,
      );

      // Check current permission status
      let permissionStatus = galleryPermission;

      // If permission is not granted or limited, request it
      if (permissionStatus !== "granted" && permissionStatus !== "limited") {
        console.log("[OnboardingPhoto] Requesting gallery permission");
        const { status } =
          await ImagePicker.requestMediaLibraryPermissionsAsync();
        permissionStatus = status;
        setGalleryPermission(status);
        console.log("[OnboardingPhoto] Gallery permission result:", status);

        if (status !== "granted" && status !== "limited") {
          console.log("[OnboardingPhoto] Gallery permission denied");
          showPermissionDeniedAlert("gallery");
          return;
        }
      }

      // Permission granted or limited, open gallery
      isPickingImage.current = true;
      console.log("[OnboardingPhoto] Launching gallery");

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      isPickingImage.current = false;

      if (!result.canceled && result.assets && result.assets.length > 0) {
        console.log("[OnboardingPhoto] Photo selected, navigating to preview");
        router.push({
          pathname: "/onboarding-photo-preview",
          params: { photoUri: result.assets[0].uri },
        });
      } else {
        console.log("[OnboardingPhoto] Gallery cancelled");
      }
    } catch (error) {
      isPickingImage.current = false;
      console.error("[OnboardingPhoto] Gallery error:", error);
      Alert.alert("Gallery Error", "Could not open gallery. Please try again.");
    }
  };

  const handleSkip = () => {
    console.log("[OnboardingPhoto] Skipping photo, navigating to onboarding");
    router.push("/onboarding");
  };

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: C.cream,
        paddingTop: insets.top + 40,
        paddingBottom: insets.bottom + 40,
        paddingHorizontal: 24,
      }}
    >
      {/* Header */}
      <View style={{ flex: 1, justifyContent: "center" }}>
        <View style={{ alignItems: "center", marginBottom: 60 }}>
          {/* Emoji Icon */}
          <Text style={{ fontSize: 80, marginBottom: 24 }}>📸</Text>

          {/* Title */}
          <Text
            style={{
              fontSize: 32,
              fontWeight: "900",
              color: C.warmBrown,
              textAlign: "center",
              marginBottom: 16,
              letterSpacing: -0.5,
            }}
          >
            Let's meet your dog
          </Text>

          {/* Subtitle */}
          <Text
            style={{
              fontSize: 17,
              color: C.mutedBrown,
              textAlign: "center",
              lineHeight: 26,
              paddingHorizontal: 20,
            }}
          >
            Start with a photo. You can use it as your dog's first pet moment.
          </Text>
        </View>

        {/* Action Buttons */}
        <View style={{ gap: 16 }}>
          {/* Open Camera - Primary */}
          <TouchableOpacity
            onPress={openCamera}
            disabled={isPickingImage.current}
            style={{
              backgroundColor: C.coral,
              borderRadius: 18,
              paddingVertical: 18,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
              shadowColor: C.coral,
              shadowOffset: { width: 0, height: 6 },
              shadowOpacity: 0.3,
              shadowRadius: 12,
              elevation: 6,
              opacity: isPickingImage.current ? 0.5 : 1,
            }}
          >
            <CameraIcon size={24} color="#FFF" />
            <Text
              style={{
                fontSize: 17,
                fontWeight: "800",
                color: "#FFF",
              }}
            >
              Open camera
            </Text>
          </TouchableOpacity>

          {/* Choose from Gallery */}
          <TouchableOpacity
            onPress={openGallery}
            disabled={isPickingImage.current}
            style={{
              backgroundColor: C.sand,
              borderRadius: 18,
              paddingVertical: 18,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
              borderWidth: 2,
              borderColor: C.peach,
              opacity: isPickingImage.current ? 0.5 : 1,
            }}
          >
            <ImageIcon size={24} color={C.coral} />
            <Text
              style={{
                fontSize: 17,
                fontWeight: "800",
                color: C.coral,
              }}
            >
              Choose from gallery
            </Text>
          </TouchableOpacity>

          {/* Skip for now */}
          <TouchableOpacity
            onPress={handleSkip}
            style={{
              paddingVertical: 16,
              alignItems: "center",
            }}
          >
            <Text
              style={{
                fontSize: 16,
                fontWeight: "700",
                color: C.mutedBrown,
                textDecorationLine: "underline",
              }}
            >
              Skip for now
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Footer Helper Text */}
      <Text
        style={{
          fontSize: 14,
          color: C.mutedBrown,
          textAlign: "center",
          marginTop: 32,
          opacity: 0.8,
        }}
      >
        Don't worry, you can change this later.
      </Text>
    </View>
  );
}
