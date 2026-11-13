import React, { useState, useEffect } from "react";
import { COLORS } from "@/constants/theme";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  TextInput,
  Switch,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import KeyboardAwareScrollView from "@/components/KeyboardAwareScrollView";
import { X } from "lucide-react-native";
import { ROUTINE_TYPES } from "@/data/routinesData";
import DateField from "@/components/DateField";
import { useTranslation } from "react-i18next";

const C = {
  cream: COLORS.cream,
  card: "#FFFBF7",
  coral: COLORS.coral,
  peach: "#FFE5D9",
  terracotta: COLORS.terracotta,
  warmBrown: COLORS.warmBrown,
  mutedBrown: "#8B7355",
  sage: COLORS.sage,
  sand: "#F5EDE4",
};

export default function PreventiveCareRoutineModal({
  visible,
  onClose,
  onSave,
  editingRoutine,
}) {
  const { t } = useTranslation();
  const [productName, setProductName] = useState("");
  const [treatmentType, setTreatmentType] = useState("flea");
  const [lastGiven, setLastGiven] = useState("");
  const [nextDue, setNextDue] = useState("");
  const [repeatInterval, setRepeatInterval] = useState("monthly");
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [timeSensitive, setTimeSensitive] = useState(true);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (editingRoutine) {
      setProductName(editingRoutine.productName || "");
      setTreatmentType(editingRoutine.treatmentType || "flea");
      setLastGiven(editingRoutine.lastGiven || "");
      setNextDue(editingRoutine.nextDue || "");
      setRepeatInterval(editingRoutine.repeatInterval || "monthly");
      setReminderEnabled(editingRoutine.notificationEnabled ?? true);
      setTimeSensitive(editingRoutine.timeSensitive ?? true);
      setNotes(editingRoutine.notes || "");
    } else {
      setProductName("");
      setTreatmentType("flea");
      setLastGiven("");
      setNextDue("");
      setRepeatInterval("monthly");
      setReminderEnabled(true);
      setTimeSensitive(true);
      setNotes("");
    }
  }, [editingRoutine, visible]);

  const handleSave = () => {
    const routine = {
      type: ROUTINE_TYPES.PREVENTIVE,
      petId: editingRoutine?.petId ?? null,
      // Editing keeps the routine's current state: a PAUSED routine must not silently resume on save.
      isActive: editingRoutine?.isActive ?? true,
      productName,
      treatmentType,
      lastGiven,
      nextDue,
      repeatInterval,
      times: ["10:00"],
      notificationEnabled: reminderEnabled,
      timeSensitive,
      notes,
      title: productName || "Preventive Care",
      description:
        treatmentType.charAt(0).toUpperCase() +
        treatmentType.slice(1) +
        " prevention",
    };

    if (editingRoutine) routine.id = editingRoutine.id;
    onSave(routine);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        <View style={{ flex: 1, backgroundColor: C.cream }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              padding: 20,
              paddingTop: 60,
              borderBottomWidth: 1,
              borderBottomColor: C.peach,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 20,
                  fontWeight: "800",
                  color: C.warmBrown,
                  marginBottom: 4,
                }}
              >
                {editingRoutine
                  ? t("routinesUi.preventiveCare.titleEdit")
                  : t("routinesUi.preventiveCare.titleCreate")}
              </Text>
              <Text style={{ fontSize: 14, color: C.mutedBrown }}>
                {t("routinesUi.preventiveCare.fleaTickHeartwormPrevention")}
              </Text>
            </View>
            <TouchableOpacity accessibilityLabel={t("common.close")} accessibilityRole="button" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              onPress={onClose}
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: C.sand,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <X size={20} color={C.warmBrown} />
            </TouchableOpacity>
          </View>

          <KeyboardAwareScrollView
            contentContainerStyle={{ padding: 20, paddingBottom: 120 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text
              style={{
                fontSize: 15,
                fontWeight: "700",
                color: C.warmBrown,
                marginBottom: 12,
              }}
            >
              {t("routinesUi.preventiveCare.productTreatmentName")}
            </Text>
            <TextInput
              value={productName}
              onChangeText={setProductName}
              placeholder={t("routinesUi.preventiveCare.exampleNexgard")}
              placeholderTextColor={C.mutedBrown}
              style={{
                backgroundColor: C.card,
                borderRadius: 12,
                padding: 12,
                fontSize: 15,
                color: C.warmBrown,
                borderWidth: 1,
                borderColor: C.peach,
                marginBottom: 20,
              }}
            />

            <Text
              style={{
                fontSize: 15,
                fontWeight: "700",
                color: C.warmBrown,
                marginBottom: 12,
              }}
            >
              {t("routinesUi.preventiveCare.treatmentType")}
            </Text>
            <View style={{ gap: 8, marginBottom: 20 }}>
              {[
                { value: "flea", label: t("routinesUi.preventiveCare.fleaPrevention") },
                { value: "tick", label: t("routinesUi.preventiveCare.tickPrevention") },
                { value: "worm", label: t("routinesUi.preventiveCare.wormPrevention") },
                { value: "heartworm", label: t("routinesUi.preventiveCare.heartwormPrevention") },
                { value: "other", label: t("routinesUi.preventiveCare.other") },
              ].map((option) => (
                <TouchableOpacity
                  key={option.value}
                  onPress={() => setTreatmentType(option.value)}
                  style={{
                    backgroundColor:
                      treatmentType === option.value
                        ? "#F4A460" + "20"
                        : C.card,
                    borderRadius: 12,
                    padding: 14,
                    borderWidth: 1.5,
                    borderColor:
                      treatmentType === option.value ? "#F4A460" : C.peach,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 15,
                      fontWeight:
                        treatmentType === option.value ? "700" : "600",
                      color:
                        treatmentType === option.value
                          ? "#F4A460"
                          : C.warmBrown,
                    }}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Stacked (not side-by-side) so the inline calendar has full width */}
            <View style={{ gap: 12, marginBottom: 20 }}>
              <View>
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: "600",
                    color: C.mutedBrown,
                    marginBottom: 8,
                  }}
                >
                  {t("routinesUi.preventiveCare.lastGiven")}
                </Text>
                <DateField value={lastGiven} onChange={setLastGiven} maximumDate={new Date()} />
              </View>
              <View>
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: "600",
                    color: C.mutedBrown,
                    marginBottom: 8,
                  }}
                >
                  {t("routinesUi.preventiveCare.nextDue")}
                </Text>
                <DateField value={nextDue} onChange={setNextDue} />
              </View>
            </View>

            <Text
              style={{
                fontSize: 15,
                fontWeight: "700",
                color: C.warmBrown,
                marginBottom: 12,
              }}
            >
              {t("routinesUi.preventiveCare.repeatInterval")}
            </Text>
            <View style={{ gap: 8, marginBottom: 20 }}>
              {[
                { value: "monthly", label: t("routinesUi.preventiveCare.monthly") },
                { value: "every_3_months", label: t("routinesUi.preventiveCare.every3Months") },
                { value: "every_6_months", label: t("routinesUi.preventiveCare.every6Months") },
                { value: "yearly", label: t("routinesUi.preventiveCare.yearly") },
              ].map((option) => (
                <TouchableOpacity
                  key={option.value}
                  onPress={() => setRepeatInterval(option.value)}
                  style={{
                    backgroundColor:
                      repeatInterval === option.value
                        ? "#F4A460" + "20"
                        : C.card,
                    borderRadius: 12,
                    padding: 14,
                    borderWidth: 1.5,
                    borderColor:
                      repeatInterval === option.value ? "#F4A460" : C.peach,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 15,
                      fontWeight:
                        repeatInterval === option.value ? "700" : "600",
                      color:
                        repeatInterval === option.value
                          ? "#F4A460"
                          : C.warmBrown,
                    }}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View
              style={{
                backgroundColor: C.card,
                borderRadius: 16,
                padding: 16,
                borderWidth: 1,
                borderColor: C.peach,
                marginBottom: 16,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 14,
                }}
              >
                <Text
                  style={{
                    fontSize: 15,
                    fontWeight: "600",
                    color: C.warmBrown,
                  }}
                >
                  {t("routinesUi.preventiveCare.reminderEnabled")}
                </Text>
                <Switch
                  value={reminderEnabled}
                  onValueChange={setReminderEnabled}
                  trackColor={{ false: C.sand, true: C.sage + "60" }}
                  thumbColor={reminderEnabled ? C.sage : C.peach}
                />
              </View>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Text
                  style={{
                    fontSize: 15,
                    fontWeight: "600",
                    color: C.warmBrown,
                  }}
                >
                  {t("routinesUi.preventiveCare.timeSensitive")}
                </Text>
                <Switch
                  value={timeSensitive}
                  onValueChange={setTimeSensitive}
                  trackColor={{ false: C.sand, true: C.coral + "60" }}
                  thumbColor={timeSensitive ? C.coral : C.peach}
                />
              </View>
            </View>

            <Text
              style={{
                fontSize: 15,
                fontWeight: "700",
                color: C.warmBrown,
                marginBottom: 12,
              }}
            >
              {t("routinesUi.preventiveCare.notesOptional")}
            </Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder={t("common.additionalNotesPlaceholder")}
              placeholderTextColor={C.mutedBrown}
              multiline
              numberOfLines={3}
              style={{
                backgroundColor: C.card,
                borderRadius: 12,
                padding: 12,
                fontSize: 14,
                color: C.warmBrown,
                borderWidth: 1,
                borderColor: C.peach,
                textAlignVertical: "top",
                marginBottom: 24,
              }}
            />
          </KeyboardAwareScrollView>

          <View
            style={{
              padding: 20,
              paddingBottom: 30,
              borderTopWidth: 1,
              borderTopColor: C.peach,
              backgroundColor: C.cream,
            }}
          >
            <TouchableOpacity
              onPress={handleSave}
              style={{
                backgroundColor: "#F4A460",
                borderRadius: 14,
                paddingVertical: 16,
                alignItems: "center",
              }}
            >
              <Text style={{ fontSize: 16, fontWeight: "700", color: "#FFF" }}>
                {editingRoutine
                ? t("routinesUi.shared.saveChanges")
                : t("routinesUi.shared.createRoutine")}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
