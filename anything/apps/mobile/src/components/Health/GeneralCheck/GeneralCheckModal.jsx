import React, { useState, useRef } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  Alert,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
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
import { CHECK_AREAS, CHANGE_OPTIONS } from "@/data/generalCheckData";
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

export default function GeneralCheckModal({ visible, onClose }) {
  const { t } = useTranslation();
  const tc = (k, vars) => t(`health.generalCheck.${k}`, vars);
  const insets = useSafeAreaInsets();
  const scrollViewRef = useRef(null);
  const logGeneralCheckMutation = useLogGeneralCheck();

  const [currentAreaIndex, setCurrentAreaIndex] = useState(0);
  const [checkData, setCheckData] = useState({});

  const currentArea = CHECK_AREAS[currentAreaIndex];
  const currentAreaData = checkData[currentArea?.key] || {
    status: null,
    changes: [],
    notes: "",
    photos: [],
  };

  const handleAreaStatus = (status) => {
    setCheckData({
      ...checkData,
      [currentArea.key]: {
        ...currentAreaData,
        status,
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

  const handleNext = () => {
    if (currentAreaIndex < CHECK_AREAS.length - 1) {
      setCurrentAreaIndex(currentAreaIndex + 1);
      scrollViewRef.current?.scrollTo({ y: 0, animated: false });
    } else {
      handleComplete();
    }
  };

  const handleBack = () => {
    if (currentAreaIndex > 0) {
      setCurrentAreaIndex(currentAreaIndex - 1);
      scrollViewRef.current?.scrollTo({ y: 0, animated: false });
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
      return d?.notes ? `${a.label}: ${d.notes}` : null;
    })
      .filter(Boolean)
      .join("\n");

    // Persist the check to /api/health/general-checks so it lands on the pet's real
    // health timeline (Today's Progress) and survives reopen. Area keys are remapped
    // to the API's shape (teeth_mouth → teeth, skin_fur → skin).
    try {
      await logGeneralCheckMutation.mutateAsync({
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
    setCheckData({});
    onClose();
  };

  const canProceed = currentAreaData.status !== null;
  const isLastArea = currentAreaIndex === CHECK_AREAS.length - 1;
  const progress = ((currentAreaIndex + 1) / CHECK_AREAS.length) * 100;

  return (
    <Modal visible={visible} animationType="slide" transparent>
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
          <View style={{ paddingHorizontal: 20, marginBottom: 20 }}>
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
                {tc("percentComplete", { percent: Math.round(progress) })}
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
                    {currentArea.label}
                  </Text>
                  <Text style={{ fontSize: 13, color: C.mutedBrown }}>
                    {currentArea.description}
                  </Text>
                </View>
              </View>
            </View>

            {/* Status Selection — the required first action. Kept directly under the
                compact area card (no scrolling needed) and visually flagged as the
                starting choice so "Next" never reads as dead. */}
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
                    color: C.coral,
                    marginBottom: 12,
                  }}
                >
                  {tc("chooseHint")}
                </Text>
              )}
              <View style={{ gap: 10 }}>
                <TouchableOpacity
                  onPress={() => handleAreaStatus("usual")}
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
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => handleAreaStatus("changed")}
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
                </TouchableOpacity>
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
                      <TouchableOpacity
                        key={option.key}
                        onPress={() => toggleChange(option.key)}
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
                          {option.label}
                        </Text>
                        {isSelected && (
                          <CheckCircle size={18} color={C.coral} />
                        )}
                      </TouchableOpacity>
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
              disabled={!canProceed || logGeneralCheckMutation.isPending}
              style={{
                flex: currentAreaIndex > 0 ? 2 : 1,
                backgroundColor:
                  canProceed && !logGeneralCheckMutation.isPending
                    ? C.coral
                    : C.mutedBrown + "40",
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
                  ? logGeneralCheckMutation.isPending
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
