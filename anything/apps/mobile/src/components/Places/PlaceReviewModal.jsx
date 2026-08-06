import React, { useEffect, useState } from "react";
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
  ScrollView,
} from "react-native";
import { X, Star } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { COLORS } from "@/constants/colors";
import { PET_WELCOME_LEVELS, PLACE_AMENITIES } from "@/constants/placeReviews";
import { useSubmitPlaceReview } from "@/hooks/usePlaceReviews";

// Two-dimension PLACE review composer (drill-in from the place detail). Star picker mirrors the
// provider WriteReviewModal; adds a single-select pet-welcome tier (icon + label) and multi-select
// amenity chips, plus an optional comment. Submit is disabled until a rating (≥1) AND a welcome tier
// are chosen. Posts via useSubmitPlaceReview (upsert), so it both CREATES and EDITS the caller's one
// review. When `existing` is passed the fields prefill and the title switches to "Edit your review".
export default function PlaceReviewModal({
  visible,
  onClose,
  place,
  existing,
  onSubmitted,
}) {
  const { t } = useTranslation();
  const submit = useSubmitPlaceReview(place?.id);

  const [rating, setRating] = useState(0);
  const [welcome, setWelcome] = useState(null);
  const [amenities, setAmenities] = useState([]);
  const [comment, setComment] = useState("");

  // (Re)seed from the caller's existing review each time the sheet opens — a fresh open of an
  // already-reviewed place shows their prior answers to edit; a first review opens blank.
  useEffect(() => {
    if (!visible) return;
    setRating(existing?.overall_rating ?? 0);
    setWelcome(existing?.pet_welcome_level ?? null);
    setAmenities(Array.isArray(existing?.amenities) ? existing.amenities : []);
    setComment(existing?.comment ?? "");
  }, [visible, existing]);

  const toggleAmenity = (key) =>
    setAmenities((prev) =>
      prev.includes(key) ? prev.filter((a) => a !== key) : [...prev, key],
    );

  const submitting = submit.isPending;
  const canSubmit = rating >= 1 && welcome != null && !submitting;

  const handleSubmit = () => {
    if (!canSubmit) return;
    submit.mutate(
      {
        overall_rating: rating,
        pet_welcome_level: welcome,
        amenities,
        comment: comment.trim() || undefined,
        place_name: place?.name,
        place_category: place?.category ?? undefined,
      },
      {
        onSuccess: () => {
          onSubmitted?.();
          onClose();
        },
        onError: (error) =>
          Alert.alert(
            t("placeReviews.submitFailedTitle"),
            error.message || t("placeReviews.submitFailedBody"),
          ),
      },
    );
  };

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
          testID="place-review-modal"
          style={{
            backgroundColor: COLORS.cream,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingHorizontal: 20,
            paddingTop: 20,
            paddingBottom: 36,
            maxHeight: "88%",
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
              {existing ? t("placeReviews.editTitle") : t("placeReviews.modalTitle")}
            </Text>
            <TouchableOpacity
              onPress={onClose}
              disabled={submitting}
              accessibilityLabel={t("common.close")}
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

          <ScrollView showsVerticalScrollIndicator={false}>
            {place?.name ? (
              <Text style={{ fontSize: 14, color: COLORS.mutedBrown, marginBottom: 16 }}>
                {place.name}
              </Text>
            ) : null}

            {/* Overall 1–5 stars */}
            <Text style={styles.label(COLORS)}>{t("placeReviews.overallLabel")}</Text>
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
                  testID={`place-star-${n}`}
                  onPress={() => setRating(n)}
                  disabled={submitting}
                  accessibilityLabel={`${n}`}
                >
                  <Star
                    size={36}
                    color={COLORS.coral}
                    fill={n <= rating ? COLORS.coral : "transparent"}
                  />
                </TouchableOpacity>
              ))}
            </View>

            {/* Pet-welcome tier — single select */}
            <Text style={styles.label(COLORS)}>{t("placeReviews.welcomeLabel")}</Text>
            <View style={{ gap: 8, marginBottom: 20 }}>
              {PET_WELCOME_LEVELS.map((lvl) => {
                const active = welcome === lvl.key;
                return (
                  <TouchableOpacity
                    key={lvl.key}
                    testID={`place-welcome-${lvl.key}`}
                    onPress={() => setWelcome(lvl.key)}
                    disabled={submitting}
                    accessibilityState={{ selected: active }}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                      paddingVertical: 12,
                      paddingHorizontal: 14,
                      borderRadius: 14,
                      backgroundColor: active ? COLORS.coral + "18" : COLORS.card,
                      borderWidth: 1,
                      borderColor: active ? COLORS.coral : COLORS.peach,
                    }}
                  >
                    <Text style={{ fontSize: 18 }}>{lvl.icon}</Text>
                    <Text
                      style={{
                        fontSize: 15,
                        fontWeight: active ? "800" : "600",
                        color: active ? COLORS.warmBrown : COLORS.mutedBrown,
                      }}
                    >
                      {t(`placeReviews.welcome.${lvl.key}`)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Amenities — multi select chips */}
            <Text style={styles.label(COLORS)}>{t("placeReviews.amenitiesLabel")}</Text>
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: 8,
                marginBottom: 20,
              }}
            >
              {PLACE_AMENITIES.map((am) => {
                const active = amenities.includes(am.key);
                return (
                  <TouchableOpacity
                    key={am.key}
                    testID={`place-amenity-${am.key}`}
                    onPress={() => toggleAmenity(am.key)}
                    disabled={submitting}
                    accessibilityState={{ selected: active }}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                      paddingVertical: 8,
                      paddingHorizontal: 12,
                      borderRadius: 999,
                      backgroundColor: active ? COLORS.coral : COLORS.card,
                      borderWidth: 1,
                      borderColor: active ? COLORS.coral : COLORS.peach,
                    }}
                  >
                    <Text style={{ fontSize: 14 }}>{am.icon}</Text>
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: "700",
                        color: active ? "#FFF" : COLORS.warmBrown,
                      }}
                    >
                      {t(`placeReviews.amenity.${am.key}`)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TextInput
              testID="place-review-comment"
              value={comment}
              onChangeText={setComment}
              placeholder={t("placeReviews.commentPlaceholder")}
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
                minHeight: 90,
                textAlignVertical: "top",
                marginBottom: 18,
              }}
            />
          </ScrollView>

          <TouchableOpacity
            testID="place-review-submit"
            onPress={handleSubmit}
            disabled={!canSubmit}
            accessibilityState={{ disabled: !canSubmit }}
            style={{
              backgroundColor: canSubmit ? COLORS.coral : COLORS.mutedBrown,
              opacity: canSubmit ? 1 : 0.6,
              borderRadius: 16,
              paddingVertical: 16,
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "row",
              gap: 8,
              marginTop: 4,
            }}
          >
            {submitting ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={{ color: "#FFF", fontWeight: "800", fontSize: 16 }}>
                {t("placeReviews.submit")}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = {
  label: (COLORS) => ({
    fontSize: 13,
    fontWeight: "800",
    color: COLORS.mutedBrown,
    letterSpacing: 0.4,
    marginBottom: 10,
  }),
};
