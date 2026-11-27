import React, { useState } from "react";
import { View, Text, TextInput, ActivityIndicator } from "react-native";
import { useTranslation } from "react-i18next";
import { COLORS, MATERIALS, RADIUS, SPACING, TYPE } from "@/constants/theme";
import { useVetSearch } from "@/hooks/useShareOffers";
import SecondaryButton from "./SecondaryButton";
import { Choice, Heading, card, muted, text } from "./parts";

const input = [
  TYPE.callout,
  {
    color: COLORS.warmBrown,
    backgroundColor: MATERIALS.surface,
    borderRadius: RADIUS.control,
    borderWidth: 1,
    borderColor: MATERIALS.hairline,
    paddingHorizontal: SPACING.lg,
    paddingVertical: 12,
    marginBottom: SPACING.sm,
  },
];

/**
 * The search step of the share sheet: the owner types a vet's or clinic's name or username and picks one of the
 * matching businesses on PawPi. Shown only when the server can send invitations. The picked business stays listed
 * while the search changes.
 *
 * Props: picked ({ id, name, ... } or null: the last one picked here), selectedId (the business the sheet is about, which
 * may be one from the list above), onPick(vet), excludeIds (businesses already offered in that list), describe(vet) (a
 * status line for a result), canLink (a link can be created instead, so an empty result may suggest it).
 */
export default function VetSearch({ picked, selectedId, onPick, excludeIds = [], describe, canLink }) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const { data, isError, refetch, term, waiting, isFetching } = useVetSearch(search);

  // Until the server says it can, the step is not offered.
  if (data ? !data.available : !isError && !term) return null;

  const hidden = new Set(excludeIds.map(String));
  const found = (data?.vets ?? []).filter((v) => !hidden.has(String(v.id)));
  const shown =
    picked && !found.some((v) => String(v.id) === String(picked.id)) ? [picked, ...found] : found;
  const place = (vet) =>
    [vet.location_name, vet.address].filter(Boolean).join(" · ") || (vet.handle ? `@${vet.handle}` : "");

  return (
    <View testID="vet-search">
      <Heading>{t("shareOffer.searchTitle")}</Heading>
      <Text style={[muted, { marginBottom: SPACING.sm }]}>{t("shareOffer.searchHint")}</Text>
      <TextInput
        testID="vet-search-input"
        value={search}
        onChangeText={setSearch}
        placeholder={t("shareOffer.searchPlaceholder")}
        placeholderTextColor={COLORS.mutedBrown}
        accessibilityLabel={t("shareOffer.searchPlaceholder")}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        maxLength={60}
        style={input}
      />
      {isError ? (
        <View style={card}>
          <Text style={text}>{t("shareOffer.searchError")}</Text>
          <SecondaryButton label={t("vetShare.retry")} onPress={() => refetch()} />
        </View>
      ) : null}
      {search.trim().length >= 2 && (waiting || isFetching) ? (
        <ActivityIndicator color={COLORS.coral} />
      ) : null}
      {shown.map((vet) => (
        <Choice
          key={vet.id}
          testID={`vet-search-result-${vet.id}`}
          role="radio"
          selected={String(selectedId) === String(vet.id)}
          onPress={() => onPick(vet)}
          title={vet.name}
          description={[place(vet), describe?.(vet)].filter(Boolean).join(" · ") || null}
        />
      ))}
      {term && !waiting && !isFetching && !isError && found.length === 0 ? (
        <Text testID="vet-search-empty" style={muted}>
          {t(canLink ? "shareOffer.searchEmpty" : "shareOffer.searchEmptyNoLink")}
        </Text>
      ) : null}
    </View>
  );
}
