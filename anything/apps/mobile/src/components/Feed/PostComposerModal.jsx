import React, { useState, useEffect, useRef, useCallback, memo } from "react";
import {
  View,
  Text,
  ScrollView,
  Image,
  TextInput,
  Modal,
  Platform,
  Alert,
  KeyboardAvoidingView,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Camera, ChevronLeft, Video as VideoIcon, X } from "lucide-react-native";
import * as ImagePicker from "expo-image-picker";
import { Video, ResizeMode } from "expo-av";
import {
  COLORS,
  TYPE,
  RADIUS,
  SPACING,
  MATERIALS,
  ELEVATION,
} from "@/constants/theme";
import { PressableScale } from "@/components/ui";

const { width: SCREEN_W } = Dimensions.get("window");

// Celebratory treatment for the daily "lucky" user. Shown above the capture
// buttons ONLY when the server says they're eligible today. Pure presentation —
// it never gates capture/posting (the server re-checks on POST). Copy makes
// clear it's a today-only, optional bonus; a photo is always still welcome.
const LuckyDayBanner = memo(function LuckyDayBanner() {
  return (
    <View
      testID="composer-lucky-banner"
      style={{
        backgroundColor: COLORS.peach,
        borderRadius: RADIUS.card,
        padding: SPACING.lg,
        marginBottom: SPACING.xl,
        borderWidth: 1,
        borderColor: COLORS.honey,
      }}
    >
      <Text style={[TYPE.headline, { color: COLORS.terracotta }]}>
        🎉 You're one of today's lucky users!
      </Text>
      <Text
        style={[
          TYPE.callout,
          { color: COLORS.warmBrown, marginTop: SPACING.xs },
        ]}
      >
        You can share a short video today — just for today. A photo's always
        welcome too.
      </Text>
    </View>
  );
});

export const PostComposerModal = memo(function PostComposerModal({
  visible,
  petName,
  onClose,
  onPost,
}) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState("picker"); // "picker" | "compose"
  const [mediaUri, setMediaUri] = useState(null);
  const [mediaType, setMediaType] = useState("image"); // "image" | "video"
  const [caption, setCaption] = useState("");
  // Whether to OFFER the video option. Only the daily "lucky" user gets it; the
  // server is the real gate (POST re-checks), this flag only decides the UI.
  const [videoEligible, setVideoEligible] = useState(false);
  const captionRef = useRef(null);

  // Reset every time modal opens, then ask the server whether this user may
  // record a video today. While loading / on error / when not eligible we leave
  // videoEligible=false, so the composer stays photo-only (today's behavior).
  useEffect(() => {
    if (!visible) return;
    setStep("picker");
    setMediaUri(null);
    setMediaType("image");
    setCaption("");
    setVideoEligible(false);

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/posts/video-eligibility");
        if (!res.ok) return; // treat any error as not eligible → photo only
        const data = await res.json();
        if (!cancelled) setVideoEligible(data?.eligible === true);
      } catch {
        // Network/parse failure → stay photo-only, never block posting.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible]);

  const takePhoto = useCallback(async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        "Camera access needed",
        "Please allow camera access in settings.",
      );
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (!result.canceled) {
      setMediaUri(result.assets[0].uri);
      setMediaType("image");
      setStep("compose");
    }
  }, []);

  const takeVideo = useCallback(async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        "Camera access needed",
        "Please allow camera access to record a video.",
      );
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["videos"],
      videoMaxDuration: 15,
      quality: 0.85,
    });
    if (!result.canceled) {
      setMediaUri(result.assets[0].uri);
      setMediaType("video");
      setStep("compose");
    }
  }, []);

  const handleSubmit = useCallback(() => {
    if (!mediaUri) return;
    onPost({ uri: mediaUri, caption, mediaType });
    onClose();
  }, [mediaUri, caption, mediaType, onPost, onClose]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
    >
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: COLORS.cream }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        {/* Header */}
        <View
          style={{
            paddingTop: insets.top + 6,
            paddingHorizontal: 20,
            paddingBottom: 14,
            backgroundColor: COLORS.card,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottomWidth: 1,
            borderBottomColor: COLORS.peach,
          }}
        >
          {step === "compose" ? (
            <PressableScale
              onPress={() => setStep("picker")}
              accessibilityRole="button"
              style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
            >
              <ChevronLeft size={20} color={COLORS.coral} />
              <Text style={[TYPE.body, { color: COLORS.coral, fontWeight: "700" }]}>
                Back
              </Text>
            </PressableScale>
          ) : (
            <PressableScale onPress={onClose} accessibilityRole="button">
              <X size={22} color={COLORS.mutedBrown} />
            </PressableScale>
          )}
          <Text style={[TYPE.headline, { color: COLORS.warmBrown }]}>
            {step === "picker" ? "Add a photo" : "Daily update"}
          </Text>
          <View style={{ width: 40 }} />
        </View>

        {step === "picker" ? (
          // ── STEP 1: Photo picker ──
          <View style={{ flex: 1, justifyContent: "center", padding: SPACING.xxl }}>
            <View style={{ alignItems: "center", marginBottom: SPACING.huge }}>
              <Text style={{ fontSize: 48 }}>🐾</Text>
              <Text
                style={[
                  TYPE.title,
                  { color: COLORS.warmBrown, marginTop: SPACING.md, textAlign: "center" },
                ]}
              >
                Today's pet moment
              </Text>
              <Text
                style={[
                  TYPE.callout,
                  { color: COLORS.mutedBrown, marginTop: SPACING.sm, textAlign: "center" },
                ]}
              >
                What is {petName} up to right now?{"\n"}Share today's daily
                update with your pet friends!
              </Text>
            </View>

            {/* Celebratory treatment for the daily "lucky" user — only when the
                server says they're eligible today. Nothing renders otherwise. */}
            {videoEligible ? <LuckyDayBanner /> : null}

            <PressableScale
              onPress={takePhoto}
              accessibilityRole="button"
              testID="composer-take-photo"
              style={{
                backgroundColor: COLORS.coral,
                borderRadius: RADIUS.lg,
                padding: SPACING.lg,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: SPACING.md,
                shadowColor: COLORS.coral,
                ...ELEVATION.sm,
              }}
            >
              <Camera size={22} color="#FFF" />
              <Text style={[TYPE.headline, { color: "#FFF" }]}>Take a photo</Text>
            </PressableScale>

            {/* The daily "lucky" user also gets to record a short video. Only
                shown when the server says they're eligible today (server still
                re-checks on POST). */}
            {videoEligible ? (
              <PressableScale
                onPress={takeVideo}
                accessibilityRole="button"
                testID="composer-take-video"
                style={{
                  marginTop: SPACING.md,
                  backgroundColor: COLORS.card,
                  borderRadius: RADIUS.lg,
                  padding: SPACING.lg,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: SPACING.md,
                  borderWidth: 1.5,
                  borderColor: COLORS.coral,
                }}
              >
                <VideoIcon size={22} color={COLORS.coral} />
                <Text style={[TYPE.headline, { color: COLORS.coral }]}>
                  Record a video
                </Text>
                {/* "Today only" tag marks this as the special, time-limited
                    option without overpowering the primary "Take a photo". */}
                <View
                  style={{
                    backgroundColor: COLORS.coral,
                    borderRadius: RADIUS.chip,
                    paddingHorizontal: SPACING.sm,
                    paddingVertical: 2,
                  }}
                >
                  <Text style={[TYPE.caption, { color: "#FFF" }]}>
                    Today only
                  </Text>
                </View>
              </PressableScale>
            ) : null}
          </View>
        ) : (
          // ── STEP 2: Preview + caption ──
          <ScrollView
            contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Media preview — a looping muted video for video posts, the photo
                as before for image posts. */}
            <View style={{ position: "relative", marginBottom: 18 }}>
              {mediaType === "video" ? (
                <Video
                  testID="composer-video-preview"
                  source={{ uri: mediaUri }}
                  style={{
                    width: "100%",
                    height: SCREEN_W - 40,
                    borderRadius: RADIUS.lg,
                    backgroundColor: "#000",
                  }}
                  resizeMode={ResizeMode.COVER}
                  isLooping
                  shouldPlay
                  isMuted
                />
              ) : (
                <Image
                  source={{ uri: mediaUri }}
                  style={{
                    width: "100%",
                    height: SCREEN_W - 40,
                    borderRadius: RADIUS.lg,
                  }}
                  resizeMode="cover"
                />
              )}
              <PressableScale
                onPress={() => setStep("picker")}
                accessibilityRole="button"
                accessibilityLabel={
                  mediaType === "video" ? "Change video" : "Change photo"
                }
                style={{
                  position: "absolute",
                  top: SPACING.md,
                  right: SPACING.md,
                  backgroundColor: MATERIALS.overlay,
                  borderRadius: RADIUS.chip,
                  padding: SPACING.sm,
                }}
              >
                <Camera size={18} color="#FFF" />
              </PressableScale>
            </View>

            {/* Caption */}
            <Text
              style={[
                TYPE.callout,
                { fontWeight: "800", color: COLORS.warmBrown, marginBottom: SPACING.sm },
              ]}
            >
              Add a caption for {petName} ✍️
            </Text>
            <TextInput
              ref={captionRef}
              style={[
                TYPE.body,
                {
                  backgroundColor: MATERIALS.surfaceSunken,
                  borderRadius: RADIUS.control,
                  padding: SPACING.lg,
                  minHeight: 100,
                  textAlignVertical: "top",
                  marginBottom: SPACING.xxl,
                  color: COLORS.warmBrown,
                  borderWidth: 1.5,
                  borderColor: MATERIALS.hairline,
                },
              ]}
              testID="composer-caption"
              placeholder={`What's ${petName} doing today? 🐶`}
              placeholderTextColor={COLORS.mutedBrown}
              multiline
              value={caption}
              onChangeText={setCaption}
            />

            <PressableScale
              onPress={handleSubmit}
              accessibilityRole="button"
              style={{
                backgroundColor: COLORS.coral,
                borderRadius: RADIUS.lg,
                padding: SPACING.lg,
                alignItems: "center",
                shadowColor: COLORS.coral,
                ...ELEVATION.sm,
              }}
            >
              <Text style={[TYPE.headline, { color: "#FFF" }]}>
                Post daily update 🐾
              </Text>
            </PressableScale>
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
});
