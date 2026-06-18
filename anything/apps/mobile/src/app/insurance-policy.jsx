import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { ArrowLeft, Shield, Check, ExternalLink } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { COLORS } from "@/constants/colors";
import {
  useInsurancePolicies,
  useApplyPolicy,
  useActivatePolicy,
} from "@/hooks/useInsurance";

// Insurance apply / policy hub (ticket 2.72, extends the 2.54 marketplace). From a plan, the owner
// READS + ACCEPTS the insurer's terms/disclaimer, applies (records terms_accepted_at), then — once
// the insurer issues a premium — pays via 2.3 and the policy goes active. PawPi facilitates; the
// insurer is the party-of-record (no underwriting). Real data + empty states.

const STATUS_LABEL = {
  application: "Under review",
  payment_pending: "Awaiting payment",
  active: "Active",
  lapsed: "Lapsed",
  cancelled: "Cancelled",
};

function money(cents) {
  if (cents == null) return null;
  return `$${(cents / 100).toFixed(2)}`;
}

export default function InsurancePolicyScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();
  const params = useLocalSearchParams();
  const providerId = Array.isArray(params.providerId)
    ? params.providerId[0]
    : params.providerId;
  const planId = Array.isArray(params.planId) ? params.planId[0] : params.planId;
  const planName = Array.isArray(params.planName)
    ? params.planName[0]
    : params.planName;
  const petId = Array.isArray(params.petId) ? params.petId[0] : params.petId;
  const termsUrl = Array.isArray(params.termsUrl)
    ? params.termsUrl[0]
    : params.termsUrl;
  const insurerName = Array.isArray(params.insurerName)
    ? params.insurerName[0]
    : params.insurerName;

  const { data: policies = [] } = useInsurancePolicies(petId ?? null);
  const apply = useApplyPolicy(petId);
  const activate = useActivatePolicy(petId);

  const [accepted, setAccepted] = useState(false);

  const disclaimer = t("ins.disclaimer", {
    insurer: insurerName || t("ins.theInsurer"),
  });

  const submit = async () => {
    if (!accepted || !providerId) return;
    try {
      await apply.mutateAsync({
        plan_id: planId ? Number(planId) : null,
        provider_id: Number(providerId),
        pet_id: petId ? Number(petId) : null,
        terms_accepted: true,
        terms_url: termsUrl || null,
      });
      Alert.alert(t("ins.appliedTitle"), t("ins.appliedBody"));
      setAccepted(false);
    } catch (e) {
      Alert.alert(t("ins.couldNotApply"), e.message || "");
    }
  };

  const pay = async (policy) => {
    if (!policy.premium_cents) return;
    try {
      const res = await fetch(`/api/payments/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider_id: policy.provider_id,
          kind: "subscription",
          amount_cents: policy.premium_cents,
          rail: "mercadopago",
          source_ref: `ins-${policy.id}`,
        }),
      });
      if (res.status === 503) {
        Alert.alert(t("ins.payUnavailable"), t("ins.payUnavailableBody"));
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Payment failed");
      if (data.checkoutUrl) Linking.openURL(data.checkoutUrl);
      // Best-effort: activate once the rail reports the payment approved (webhook-driven).
      if (data.payment?.id) {
        activate
          .mutateAsync({ id: policy.id, payment_id: data.payment.id })
          .catch(() => {});
      }
    } catch (e) {
      Alert.alert(t("ins.couldNotPay"), e.message || "");
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.cream }}>
      <View
        style={{
          paddingTop: insets.top,
          paddingHorizontal: 20,
          paddingBottom: 14,
          backgroundColor: COLORS.card,
          flexDirection: "row",
          alignItems: "center",
          borderBottomWidth: 1,
          borderBottomColor: COLORS.peach,
        }}
      >
        <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 14 }}>
          <ArrowLeft size={22} color={COLORS.warmBrown} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 20, fontWeight: "800", color: COLORS.warmBrown }}>
            {t("ins.title")}
          </Text>
          {planName ? (
            <Text style={{ fontSize: 12, color: COLORS.mutedBrown, marginTop: 1 }}>
              {planName}
            </Text>
          ) : null}
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
        {/* Existing policies for this pet */}
        {policies.length > 0 && (
          <View style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 13, fontWeight: "800", color: COLORS.mutedBrown, marginBottom: 8 }}>
              {t("ins.yourPolicies")}
            </Text>
            {policies.map((p) => (
              <View
                key={p.id}
                testID={`ins-policy-${p.id}`}
                style={{ backgroundColor: COLORS.card, borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: COLORS.peach }}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ fontWeight: "800", color: COLORS.warmBrown }}>
                    {p.plan_name || p.provider_name || t("ins.policy")}
                  </Text>
                  <Text style={{ fontWeight: "800", color: COLORS.coral }}>
                    {STATUS_LABEL[p.status] || p.status}
                  </Text>
                </View>
                {p.policy_number ? (
                  <Text style={{ color: COLORS.mutedBrown, fontSize: 12, marginTop: 2 }}>
                    {t("ins.policyNo")}: {p.policy_number}
                  </Text>
                ) : null}
                {p.premium_cents != null ? (
                  <Text style={{ color: COLORS.warmBrown, fontWeight: "700", marginTop: 2 }}>
                    {money(p.premium_cents)}
                    {p.billing_period ? ` / ${p.billing_period}` : ""}
                  </Text>
                ) : null}
                {p.premium_cents != null && p.status === "payment_pending" && (
                  <TouchableOpacity
                    testID={`ins-pay-${p.id}`}
                    onPress={() => pay(p)}
                    style={{ marginTop: 10, backgroundColor: COLORS.coral, borderRadius: 12, paddingVertical: 9, alignItems: "center" }}
                  >
                    <Text style={{ color: "#fff", fontWeight: "800" }}>
                      {t("ins.payPremium")} {money(p.premium_cents)}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </View>
        )}

        {/* Apply */}
        <View style={{ backgroundColor: COLORS.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: COLORS.peach }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <Shield size={18} color={COLORS.coral} />
            <Text style={{ fontSize: 16, fontWeight: "800", color: COLORS.warmBrown }}>
              {t("ins.apply")}
            </Text>
          </View>

          <Text testID="ins-disclaimer" style={{ fontSize: 12, color: COLORS.mutedBrown, lineHeight: 17, marginBottom: 12 }}>
            {disclaimer}
          </Text>

          {termsUrl ? (
            <TouchableOpacity
              testID="ins-terms-link"
              onPress={() => Linking.openURL(termsUrl)}
              style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 12 }}
            >
              <ExternalLink size={14} color={COLORS.sageDark} />
              <Text style={{ color: COLORS.sageDark, fontWeight: "700", fontSize: 13 }}>
                {t("ins.readTerms")}
              </Text>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity
            testID="ins-accept"
            onPress={() => setAccepted((v) => !v)}
            style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 }}
          >
            <View
              style={{
                width: 22,
                height: 22,
                borderRadius: 6,
                borderWidth: 1.5,
                borderColor: accepted ? COLORS.coral : COLORS.mutedBrown,
                backgroundColor: accepted ? COLORS.coral : "transparent",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {accepted ? <Check size={15} color="#fff" /> : null}
            </View>
            <Text style={{ flex: 1, fontSize: 13, color: COLORS.warmBrown }}>
              {t("ins.acceptTerms")}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            testID="ins-submit"
            onPress={submit}
            disabled={!accepted || apply.isPending}
            style={{
              backgroundColor: accepted ? COLORS.coral : COLORS.peach,
              borderRadius: 14,
              paddingVertical: 14,
              alignItems: "center",
              opacity: apply.isPending ? 0.6 : 1,
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>
              {t("ins.applyNow")}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}
