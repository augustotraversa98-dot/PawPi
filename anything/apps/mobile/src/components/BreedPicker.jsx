import React, { useMemo, useState } from "react";
import { View, Text, TextInput, FlatList } from "react-native";
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
  COMMON_BREEDS,
  DOG_BREEDS,
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
 *   scrollable — fill the parent (flex:1) and scroll the results in their own
 *     FlatList under a fixed search box. Used by the onboarding step so the
 *     matches keep a usable height above the keyboard. Default false: inline
 *     content that a parent ScrollView scrolls (profile-edit / add-dog modal).
 *
 * Behaviour: a case/accent-insensitive search filters the canonical list; a
 * default view is "Mixed breed" + a short list of common breeds; typing ranks real
 * matches first (prefix > word > substring), then a "Use "{typed}"" row lets a
 * rare breed/cross be saved deliberately.
 * Breed NAMES stay canonical English; only the surrounding UI strings localize.
 */
export default function BreedPicker({
  value = "",
  onChange,
  autoFocus = false,
  testID = "breed-search",
  scrollable = false,
}) {
  const { t } = useTranslation();
  // Seed the search box with the current value so edit screens show it in
  // context; the pinned "Mixed Breed" is represented by its own row, not text.
  const [query, setQuery] = useState(() =>
    value && value !== MIXED_VALUE ? value : "",
  );

  const trimmed = query.trim();
  const searching = trimmed.length > 0;
  const matches = useMemo(() => filterBreeds(query, MAX_RESULTS), [query]);
  const totalMatches = useMemo(() => filterBreeds(query).length, [query]);
  const showCustom = searching && !hasExactBreedMatch(query);
  const truncated = searching && totalMatches > matches.length;
  const showEmpty = searching && totalMatches === 0;
  // Default (not searching): a tidy short list; the full catalog appears as the
  // user types. While searching, real matches come first.
  const data = searching ? matches : COMMON_BREEDS;

  // "Mixed breed" leads the default view, but while searching it only shows
  // (below the real matches) when the typed text actually points at it.
  const mixedLabel = t("breedPicker.mixed");
  const showMixedBelow =
    searching && normalizeBreed(mixedLabel).includes(normalizeBreed(trimmed));

  const mixedRow = (
    <BreedRow
      testID="breed-option-mixed"
      label={mixedLabel}
      selected={value === MIXED_VALUE}
      onPress={() => onChange?.(MIXED_VALUE)}
    />
  );

  const renderMatch = ({ item: breed }) => (
    <BreedRow
      testID={`breed-option-${breed}`}
      label={breed}
      selected={value === breed}
      onPress={() => onChange?.(breed)}
    />
  );

  const header = searching ? null : (
    <View>
      {mixedRow}
      <Text
        style={[
          TYPE.footnote,
          {
            color: COLORS.mutedBrown,
            fontWeight: "700",
            textTransform: "uppercase",
            letterSpacing: 0.5,
            marginTop: SPACING.xs,
            marginBottom: SPACING.sm,
          },
        ]}
      >
        {t("breedPicker.commonHeading")}
      </Text>
    </View>
  );

  const trailing = (
    <View>
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
      {showMixedBelow ? mixedRow : null}
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
      {!searching ? (
        <Text
          testID="breed-search-hint"
          style={[
            TYPE.footnote,
            {
              color: COLORS.mutedBrown,
              textAlign: "center",
              paddingVertical: SPACING.sm,
            },
          ]}
        >
          {t("breedPicker.searchHint", { count: DOG_BREEDS.length })}
        </Text>
      ) : null}
    </View>
  );

  const keepTyping = truncated ? (
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
  ) : null;

  const searchBox = (
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
            paddingVertical: 12,
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
  );

  if (scrollable) {
    return (
      <View style={{ flex: 1, minHeight: 160 }}>
        {searchBox}
        <FlatList
          testID="breed-results"
          style={{ flex: 1 }}
          data={data}
          keyExtractor={(breed) => breed}
          renderItem={renderMatch}
          ListHeaderComponent={header}
          ListFooterComponent={
            <View>
              {keepTyping}
              {trailing}
            </View>
          }
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        />
      </View>
    );
  }

  return (
    // No flex:1 — the picker sizes to its content so it works both as a flex
    // child and inside a page ScrollView (profile-edit / add dog modal), where
    // flex:1 would collapse to zero height. Results render inline (no nested
    // same-axis ScrollView, which collapses unpredictably in those parents).
    <View>
      {searchBox}
      {header}
      {data.map((breed) => (
        <React.Fragment key={breed}>{renderMatch({ item: breed })}</React.Fragment>
      ))}
      {keepTyping}
      {trailing}
    </View>
  );
}
