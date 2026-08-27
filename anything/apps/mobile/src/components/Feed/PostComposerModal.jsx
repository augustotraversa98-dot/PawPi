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
import { useTranslation } from "react-i18next";
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
// Preview mirrors the feed frame: 4:5 portrait (height = 1.25 × width) so what you
// crop is what the card will show. Width = screen minus the ScrollView's 20pt gutters.
const PREVIEW_W = SCREEN_W - 40;
const PREVIEW_H = Math.round((PREVIEW_W * 5) / 4);

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
      <LuckyDayBannerContent />
    </View>
  );
});

function LuckyDayBannerContent() {
  const { t } = useTranslation();
  return (
    <>
      <Text style={[TYPE.headline, { color: COLORS.terracotta }]}>
        {t("postComposer.luckyTitle")}
      </Text>
      <Text
        style={[
          TYPE.callout,
          { color: COLORS.warmBrown, marginTop: SPACING.xs },
        ]}
      >
        {t("postComposer.luckyBody")}
      </Text>
    </>
  );
}

export const PostComposerModal = memo(function PostComposerModal({
  visible,
  petName,
  onClose,
  onPost,
  // ── Reuse controls (default = the pet daily-moment behavior, unchanged) ──
  // allowVideo: undefined → ask the pet daily "lucky" gate (/api/posts/video-eligibility);
  //   true → always offer video (e.g. business moments, no daily lottery);
  //   false → never offer video (photo only).
  allowVideo,
  // showLuckyBanner: the celebratory "you're one of today's lucky users" treatment + the
  //   "Today only" chip. Pet moments show it; business moments don't (video is always available).
  showLuckyBanner = true,
  // copy: optional string overrides so the SAME composer serves the business "Post a moment" flow
  //   with its own (localized) copy. Any omitted key falls back to the pet daily-moment string.
  copy,
}) {
  const { t: i18nT } = useTranslation();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState("picker"); // "picker" | "compose"
  const [mediaUri, setMediaUri] = useState(null);
  const [mediaType, setMediaType] = useState("image"); // "image" | "video"
  const [caption, setCaption] = useState("");
  // Whether to OFFER the video option. For the pet flow only the daily "lucky" user gets it (the
  // server is the real gate, POST re-checks); a caller can force it on/off via allowVideo.
  const [videoEligible, setVideoEligible] = useState(false);
  const captionRef = useRef(null);

  // Effective copy — pet daily-moment defaults, overridable per key by the `copy` prop.
  const c = copy ?? {};
  const t = {
    pickerHeader: c.pickerHeader ?? i18nT("postComposer.pickerHeader"),
    composeHeader: c.composeHeader ?? i18nT("postComposer.composeHeader"),
    heading: c.heading ?? i18nT("postComposer.heading"),
    subheading:
      c.subheading ?? i18nT("postComposer.subheading", { petName }),
    takePhoto: c.takePhoto ?? i18nT("postComposer.takePhoto"),
    recordVideo: c.recordVideo ?? i18nT("postComposer.recordVideo"),
    todayOnly: c.todayOnly ?? i18nT("postComposer.todayOnly"),
    captionLabel:
      c.captionLabel ?? i18nT("postComposer.captionLabel", { petName }),
    captionPlaceholder:
      c.captionPlaceholder ??
      i18nT("postComposer.captionPlaceholder", { petName }),
    submit: c.submit ?? i18nT("postComposer.submit"),
  };

  // Reset every time modal opens, then decide whether to offer video. When the caller fixes
  // allowVideo we honor it directly; otherwise (pet flow) we ask the server's daily "lucky" gate.
  // While loading / on error / when not eligible we leave videoEligible=false → photo-only.
  useEffect(() => {
    if (!visible) return;
    setStep("picker");
    setMediaUri(null);
    setMediaType("image");
    setCaption("");
    setVideoEligible(false);

    if (allowVideo !== undefined) {
      setVideoEligible(allowVideo === true);
      return;
    }

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
  }, [visible, allowVideo]);

  const takePhoto = useCallback(async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        i18nT("postComposer.cameraDeniedTitle"),
        i18nT("postComposer.cameraDeniedBody"),
      );
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [4, 5], // 4:5 portrait — matches the feed frame (PostCard)
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
        i18nT("postComposer.cameraDeniedTitle"),
        i18nT("postComposer.cameraDeniedVideoBody"),
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
      onRequestClose={onClose}
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
                {i18nT("common.back")}
              </Text>
            </PressableScale>
          ) : (
            <PressableScale onPress={onClose} accessibilityRole="button">
              <X size={22} color={COLORS.mutedBrown} />
            </PressableScale>
          )}
          <Text style={[TYPE.headline, { color: COLORS.warmBrown }]}>
            {step === "picker" ? t.pickerHeader : t.composeHeader}
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
                {t.heading}
              </Text>
              <Text
                style={[
                  TYPE.callout,
                  { color: COLORS.mutedBrown, marginTop: SPACING.sm, textAlign: "center" },
                ]}
              >
                {t.subheading}
              </Text>
            </View>

            {/* Celebratory treatment for the daily "lucky" user — only when the
                server says they're eligible today. Suppressed for callers where
                video isn't a daily bonus (e.g. business moments). */}
            {videoEligible && showLuckyBanner ? <LuckyDayBanner /> : null}

            <PressableScale
              onPress={takePhoto}
              accessibilityRole="button"
              testID="composer-take-photo"
              style={{
                backgroundColor: COLORS.coral,
                borderRadius: RADIUS.control,
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
              <Text style={[TYPE.headline, { color: "#FFF" }]}>{t.takePhoto}</Text>
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
                  borderRadius: RADIUS.control,
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
                  {t.recordVideo}
                </Text>
                {/* "Today only" tag marks the pet flow's special, time-limited option. Hidden for
                    callers where video isn't a daily bonus (e.g. business moments). */}
                {showLuckyBanner ? (
                  <View
                    style={{
                      backgroundColor: COLORS.coral,
                      borderRadius: RADIUS.chip,
                      paddingHorizontal: SPACING.sm,
                      paddingVertical: 2,
                    }}
                  >
                    <Text style={[TYPE.caption, { color: "#FFF" }]}>
                      {t.todayOnly}
                    </Text>
                  </View>
                ) : null}
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
                    width: PREVIEW_W,
                    height: PREVIEW_H,
                    borderRadius: RADIUS.control,
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
                    width: PREVIEW_W,
                    height: PREVIEW_H,
                    borderRadius: RADIUS.control,
                  }}
                  resizeMode="cover"
                />
              )}
              <PressableScale
                onPress={() => setStep("picker")}
                accessibilityRole="button"
                accessibilityLabel={
                  mediaType === "video"
                    ? i18nT("postComposer.changeVideo")
                    : i18nT("postComposer.changePhoto")
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
              {t.captionLabel}
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
              placeholder={t.captionPlaceholder}
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
                borderRadius: RADIUS.control,
                padding: SPACING.lg,
                alignItems: "center",
                shadowColor: COLORS.coral,
                ...ELEVATION.sm,
              }}
            >
              <Text style={[TYPE.headline, { color: "#FFF" }]}>
                {t.submit}
              </Text>
            </PressableScale>
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
});
