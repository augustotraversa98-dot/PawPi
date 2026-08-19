import React, { useMemo, useState } from "react";
import { View, Text, TextInput } from "react-native";
import { Check, Search } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import {
  COLORS,
  TYPE,
  RADIUS,
  SPACING,
  MATERIALS,
} from "@/constants/theme";
import { PressableScale } from "@/components/ui";
import {
  filterBreeds,
  hasExactBreedMatch,
  normalizeBreed,
} from "@/data/dogBreeds";

// The canonical value we persist for the pinned "Mixed breed" option. The label
// is localized; this stored string stays English so breed comparisons are stable.
const MIXED_VALUE = "Mixed Breed";

// Cap how many breed rows we render inline; beyond this the user narrows with
// the search box (a "keep typing" footer signals the list is truncated).
const MAX_RESULTS = 40;

// A single selectable row — sunken well, coral tint + Check when selected.
function BreedRow({ label, selected, onPress, testID }) {
  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        backgroundColor: selected ? COLORS.coral : MATERIALS.surfaceSunken,
        paddingVertical: 13,
        paddingHorizontal: SPACING.lg,
        borderRadius: RADIUS.control,
        borderWidth: 2,
        borderColor: selected ? COLORS.coral : MATERIALS.hairline,
        marginBottom: SPACING.sm,
      }}
    >
      <Text
        style={[
          TYPE.headline,
          { color: selected ? "#FFF" : COLORS.warmBrown, flexShrink: 1 },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
      {selected ? <Check size={20} color="#FFF" /> : null}
    </PressableScale>
  );
}

/**
 * Searchable breed picker (controlled).
 *
 * Props:
 *   value    — the currently-selected canonical breed string (or "").
 *   onChange — called with the canonical breed string when a row is tapped.
 *   autoFocus, testID — optional passthroughs for the search input.
 *
 * Behaviour: a case/accent-insensitive search filters the canonical list; a
 * pinned "Mixed breed" option sits at the top; when the typed text has no exact
 * match a "Use "{typed}"" row lets a rare breed/cross be saved deliberately.
 * Breed NAMES stay canonical English; only the surrounding UI strings localize.
 */
export default function BreedPicker({
  value = "",
  onChange,
  autoFocus = false,
  testID = "breed-search",
}) {
  const { t } = useTranslation();
  // Seed the search box with the current value so edit screens show it in
  // context; the pinned "Mixed Breed" is represented by its own row, not text.
  const [query, setQuery] = useState(() =>
    value && value !== MIXED_VALUE ? value : "",
  );

  const trimmed = query.trim();
  const matches = useMemo(() => filterBreeds(query, MAX_RESULTS), [query]);
  const totalMatches = useMemo(() => filterBreeds(query).length, [query]);
  const showCustom = trimmed.length > 0 && !hasExactBreedMatch(query);
  const truncated = totalMatches > matches.length;
  const showEmpty = trimmed.length > 0 && totalMatches === 0;

  return (
    // No flex:1 — the picker sizes to its content so it works both as a flex
    // child (onboarding step) and inside a page ScrollView (profile-edit / add
    // dog modal), where flex:1 would collapse to zero height.
    <View>
      {/* Search input */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: MATERIALS.surfaceSunken,
          borderRadius: RADIUS.control,
          borderWidth: 2,
          borderColor: MATERIALS.hairline,
          paddingHorizontal: SPACING.lg,
          marginBottom: SPACING.md,
        }}
      >
        <Search size={20} color={COLORS.mutedBrown} />
        <TextInput
          testID={testID}
          style={[
            TYPE.headline,
            {
              flex: 1,
              paddingVertical: 14,
              paddingLeft: SPACING.sm,
              color: COLORS.warmBrown,
            },
          ]}
          placeholder={t("breedPicker.searchPlaceholder")}
          placeholderTextColor={COLORS.mutedBrown}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="words"
          autoCorrect={false}
          autoFocus={autoFocus}
          returnKeyType="search"
        />
      </View>

      {/* Results — rendered inline (no nested ScrollView) so overflow is handled
          by whichever parent scroll the picker lives in (onboarding step,
          profile-edit form, add-dog modal). A nested same-axis ScrollView
          collapses unpredictably inside those parents. */}
      <View>
        {/* Pinned Mixed breed option */}
        <BreedRow
          testID="breed-option-mixed"
          label={t("breedPicker.mixed")}
          selected={value === MIXED_VALUE}
          onPress={() => onChange?.(MIXED_VALUE)}
        />

        {/* Deliberate type-your-own fallback */}
        {showCustom ? (
          <BreedRow
            testID="breed-option-custom"
            label={t("breedPicker.useCustom", { query: trimmed })}
            selected={
              normalizeBreed(value) === normalizeBreed(trimmed) &&
              value !== MIXED_VALUE
            }
            onPress={() => onChange?.(trimmed)}
          />
        ) : null}

        {/* Empty state (no canonical matches — the Use-row is still offered) */}
        {showEmpty ? (
          <Text
            style={[
              TYPE.subhead,
              {
                color: COLORS.mutedBrown,
                paddingVertical: SPACING.sm,
                paddingHorizontal: SPACING.xs,
              },
            ]}
          >
            {t("breedPicker.empty")}
          </Text>
        ) : null}

        {/* Canonical breed list */}
        {matches.map((breed) => (
          <BreedRow
            key={breed}
            testID={`breed-option-${breed}`}
            label={breed}
            selected={value === breed}
            onPress={() => onChange?.(breed)}
          />
        ))}

        {truncated ? (
          <Text
            style={[
              TYPE.footnote,
              {
                color: COLORS.mutedBrown,
                textAlign: "center",
                paddingVertical: SPACING.sm,
              },
            ]}
          >
            {t("breedPicker.keepTyping")}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
