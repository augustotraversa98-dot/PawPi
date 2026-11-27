import React from "react";
import { View, Text } from "react-native";
import { useTranslation } from "react-i18next";
import { COLORS, TYPE } from "@/constants/theme";
import { formatLocalDate } from "@/utils/localeDateTime";
import {
  RECORD_READ_SCOPE,
  addableSections,
  grantAccessLines,
  isGrantEnded,
} from "@/utils/vetShare";

const strong = [TYPE.footnote, { color: COLORS.warmBrown, fontWeight: "700", lineHeight: 18 }];
const body = [TYPE.footnote, { color: COLORS.warmBrown, lineHeight: 18 }];
const muted = [TYPE.footnote, { color: COLORS.mutedBrown, lineHeight: 18 }];

export function Bullets({ lines, style = body }) {
  return lines.map((line) => (
    <View key={line} style={{ flexDirection: "row", gap: 6 }}>
      <Text style={style}>•</Text>
      <Text style={[style, { flex: 1 }]}>{line}</Text>
    </View>
  ));
}

function headingKey(grant, adds) {
  if (grant.status === "pending") return "vetShare.grant.asked";
  if (grant.sections?.length) {
    // "Read only" is said only of a share nothing can be added through.
    if (adds) return isGrantEnded(grant) ? "vetShare.grant.couldSeeParts" : "vetShare.grant.canSeeParts";
    return isGrantEnded(grant) ? "vetShare.grant.couldSee" : "vetShare.grant.canSee";
  }
  if ((grant.scopes ?? []).includes(RECORD_READ_SCOPE)) return "vetShare.grant.older";
  return isGrantEnded(grant) ? "vetShare.grant.couldDo" : "vetShare.grant.canDo";
}

/**
 * What one grant (or pending request) opens and until when, exactly as the server describes it. Shared by the share
 * sheet, Data Access and the booking summary so the three never say different things.
 */
export default function GrantAccess({ grant, petName }) {
  const { t } = useTranslation();
  const lines = grantAccessLines(grant, t, petName);
  const ended = isGrantEnded(grant);
  const pending = grant.status === "pending";
  // An older grant says what it can write in the lines above.
  const adds = grant.sections?.length && !pending ? addableSections(grant) : [];

  let until = null;
  if (ended) {
    until = grant.expires_at
      ? t("vetShare.grant.endedOn", { date: formatLocalDate(grant.expires_at) })
      : t("vetShare.grant.ended");
  } else if (!pending) {
    until = grant.expires_at
      ? t("vetShare.grant.until", { date: formatLocalDate(grant.expires_at) })
      : t("vetShare.grant.untilRevoked");
  }

  return (
    <View testID={grant.id != null ? `grant-access-${grant.id}` : undefined} style={{ marginTop: 6, gap: 2 }}>
      {lines.length > 0 ? (
        <>
          <Text style={strong}>{t(headingKey(grant, adds.length > 0))}</Text>
          <Bullets lines={lines} />
        </>
      ) : null}
      {adds.length > 0 ? (
        <View testID={`grant-adds-${grant.id}`} style={{ marginTop: 4, gap: 2 }}>
          <Text style={strong}>{t(ended ? "vetShare.grant.couldAdd" : "vetShare.grant.canAdd")}</Text>
          <Bullets lines={adds.map((k) => t(`vetShare.canAdd.${k}`))} />
        </View>
      ) : null}
      {until ? <Text style={[strong, { marginTop: 4 }]}>{until}</Text> : null}
      {!pending && grant.granted_at ? (
        <Text style={muted}>
          {t("dataAccess.grantedOn", { date: formatLocalDate(grant.granted_at) })}
        </Text>
      ) : null}
    </View>
  );
}
