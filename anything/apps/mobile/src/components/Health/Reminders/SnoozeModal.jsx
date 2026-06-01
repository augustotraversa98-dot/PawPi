import React from "react";
import { View, Text, TouchableOpacity, Modal } from "react-native";
import { X, Clock } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SNOOZE_OPTIONS } from "@/data/remindersData";

const C = {
  cream: "#FFF7EF",
  card: "#FFFBF7",
  coral: "#FF6F61",
  peach: "#FFE5D9",
  terracotta: "#B75D32",
  warmBrown: "#3B241B",
  mutedBrown: "#8B7355",
  sand: "#F5EDE4",
};

export default function SnoozeModal({ visible, onClose, onSelect, reminder }) {
  const insets = useSafeAreaInsets();

  if (!reminder) return null;

  const handleSelect = (option) => {
    onSelect(option);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0, 0, 0, 0.5)",
          justifyContent: "flex-end",
        }}
      >
        <View
          style={{
            backgroundColor: C.cream,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingTop: 24,
            paddingBottom: insets.bottom + 24,
            paddingHorizontal: 20,
            maxHeight: "80%",
          }}
        >
          {/* Header */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 20,
            }}
          >
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
            >
              <Clock size={24} color={C.coral} />
              <Text
                style={{ fontSize: 20, fontWeight: "800", color: C.warmBrown }}
              >
                Snooze Reminder
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                backgroundColor: C.sand,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <X size={18} color={C.mutedBrown} />
            </TouchableOpacity>
          </View>

          {/* Reminder info */}
          <View
            style={{
              backgroundColor: C.card,
              borderRadius: 12,
              padding: 14,
              marginBottom: 20,
              borderWidth: 1,
              borderColor: C.peach,
            }}
          >
            <Text
              style={{ fontSize: 14, fontWeight: "600", color: C.warmBrown }}
            >
              {reminder.title}
            </Text>
            <Text style={{ fontSize: 12, color: C.mutedBrown, marginTop: 2 }}>
              {reminder.description}
            </Text>
          </View>

          {/* Snooze options */}
          <Text
            style={{
              fontSize: 13,
              fontWeight: "600",
              color: C.mutedBrown,
              marginBottom: 12,
            }}
          >
            Snooze for:
          </Text>

          <View style={{ gap: 10 }}>
            {SNOOZE_OPTIONS.map((option, index) => (
              <TouchableOpacity
                key={index}
                onPress={() => handleSelect(option)}
                style={{
                  backgroundColor: C.card,
                  borderRadius: 14,
                  paddingVertical: 16,
                  paddingHorizontal: 18,
                  borderWidth: 1.5,
                  borderColor: C.peach,
                }}
              >
                <Text
                  style={{
                    fontSize: 15,
                    fontWeight: "600",
                    color: C.warmBrown,
                    textAlign: "center",
                  }}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Cancel */}
          <TouchableOpacity
            onPress={onClose}
            style={{
              marginTop: 16,
              paddingVertical: 12,
            }}
          >
            <Text
              style={{
                fontSize: 14,
                fontWeight: "600",
                color: C.mutedBrown,
                textAlign: "center",
              }}
            >
              Cancel
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
