import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  Modal,
  Pressable,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  Platform,
  KeyboardAvoidingView,
  Image,
  ActivityIndicator,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import useUpload from "@/utils/useUpload";
import KeyboardAwareScrollView from "@/components/KeyboardAwareScrollView";
import {
  X,
  ChevronRight,
  CheckCircle,
  Camera,
  Image as ImageIcon,
  Info,
  Lock,
  Sparkles,
} from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { CHECK_AREAS, CHANGE_OPTIONS, QUICK_SUGGESTION_COUNT } from "@/data/generalCheckData";
import { useLogGeneralCheck } from "@/hooks/useHealthTracking";

const C = {
  cream: "#FFF7EF",
  card: "#FFFBF7",
  coral: "#FF6F61",
  peach: "#FFE5D9",
  terracotta: "#B75D32",
  warmBrown: "#3B241B",
  mutedBrown: "#8B7355",
  sage: "#A7BFA3",
  sand: "#F5EDE4",
};

// mode: "full" (default) is the per-area wizard opened from HealthTrack. "quick" is the
// light guided check opened from the Care Ring — it shows only today's SUGGESTED areas
// (`suggestedAreas`, a small rotating set), each starting UNANSWERED. The owner must mark
// each ("looks usual" or "something changed") before Save enables; there is no passive
// all-usual default, so the ring's Care segment can't be filled without a real observation.
// onSaved(check) hands the created row back to the caller (the Care Ring) so it can offer Undo.
export default function GeneralCheckModal({
  visible,
  onClose,
  mode = "full",
  onSaved,
  suggestedAreas,
}) {
  const { t } = useTranslation();
  const tc = (k, vars) => t(`health.generalCheck.${k}`, vars);
  // Localized area label/description + change-option label, falling back to the
  // English constant in generalCheckData.js if a key is ever missing.
  const areaLabel = (area) =>
    tc(`areas.${area.key}.label`) === `areas.${area.key}.label`
      ? area.label
      : tc(`areas.${area.key}.label`);
  const areaDesc = (area) =>
    tc(`areas.${area.key}.description`) === `areas.${area.key}.description`
      ? area.description
      : tc(`areas.${area.key}.description`);
  const changeLabel = (opt) =>
    tc(`changes.${opt.key}`) === `changes.${opt.key}`
      ? opt.label
      : tc(`changes.${opt.key}`);

  const insets = useSafeAreaInsets();
  const scrollViewRef = useRef(null);
  const logGeneralCheckMutation = useLogGeneralCheck();
  const [upload, { loading: uploading }] = useUpload();

  const [currentAreaIndex, setCurrentAreaIndex] = useState(0);
  const [checkData, setCheckData] = useState({});
  // Quick mode only: the suggested area keys FROZEN at open, so they don't shuffle mid-
  // session if the parent's `suggestedAreas` prop recomputes while the sheet is open.
  const [quickAreaKeys, setQuickAreaKeys] = useState([]);

  const currentArea = CHECK_AREAS[currentAreaIndex];
  const currentAreaData = checkData[currentArea?.key] || {
    status: null,
    changes: [],
    notes: "",
    photos: [],
  };

  // Quick mode: freeze today's suggested areas on open. NO status is seeded — every
  // suggested area starts unanswered, so Save stays disabled until the owner actually
  // marks each one (no hollow all-usual write). Falls back to the fixed opening order if
  // the caller passed nothing yet (e.g. history still loading).
  useEffect(() => {
    if (!visible || mode !== "quick") return;
    const keys =
      Array.isArray(suggestedAreas) && suggestedAreas.length > 0
        ? suggestedAreas.slice(0, QUICK_SUGGESTION_COUNT)
        : CHECK_AREAS.slice(0, QUICK_SUGGESTION_COUNT).map((a) => a.key);
    setQuickAreaKeys(keys);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, mode]);

  // Quick-mode per-area editors — each takes an explicit area key (multiple suggested
  // areas are answerable at once, so they can't lean on the wizard's single "current area").
  const setQuickStatus = (areaKey, status) => {
    setCheckData((prev) => ({
      ...prev,
      [areaKey]: {
        ...(prev[areaKey] || { changes: [], notes: "", photos: [] }),
        status,
        changes: status === "usual" ? [] : prev[areaKey]?.changes || [],
      },
    }));
  };

  const toggleQuickChange = (areaKey, changeKey) => {
    setCheckData((prev) => {
      const area = prev[areaKey] || { status: "changed", changes: [], notes: "", photos: [] };
      const changes = area.changes || [];
      return {
        ...prev,
        [areaKey]: {
          ...area,
          changes: changes.includes(changeKey)
            ? changes.filter((c) => c !== changeKey)
            : [...changes, changeKey],
        },
      };
    });
  };

  const setQuickNotes = (areaKey, text) => {
    setCheckData((prev) => ({
      ...prev,
      [areaKey]: {
        ...(prev[areaKey] || { status: "changed", changes: [], notes: "", photos: [] }),
        notes: text,
      },
    }));
  };

  const handleAreaStatus = (status) => {
    setCheckData({
      ...checkData,
      [currentArea.key]: {
        ...currentAreaData,
        // Tapping the already-selected status clears it back to "not checked" —
        // the check is optional per area, so the owner can un-answer freely.
        status: currentAreaData.status === status ? null : status,
        changes: status === "usual" ? [] : currentAreaData.changes,
      },
    });
  };

  const toggleChange = (changeKey) => {
    const currentChanges = currentAreaData.changes || [];
    const newChanges = currentChanges.includes(changeKey)
      ? currentChanges.filter((c) => c !== changeKey)
      : [...currentChanges, changeKey];

    setCheckData({
      ...checkData,
      [currentArea.key]: {
        ...currentAreaData,
        changes: newChanges,
      },
    });
  };

  const handleNotesChange = (text) => {
    setCheckData({
      ...checkData,
      [currentArea.key]: {
        ...currentAreaData,
        notes: text,
      },
    });
  };

  // Append/remove an uploaded photo URL on a SPECIFIC area's photos[]. Read the area
  // fresh from state (not a closed-over snapshot) so back-to-back adds don't clobber.
  const addPhotoToArea = (areaKey, url) => {
    setCheckData((prev) => {
      const area = prev[areaKey] || {
        status: null,
        changes: [],
        notes: "",
        photos: [],
      };
      return {
        ...prev,
        [areaKey]: { ...area, photos: [...(area.photos || []), url] },
      };
    });
  };

  const removePhotoFromArea = (areaKey, url) => {
    setCheckData((prev) => {
      const area = prev[areaKey];
      if (!area) return prev;
      return {
        ...prev,
        [areaKey]: {
          ...area,
          photos: (area.photos || []).filter((p) => p !== url),
        },
      };
    });
  };

  // Wizard-facing aliases bound to the current step's area (unchanged call sites).
  const addPhotoToCurrentArea = (url) => addPhotoToArea(currentArea.key, url);
  const removePhotoFromCurrentArea = (url) =>
    removePhotoFromArea(currentArea.key, url);

  // Shared capture flow: pick (camera or library) → upload via the app's chokepoint
  // (@/utils/useUpload → POST /api/upload → hosted URL) → store the URL on the given area.
  // Permission denial and upload failure both degrade gracefully (the check still saves
  // without a photo); nothing here can throw up to the render.
  const capturePhotoForArea = async (areaKey, source) => {
    if (uploading) return;
    try {
      const permission =
        source === "camera"
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (permission?.granted === false) {
        Alert.alert(tc("photoPermissionTitle"), tc("photoPermissionBody"));
        return;
      }

      const result =
        source === "camera"
          ? await ImagePicker.launchCameraAsync({
              allowsEditing: false,
              quality: 0.8,
            })
          : await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              allowsEditing: false,
              quality: 0.8,
            });

      if (result.canceled || !result.assets?.length) return;

      const asset = result.assets[0];
      const uploadResult = await upload({
        reactNativeAsset: {
          uri: asset.uri,
          name: `general_check_${areaKey}_${asset.fileName || "photo"}.jpg`,
          mimeType: asset.mimeType || "image/jpeg",
        },
      });

      if (uploadResult?.error || !uploadResult?.url) {
        Alert.alert(tc("photoError"));
        return;
      }
      addPhotoToArea(areaKey, uploadResult.url);
    } catch (error) {
      console.error("[GeneralCheck] photo capture error:", error);
      Alert.alert(tc("photoError"));
    }
  };

  // Wizard-facing alias bound to the current step's area (unchanged call sites).
  const capturePhoto = (source) => capturePhotoForArea(currentArea.key, source);

  const goToArea = (index) => {
    if (index < 0 || index > CHECK_AREAS.length - 1) return;
    setCurrentAreaIndex(index);
    scrollViewRef.current?.scrollTo({ y: 0, animated: false });
  };

  const handleNext = () => {
    if (currentAreaIndex < CHECK_AREAS.length - 1) {
      goToArea(currentAreaIndex + 1);
    } else {
      handleComplete();
    }
  };

  const handleBack = () => {
    if (currentAreaIndex > 0) {
      goToArea(currentAreaIndex - 1);
    }
  };

  const handleComplete = async () => {
    if (logGeneralCheckMutation.isPending) return;

    const changedCount = Object.values(checkData).filter(
      (area) => area.status === "changed",
    ).length;

    // Preserve every per-area observation in the single API notes field so nothing
    // the owner typed is silently dropped when we persist.
    const notes = CHECK_AREAS.map((a) => {
      const d = checkData[a.key];
      return d?.notes ? `${areaLabel(a)}: ${d.notes}` : null;
    })
      .filter(Boolean)
      .join("\n");

    // Persist the check to /api/health/general-checks so it lands on the pet's real
    // health timeline and survives reopen. Area keys are remapped
    // to the API's shape (teeth_mouth → teeth, skin_fur → skin). Un-checked areas
    // simply carry an undefined status → the route stores NULL, so only areas the
    // owner actually assessed are recorded — no invented data.
    let saved;
    try {
      saved = await logGeneralCheckMutation.mutateAsync({
        areas: {
          eyes: checkData.eyes,
          ears: checkData.ears,
          teeth: checkData.teeth_mouth,
          skin: checkData.skin_fur,
          paws: checkData.paws,
          face: checkData.face,
          mood: checkData.mood,
          energy: checkData.energy,
        },
        notes,
      });
    } catch (error) {
      // The mutation's onError already alerts; keep the modal open so the owner can retry.
      return;
    }

    // Hand the created row back so a caller (the Care Ring) can offer Undo. No-op for the
    // wizard, which passes no onSaved.
    onSaved?.(saved?.check);

    if (changedCount > 0) {
      Alert.alert(
        tc("savedTitle"),
        changedCount === 1
          ? tc("savedBodyOne")
          : tc("savedBodyMany", { count: changedCount }),
        [{ text: tc("ok"), onPress: handleCloseModal }],
      );
    } else {
      handleCloseModal();
    }
  };

  const handleCloseModal = () => {
    setCurrentAreaIndex(0);
    setQuickAreaKeys([]);
    setCheckData({});
    onClose();
  };

  // Every area is optional — "Next" always advances (an un-checked area is simply
  // "not checked", never an error). The primary button is only blocked while a save
  // is in flight on the final area.
  const isLastArea = currentAreaIndex === CHECK_AREAS.length - 1;
  const isSaving = logGeneralCheckMutation.isPending;
  // Progress reflects what the owner has actually ASSESSED (areas with a chosen
  // status), NOT which area they're currently viewing. Otherwise jumping to the
  // last area would falsely read "100% complete" with nothing checked.
  const assessedCount = Object.values(checkData).filter((a) => a?.status).length;
  const progress = (assessedCount / CHECK_AREAS.length) * 100;

  // ── Quick mode: the light guided check (Care Ring). A self-contained return kept
  // ENTIRELY separate from the wizard below, so the wizard render (and its tests) are
  // untouched. Shows only today's SUGGESTED areas, each UNANSWERED; the owner marks every
  // one before Save enables — no hollow all-usual write. ──
  if (mode === "quick") {
    const suggested = quickAreaKeys
      .map((key) => CHECK_AREAS.find((a) => a.key === key))
      .filter(Boolean);
    const allAnswered =
      suggested.length > 0 &&
      suggested.every((a) => checkData[a.key]?.status != null);
    const saveDisabled = isSaving || !allAnswered;

    const andWord = tc("quickAreasAnd");
    const names = suggested.map((a) => areaLabel(a));
    const joinedAreas =
      names.length <= 1
        ? names[0] || ""
        : names.length === 2
          ? `${names[0]} ${andWord} ${names[1]}`
          : `${names.slice(0, -1).join(", ")} ${andWord} ${names[names.length - 1]}`;

    return (
      <Modal
        visible={visible}
        animationType="slide"
        transparent
        onRequestClose={handleCloseModal}
      >
        <KeyboardAvoidingView
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.5)",
            justifyContent: "flex-end",
          }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View
            style={{
              backgroundColor: C.cream,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              paddingTop: 20,
              paddingBottom: insets.bottom + 20,
              height: "90%",
            }}
          >
            {/* Header */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingHorizontal: 20,
                marginBottom: 6,
              }}
            >
              <Text style={{ fontSize: 20, fontWeight: "800", color: C.warmBrown }}>
                {tc("title")}
              </Text>
              <TouchableOpacity
                onPress={handleCloseModal}
                accessibilityRole="button"
                accessibilityLabel={tc("back")}
              >
                <X size={24} color={C.warmBrown} />
              </TouchableOpacity>
            </View>
            <View style={{ paddingHorizontal: 20, marginBottom: 12 }}>
              <Text style={{ fontSize: 15, fontWeight: "700", color: C.warmBrown }}>
                {tc("quickTodayLabel", { areas: joinedAreas })}
              </Text>
              <Text style={{ fontSize: 13, color: C.mutedBrown, lineHeight: 18, marginTop: 2 }}>
                {tc("quickInstruction")}
              </Text>
            </View>

            <KeyboardAwareScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20 }}
              showsVerticalScrollIndicator={false}
            >
              {suggested.map((area) => {
                const ad = checkData[area.key] || {
                  status: null,
                  changes: [],
                  notes: "",
                  photos: [],
                };
                const changed = ad.status === "changed";
                return (
                  <View
                    key={area.key}
                    style={{
                      backgroundColor: C.card,
                      borderRadius: 14,
                      borderWidth: 1.5,
                      borderColor: changed
                        ? "#FFB74D"
                        : ad.status === "usual"
                          ? C.sage
                          : C.peach,
                      marginBottom: 12,
                      padding: 14,
                      gap: 12,
                    }}
                  >
                    {/* Area heading */}
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                      <Text style={{ fontSize: 24 }}>{area.emoji}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 16, fontWeight: "800", color: C.warmBrown }}>
                          {areaLabel(area)}
                        </Text>
                        <Text style={{ fontSize: 12, color: C.mutedBrown, marginTop: 1 }}>
                          {areaDesc(area)}
                        </Text>
                      </View>
                    </View>

                    {/* Status choice — starts unanswered; one must be picked to save. */}
                    <View style={{ flexDirection: "row", gap: 10 }}>
                      <Pressable
                        onPress={() => setQuickStatus(area.key, "usual")}
                        accessibilityRole="radio"
                        accessibilityLabel={`${areaLabel(area)}: ${tc("looksUsual")}`}
                        accessibilityState={{ selected: ad.status === "usual" }}
                        style={{
                          flex: 1,
                          backgroundColor: ad.status === "usual" ? C.sage : C.cream,
                          borderRadius: 12,
                          paddingVertical: 12,
                          alignItems: "center",
                          borderWidth: 1.5,
                          borderColor: ad.status === "usual" ? C.sage : C.peach,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: "700",
                            color: ad.status === "usual" ? "#FFF" : C.warmBrown,
                          }}
                        >
                          {tc("looksUsual")}
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => setQuickStatus(area.key, "changed")}
                        accessibilityRole="radio"
                        accessibilityLabel={`${areaLabel(area)}: ${tc("somethingChanged")}`}
                        accessibilityState={{ selected: ad.status === "changed" }}
                        style={{
                          flex: 1,
                          backgroundColor: ad.status === "changed" ? "#FFB74D" : C.cream,
                          borderRadius: 12,
                          paddingVertical: 12,
                          alignItems: "center",
                          borderWidth: 1.5,
                          borderColor: ad.status === "changed" ? "#FFB74D" : C.peach,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: "700",
                            color: ad.status === "changed" ? "#FFF" : C.warmBrown,
                          }}
                        >
                          {tc("somethingChanged")}
                        </Text>
                      </Pressable>
                    </View>

                    {/* "Something changed" → change options + optional photo + note */}
                    {changed && (
                      <>
                        <View style={{ gap: 8 }}>
                          <Text
                            style={{ fontSize: 13, fontWeight: "700", color: C.warmBrown }}
                          >
                            {tc("whatChanged")}
                          </Text>
                          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                            {CHANGE_OPTIONS.map((option) => {
                              const isSelected = ad.changes?.includes(option.key);
                              return (
                                <Pressable
                                  key={option.key}
                                  onPress={() => toggleQuickChange(area.key, option.key)}
                                  accessibilityRole="checkbox"
                                  accessibilityLabel={changeLabel(option)}
                                  accessibilityState={{ checked: !!isSelected }}
                                  style={{
                                    backgroundColor: isSelected ? C.coral + "20" : C.cream,
                                    borderRadius: 999,
                                    paddingVertical: 8,
                                    paddingHorizontal: 12,
                                    borderWidth: 1.5,
                                    borderColor: isSelected ? C.coral : C.peach,
                                    flexDirection: "row",
                                    alignItems: "center",
                                    gap: 6,
                                  }}
                                >
                                  <Text style={{ fontSize: 14 }}>{option.emoji}</Text>
                                  <Text
                                    style={{
                                      fontSize: 13,
                                      fontWeight: isSelected ? "700" : "600",
                                      color: isSelected ? C.coral : C.warmBrown,
                                    }}
                                  >
                                    {changeLabel(option)}
                                  </Text>
                                </Pressable>
                              );
                            })}
                          </View>
                        </View>

                        <View style={{ flexDirection: "row", gap: 10 }}>
                          <TouchableOpacity
                            onPress={() => capturePhotoForArea(area.key, "camera")}
                            disabled={uploading}
                            accessibilityRole="button"
                            accessibilityLabel={tc("takePhoto")}
                            style={{
                              flex: 1,
                              backgroundColor: C.cream,
                              borderRadius: 12,
                              padding: 12,
                              borderWidth: 1.5,
                              borderColor: C.peach,
                              flexDirection: "row",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: 6,
                              opacity: uploading ? 0.6 : 1,
                            }}
                          >
                            <Camera size={16} color={C.terracotta} />
                            <Text
                              style={{ fontSize: 12, fontWeight: "700", color: C.warmBrown }}
                            >
                              {tc("takePhoto")}
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => capturePhotoForArea(area.key, "library")}
                            disabled={uploading}
                            accessibilityRole="button"
                            accessibilityLabel={tc("choosePhoto")}
                            style={{
                              flex: 1,
                              backgroundColor: C.cream,
                              borderRadius: 12,
                              padding: 12,
                              borderWidth: 1.5,
                              borderColor: C.peach,
                              flexDirection: "row",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: 6,
                              opacity: uploading ? 0.6 : 1,
                            }}
                          >
                            <ImageIcon size={16} color={C.terracotta} />
                            <Text
                              style={{ fontSize: 12, fontWeight: "700", color: C.warmBrown }}
                            >
                              {tc("choosePhoto")}
                            </Text>
                          </TouchableOpacity>
                        </View>

                        {ad.photos?.length > 0 && (
                          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                            {ad.photos.map((uri) => (
                              <View key={uri} style={{ position: "relative" }}>
                                <Image
                                  source={{ uri }}
                                  style={{
                                    width: 64,
                                    height: 64,
                                    borderRadius: 12,
                                    borderWidth: 1.5,
                                    borderColor: C.peach,
                                  }}
                                  resizeMode="cover"
                                />
                                <TouchableOpacity
                                  onPress={() => removePhotoFromArea(area.key, uri)}
                                  accessibilityRole="button"
                                  accessibilityLabel={tc("removePhoto")}
                                  hitSlop={8}
                                  style={{
                                    position: "absolute",
                                    top: -8,
                                    right: -8,
                                    width: 24,
                                    height: 24,
                                    borderRadius: 12,
                                    backgroundColor: C.warmBrown,
                                    justifyContent: "center",
                                    alignItems: "center",
                                  }}
                                >
                                  <X size={14} color="#FFF" />
                                </TouchableOpacity>
                              </View>
                            ))}
                          </View>
                        )}

                        <TextInput
                          value={ad.notes}
                          onChangeText={(text) => setQuickNotes(area.key, text)}
                          placeholder={tc("notesPlaceholder")}
                          placeholderTextColor={C.mutedBrown + "80"}
                          multiline
                          style={{
                            backgroundColor: C.cream,
                            borderRadius: 12,
                            padding: 12,
                            fontSize: 14,
                            color: C.warmBrown,
                            borderWidth: 1,
                            borderColor: C.peach,
                            minHeight: 64,
                            textAlignVertical: "top",
                          }}
                        />
                      </>
                    )}
                  </View>
                );
              })}

              {uploading && (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    marginBottom: 8,
                  }}
                >
                  <ActivityIndicator size="small" color={C.terracotta} />
                  <Text style={{ fontSize: 12, fontWeight: "600", color: C.mutedBrown }}>
                    {tc("uploadingPhoto")}
                  </Text>
                </View>
              )}

              {/* Safety framing — this prepares vet conversations, it is not a diagnosis. */}
              <View
                style={{
                  backgroundColor: "#FFF4E6",
                  borderRadius: 12,
                  padding: 14,
                  borderWidth: 1,
                  borderColor: "#FFE4C4",
                  flexDirection: "row",
                  alignItems: "flex-start",
                  gap: 10,
                  marginTop: 4,
                }}
              >
                <Info size={16} color="#FFB74D" style={{ marginTop: 2 }} />
                <Text style={{ fontSize: 11, color: C.mutedBrown, lineHeight: 16, flex: 1 }}>
                  {tc("safetyWarning")}
                </Text>
              </View>
            </KeyboardAwareScrollView>

            {/* Save — disabled until every suggested area is answered. */}
            <View
              style={{
                paddingHorizontal: 20,
                paddingTop: 16,
                borderTopWidth: 1,
                borderTopColor: C.peach,
              }}
            >
              {!allAnswered && (
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: "600",
                    color: C.mutedBrown,
                    textAlign: "center",
                    marginBottom: 10,
                  }}
                >
                  {tc("quickSaveHint")}
                </Text>
              )}
              <TouchableOpacity
                onPress={handleComplete}
                disabled={saveDisabled}
                accessibilityRole="button"
                accessibilityLabel={tc("save")}
                accessibilityState={{ disabled: saveDisabled }}
                style={{
                  backgroundColor: saveDisabled ? C.mutedBrown + "40" : C.coral,
                  borderRadius: 14,
                  padding: 16,
                  alignItems: "center",
                }}
              >
                <Text style={{ fontSize: 16, fontWeight: "700", color: "#FFF" }}>
                  {isSaving ? tc("saving") : tc("save")}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleCloseModal}>
      <KeyboardAvoidingView
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.5)",
          justifyContent: "flex-end",
        }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View
          style={{
            backgroundColor: C.cream,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingTop: 20,
            paddingBottom: insets.bottom + 20,
            // A DEFINITE height (not maxHeight-only) is required: the middle child is a
            // KeyboardAwareScrollView with flex:1, and flex:1 resolves to 0 height when the
            // parent is content-sized. Without this the entire scroll body (status options,
            // change list, notes) collapses to zero height and "Next" can never enable.
            height: "90%",
          }}
        >
          {/* Header */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: 20,
              marginBottom: 12,
            }}
          >
            <Text
              style={{ fontSize: 20, fontWeight: "800", color: C.warmBrown }}
            >
              {tc("title")}
            </Text>
            <TouchableOpacity onPress={handleCloseModal}>
              <X size={24} color={C.warmBrown} />
            </TouchableOpacity>
          </View>

          {/* Progress Bar */}
          <View style={{ paddingHorizontal: 20, marginBottom: 12 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 8,
              }}
            >
              <Text
                style={{ fontSize: 12, fontWeight: "600", color: C.mutedBrown }}
              >
                {tc("progress", {
                  current: currentAreaIndex + 1,
                  total: CHECK_AREAS.length,
                })}
              </Text>
              <Text style={{ fontSize: 12, fontWeight: "600", color: C.sage }}>
                {tc("assessedCount", {
                  count: assessedCount,
                  total: CHECK_AREAS.length,
                })}
              </Text>
            </View>
            <View
              style={{
                height: 6,
                backgroundColor: C.peach,
                borderRadius: 3,
                overflow: "hidden",
              }}
            >
              <View
                style={{
                  height: "100%",
                  width: `${progress}%`,
                  backgroundColor: C.sage,
                  borderRadius: 3,
                }}
              />
            </View>
          </View>

          {/* Area stepper — every one of the 8 body areas is directly reachable, so the
              owner is never trapped on a single area. The current area is highlighted;
              an area that already has a status shows a check. */}
          <View style={{ marginBottom: 16 }}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}
            >
              {CHECK_AREAS.map((area, idx) => {
                const assessed = checkData[area.key]?.status != null;
                const isCurrent = idx === currentAreaIndex;
                return (
                  <Pressable
                    key={area.key}
                    onPress={() => goToArea(idx)}
                    accessibilityRole="button"
                    accessibilityLabel={areaLabel(area)}
                    accessibilityState={{ selected: isCurrent }}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderRadius: 999,
                      backgroundColor: isCurrent ? C.coral : C.card,
                      borderWidth: 1.5,
                      borderColor: isCurrent
                        ? C.coral
                        : assessed
                          ? C.sage
                          : C.peach,
                    }}
                  >
                    <Text style={{ fontSize: 15 }}>{area.emoji}</Text>
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: "700",
                        color: isCurrent ? "#FFF" : C.warmBrown,
                      }}
                    >
                      {areaLabel(area)}
                    </Text>
                    {assessed && (
                      <CheckCircle
                        size={14}
                        color={isCurrent ? "#FFF" : C.sage}
                      />
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          <KeyboardAwareScrollView
            ref={scrollViewRef}
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20 }}
            showsVerticalScrollIndicator={false}
          >
            {/* Current Area */}
            <View
              style={{
                backgroundColor: C.card,
                borderRadius: 18,
                padding: 20,
                borderWidth: 1.5,
                borderColor: C.peach,
                marginBottom: 16,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  marginBottom: 10,
                }}
              >
                <Text style={{ fontSize: 32 }}>{currentArea.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: 20,
                      fontWeight: "800",
                      color: C.warmBrown,
                      marginBottom: 2,
                    }}
                  >
                    {areaLabel(currentArea)}
                  </Text>
                  <Text style={{ fontSize: 13, color: C.mutedBrown }}>
                    {areaDesc(currentArea)}
                  </Text>
                </View>
              </View>
            </View>

            {/* Status Selection — optional per area. Every area can be left "not
                checked"; a subtle hint says so, and "Next" advances regardless. */}
            <View style={{ marginBottom: 20 }}>
              <Text
                style={{
                  fontSize: 15,
                  fontWeight: "800",
                  color: C.warmBrown,
                  marginBottom: currentAreaData.status === null ? 4 : 12,
                }}
              >
                {tc("howDoesThisLook")}
              </Text>
              {currentAreaData.status === null && (
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: "600",
                    color: C.mutedBrown,
                    marginBottom: 12,
                  }}
                >
                  {tc("optionalHint")}
                </Text>
              )}
              <View style={{ gap: 10 }}>
                <Pressable
                  onPress={() => handleAreaStatus("usual")}
                  accessibilityRole="radio"
                  accessibilityLabel={tc("looksUsual")}
                  accessibilityState={{
                    selected: currentAreaData.status === "usual",
                  }}
                  hitSlop={8}
                  style={{
                    backgroundColor:
                      currentAreaData.status === "usual" ? C.sage : C.card,
                    borderRadius: 14,
                    padding: 16,
                    borderWidth: 1.5,
                    borderColor:
                      currentAreaData.status === "usual" ? C.sage : C.peach,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <View
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 12,
                      backgroundColor:
                        currentAreaData.status === "usual" ? "#FFF" : C.sand,
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                  >
                    {currentAreaData.status === "usual" && (
                      <CheckCircle size={16} color={C.sage} />
                    )}
                  </View>
                  <Text
                    style={{
                      fontSize: 15,
                      fontWeight: "700",
                      color:
                        currentAreaData.status === "usual"
                          ? "#FFF"
                          : C.warmBrown,
                      flex: 1,
                    }}
                  >
                    {tc("looksUsual")}
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => handleAreaStatus("changed")}
                  accessibilityRole="radio"
                  accessibilityLabel={tc("somethingChanged")}
                  accessibilityState={{
                    selected: currentAreaData.status === "changed",
                  }}
                  hitSlop={8}
                  style={{
                    backgroundColor:
                      currentAreaData.status === "changed" ? "#FFB74D" : C.card,
                    borderRadius: 14,
                    padding: 16,
                    borderWidth: 1.5,
                    borderColor:
                      currentAreaData.status === "changed"
                        ? "#FFB74D"
                        : C.peach,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <View
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 12,
                      backgroundColor:
                        currentAreaData.status === "changed" ? "#FFF" : C.sand,
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                  >
                    {currentAreaData.status === "changed" && (
                      <CheckCircle size={16} color="#FFB74D" />
                    )}
                  </View>
                  <Text
                    style={{
                      fontSize: 15,
                      fontWeight: "700",
                      color:
                        currentAreaData.status === "changed"
                          ? "#FFF"
                          : C.warmBrown,
                      flex: 1,
                    }}
                  >
                    {tc("somethingChanged")}
                  </Text>
                </Pressable>
              </View>
            </View>

            {/* Change Options (if "Something changed" is selected) */}
            {currentAreaData.status === "changed" && (
              <View style={{ marginBottom: 20 }}>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "700",
                    color: C.warmBrown,
                    marginBottom: 12,
                  }}
                >
                  {tc("whatChanged")}
                </Text>
                <View style={{ gap: 8 }}>
                  {CHANGE_OPTIONS.map((option) => {
                    const isSelected = currentAreaData.changes?.includes(
                      option.key,
                    );
                    return (
                      <Pressable
                        key={option.key}
                        onPress={() => toggleChange(option.key)}
                        accessibilityRole="checkbox"
                        accessibilityLabel={changeLabel(option)}
                        accessibilityState={{ checked: !!isSelected }}
                        hitSlop={6}
                        style={{
                          backgroundColor: isSelected ? C.coral + "20" : C.card,
                          borderRadius: 12,
                          padding: 14,
                          borderWidth: 1.5,
                          borderColor: isSelected ? C.coral : C.peach,
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 10,
                        }}
                      >
                        <Text style={{ fontSize: 18 }}>{option.emoji}</Text>
                        <Text
                          style={{
                            fontSize: 14,
                            fontWeight: isSelected ? "700" : "600",
                            color: isSelected ? C.coral : C.warmBrown,
                            flex: 1,
                          }}
                        >
                          {changeLabel(option)}
                        </Text>
                        {isSelected && (
                          <CheckCircle size={18} color={C.coral} />
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Photo Actions */}
            <View style={{ marginBottom: 20 }}>
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: "700",
                  color: C.warmBrown,
                  marginBottom: 12,
                }}
              >
                {tc("addPhoto")}
              </Text>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <TouchableOpacity
                  onPress={() => capturePhoto("camera")}
                  disabled={uploading}
                  accessibilityRole="button"
                  accessibilityLabel={tc("takePhoto")}
                  style={{
                    flex: 1,
                    backgroundColor: C.card,
                    borderRadius: 12,
                    padding: 14,
                    borderWidth: 1.5,
                    borderColor: C.peach,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    opacity: uploading ? 0.6 : 1,
                  }}
                >
                  <Camera size={18} color={C.terracotta} />
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "700",
                      color: C.warmBrown,
                    }}
                  >
                    {tc("takePhoto")}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => capturePhoto("library")}
                  disabled={uploading}
                  accessibilityRole="button"
                  accessibilityLabel={tc("choosePhoto")}
                  style={{
                    flex: 1,
                    backgroundColor: C.card,
                    borderRadius: 12,
                    padding: 14,
                    borderWidth: 1.5,
                    borderColor: C.peach,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    opacity: uploading ? 0.6 : 1,
                  }}
                >
                  <ImageIcon size={18} color={C.terracotta} />
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "700",
                      color: C.warmBrown,
                    }}
                  >
                    {tc("choosePhoto")}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Uploading indicator */}
              {uploading && (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    marginTop: 10,
                  }}
                >
                  <ActivityIndicator size="small" color={C.terracotta} />
                  <Text
                    style={{ fontSize: 12, fontWeight: "600", color: C.mutedBrown }}
                  >
                    {tc("uploadingPhoto")}
                  </Text>
                </View>
              )}

              {/* Thumbnails of photos added to THIS area, each with a remove control */}
              {currentAreaData.photos?.length > 0 && (
                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    gap: 10,
                    marginTop: 12,
                  }}
                >
                  {currentAreaData.photos.map((uri) => (
                    <View key={uri} style={{ position: "relative" }}>
                      <Image
                        source={{ uri }}
                        style={{
                          width: 72,
                          height: 72,
                          borderRadius: 12,
                          borderWidth: 1.5,
                          borderColor: C.peach,
                        }}
                        resizeMode="cover"
                      />
                      <TouchableOpacity
                        onPress={() => removePhotoFromCurrentArea(uri)}
                        accessibilityRole="button"
                        accessibilityLabel={tc("removePhoto")}
                        hitSlop={8}
                        style={{
                          position: "absolute",
                          top: -8,
                          right: -8,
                          width: 24,
                          height: 24,
                          borderRadius: 12,
                          backgroundColor: C.warmBrown,
                          justifyContent: "center",
                          alignItems: "center",
                        }}
                      >
                        <X size={14} color="#FFF" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}

              {/* AI Placeholder */}
              <View
                style={{
                  backgroundColor: "#F3E5F5",
                  borderRadius: 12,
                  padding: 14,
                  borderWidth: 1.5,
                  borderColor: "#E1BEE7",
                  marginTop: 10,
                  opacity: 0.6,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                    marginBottom: 6,
                  }}
                >
                  <Sparkles size={16} color="#9C27B0" />
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "700",
                      color: "#6A1B9A",
                      flex: 1,
                    }}
                  >
                    {tc("askAi")}
                  </Text>
                  <Lock size={14} color="#9C27B0" />
                </View>
                <Text
                  style={{
                    fontSize: 11,
                    color: "#6A1B9A",
                    lineHeight: 15,
                  }}
                >
                  {tc("askAiSoon")}
                </Text>
              </View>
            </View>

            {/* Notes */}
            <View style={{ marginBottom: 20 }}>
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: "700",
                  color: C.warmBrown,
                  marginBottom: 12,
                }}
              >
                {tc("notes")}
              </Text>
              <TextInput
                value={currentAreaData.notes}
                onChangeText={handleNotesChange}
                placeholder={tc("notesPlaceholder")}
                placeholderTextColor={C.mutedBrown + "80"}
                multiline
                numberOfLines={3}
                style={{
                  backgroundColor: C.card,
                  borderRadius: 12,
                  padding: 14,
                  fontSize: 15,
                  color: C.warmBrown,
                  borderWidth: 1,
                  borderColor: C.peach,
                  minHeight: 80,
                  textAlignVertical: "top",
                }}
              />
            </View>

            {/* Safety Warning */}
            <View
              style={{
                backgroundColor: "#FFF4E6",
                borderRadius: 12,
                padding: 14,
                borderWidth: 1,
                borderColor: "#FFE4C4",
                flexDirection: "row",
                alignItems: "flex-start",
                gap: 10,
              }}
            >
              <Info size={16} color="#FFB74D" style={{ marginTop: 2 }} />
              <Text
                style={{
                  fontSize: 11,
                  color: C.mutedBrown,
                  lineHeight: 16,
                  flex: 1,
                }}
              >
                {tc("safetyWarning")}
              </Text>
            </View>
          </KeyboardAwareScrollView>

          {/* Navigation Buttons */}
          <View
            style={{
              paddingHorizontal: 20,
              paddingTop: 16,
              borderTopWidth: 1,
              borderTopColor: C.peach,
              flexDirection: "row",
              gap: 12,
            }}
          >
            {currentAreaIndex > 0 && (
              <TouchableOpacity
                onPress={handleBack}
                style={{
                  flex: 1,
                  backgroundColor: C.card,
                  borderRadius: 14,
                  padding: 16,
                  alignItems: "center",
                  borderWidth: 1.5,
                  borderColor: C.peach,
                }}
              >
                <Text
                  style={{
                    fontSize: 16,
                    fontWeight: "700",
                    color: C.warmBrown,
                  }}
                >
                  {tc("back")}
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={handleNext}
              disabled={isSaving}
              style={{
                flex: currentAreaIndex > 0 ? 2 : 1,
                backgroundColor: isSaving ? C.mutedBrown + "40" : C.coral,
                borderRadius: 14,
                padding: 16,
                alignItems: "center",
                flexDirection: "row",
                justifyContent: "center",
                gap: 8,
              }}
            >
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: "700",
                  color: "#FFF",
                }}
              >
                {isLastArea
                  ? isSaving
                    ? tc("saving")
                    : tc("complete")
                  : tc("next")}
              </Text>
              {!isLastArea && <ChevronRight size={20} color="#FFF" />}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
