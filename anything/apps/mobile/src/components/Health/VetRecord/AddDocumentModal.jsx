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
import { COLORS as C } from "@/constants/colors";
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
      <View style={{ flex: 1, backgroundColor: C.cream }}>
        <View
          style={{
            paddingTop: insets.top + 6,
            paddingHorizontal: 20,
            paddingBottom: 14,
            backgroundColor: C.card,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottomWidth: 1,
            borderBottomColor: C.peach,
          }}
        >
          <TouchableOpacity onPress={close} accessibilityLabel="Close">
            <X size={22} color={C.mutedBrown} />
          </TouchableOpacity>
          <Text style={{ fontSize: 17, fontWeight: "800", color: C.warmBrown }}>
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
              borderRadius: 16,
              borderWidth: 2,
              borderStyle: "dashed",
              borderColor: C.peach,
              backgroundColor: C.card,
              justifyContent: "center",
              alignItems: "center",
              marginBottom: 20,
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
                <ImagePlus size={32} color={C.coral} />
                <Text style={{ color: C.mutedBrown, marginTop: 8, fontWeight: "600" }}>
                  Choose a photo of the paperwork
                </Text>
              </>
            )}
          </TouchableOpacity>

          <Text style={{ fontSize: 13, fontWeight: "700", color: C.mutedBrown, marginBottom: 6 }}>
            Name
          </Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. Rabies certificate"
            placeholderTextColor={C.mutedBrown}
            style={{
              backgroundColor: "#FFF",
              borderRadius: 14,
              padding: 14,
              fontSize: 15,
              color: C.warmBrown,
              borderWidth: 2,
              borderColor: name ? C.coral : C.sand,
              marginBottom: 20,
            }}
          />

          <Text style={{ fontSize: 13, fontWeight: "700", color: C.mutedBrown, marginBottom: 8 }}>
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
                    backgroundColor: active ? C.coral : C.sand,
                    borderWidth: 1,
                    borderColor: active ? C.coral : C.peach,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "700",
                      color: active ? "#FFF" : C.mutedBrown,
                    }}
                  >
                    {type}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={{ fontSize: 13, fontWeight: "700", color: C.mutedBrown, marginBottom: 8 }}>
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
              borderColor: documentDate ? C.coral : C.sand,
            }}
          />

          <TouchableOpacity
            onPress={handleSave}
            disabled={!canSave}
            style={{
              marginTop: 28,
              backgroundColor: canSave ? C.coral : C.sand,
              borderRadius: 16,
              height: 54,
              flexDirection: "row",
              justifyContent: "center",
              alignItems: "center",
              gap: 8,
            }}
          >
            {saving || uploading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <>
                <FileText size={18} color={canSave ? "#FFF" : C.mutedBrown} />
                <Text
                  style={{
                    color: canSave ? "#FFF" : C.mutedBrown,
                    fontWeight: "800",
                    fontSize: 16,
                  }}
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
