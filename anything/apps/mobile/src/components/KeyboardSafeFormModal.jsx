import React from "react";
import {
  View,
  Text,
  Modal,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import { X } from "lucide-react-native";
import KeyboardAwareScrollView from "./KeyboardAwareScrollView";
import { PressableScale } from "./ui";
import {
  COLORS,
  MATERIALS,
  RADIUS,
  SPACING,
  TYPE,
  ELEVATION,
} from "@/constants/theme";

// Restyled to the 2.77 design tokens (was a local hex map). Same palette family,
// now centralized + lighter chrome.
const C = {
  cream: MATERIALS.surfaceAlt,
  warmBrown: COLORS.warmBrown,
  mutedBrown: COLORS.mutedBrown,
  peach: MATERIALS.hairline,
  sand: COLORS.sand,
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
              <Text style={[TYPE.title2, { color: C.warmBrown, marginBottom: 4 }]}>
                {icon ? `${icon} ` : ""}
                {title}
              </Text>
              {subtitle && (
                <Text style={[TYPE.callout, { color: C.mutedBrown }]}>
                  {subtitle}
                </Text>
              )}
            </View>
            <PressableScale
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={{
                width: 36,
                height: 36,
                borderRadius: RADIUS.chip,
                backgroundColor: C.sand,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <X size={20} color={C.warmBrown} />
            </PressableScale>
          </View>

          {/* Scrollable Form Content */}
          <KeyboardAwareScrollView
            contentContainerStyle={{ padding: 20, paddingBottom: 120 }}
            showsVerticalScrollIndicator={false}
          >
            {children}
          </KeyboardAwareScrollView>

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
            <PressableScale
              onPress={onCtaPress}
              disabled={ctaDisabled}
              accessibilityRole="button"
              style={{
                backgroundColor: ctaColor,
                borderRadius: RADIUS.control,
                paddingVertical: SPACING.lg,
                alignItems: "center",
                opacity: ctaDisabled ? 0.6 : 1,
                shadowColor: ctaColor,
                ...(ctaDisabled ? ELEVATION.none : ELEVATION.sm),
              }}
            >
              <Text style={[TYPE.headline, { color: "#FFF" }]}>
                {ctaLabel}
              </Text>
            </PressableScale>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
