import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Modal,
  TextInput,
  Switch,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import { X } from "lucide-react-native";
import { ROUTINE_TYPES } from "@/data/routinesData";

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

export default function PreventiveCareRoutineModal({
  visible,
  onClose,
  onSave,
  editingRoutine,
}) {
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
      petId: "phoebe",
      isActive: true,
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
    <Modal visible={visible} animationType="slide" transparent={true}>
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
                🛡️ {editingRoutine ? "Edit" : "Create"} Preventive Care
              </Text>
              <Text style={{ fontSize: 14, color: C.mutedBrown }}>
                Flea, tick, heartworm prevention
              </Text>
            </View>
            <TouchableOpacity
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

          <ScrollView
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
              Product / Treatment Name
            </Text>
            <TextInput
              value={productName}
              onChangeText={setProductName}
              placeholder="e.g., NexGard"
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
              Treatment Type
            </Text>
            <View style={{ gap: 8, marginBottom: 20 }}>
              {[
                { value: "flea", label: "Flea Prevention" },
                { value: "tick", label: "Tick Prevention" },
                { value: "worm", label: "Worm Prevention" },
                { value: "heartworm", label: "Heartworm Prevention" },
                { value: "other", label: "Other" },
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

            <View style={{ flexDirection: "row", gap: 12, marginBottom: 20 }}>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: "600",
                    color: C.mutedBrown,
                    marginBottom: 8,
                  }}
                >
                  Last Given
                </Text>
                <TextInput
                  value={lastGiven}
                  onChangeText={setLastGiven}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={C.mutedBrown}
                  style={{
                    backgroundColor: C.card,
                    borderRadius: 12,
                    padding: 12,
                    fontSize: 14,
                    color: C.warmBrown,
                    borderWidth: 1,
                    borderColor: C.peach,
                  }}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: "600",
                    color: C.mutedBrown,
                    marginBottom: 8,
                  }}
                >
                  Next Due
                </Text>
                <TextInput
                  value={nextDue}
                  onChangeText={setNextDue}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={C.mutedBrown}
                  style={{
                    backgroundColor: C.card,
                    borderRadius: 12,
                    padding: 12,
                    fontSize: 14,
                    color: C.warmBrown,
                    borderWidth: 1,
                    borderColor: C.peach,
                  }}
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
              Repeat Interval
            </Text>
            <View style={{ gap: 8, marginBottom: 20 }}>
              {[
                { value: "monthly", label: "Monthly" },
                { value: "every_3_months", label: "Every 3 months" },
                { value: "every_6_months", label: "Every 6 months" },
                { value: "yearly", label: "Yearly" },
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
                  Reminder enabled
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
                  Time-sensitive
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
              Notes (optional)
            </Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Additional notes..."
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
          </ScrollView>

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
                {editingRoutine ? "Save Changes" : "Create Routine"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
