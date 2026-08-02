import React, { useMemo, useState } from "react";
import { View, Text, TextInput } from "react-native";
import { Search, X } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { COLORS } from "@/constants/colors";
import { TYPE, RADIUS, SPACING, MATERIALS } from "@/constants/theme";
import { PressableScale } from "@/components/ui";

// Shared search + sort for the provider discovery lists (vet, grooming, walking,
// daycare, sitting, training, telehealth). Before this the lists were a flat map
// with no way to find a provider by name or reorder by rating.
//
// Everything is CLIENT-SIDE over the already-fetched providers array, so it is
// purely additive — no backend/query change. Filtering as the user types gives
// instant type-ahead; sorting uses the avg_rating / review_count already in the
// discover projection.

export const PROVIDER_SORTS = [
  { key: "relevance", labelKey: "providers.sortSuggested" },
  { key: "rating", labelKey: "providers.sortTopRated" },
  { key: "reviews", labelKey: "providers.sortMostReviewed" },
];

export function useProviderListFilter(providers) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("relevance");

  const filtered = useMemo(() => {
    const list = Array.isArray(providers) ? providers.slice() : [];
    const q = query.trim().toLowerCase();
    const matched = q
      ? list.filter((p) =>
          [p?.name, p?.bio, p?.provider_type].some(
            (field) =>
              typeof field === "string" && field.toLowerCase().includes(q),
          ),
        )
      : list;

    if (sort === "rating") {
      // Rated providers first, highest average first; unrated fall to the bottom.
      matched.sort((a, b) => (b?.avg_rating ?? -1) - (a?.avg_rating ?? -1));
    } else if (sort === "reviews") {
      matched.sort((a, b) => (b?.review_count ?? 0) - (a?.review_count ?? 0));
    } else if (sort === "nearest") {
      // Services Hub: nearest first using distance_km from the discover projection
      // (present only when the caller passed the device lat/lng). Providers with no
      // distance fall to the bottom. Inert for callers that never select this sort.
      matched.sort(
        (a, b) => (a?.distance_km ?? Infinity) - (b?.distance_km ?? Infinity),
      );
    }
    return matched;
  }, [providers, query, sort]);

  return { query, setQuery, sort, setSort, filtered };
}

export default function ProviderListControls({
  query,
  setQuery,
  sort,
  setSort,
  placeholder,
  sorts = PROVIDER_SORTS,
}) {
  const { t } = useTranslation();
  const searchPlaceholder = placeholder || t("providers.searchPlaceholder");
  return (
    <View style={{ marginBottom: SPACING.md + 2 }}>
      {/* Search box with instant type-ahead + clear button. */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: SPACING.sm,
          backgroundColor: COLORS.card,
          borderRadius: RADIUS.control,
          borderWidth: 1,
          borderColor: COLORS.peach,
          paddingHorizontal: SPACING.md,
          paddingVertical: SPACING.sm + 2,
          marginBottom: SPACING.sm + 2,
        }}
      >
        <Search size={18} color={COLORS.mutedBrown} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={searchPlaceholder}
          placeholderTextColor={COLORS.mutedBrown}
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel={searchPlaceholder}
          style={[TYPE.subhead, { flex: 1, color: COLORS.warmBrown, padding: 0 }]}
        />
        {query.length > 0 ? (
          <PressableScale
            onPress={() => setQuery("")}
            accessibilityLabel={t("providers.clearSearch")}
            hitSlop={8}
          >
            <X size={18} color={COLORS.mutedBrown} />
          </PressableScale>
        ) : null}
      </View>

      {/* Sort chips. */}
      <View style={{ flexDirection: "row", gap: SPACING.sm, flexWrap: "wrap" }}>
        {sorts.map((s) => {
          const selected = sort === s.key;
          return (
            <PressableScale
              key={s.key}
              onPress={() => setSort(s.key)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={{
                paddingHorizontal: SPACING.md,
                paddingVertical: SPACING.xs + 2,
                borderRadius: RADIUS.chip,
                borderWidth: 1,
                borderColor: selected ? COLORS.coral : COLORS.peach,
                backgroundColor: selected ? COLORS.coral + "18" : COLORS.card,
              }}
            >
              <Text
                style={[
                  TYPE.footnote,
                  {
                    fontWeight: "700",
                    color: selected ? COLORS.coral : COLORS.mutedBrown,
                  },
                ]}
              >
                {t(s.labelKey)}
              </Text>
            </PressableScale>
          );
        })}
      </View>
    </View>
  );
}
