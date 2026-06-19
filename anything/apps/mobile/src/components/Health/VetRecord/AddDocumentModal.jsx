import React, { useState } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X, ImagePlus, FileText } from "lucide-react-native";
import * as ImagePicker from "expo-image-picker";
import { COLORS, TYPE, RADIUS, SPACING, MATERIALS } from "@/constants/theme";
import { useUpload } from "@/utils/useUpload";
import DateField from "@/components/DateField";
import KeyboardAwareScrollView from "@/components/KeyboardAwareScrollView";
import { getLocalPostDateString } from "@/utils/dateUtils";

// Owner adds a Vet Record document (ticket 2.41): name + type + a photo of the
// paperwork + a date → Supabase Storage upload → POST /api/vet-record/documents
// (owner-scoped). Real data only; the parent refetches on save.
const DOC_TYPES = [
  "Lab result",
  "Prescription",
  "Vaccination",
  "Invoice",
  "Insurance",
  "Vet report",
  "Other",
];

export function AddDocumentModal({ visible, onClose, petId, onSaved }) {
  const insets = useSafeAreaInsets();
  const [upload, { loading: uploading }] = useUpload();

  const [name, setName] = useState("");
  const [documentType, setDocumentType] = useState(DOC_TYPES[0]);
  const [documentDate, setDocumentDate] = useState(getLocalPostDateString());
  const [photoUri, setPhotoUri] = useState(null);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setName("");
    setDocumentType(DOC_TYPES[0]);
    setDocumentDate(getLocalPostDateString());
    setPhotoUri(null);
  };

  const close = () => {
    reset();
    onClose?.();
  };

  const pickPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission needed", "Allow photo access to attach a document.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
    });
    if (!result.canceled && result.assets?.[0]?.uri) {
      setPhotoUri(result.assets[0].uri);
    }
  };

  const canSave = name.trim().length > 0 && !!photoUri && !saving && !uploading;

  const handleSave = async () => {
    if (!canSave || !petId) return;
    setSaving(true);
    try {
      const uploadResult = await upload({
        reactNativeAsset: {
          uri: photoUri,
          name: `vet_doc_${Date.now()}.jpg`,
          mimeType: "image/jpeg",
        },
      });
      if (uploadResult.error || !uploadResult.url) {
        throw new Error(uploadResult.error || "Upload failed");
      }

      const response = await fetch("/api/vet-record/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          petId,
          name: name.trim(),
          documentType,
          fileUrl: uploadResult.url,
          documentDate: documentDate || null,
        }),
      });
      if (!response.ok) {
        const e = await response.json().catch(() => ({}));
        throw new Error(e.error || "Could not save document");
      }

      onSaved?.();
      close();
    } catch (error) {
      Alert.alert("Error", error.message || "Could not save the document.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={close}
    >
      <View style={{ flex: 1, backgroundColor: COLORS.cream }}>
        <View
          style={{
            paddingTop: insets.top + 6,
            paddingHorizontal: 20,
            paddingBottom: 14,
            backgroundColor: MATERIALS.surface,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottomWidth: 1,
            borderBottomColor: MATERIALS.hairline,
          }}
        >
          <TouchableOpacity onPress={close} accessibilityLabel="Close">
            <X size={22} color={COLORS.mutedBrown} />
          </TouchableOpacity>
          <Text style={[TYPE.headline, { fontWeight: "800", color: COLORS.warmBrown }]}>
            Add document
          </Text>
          <View style={{ width: 22 }} />
        </View>

        <KeyboardAwareScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 20, paddingBottom: 60 }}
        >
          {/* Photo picker */}
          <TouchableOpacity
            testID="pick-document-photo"
            onPress={pickPhoto}
            activeOpacity={0.9}
            style={{
              height: 180,
              borderRadius: RADIUS.control,
              borderWidth: 2,
              borderStyle: "dashed",
              borderColor: MATERIALS.hairline,
              backgroundColor: MATERIALS.surface,
              justifyContent: "center",
              alignItems: "center",
              marginBottom: SPACING.xl,
              overflow: "hidden",
            }}
          >
            {photoUri ? (
              <Image
                source={{ uri: photoUri }}
                style={{ width: "100%", height: "100%" }}
                resizeMode="cover"
              />
            ) : (
              <>
                <ImagePlus size={32} color={COLORS.coral} />
                <Text style={[TYPE.body, { color: COLORS.mutedBrown, marginTop: SPACING.sm, fontWeight: "600" }]}>
                  Choose a photo of the paperwork
                </Text>
              </>
            )}
          </TouchableOpacity>

          <Text style={{ fontSize: 13, fontWeight: "700", color: COLORS.mutedBrown, marginBottom: 6 }}>
            Name
          </Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. Rabies certificate"
            placeholderTextColor={COLORS.mutedBrown}
            style={{
              backgroundColor: "#FFF",
              borderRadius: 14,
              padding: 14,
              fontSize: 15,
              color: COLORS.warmBrown,
              borderWidth: 2,
              borderColor: name ? COLORS.coral : MATERIALS.hairline,
              marginBottom: 20,
            }}
          />

          <Text style={{ fontSize: 13, fontWeight: "700", color: COLORS.mutedBrown, marginBottom: 8 }}>
            Type
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
            {DOC_TYPES.map((type) => {
              const active = documentType === type;
              return (
                <TouchableOpacity
                  key={type}
                  onPress={() => setDocumentType(type)}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    borderRadius: 16,
                    backgroundColor: active ? COLORS.coral : MATERIALS.surfaceSunken,
                    borderWidth: 1,
                    borderColor: active ? COLORS.coral : MATERIALS.hairline,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "700",
                      color: active ? "#FFF" : COLORS.mutedBrown,
                    }}
                  >
                    {type}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={{ fontSize: 13, fontWeight: "700", color: COLORS.mutedBrown, marginBottom: 8 }}>
            Date
          </Text>
          <DateField
            value={documentDate}
            onChange={setDocumentDate}
            maximumDate={new Date()}
            fieldStyle={{
              backgroundColor: "#FFF",
              borderRadius: 14,
              padding: 14,
              borderWidth: 2,
              borderColor: documentDate ? COLORS.coral : MATERIALS.hairline,
            }}
          />

          <TouchableOpacity
            onPress={handleSave}
            disabled={!canSave}
            style={{
              marginTop: SPACING.xxl + SPACING.xs,
              backgroundColor: canSave ? COLORS.coral : MATERIALS.surfaceSunken,
              borderRadius: RADIUS.control,
              height: 54,
              flexDirection: "row",
              justifyContent: "center",
              alignItems: "center",
              gap: SPACING.sm,
            }}
          >
            {saving || uploading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <>
                <FileText size={18} color={canSave ? "#FFF" : COLORS.mutedBrown} />
                <Text
                  style={[
                    TYPE.headline,
                    { color: canSave ? "#FFF" : COLORS.mutedBrown, fontWeight: "800" },
                  ]}
                >
                  Save document
                </Text>
              </>
            )}
          </TouchableOpacity>
        </KeyboardAwareScrollView>
      </View>
    </Modal>
  );
}

export default AddDocumentModal;
