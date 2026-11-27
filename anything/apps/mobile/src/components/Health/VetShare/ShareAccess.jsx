import React from "react";
import { View, Text } from "react-native";
import { useTranslation } from "react-i18next";
import { addableSections, SHARE_SECTIONS } from "@/utils/vetShare";
import { Bullets } from "./GrantAccess";
import { muted } from "./parts";

/** The parts that can be added to, as bullet lines. Notes also cover editing the ones added that way. */
export const addLines = (t, keys) => keys.map((k) => t(`vetShare.canAdd.${k}`));

/** The same parts named in one line, for a sentence. */
export const addNames = (t, keys) => keys.map((k) => t(`vetShare.section.${k}.title`)).join(", ");

/**
 * What a record link shows and what can be added through it. Shared by the share sheet's list and Data access.
 */
export function LinkAccess({ link, style = muted }) {
  const { t } = useTranslation();
  const sections = SHARE_SECTIONS.filter((k) => link.sections?.includes(k));
  const adds = addableSections(link);
  const onlyNotes = adds.length === 1 && adds[0] === "vet_notes";
  return (
    <View style={{ gap: 2 }}>
      <Text style={style}>{t("recordLink.rowCanSee")}</Text>
      <Bullets lines={sections.map((k) => t(`vetShare.section.${k}.title`))} style={style} />
      {adds.length === 0 || onlyNotes ? (
        <Text style={style}>{t(onlyNotes ? "recordLink.rowNotes" : "recordLink.rowViewOnly")}</Text>
      ) : (
        <>
          <Text style={style}>{t("vetShare.grant.canAdd")}</Text>
          <Bullets lines={addLines(t, adds)} style={style} />
        </>
      )}
    </View>
  );
}
