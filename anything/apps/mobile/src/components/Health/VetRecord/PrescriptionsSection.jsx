import React from "react";
import { View, Text, Alert } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Pill, Truck } from "lucide-react-native";
import { COLORS, TYPE, RADIUS, SPACING, MATERIALS } from "@/constants/theme";
import { Card, PressableScale } from "@/components/ui";
import { usePrescriptions, useRequestRefill } from "@/hooks/usePrescriptions";

// Prescriptions section in the Vet Record (ticket 2.53). OWNER read-only: a list of Rx a vet
// issued (newest first) with full detail, clearly "Prescribed by {clinic}" and DISTINCT from
// owner-entered Current Medications. The owner can REQUEST A REFILL on an active Rx with refills
// remaining; there is NO create/edit/delete affordance on the prescription itself. Empty → a clean
// empty state (no fake data). The app records what a licensed vet issued; it does not prescribe.

function Field({ label, value }) {
  if (value == null || value === "") return null;
  return (
    <Text style={[TYPE.subhead, { fontWeight: "500", color: COLORS.mutedBrown, marginTop: 2 }]}>
      <Text style={{ fontWeight: "700", color: COLORS.warmBrown }}>{label}: </Text>
      {String(value)}
    </Text>
  );
}

export function PrescriptionsSection({ petId }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { data, isLoading } = usePrescriptions(petId ?? null);
  const requestRefill = useRequestRefill(petId);

  const prescriptions = data?.prescriptions || [];
  const refillRequests = data?.refillRequests || [];

  const STATUS_LABEL = {
    active: t("health.prescriptions.statusActive"),
    completed: t("health.prescriptions.statusCompleted"),
    cancelled: t("health.prescriptions.statusCancelled"),
  };

  const pendingFor = (rxId) =>
    refillRequests.find((r) => r.prescription_id === rxId && r.status === "requested");

  const onRequestRefill = (rx) => {
    Alert.alert(
      t("health.prescriptions.confirmTitle"),
      t("health.prescriptions.confirmBody", {
        clinic: rx.clinic_name || t("health.prescriptions.clinicInline"),
        drug: rx.drug_name,
      }),
      [
        { text: t("health.prescriptions.cancel"), style: "cancel" },
        {
          text: t("health.prescriptions.confirmRequest"),
          onPress: () =>
            requestRefill.mutate(rx.id, {
              onError: (e) =>
                Alert.alert(
                  t("health.prescriptions.errorTitle"),
                  e.message || t("health.prescriptions.errorRetry"),
                ),
            }),
        },
      ],
    );
  };

  return (
    <View style={{ marginBottom: SPACING.lg }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: SPACING.sm, marginBottom: SPACING.sm }}>
        <Pill size={18} color={COLORS.coral} />
        <Text style={[TYPE.headline, { fontWeight: "800", color: COLORS.warmBrown }]}>
          {t("health.prescriptions.title")}
        </Text>
      </View>

      {isLoading ? null : prescriptions.length === 0 ? (
        <Text testID="rx-empty" style={[TYPE.subhead, { fontWeight: "500", color: COLORS.mutedBrown }]}>
          {t("health.prescriptions.empty")}
        </Text>
      ) : (
        prescriptions.map((rx) => {
          const pending = pendingFor(rx.id);
          const canRefill = rx.status === "active" && rx.refills_remaining > 0 && !pending;
          return (
            <Card
              key={rx.id}
              testID={`rx-${rx.id}`}
              level="sm"
              style={{
                padding: SPACING.lg - 2,
                marginBottom: SPACING.sm,
              }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={[TYPE.headline, { fontWeight: "800", color: COLORS.warmBrown }]}>
                  {rx.drug_name}
                  {rx.strength ? ` · ${rx.strength}` : ""}
                </Text>
                <Text style={[TYPE.subhead, { fontWeight: "700", color: COLORS.coral }]}>
                  {STATUS_LABEL[rx.status] || rx.status}
                </Text>
              </View>
              <Text style={[TYPE.footnote, { color: COLORS.mutedBrown, fontStyle: "italic", marginTop: 2 }]}>
                {t("health.prescriptions.prescribedBy", { clinic: rx.clinic_name || t("health.prescriptions.clinicFallback") })}
              </Text>
              <Field label={t("health.prescriptions.fDose")} value={rx.dose} />
              <Field label={t("health.prescriptions.fFrequency")} value={rx.frequency} />
              <Field label={t("health.prescriptions.fRoute")} value={rx.route} />
              <Field label={t("health.prescriptions.fDuration")} value={rx.duration} />
              <Field label={t("health.prescriptions.fQuantity")} value={rx.quantity} />
              <Field label={t("health.prescriptions.fRefillsRemaining")} value={rx.refills_remaining} />
              <Field label={t("health.prescriptions.fInstructions")} value={rx.instructions} />

              {pending && (
                <Text testID={`rx-pending-${rx.id}`} style={[TYPE.subhead, { marginTop: SPACING.sm, color: COLORS.sageDark, fontWeight: "700" }]}>
                  {t("health.prescriptions.pending")}
                </Text>
              )}
              {canRefill && (
                <PressableScale
                  testID={`rx-refill-${rx.id}`}
                  onPress={() => onRequestRefill(rx)}
                  style={{ marginTop: SPACING.md - 2, backgroundColor: COLORS.coral, borderRadius: RADIUS.control, paddingVertical: 9, alignItems: "center" }}
                >
                  <Text style={[TYPE.subhead, { color: "#fff", fontWeight: "800" }]}>{t("health.prescriptions.requestRefill")}</Text>
                </PressableScale>
              )}
              {rx.status === "active" && rx.refills_remaining > 0 && (
                <PressableScale
                  testID={`rx-fulfill-${rx.id}`}
                  onPress={() =>
                    router.push(
                      `/rx-fulfillment?prescriptionId=${rx.id}&petId=${petId}&drugName=${encodeURIComponent(rx.drug_name || "")}`,
                    )
                  }
                  style={{ marginTop: SPACING.sm, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: SPACING.xs + 2, backgroundColor: MATERIALS.surface, borderWidth: 1.5, borderColor: COLORS.coral, borderRadius: RADIUS.control, paddingVertical: 9 }}
                >
                  <Truck size={15} color={COLORS.coral} />
                  <Text style={[TYPE.subhead, { color: COLORS.coral, fontWeight: "800" }]}>{t("health.prescriptions.requestFulfillment")}</Text>
                </PressableScale>
              )}
            </Card>
          );
        })
      )}
    </View>
  );
}

export default PrescriptionsSection;
