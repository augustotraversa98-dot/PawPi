import React from "react";
import { View, Text, TouchableOpacity, Modal } from "react-native";
import { AlertTriangle, X } from "lucide-react-native";

const C = {
  cream: "#FFF7EF",
  card: "#FFFBF7",
  coral: "#FF6F61",
  peach: "#FFE5D9",
  warmBrown: "#3B241B",
  mutedBrown: "#8B7355",
  sand: "#F5EDE4",
};

export default function DeleteConfirmationModal({
  visible,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = "Delete",
  isDestructive = true,
}) {
  const handleConfirm = () => {
    console.log("[DeleteConfirmModal] Confirm button pressed", {
      title,
      confirmText,
    });
    onConfirm();
  };

  const handleCancel = () => {
    console.log("[DeleteConfirmModal] Cancel button pressed", { title });
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0, 0, 0, 0.5)",
          justifyContent: "center",
          alignItems: "center",
          padding: 20,
        }}
      >
        <View
          style={{
            backgroundColor: C.cream,
            borderRadius: 20,
            padding: 24,
            width: "100%",
            maxWidth: 360,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.3,
            shadowRadius: 16,
            elevation: 10,
          }}
        >
          {/* Icon */}
          <View
            style={{
              width: 60,
              height: 60,
              borderRadius: 30,
              backgroundColor: isDestructive ? "#FFE4E1" : C.sand,
              justifyContent: "center",
              alignItems: "center",
              marginBottom: 20,
              alignSelf: "center",
            }}
          >
            <AlertTriangle
              size={32}
              color={isDestructive ? C.coral : C.mutedBrown}
            />
          </View>

          {/* Title */}
          <Text
            style={{
              fontSize: 20,
              fontWeight: "800",
              color: C.warmBrown,
              textAlign: "center",
              marginBottom: 12,
            }}
          >
            {title}
          </Text>

          {/* Message */}
          <Text
            style={{
              fontSize: 14,
              color: C.mutedBrown,
              textAlign: "center",
              lineHeight: 21,
              marginBottom: 28,
            }}
          >
            {message}
          </Text>

          {/* Buttons */}
          <View style={{ gap: 12 }}>
            <TouchableOpacity
              onPress={handleConfirm}
              style={{
                backgroundColor: C.coral,
                borderRadius: 14,
                paddingVertical: 16,
                alignItems: "center",
              }}
            >
              <Text style={{ fontSize: 16, fontWeight: "800", color: "#FFF" }}>
                {confirmText}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleCancel}
              style={{
                backgroundColor: C.sand,
                borderRadius: 14,
                paddingVertical: 16,
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
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
