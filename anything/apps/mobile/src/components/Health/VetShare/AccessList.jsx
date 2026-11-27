import React from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { useTranslation } from "react-i18next";
import { Link2, ShieldAlert, ShieldCheck, Stethoscope, Users } from "lucide-react-native";
import { COLORS, MATERIALS, RADIUS, SPACING } from "@/constants/theme";
import { formatLocalDate } from "@/utils/localeDateTime";
import { roleLabel } from "@/utils/sharingLabels";
import { SHARE_SECTIONS } from "@/utils/vetShare";
import { accessEntryKey, accessEntryTitle, orderForDog } from "@/utils/whoHasAccess";
import GrantAccess, { Bullets } from "./GrantAccess";
import SecondaryButton from "./SecondaryButton";
import { bold, card, muted, text } from "./parts";

const ICONS = {
  vet: Stethoscope,
  record_link: Link2,
  emergency_link: ShieldAlert,
  family: Users,
};

const strong = [muted, { fontWeight: "700", color: COLORS.warmBrown }];

// "Until 03/05/2027", or that it lasts until the owner ends it.
function Until({ entry }) {
  const { t } = useTranslation();
  return (
    <Text style={[strong, { marginTop: 4 }]}>
      {entry.expires_at
        ? t("vetShare.grant.until", { date: formatLocalDate(entry.expires_at) })
        : t("vetShare.grant.untilRevoked")}
    </Text>
  );
}

// What one entry can see (or do).
function EntryAccess({ entry, petName }) {
  const { t } = useTranslation();
  if (entry.kind === "vet") {
    return <GrantAccess grant={{ ...entry, status: "active" }} petName={petName} />;
  }
  if (entry.kind === "record_link") {
    const sections = SHARE_SECTIONS.filter((k) => entry.sections?.includes(k));
    return (
      <View style={{ marginTop: 6, gap: 2 }}>
        <Text style={strong}>{t("recordLink.rowCanSee")}</Text>
        <Bullets lines={sections.map((k) => t(`vetShare.section.${k}.title`))} />
        <Text style={muted}>
          {t(entry.allow_notes ? "recordLink.rowNotes" : "recordLink.rowViewOnly")}
        </Text>
        <Until entry={entry} />
      </View>
    );
  }
  if (entry.kind === "emergency_link") {
    return (
      <View style={{ marginTop: 6, gap: 2 }}>
        <Text style={muted}>
          {t(entry.scope === "basic" ? "emergencyCard.scopeBasicHint" : "emergencyCard.scopeFullHint")}
        </Text>
        <Until entry={entry} />
      </View>
    );
  }
  return (
    <View style={{ marginTop: 6, gap: 2 }}>
      <Text style={strong}>{roleLabel(t, entry.role)}</Text>
      <Text style={muted}>
        {t(entry.role === "family" ? "whoHasAccess.family" : "whoHasAccess.caregiver", { pet: petName })}
      </Text>
      <Until entry={entry} />
    </View>
  );
}

function EntryCard({ entry, onRevokeVet, onRemoveLink, onManage, revoking, removing }) {
  const { t } = useTranslation();
  const petName = entry.pet_name || t("dataAccess.yourPet");
  const Icon = ICONS[entry.kind] ?? ShieldCheck;
  const relation =
    entry.kind === "vet" || entry.kind === "family"
      ? `${t("dataAccess.hasAccessTo")} ${petName}`
      : t("whoHasAccess.opens", { pet: petName });

  return (
    <View
      testID={`access-entry-${entry.kind}-${entry.id}`}
      style={[card, { borderRadius: RADIUS.card, marginBottom: SPACING.md }]}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: RADIUS.control,
            backgroundColor: MATERIALS.surfaceSunken,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Icon size={22} color={COLORS.coral} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[bold, { fontSize: 16 }]}>{accessEntryTitle(entry, t)}</Text>
          <Text testID={`access-entry-pet-${entry.kind}-${entry.id}`} style={muted}>
            {relation}
          </Text>
        </View>
      </View>

      <EntryAccess entry={entry} petName={petName} />

      {entry.kind === "vet" ? (
        <SecondaryButton
          testID={`data-access-revoke-${entry.id}`}
          label={t("dataAccess.revokeCta")}
          onPress={() => onRevokeVet(entry)}
          disabled={revoking}
        />
      ) : null}
      {entry.kind === "record_link" ? (
        <SecondaryButton
          testID={`record-link-remove-${entry.id}`}
          label={t("recordLink.remove")}
          onPress={() => onRemoveLink(entry)}
          disabled={removing}
        />
      ) : null}
      {entry.kind === "emergency_link" || entry.kind === "family" ? (
        <SecondaryButton
          testID={`access-manage-${entry.kind}-${entry.id}`}
          label={t(entry.kind === "family" ? "whoHasAccess.manageFamily" : "whoHasAccess.manageEmergency")}
          onPress={() => onManage(entry)}
        />
      ) : null}
    </View>
  );
}

/**
 * Everything that can open one of the owner's dogs' data right now, the dog on screen first: the same entries My Hub
 * counts, each with what it can see, until when and the way to end or manage it.
 *
 * Props: access (useWhoHasAccess()); currentPetId; onRevokeVet(entry), onRemoveLink(entry), onManage(entry);
 * revoking / removing: such a change is on its way.
 */
export default function AccessList({
  access,
  currentPetId,
  onRevokeVet,
  onRemoveLink,
  onManage,
  revoking,
  removing,
}) {
  const { t } = useTranslation();

  if (!access.data) {
    if (!access.isError) return <ActivityIndicator color={COLORS.coral} style={{ marginBottom: SPACING.lg }} />;
    return (
      <View testID="who-has-access-error" style={card}>
        <Text style={text}>{t("whoHasAccess.loadError")}</Text>
        <SecondaryButton testID="who-has-access-retry" label={t("vetShare.retry")} onPress={() => access.refetch()} />
      </View>
    );
  }

  const entries = orderForDog(access.data.entries, currentPetId);
  return (
    <View testID="who-has-access">
      {entries.length === 0 ? (
        <View style={[card, { flexDirection: "row", alignItems: "center", gap: 10 }]}>
          <ShieldCheck size={18} color={COLORS.mutedBrown} />
          <Text style={[text, { color: COLORS.mutedBrown, flex: 1 }]}>{t("dataAccess.noAccess")}</Text>
        </View>
      ) : (
        entries.map((entry) => (
          <EntryCard
            key={accessEntryKey(entry)}
            entry={entry}
            onRevokeVet={onRevokeVet}
            onRemoveLink={onRemoveLink}
            onManage={onManage}
            revoking={revoking}
            removing={removing}
          />
        ))
      )}
      {access.data.partial ? (
        <Text testID="who-has-access-partial" style={[muted, { marginBottom: SPACING.md }]}>
          {t("whoHasAccess.partial")}
        </Text>
      ) : null}
    </View>
  );
}
