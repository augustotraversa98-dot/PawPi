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
import { useTranslation } from "react-i18next";
import { X, ImagePlus, FileText, Sparkles, CheckCircle2 } from "lucide-react-native";
import * as ImagePicker from "expo-image-picker";
import { COLORS, TYPE, RADIUS, SPACING, MATERIALS } from "@/constants/theme";
import { useUpload } from "@/utils/useUpload";
import DateField from "@/components/DateField";
import KeyboardAwareScrollView from "@/components/KeyboardAwareScrollView";
import { getLocalPostDateString } from "@/utils/dateUtils";
import { ReviewProposalModal } from "./ReviewProposalModal";

// Owner adds a Vet Record document (ticket 2.41; VR-C tagging): name + a canonical CATEGORY
// (vaccine/lab/visit/invoice/other) + a photo of the paperwork + a date → upload → POST
// /api/vet-record/documents (owner-OR-editor scoped, 0120).
//
// AI-2 (night-run 2026-08-18d): once the file is stored, PawPi automatically READS it (AI-1's
// /extract route, Claude vision) and — if it finds records — opens a REVIEW SHEET the owner
// confirms before anything lands in the Medical history. The upload flow is unchanged (the file is
// always stored + downloadable first); reading is a non-blocking bonus with graceful states:
//   dormant (no key) → "Automatic reading isn't switched on yet."
//   empty proposal   → "We saved your file. We couldn't pull structured info from this one."
//   read error       → same honest fallback (file still stored).
const DOC_CATEGORIES = ["vaccine", "lab", "visit", "invoice", "other"];

const hasAnyRecords = (records) =>
  !!records &&
  Object.values(records).some((a) => Array.isArray(a) && a.length > 0);

export function AddDocumentModal({ visible, onClose, petId, onSaved }) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [upload, { loading: uploading }] = useUpload();

  const [name, setName] = useState("");
  const [category, setCategory] = useState(DOC_CATEGORIES[0]);
  const [documentDate, setDocumentDate] = useState(getLocalPostDateString());
  const [photoUri, setPhotoUri] = useState(null);
  const [saving, setSaving] = useState(false);
  // "form" | "reading" | "review" | "dormant" | "empty" | "readError"
  const [phase, setPhase] = useState("form");
  const [proposal, setProposal] = useState(null);

  const reset = () => {
    setName("");
    setCategory(DOC_CATEGORIES[0]);
    setDocumentDate(getLocalPostDateString());
    setPhotoUri(null);
    setPhase("form");
    setProposal(null);
    setSaving(false);
  };

  const close = () => {
    reset();
    onClose?.();
  };

  const pickPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        t("health.vetRecord.addDoc.permissionTitle"),
        t("health.vetRecord.addDoc.permissionBody"),
      );
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

  // After the file is stored, read it with AI-1's /extract route. WRITES NOTHING — it returns a
  // proposal the owner reviews. Never throws to the caller: the file is already saved.
  const runExtraction = async ({ url, filename }) => {
    setPhase("reading");
    try {
      const res = await fetch("/api/vet-record/documents/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ petId, url, filename, mimeType: "image/jpeg" }),
      });
      if (res.status === 503) {
        setPhase("dormant");
        return;
      }
      if (!res.ok) {
        setPhase("readError");
        return;
      }
      const data = await res.json().catch(() => ({}));
      const records = data?.proposal?.records;
      if (!hasAnyRecords(records)) {
        setPhase("empty");
        return;
      }
      setProposal(data.proposal);
      setPhase("review");
      // Dismiss THIS sheet; the review sheet (rendered as a sibling) takes over so we never stack
      // two page-sheets. Internal state (proposal/phase) survives — the parent keeps us mounted.
      onClose?.();
    } catch {
      setPhase("readError");
    }
  };

  const handleSave = async () => {
    if (!canSave || !petId) return;
    setSaving(true);
    try {
      const filename = `vet_doc_${Date.now()}.jpg`;
      const uploadResult = await upload({
        reactNativeAsset: { uri: photoUri, name: filename, mimeType: "image/jpeg" },
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
          // category is the canonical tidy-history bucket (0121); document_type keeps a
          // human label for back-compat display (mirror the category key).
          category,
          documentType: t(`health.vetRecord.docCategory.${category}`),
          fileUrl: uploadResult.url,
          documentDate: documentDate || null,
        }),
      });
      if (!response.ok) {
        const e = await response.json().catch(() => ({}));
        throw new Error(e.error || "Could not save document");
      }

      // The file is stored — refresh Documents now so it appears regardless of what reading finds.
      onSaved?.();
      setSaving(false);
      // Then read it (non-blocking bonus).
      await runExtraction({ url: uploadResult.url, filename });
    } catch (error) {
      setSaving(false);
      Alert.alert(
        t("health.vetRecord.errorTitle"),
        t("health.vetRecord.addDoc.errorBody"),
      );
    }
  };

  // Status screen for the graceful non-review outcomes (dormant / empty / read error).
  const statusScreen = (titleKey, bodyKey) => (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
      <CheckCircle2 size={44} color={COLORS.coral} />
      <Text
        style={[
          TYPE.headline,
          { fontWeight: "800", color: COLORS.warmBrown, marginTop: 16, textAlign: "center" },
        ]}
      >
        {t(titleKey)}
      </Text>
      <Text
        style={[
          TYPE.body,
          { color: COLORS.mutedBrown, marginTop: 8, textAlign: "center", lineHeight: 20 },
        ]}
      >
        {t(bodyKey)}
      </Text>
      <TouchableOpacity
        testID="doc-status-done"
        onPress={close}
        style={{
          marginTop: 28,
          backgroundColor: COLORS.coral,
          borderRadius: RADIUS.control,
          height: 50,
          paddingHorizontal: 40,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Text style={[TYPE.headline, { color: "#FFF", fontWeight: "800" }]}>
          {t("health.vetRecord.addDoc.done")}
        </Text>
      </TouchableOpacity>
    </View>
  );

  const renderBody = () => {
    if (phase === "reading") {
      return (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
          <ActivityIndicator size="large" color={COLORS.coral} />
          <Text
            style={[
              TYPE.headline,
              { fontWeight: "800", color: COLORS.warmBrown, marginTop: 18, textAlign: "center" },
            ]}
          >
            {t("health.vetRecord.addDoc.reading")}
          </Text>
          <Text
            style={[
              TYPE.body,
              { color: COLORS.mutedBrown, marginTop: 8, textAlign: "center", lineHeight: 20 },
            ]}
          >
            {t("health.vetRecord.addDoc.readingHint")}
          </Text>
        </View>
      );
    }
    if (phase === "dormant") {
      return statusScreen(
        "health.vetRecord.addDoc.dormantTitle",
        "health.vetRecord.addDoc.dormant",
      );
    }
    if (phase === "empty") {
      return statusScreen(
        "health.vetRecord.addDoc.emptyTitle",
        "health.vetRecord.addDoc.empty",
      );
    }
    if (phase === "readError") {
      return statusScreen(
        "health.vetRecord.addDoc.readErrorTitle",
        "health.vetRecord.addDoc.readError",
      );
    }
    return renderForm();
  };

  const renderForm = () => (
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
              {t("health.vetRecord.addDoc.photoPrompt")}
            </Text>
          </>
        )}
      </TouchableOpacity>

      <Text style={{ fontSize: 13, fontWeight: "700", color: COLORS.mutedBrown, marginBottom: 6 }}>
        {t("health.vetRecord.addDoc.name")}
      </Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder={t("health.vetRecord.addDoc.namePlaceholder")}
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
        {t("health.vetRecord.addDoc.category")}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
        {DOC_CATEGORIES.map((cat) => {
          const active = category === cat;
          return (
            <TouchableOpacity
              key={cat}
              testID={`doc-category-${cat}`}
              onPress={() => setCategory(cat)}
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
                {t(`health.vetRecord.docCategory.${cat}`)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={{ fontSize: 13, fontWeight: "700", color: COLORS.mutedBrown, marginBottom: 8 }}>
        {t("health.vetRecord.addDoc.date")}
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

      {/* AI reading is now live — honest, non-blocking note. */}
      <View
        style={{
          flexDirection: "row",
          gap: 10,
          alignItems: "flex-start",
          backgroundColor: MATERIALS.surfaceSunken,
          borderRadius: 14,
          padding: 14,
          marginTop: 20,
          borderWidth: 1,
          borderColor: MATERIALS.hairline,
        }}
      >
        <Sparkles size={18} color={COLORS.coral} style={{ marginTop: 1 }} />
        <Text style={{ flex: 1, fontSize: 12, color: COLORS.mutedBrown, lineHeight: 17 }}>
          {t("health.vetRecord.addDoc.comingSoon")}
        </Text>
      </View>

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
              {t("health.vetRecord.addDoc.save")}
            </Text>
          </>
        )}
      </TouchableOpacity>
    </KeyboardAwareScrollView>
  );

  return (
    <>
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
            <TouchableOpacity onPress={close} accessibilityLabel={t("health.vetRecord.close")}>
              <X size={22} color={COLORS.mutedBrown} />
            </TouchableOpacity>
            <Text style={[TYPE.headline, { fontWeight: "800", color: COLORS.warmBrown }]}>
              {t("health.vetRecord.addDoc.title")}
            </Text>
            <View style={{ width: 22 }} />
          </View>

          {renderBody()}
        </View>
      </Modal>

      {/* AI-2: the review sheet — shown as a sibling once reading proposes records. */}
      <ReviewProposalModal
        visible={phase === "review"}
        proposal={proposal}
        petId={petId}
        onClose={reset}
        onApplied={onSaved}
      />
    </>
  );
}

export default AddDocumentModal;
