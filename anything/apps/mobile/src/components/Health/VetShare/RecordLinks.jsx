import React from "react";
import { View, Text, Alert, ActivityIndicator } from "react-native";
import { useTranslation } from "react-i18next";
import { COLORS } from "@/constants/theme";
import { useRecordLinks, useRevokeRecordLink } from "@/hooks/useRecordLinks";
import { formatLocalDate } from "@/utils/localeDateTime";
import { activeRecordLinks, SHARE_SECTIONS } from "@/utils/vetShare";
import { Bullets } from "./GrantAccess";
import SecondaryButton from "./SecondaryButton";
import { Heading, bold, card, muted, text } from "./parts";

function LinkRow({ link, onRemove, disabled }) {
  const { t } = useTranslation();
  const pet = link.pet_name || t("dataAccess.yourPet");
  const sections = SHARE_SECTIONS.filter((k) => link.sections?.includes(k));
  return (
    <View testID={`record-link-row-${link.id}`} style={card}>
      <Text style={bold}>
        {t("recordLink.rowTitle", { pet, date: formatLocalDate(link.created_at) })}
      </Text>
      <Text style={muted}>{t("recordLink.rowCanSee")}</Text>
      <Bullets lines={sections.map((k) => t(`vetShare.section.${k}.title`))} style={muted} />
      <Text style={muted}>
        {t(link.allow_notes ? "recordLink.rowNotes" : "recordLink.rowViewOnly")}
      </Text>
      <Text style={[muted, { fontWeight: "700" }]}>
        {t("vetShare.grant.until", { date: formatLocalDate(link.expires_at) })}
      </Text>
      <SecondaryButton
        testID={`record-link-remove-${link.id}`}
        label={t("recordLink.remove")}
        onPress={() => onRemove(link)}
        disabled={disabled}
      />
    </View>
  );
}

/**
 * Record links in the share sheet: offers creating one for this pet, and lists every dog's links (the limit is per
 * owner) with what each one shows, until when, and Remove. Only mount it for an owner.
 *
 * Props: pet ({ id, name }); onCreate.
 */
export default function RecordLinks({ pet, onCreate }) {
  const { t } = useTranslation();
  const petName = pet?.name || t("dataAccess.yourPet");
  const query = useRecordLinks();
  const remove = useRevokeRecordLink({
    onError: () =>
      Alert.alert(t("recordLink.error.removeTitle"), t("recordLink.error.remove")),
  });

  const confirmRemove = (link) =>
    Alert.alert(
      t("recordLink.removeTitle"),
      t("recordLink.removeBody", { pet: link.pet_name || t("dataAccess.yourPet") }),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("recordLink.remove"),
          style: "destructive",
          onPress: () => remove.mutate(link.id),
        },
      ],
    );

  const rows = activeRecordLinks(query.data?.links).map((link) => (
    <LinkRow key={link.id} link={link} onRemove={confirmRemove} disabled={remove.isPending} />
  ));

  const renderBody = () => {
    if (query.isError) {
      return (
        <View style={card}>
          <Text style={text}>{t("recordLink.loadError")}</Text>
          <SecondaryButton label={t("vetShare.retry")} onPress={() => query.refetch()} />
        </View>
      );
    }
    if (!query.data) return <ActivityIndicator color={COLORS.coral} />;
    if (!query.data.available) {
      return (
        <View testID="record-links-unavailable" style={card}>
          <Text style={text}>{t("recordLink.unavailable")}</Text>
        </View>
      );
    }
    return (
      <>
        <View style={card}>
          <Text style={text}>{t("recordLink.intro", { pet: petName })}</Text>
          <SecondaryButton
            testID="record-link-start"
            label={t("recordLink.start")}
            onPress={onCreate}
          />
        </View>
        {rows.length > 0 ? (
          <>
            <Text style={[bold, { marginVertical: 8 }]}>{t("recordLink.listTitle")}</Text>
            {rows}
          </>
        ) : null}
      </>
    );
  };

  return (
    <View testID="record-links">
      <Heading>{t("recordLink.title")}</Heading>
      {renderBody()}
    </View>
  );
}
