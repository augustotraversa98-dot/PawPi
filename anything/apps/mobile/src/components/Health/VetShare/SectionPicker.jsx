import React, { useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useTranslation } from "react-i18next";
import { Check, Plus, Square, SquareCheck } from "lucide-react-native";
import { COLORS, MATERIALS, RADIUS, SPACING, TYPE } from "@/constants/theme";
import { EDITABLE_SECTIONS, SHARE_SECTIONS } from "@/utils/vetShare";
import { Heading, muted, picked } from "./parts";

const box = {
  flexDirection: "row",
  alignItems: "center",
  gap: SPACING.sm,
  minHeight: 44,
  paddingHorizontal: SPACING.md,
  paddingVertical: 8,
  backgroundColor: MATERIALS.surface,
  borderRadius: RADIUS.control,
  borderWidth: 1,
  borderColor: MATERIALS.hairline,
};
const title = [TYPE.footnote, { color: COLORS.warmBrown, fontWeight: "700", lineHeight: 17 }];

/**
 * The choice after a tick or a tap: adding implies seeing, except for the parts in `addWithoutSeeing` (a link can
 * take notes without showing them); a part no longer seen can no longer be added to, with the same exception.
 */
export function toggleShared({ sections, editSections }, key, what, addWithoutSeeing = []) {
  const alone = addWithoutSeeing.includes(key);
  const seen = new Set(sections);
  const added = new Set(editSections);
  if (what === "see") {
    if (seen.has(key)) {
      seen.delete(key);
      if (!alone) added.delete(key);
    } else seen.add(key);
  } else if (added.has(key)) added.delete(key);
  else {
    added.add(key);
    if (!alone) seen.add(key);
  }
  return {
    sections: SHARE_SECTIONS.filter((k) => seen.has(k)),
    editSections: EDITABLE_SECTIONS.filter((k) => added.has(k)),
  };
}

function See({ testID, selected, onPress, label, description, style }) {
  const Icon = selected ? SquareCheck : Square;
  return (
    <TouchableOpacity
      testID={testID}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={[box, style, selected && picked]}
    >
      <Icon size={20} color={selected ? COLORS.coral : COLORS.mutedBrown} />
      <View style={{ flex: 1 }}>
        <Text style={title}>{label}</Text>
        {description ? <Text style={muted}>{description}</Text> : null}
      </View>
    </TouchableOpacity>
  );
}

function CanAddToggle({ testID, selected, onPress, label, accessibilityLabel }) {
  const Icon = selected ? Check : Plus;
  return (
    <TouchableOpacity
      testID={testID}
      accessibilityRole="checkbox"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
        minHeight: 44,
        paddingHorizontal: 10,
        borderRadius: RADIUS.control,
        borderWidth: 1.5,
        borderColor: selected ? COLORS.coral : MATERIALS.hairline,
        backgroundColor: selected ? COLORS.coral : MATERIALS.surface,
      }}
    >
      <Icon size={14} color={selected ? COLORS.card : COLORS.mutedBrown} />
      <Text style={[title, { color: selected ? COLORS.card : COLORS.mutedBrown }]}>{label}</Text>
    </TouchableOpacity>
  );
}

/**
 * "What to share", compact enough to sit on one screen with the length below it: one tick per part, two to a row, and
 * what each part includes on demand. With `canAdd`, the parts that can be added to come first, each with its own
 * "Can add", off until the owner turns it on.
 *
 * Props: sections, editSections, onChange({ sections, editSections }), canAdd, addWithoutSeeing, testPrefix,
 * describe(key) → what the part includes, footer (shown with the descriptions).
 */
export default function SectionPicker({
  sections,
  editSections = [],
  onChange,
  canAdd = false,
  addWithoutSeeing,
  testPrefix,
  describe,
  footer,
}) {
  const { t } = useTranslation();
  const [details, setDetails] = useState(false);
  const toggle = (key, what) =>
    onChange(toggleShared({ sections, editSections }, key, what, addWithoutSeeing));
  const withAdd = canAdd ? EDITABLE_SECTIONS : [];
  const others = SHARE_SECTIONS.filter((k) => !withAdd.includes(k));

  const see = (key, style) => (
    <See
      key={key}
      testID={`${testPrefix}-section-${key}`}
      selected={sections.includes(key)}
      onPress={() => toggle(key, "see")}
      label={t(`vetShare.section.${key}.title`)}
      description={details ? describe(key) : null}
      style={style}
    />
  );

  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: SPACING.sm }}>
        <View style={{ flexShrink: 1 }}>
          <Heading>{t("vetShare.sectionsTitle")}</Heading>
        </View>
        <TouchableOpacity
          testID={`${testPrefix}-details`}
          accessibilityRole="button"
          accessibilityState={{ expanded: details }}
          onPress={() => setDetails((v) => !v)}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={{ marginTop: SPACING.sm }}
        >
          <Text style={[title, { color: COLORS.terracotta }]}>
            {t(details ? "vetShare.hideDetails" : "vetShare.showDetails")}
          </Text>
        </TouchableOpacity>
      </View>
      <Text style={[muted, { marginBottom: SPACING.sm }]}>
        {t(canAdd ? "vetShare.sectionsHintAdd" : "vetShare.sectionsHint")}
      </Text>

      <View style={{ gap: 6 }}>
        {withAdd.map((key) => (
          <View key={key} style={{ flexDirection: "row", alignItems: "stretch", gap: 6 }}>
            {see(key, { flex: 1 })}
            <CanAddToggle
              testID={`${testPrefix}-add-${key}`}
              selected={editSections.includes(key)}
              onPress={() => toggle(key, "add")}
              label={t("vetShare.canAddToggle")}
              accessibilityLabel={`${t("vetShare.canAddToggle")}: ${t(`vetShare.section.${key}.title`)}`}
            />
          </View>
        ))}
        {/* Descriptions need the whole width. */}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {others.map((key) => see(key, details ? { width: "100%" } : { flexBasis: "48%", flexGrow: 1 }))}
        </View>
      </View>
      {details && footer ? <View style={{ marginTop: SPACING.sm, gap: 4 }}>{footer}</View> : null}
    </View>
  );
}

/** "For how long": one chip per length. `options` is [{ key, label }]. */
export function ExpiryChips({ options, value, onChange, testPrefix }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
      {options.map(({ key, label }) => {
        const selected = value === key;
        return (
          <TouchableOpacity
            key={key}
            testID={`${testPrefix}-${key}`}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => onChange(key)}
            style={[box, { borderRadius: RADIUS.chip }, selected && picked]}
          >
            <Text style={title}>{label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
