import React, { useRef } from "react";
import { View, Text, Alert, ActivityIndicator, TouchableOpacity } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react-native";
import { COLORS, MATERIALS, RADIUS, SPACING, TYPE } from "@/constants/theme";
import { RefreshableScrollView } from "@/components/RefreshableScrollView";
import useBottomClearance from "@/hooks/useBottomClearance";
import { useActiveProvider } from "@/hooks/useActiveProvider";
import { useAnswerShareOffer, useProviderShareOffers } from "@/hooks/useShareOffers";
import { friendlyErrorMessage } from "@/utils/appAlert";
import { formatLocalDate } from "@/utils/localeDateTime";
import { goBackOr } from "@/utils/navigationBack";
import { SHARE_SECTIONS } from "@/utils/vetShare";

const muted = [TYPE.footnote, { color: COLORS.mutedBrown, lineHeight: 18 }];
const text = [TYPE.callout, { color: COLORS.warmBrown, lineHeight: 20 }];
const bold = [TYPE.callout, { color: COLORS.warmBrown, fontWeight: "800" }];
const card = {
  backgroundColor: MATERIALS.surface,
  borderRadius: RADIUS.control,
  borderWidth: 1,
  borderColor: MATERIALS.hairline,
  padding: SPACING.lg,
  marginBottom: SPACING.md,
};
const button = {
  flex: 1,
  borderRadius: RADIUS.control,
  paddingVertical: 12,
  alignItems: "center",
};

function Action({ testID, label, primary, onPress, disabled }) {
  return (
    <TouchableOpacity
      testID={testID}
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={[
        button,
        primary
          ? { backgroundColor: COLORS.coral }
          : { borderWidth: 1.5, borderColor: MATERIALS.hairline },
        disabled && { opacity: 0.6 },
      ]}
    >
      <Text style={[TYPE.callout, { fontWeight: "800", color: primary ? "#FFF" : COLORS.warmBrown }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function OfferCard({ offer, onAnswer, disabled }) {
  const { t } = useTranslation();
  const sections = SHARE_SECTIONS.filter((k) => offer.sections?.includes(k));
  const length = t(`vetShare.expiry.${offer.expiry}`);
  return (
    <View testID={`business-share-offer-${offer.id}`} style={card}>
      <Text style={[TYPE.headline, { color: COLORS.warmBrown }]}>{offer.pet_name}</Text>
      <Text style={muted}>
        {offer.owner_name
          ? t("businessShare.from", { owner: offer.owner_name })
          : t("businessShare.fromSomeone")}
      </Text>
      <Text style={[bold, { marginTop: SPACING.sm }]}>{t("businessShare.parts")}</Text>
      {sections.map((key) => (
        <Text key={key} style={text}>{`• ${t(`vetShare.section.${key}.title`)}`}</Text>
      ))}
      <Text style={[text, { marginTop: SPACING.sm }]}>
        {offer.expiry === "until_revoked"
          ? t("businessShare.untilRevoked")
          : t("businessShare.length", { length })}
      </Text>
      <Text style={muted}>
        {t("businessShare.answerBy", { date: formatLocalDate(offer.lapses_at) })}
      </Text>
      <View style={{ flexDirection: "row", gap: SPACING.md, marginTop: SPACING.md }}>
        <Action
          testID={`business-share-accept-${offer.id}`}
          label={t("businessShare.accept")}
          primary
          onPress={() => onAnswer(offer, "accept")}
          disabled={disabled}
        />
        <Action
          testID={`business-share-decline-${offer.id}`}
          label={t("businessShare.decline")}
          onPress={() => onAnswer(offer, "decline")}
          disabled={disabled}
        />
      </View>
    </View>
  );
}

function errorKey(error) {
  if (error?.code === "offer_not_open" || error?.status === 404) return "notOpen";
  if (error?.code === "not_eligible") return "notEligible";
  return null;
}

// Owners' invitations to the active business to see a vet record: accept or decline. The record itself opens in the
// web provider area; this app has no provider record screen.
export default function BusinessShareOffersScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const bottomClearance = useBottomClearance();
  const router = useRouter();
  const { activeProvider } = useActiveProvider();
  const providerId = activeProvider?.id ?? null;
  const query = useProviderShareOffers(providerId);
  // State changes too late to stop a second tap in the same frame.
  const answering = useRef(false);

  const answer = useAnswerShareOffer(providerId, {
    onSuccess: (result) =>
      result?.status === "accepted"
        ? Alert.alert(
            t("businessShare.acceptedTitle"),
            t("businessShare.acceptedBody", { pet: result.pet_name }),
          )
        : Alert.alert(t("businessShare.declinedTitle"), t("businessShare.declinedBody")),
    onError: (error) => {
      const key = errorKey(error);
      Alert.alert(
        t("businessShare.errorTitle"),
        key ? t(`businessShare.${key}`) : friendlyErrorMessage(error, "businessShare.failed"),
      );
    },
    onSettled: () => {
      answering.current = false;
    },
  });

  const respond = (offer, action) => {
    if (answering.current) return;
    answering.current = true;
    answer.mutate({ offerId: offer.id, action });
  };

  const offers = query.data?.offers ?? [];

  let content;
  if (query.isError) {
    content = (
      <View style={card}>
        <Text style={text}>{t("businessShare.loadError")}</Text>
        <View style={{ flexDirection: "row", marginTop: SPACING.md }}>
          <Action label={t("vetShare.retry")} onPress={() => query.refetch()} />
        </View>
      </View>
    );
  } else if (!query.data) {
    content = <ActivityIndicator color={COLORS.coral} />;
  } else if (!query.data.available) {
    content = <Text style={text}>{t("businessShare.unavailable")}</Text>;
  } else if (offers.length === 0) {
    content = <Text testID="business-share-empty" style={text}>{t("businessShare.empty")}</Text>;
  } else {
    content = offers.map((offer) => (
      <OfferCard key={offer.id} offer={offer} onAnswer={respond} disabled={answer.isPending} />
    ));
  }

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.cream }}>
      <View
        style={{
          paddingTop: insets.top + SPACING.sm,
          paddingHorizontal: SPACING.xl,
          paddingBottom: SPACING.md,
          flexDirection: "row",
          alignItems: "center",
          gap: SPACING.md,
        }}
      >
        <TouchableOpacity
          testID="business-share-back"
          accessibilityRole="button"
          accessibilityLabel={t("common.back")}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          onPress={() => goBackOr(router, "/business")}
        >
          <ArrowLeft size={22} color={COLORS.warmBrown} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[TYPE.title2, { color: COLORS.warmBrown }]}>
            {t("businessShare.title")}
          </Text>
          {activeProvider?.name ? <Text style={muted}>{activeProvider.name}</Text> : null}
        </View>
      </View>
      <RefreshableScrollView
        refetch={query.refetch}
        contentContainerStyle={{ padding: SPACING.xl, paddingBottom: bottomClearance + SPACING.xl }}
      >
        <Text style={[muted, { marginBottom: SPACING.md }]}>{t("businessShare.intro")}</Text>
        {content}
      </RefreshableScrollView>
    </View>
  );
}
