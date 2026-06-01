import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { X } from "lucide-react-native";

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

export default function MedicalCareIssueModal({
  visible,
  reminder,
  onClose,
  onSubmit,
}) {
  const [givenAnswer, setGivenAnswer] = useState("yes");
  const [reactionAnswer, setReactionAnswer] = useState("no");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (visible) {
      setGivenAnswer("yes");
      setReactionAnswer("no");
      setNotes("");
    }
  }, [visible]);

  if (!reminder) return null;

  const handleSubmit = () => {
    onSubmit({
      reactionOrIssue: {
        given: givenAnswer,
        reaction: reactionAnswer,
      },
      notes,
    });
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.5)",
            justifyContent: "flex-end",
          }}
        >
          <View
            style={{
              backgroundColor: C.cream,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              maxHeight: "90%",
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                padding: 20,
                borderBottomWidth: 1,
                borderBottomColor: C.peach,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 18,
                    fontWeight: "800",
                    color: C.warmBrown,
                    marginBottom: 4,
                  }}
                >
                  Something was off?
                </Text>
                <Text style={{ fontSize: 13, color: C.mutedBrown }}>
                  {reminder.title}
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
              contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
              keyboardShouldPersistTaps="handled"
            >
              <View
                style={{
                  backgroundColor: "#FEF3C7",
                  borderRadius: 12,
                  padding: 14,
                  marginBottom: 20,
                  borderWidth: 1,
                  borderColor: "#FDE68A",
                }}
              >
                <Text
                  style={{ fontSize: 13, color: "#92400E", lineHeight: 19 }}
                >
                  ⚠️ Contact your veterinarian if you notice concerning reactions
                  or symptoms.
                </Text>
              </View>

              <Label>Was it given?</Label>
              <ChoiceGroup
                options={[
                  { value: "yes", label: "Yes" },
                  { value: "partially", label: "Partially" },
                  { value: "no", label: "No" },
                ]}
                value={givenAnswer}
                onChange={setGivenAnswer}
              />

              <Label>Any reaction?</Label>
              <ChoiceGroup
                options={[
                  { value: "no", label: "No" },
                  { value: "yes", label: "Yes" },
                ]}
                value={reactionAnswer}
                onChange={setReactionAnswer}
              />

              <Label>Notes</Label>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder="What happened? (optional)"
                placeholderTextColor={C.mutedBrown}
                multiline
                style={{
                  backgroundColor: C.card,
                  borderRadius: 12,
                  padding: 12,
                  fontSize: 14,
                  color: C.warmBrown,
                  borderWidth: 1,
                  borderColor: C.peach,
                  minHeight: 80,
                  textAlignVertical: "top",
                  marginBottom: 24,
                }}
              />

              <TouchableOpacity
                onPress={handleSubmit}
                style={{
                  backgroundColor: C.terracotta,
                  borderRadius: 14,
                  paddingVertical: 16,
                  alignItems: "center",
                }}
              >
                <Text
                  style={{ fontSize: 16, fontWeight: "700", color: "#FFF" }}
                >
                  Save issue
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Label({ children }) {
  return (
    <Text
      style={{
        fontSize: 15,
        fontWeight: "700",
        color: C.warmBrown,
        marginBottom: 12,
      }}
    >
      {children}
    </Text>
  );
}

function ChoiceGroup({ options, value, onChange }) {
  return (
    <View style={{ flexDirection: "row", gap: 8, marginBottom: 20 }}>
      {options.map((opt) => {
        const selected = value === opt.value;
        return (
          <TouchableOpacity
            key={opt.value}
            onPress={() => onChange(opt.value)}
            style={{
              flex: 1,
              backgroundColor: selected ? C.terracotta : C.card,
              borderRadius: 12,
              paddingVertical: 12,
              alignItems: "center",
              borderWidth: 1.5,
              borderColor: selected ? C.terracotta : C.peach,
            }}
          >
            <Text
              style={{
                fontSize: 14,
                fontWeight: "700",
                color: selected ? "#FFF" : C.warmBrown,
              }}
            >
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
