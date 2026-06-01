import React, { useState, useEffect, useRef, useCallback, memo } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  TextInput,
  Modal,
  Platform,
  ActionSheetIOS,
  Alert,
  KeyboardAvoidingView,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Camera, ChevronLeft, ImageIcon, X } from "lucide-react-native";
import * as ImagePicker from "expo-image-picker";
import { COLORS } from "@/constants/colors";

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

  const pickFromGallery = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (!result.canceled) {
      setPhoto(result.assets[0].uri);
      setStep("compose");
    }
  }, []);

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

  const handlePickerChoice = useCallback(() => {
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ["Cancel", "📷  Take a photo", "🖼️  Choose from gallery"],
          cancelButtonIndex: 0,
        },
        (idx) => {
          if (idx === 1) takePhoto();
          if (idx === 2) pickFromGallery();
        },
      );
    } else {
      Alert.alert("Add a photo", "How would you like to add a photo?", [
        { text: "Cancel", style: "cancel" },
        { text: "Take a photo", onPress: takePhoto },
        { text: "Choose from gallery", onPress: pickFromGallery },
      ]);
    }
  }, [takePhoto, pickFromGallery]);

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
            <TouchableOpacity
              onPress={() => setStep("picker")}
              style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
            >
              <ChevronLeft size={20} color={COLORS.coral} />
              <Text
                style={{ color: COLORS.coral, fontWeight: "700", fontSize: 15 }}
              >
                Back
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={onClose}>
              <X size={22} color={COLORS.mutedBrown} />
            </TouchableOpacity>
          )}
          <Text
            style={{ fontSize: 17, fontWeight: "800", color: COLORS.warmBrown }}
          >
            {step === "picker" ? "Add a photo" : "Daily update"}
          </Text>
          <View style={{ width: 40 }} />
        </View>

        {step === "picker" ? (
          // ── STEP 1: Photo picker ──
          <View style={{ flex: 1, justifyContent: "center", padding: 28 }}>
            <View style={{ alignItems: "center", marginBottom: 40 }}>
              <Text style={{ fontSize: 48 }}>🐾</Text>
              <Text
                style={{
                  fontSize: 22,
                  fontWeight: "800",
                  color: COLORS.warmBrown,
                  marginTop: 14,
                  textAlign: "center",
                  letterSpacing: -0.4,
                }}
              >
                Today's pet moment
              </Text>
              <Text
                style={{
                  fontSize: 14,
                  color: COLORS.mutedBrown,
                  marginTop: 8,
                  textAlign: "center",
                  lineHeight: 21,
                }}
              >
                What is {petName} up to right now?{"\n"}Share today's daily
                update with your pet friends!
              </Text>
            </View>

            <TouchableOpacity
              onPress={takePhoto}
              style={{
                backgroundColor: COLORS.coral,
                borderRadius: 18,
                padding: 18,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 12,
                marginBottom: 14,
                shadowColor: COLORS.coral,
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.3,
                shadowRadius: 10,
              }}
            >
              <Camera size={22} color="#FFF" />
              <Text style={{ color: "#FFF", fontWeight: "800", fontSize: 16 }}>
                Take a photo
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={pickFromGallery}
              style={{
                backgroundColor: COLORS.card,
                borderRadius: 18,
                padding: 18,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 12,
                borderWidth: 2,
                borderColor: COLORS.peach,
              }}
            >
              <ImageIcon size={22} color={COLORS.coral} />
              <Text
                style={{ color: COLORS.coral, fontWeight: "800", fontSize: 16 }}
              >
                Choose from gallery
              </Text>
            </TouchableOpacity>
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
                  borderRadius: 22,
                }}
                resizeMode="cover"
              />
              <TouchableOpacity
                onPress={() => setStep("picker")}
                style={{
                  position: "absolute",
                  top: 12,
                  right: 12,
                  backgroundColor: "rgba(59,36,27,0.55)",
                  borderRadius: 20,
                  padding: 8,
                }}
              >
                <ImageIcon size={18} color="#FFF" />
              </TouchableOpacity>
            </View>

            {/* Caption */}
            <Text
              style={{
                fontSize: 14,
                fontWeight: "800",
                color: COLORS.warmBrown,
                marginBottom: 10,
              }}
            >
              Add a caption for {petName} ✍️
            </Text>
            <TextInput
              ref={captionRef}
              style={{
                backgroundColor: COLORS.sand,
                borderRadius: 16,
                padding: 16,
                minHeight: 100,
                textAlignVertical: "top",
                marginBottom: 22,
                color: COLORS.warmBrown,
                fontSize: 15,
                lineHeight: 22,
                borderWidth: 1.5,
                borderColor: COLORS.peach,
              }}
              placeholder={`What's ${petName} doing today? 🐶`}
              placeholderTextColor={COLORS.mutedBrown}
              multiline
              autoFocus
              value={caption}
              onChangeText={setCaption}
            />

            <TouchableOpacity
              onPress={handleSubmit}
              style={{
                backgroundColor: COLORS.coral,
                borderRadius: 18,
                padding: 18,
                alignItems: "center",
                shadowColor: COLORS.coral,
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.35,
                shadowRadius: 10,
              }}
            >
              <Text style={{ color: "#FFF", fontWeight: "800", fontSize: 17 }}>
                Post daily update 🐾
              </Text>
            </TouchableOpacity>
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
});
