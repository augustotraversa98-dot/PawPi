import React, { useState, useEffect, useRef } from "react";
import { View, Text, Alert, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Camera as CameraIcon, Image as ImageIcon } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import * as ImagePicker from "expo-image-picker";
import * as ExpoCamera from "expo-camera";
import { COLORS, TYPE, SPACING } from "@/constants/theme";
import { Button, PressableScale } from "@/components/ui";

export default function OnboardingPhotoScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();
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
      isCamera
        ? t("onboarding.photoCameraDeniedTitle")
        : t("onboarding.photoLibraryDeniedTitle"),
      t("onboarding.photoAccessDeniedBody"),
      [
        {
          text: t("onboarding.photoSkipForNow"),
          style: "cancel",
        },
        {
          text: t("onboarding.photoOpenSettings"),
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
      Alert.alert(
        t("onboarding.photoCameraErrorTitle"),
        t("onboarding.photoCameraErrorBody"),
      );
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
      Alert.alert(
        t("onboarding.photoGalleryErrorTitle"),
        t("onboarding.photoGalleryErrorBody"),
      );
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
        backgroundColor: COLORS.cream,
        paddingTop: insets.top + SPACING.huge,
        paddingBottom: insets.bottom + SPACING.huge,
        paddingHorizontal: SPACING.xxl,
      }}
    >
      {/* Header */}
      <View style={{ flex: 1, justifyContent: "center" }}>
        <View style={{ alignItems: "center", marginBottom: 60 }}>
          {/* Emoji Icon */}
          <Text style={{ fontSize: 80, marginBottom: SPACING.xxl }}>📸</Text>

          {/* Title */}
          <Text
            style={[
              TYPE.largeTitle,
              {
                fontSize: 32,
                color: COLORS.warmBrown,
                textAlign: "center",
                marginBottom: SPACING.lg,
                letterSpacing: -0.5,
              },
            ]}
          >
            {t("onboarding.photoTitle")}
          </Text>

          {/* Subtitle */}
          <Text
            style={[
              TYPE.body,
              {
                fontSize: 17,
                color: COLORS.mutedBrown,
                textAlign: "center",
                lineHeight: 26,
                paddingHorizontal: SPACING.xl,
              },
            ]}
          >
            {t("onboarding.photoSubtitle")}
          </Text>
        </View>

        {/* Action Buttons */}
        <View style={{ gap: SPACING.lg }}>
          {/* Open Camera - Primary */}
          <Button
            variant="primary"
            size="lg"
            onPress={openCamera}
            disabled={isPickingImage.current}
            icon={<CameraIcon size={24} color="#FFF" />}
          >
            <Text style={[TYPE.headline, { fontSize: 17, color: "#FFF" }]}>
              {t("onboarding.photoOpenCamera")}
            </Text>
          </Button>

          {/* Choose from Gallery */}
          <Button
            variant="secondary"
            size="lg"
            onPress={openGallery}
            disabled={isPickingImage.current}
            icon={<ImageIcon size={24} color={COLORS.coral} />}
          >
            <Text style={[TYPE.headline, { fontSize: 17, color: COLORS.coral }]}>
              {t("onboarding.photoChooseGallery")}
            </Text>
          </Button>

          {/* Skip for now */}
          <PressableScale
            onPress={handleSkip}
            style={{
              paddingVertical: SPACING.lg,
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
              {t("onboarding.photoSkipForNow")}
            </Text>
          </PressableScale>
        </View>
      </View>

      {/* Footer Helper Text */}
      <Text
        style={[
          TYPE.callout,
          {
            color: COLORS.mutedBrown,
            textAlign: "center",
            marginTop: SPACING.xxxl,
            opacity: 0.8,
          },
        ]}
      >
        {t("onboarding.photoChangeLater")}
      </Text>
    </View>
  );
}
