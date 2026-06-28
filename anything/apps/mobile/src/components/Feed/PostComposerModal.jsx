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
import { Camera, ChevronLeft, X } from "lucide-react-native";
import * as ImagePicker from "expo-image-picker";
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

export const PostComposerModal = memo(function PostComposerModal({
  visible,
  petName,
  onClose,
  onPost,
}) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState("picker"); // "picker" | "compose"
  const [photo, setPhoto] = useState(null);
  const [caption, setCaption] = useState("");
  const captionRef = useRef(null);

  // Reset every time modal opens
  useEffect(() => {
    if (visible) {
      setStep("picker");
      setPhoto(null);
      setCaption("");
    }
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
      setPhoto(result.assets[0].uri);
      setStep("compose");
    }
  }, []);

  const handleSubmit = useCallback(() => {
    if (!photo) return;
    onPost({ photo, caption });
    onClose();
  }, [photo, caption, onPost, onClose]);

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
          </View>
        ) : (
          // ── STEP 2: Preview + caption ──
          <ScrollView
            contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Photo preview */}
            <View style={{ position: "relative", marginBottom: 18 }}>
              <Image
                source={{ uri: photo }}
                style={{
                  width: "100%",
                  height: SCREEN_W - 40,
                  borderRadius: RADIUS.lg,
                }}
                resizeMode="cover"
              />
              <PressableScale
                onPress={() => setStep("picker")}
                accessibilityRole="button"
                accessibilityLabel="Change photo"
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
