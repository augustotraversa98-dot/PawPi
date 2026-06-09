import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Modal,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import { X } from "lucide-react-native";

const C = {
  cream: "#FAF7F0",
  warmBrown: "#4A3829",
  mutedBrown: "#8B7355",
  peach: "#FFE4D6",
  sand: "#F5EFE7",
};

/**
 * KeyboardSafeFormModal
 *
 * A reusable modal wrapper that handles:
 * - Keyboard avoidance (iOS/Android)
 * - Scrollable form content
 * - Fixed bottom CTA button
 * - Header with title/subtitle/close button
 * - Proper padding to prevent keyboard overlap
 *
 * Usage:
 * <KeyboardSafeFormModal
 *   visible={visible}
 *   onClose={onClose}
 *   title="Create Routine"
 *   subtitle="Set up your dog's schedule"
 *   icon="🐕"
 *   ctaLabel="Save Routine"
 *   ctaColor="#6B8E6F"
 *   onCtaPress={handleSave}
 *   ctaDisabled={false}
 * >
 *   <YourFormFields />
 * </KeyboardSafeFormModal>
 */
export default function KeyboardSafeFormModal({
  visible,
  onClose,
  title,
  subtitle,
  icon,
  ctaLabel = "Save",
  ctaColor = "#6B8E6F",
  onCtaPress,
  ctaDisabled = false,
  children,
  backgroundColor = C.cream,
  headerPaddingTop = 60,
}) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        <View style={{ flex: 1, backgroundColor }}>
          {/* Header */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              padding: 20,
              paddingTop: headerPaddingTop,
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
                {icon ? `${icon} ` : ""}
                {title}
              </Text>
              {subtitle && (
                <Text style={{ fontSize: 14, color: C.mutedBrown }}>
                  {subtitle}
                </Text>
              )}
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

          {/* Scrollable Form Content */}
          <ScrollView
            contentContainerStyle={{ padding: 20, paddingBottom: 120 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>

          {/* Fixed Bottom CTA Button */}
          <View
            style={{
              padding: 20,
              paddingBottom: 30,
              borderTopWidth: 1,
              borderTopColor: C.peach,
              backgroundColor,
            }}
          >
            <TouchableOpacity
              onPress={onCtaPress}
              disabled={ctaDisabled}
              style={{
                backgroundColor: ctaColor,
                borderRadius: 14,
                paddingVertical: 16,
                alignItems: "center",
                opacity: ctaDisabled ? 0.6 : 1,
              }}
            >
              <Text style={{ fontSize: 16, fontWeight: "700", color: "#FFF" }}>
                {ctaLabel}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
