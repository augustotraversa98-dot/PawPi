import React, { useState } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import { X, Star } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { COLORS } from "@/constants/colors";
import { useWriteReview } from "@/hooks/useProviders";

// Write a review after a COMPLETED appointment (ticket 2.2). Reused from the vet
// appointment detail surface — the backend gates on the caller having a completed
// booking with this provider and dedups one-per-booking, so the caller only ever
// reaches here from a completed appointment. Real submit only; no fake data.
export default function WriteReviewModal({
  visible,
  onClose,
  providerId,
  providerName,
  petId,
}) {
  const { t } = useTranslation();
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState("");
  const writeReview = useWriteReview();

  const reset = () => {
    setRating(0);
    setBody("");
  };

  const handleSubmit = () => {
    if (rating < 1) {
      Alert.alert(t("writeReview.pickRatingTitle"), t("writeReview.pickRatingBody"));
      return;
    }
    writeReview.mutate(
      {
        providerId,
        rating,
        body: body.trim() || undefined,
        pet_id: petId ?? undefined,
      },
      {
        onSuccess: () => {
          Alert.alert(t("writeReview.postedTitle"), t("writeReview.postedBody"));
          reset();
          onClose();
        },
        onError: (error) => {
          Alert.alert(t("writeReview.errorTitle"), error.message || t("common.retry"));
        },
      },
    );
  };

  const submitting = writeReview.isPending;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={{ flex: 1, justifyContent: "flex-end" }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View
          style={{
            backgroundColor: COLORS.cream,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            padding: 20,
            paddingBottom: 36,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 16,
            }}
          >
            <Text style={{ fontSize: 19, fontWeight: "800", color: COLORS.warmBrown }}>
              {t("writeReview.title")}
            </Text>
            <TouchableOpacity
              onPress={onClose}
              disabled={submitting}
              style={{
                width: 34,
                height: 34,
                borderRadius: 17,
                backgroundColor: COLORS.sand,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <X size={18} color={COLORS.warmBrown} />
            </TouchableOpacity>
          </View>

          {providerName ? (
            <Text
              style={{ fontSize: 14, color: COLORS.mutedBrown, marginBottom: 16 }}
            >
              {t("writeReview.prompt", { provider: providerName })}
            </Text>
          ) : null}

          {/* Star picker */}
          <View
            style={{
              flexDirection: "row",
              justifyContent: "center",
              gap: 10,
              marginBottom: 20,
            }}
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <TouchableOpacity
                key={n}
                onPress={() => setRating(n)}
                disabled={submitting}
                accessibilityLabel={t("writeReview.rateStars", { count: n })}
              >
                <Star
                  size={36}
                  color={COLORS.coral}
                  fill={n <= rating ? COLORS.coral : "transparent"}
                />
              </TouchableOpacity>
            ))}
          </View>

          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder={t("writeReview.bodyPlaceholder")}
            placeholderTextColor={COLORS.mutedBrown}
            multiline
            editable={!submitting}
            style={{
              backgroundColor: COLORS.card,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: COLORS.peach,
              padding: 14,
              fontSize: 14,
              color: COLORS.warmBrown,
              minHeight: 100,
              textAlignVertical: "top",
              marginBottom: 18,
            }}
          />

          <TouchableOpacity
            onPress={handleSubmit}
            disabled={submitting}
            style={{
              backgroundColor: submitting ? COLORS.mutedBrown : COLORS.coral,
              borderRadius: 16,
              paddingVertical: 16,
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "row",
              gap: 8,
            }}
          >
            {submitting ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={{ color: "#FFF", fontWeight: "800", fontSize: 16 }}>
                {t("writeReview.submit")}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
