import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ShieldCheck, CheckSquare, Square } from "lucide-react-native";
import { COLORS } from "@/constants/colors";
import {
  TYPE,
  RADIUS,
  SPACING,
  MATERIALS,
  BLUR,
} from "@/constants/theme";
import { Card, PressableScale, GlassSurface } from "@/components/ui";
import { RefreshableScrollView } from "@/components/RefreshableScrollView";
import { useCurrentPet } from "@/hooks/usePetProfile";
import { useDiscoverProviders } from "@/hooks/useProviders";
import { useInsurancePlans, useSubmitInsuranceLead } from "@/hooks/useInsurance";

function priceRange(p) {
  const min = p.monthly_price_min;
  const max = p.monthly_price_max;
  if (min == null && max == null) return "—";
  if (min != null && max != null) return `${min}–${max}/mo`;
  return `${min ?? max}/mo`;
}

export default function InsuranceScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();
  const { data: currentPet } = useCurrentPet();
  const { data: insurers = [], isLoading, isError, refetch } = useDiscoverProviders("insurance");
  const [insurer, setInsurer] = useState(null);
  const { data: plans = [] } = useInsurancePlans(insurer?.id ?? null);
  const submit = useSubmitInsuranceLead();

  const [compare, setCompare] = useState({}); // planId -> bool
  const [quotePlan, setQuotePlan] = useState(null);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");

  const selected = plans.filter((p) => compare[p.id]);

  const sendQuote = async () => {
    if (!quotePlan || !insurer) return;
    try {
      await submit.mutateAsync({
        provider_id: insurer.id,
        plan_id: quotePlan.id,
        pet_id: currentPet?.id ?? null,
        pet_species: currentPet?.species ?? null,
        pet_breed: currentPet?.breed ?? null,
        pet_age:
          currentPet?.age_years != null ? String(currentPet.age_years) : null,
        contact_email: email.trim() || null,
        contact_phone: phone.trim() || null,
        note: note.trim() || null,
      });
      Alert.alert(
        t("insurance.requestSentTitle"),
        t("insurance.requestSentBody", { insurer: insurer.name }),
      );
      setQuotePlan(null);
      setEmail("");
      setPhone("");
      setNote("");
    } catch (e) {
      Alert.alert(t("insurance.couldNotSend"), e.message || t("common.pleaseTryAgain"));
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.cream }}>
      <GlassSurface
        intensity={BLUR.thick}
        style={{
          borderBottomWidth: 1,
          borderColor: MATERIALS.glassBorder,
        }}
        contentStyle={{
          paddingTop: insets.top,
          paddingHorizontal: SPACING.xl,
          paddingBottom: SPACING.md + 2,
          flexDirection: "row",
          alignItems: "center",
        }}
      >
        <PressableScale onPress={() => router.back()} style={{ marginRight: SPACING.md + 2 }}>
          <ArrowLeft size={22} color={COLORS.warmBrown} />
        </PressableScale>
        <View style={{ flex: 1 }}>
          <Text style={[TYPE.title, { color: COLORS.warmBrown }]}>{t("insurance.title")}</Text>
          <Text style={[TYPE.footnote, { color: COLORS.mutedBrown, marginTop: 1 }]}>
            {t("insurance.subtitle")}
          </Text>
        </View>
      </GlassSurface>

      <RefreshableScrollView refetch={refetch} contentContainerStyle={{ padding: SPACING.lg, paddingBottom: insets.bottom + 60 }}>
        <Text style={[TYPE.subhead, { fontWeight: "800", color: COLORS.mutedBrown, marginBottom: SPACING.sm }]}>
          {t("insurance.insurers")}
        </Text>
        {isLoading ? (
          <Text style={[TYPE.body, { color: COLORS.mutedBrown }]}>{t("common.loading")}</Text>
        ) : isError ? (
          <Text style={[TYPE.body, { color: COLORS.mutedBrown }]}>{t("insurance.couldNotLoadInsurers")}</Text>
        ) : insurers.length === 0 ? (
          <Text testID="insurers-empty" style={[TYPE.body, { color: COLORS.mutedBrown }]}>
            {t("insurance.noInsurersYet")}
          </Text>
        ) : (
          insurers.map((p) => (
            <PressableScale
              key={p.id}
              testID={`insurer-${p.id}`}
              onPress={() => { setInsurer(p); setCompare({}); }}
              style={{ marginBottom: SPACING.sm }}
            >
              <Card
                level="none"
                radius={RADIUS.control - 2}
                borderColor={insurer?.id === p.id ? COLORS.coral : COLORS.peach}
                style={{
                  flexDirection: "row", alignItems: "center", gap: SPACING.sm + 2,
                  padding: SPACING.md + 2,
                  borderWidth: insurer?.id === p.id ? 2 : 1,
                }}
              >
                <ShieldCheck size={20} color={COLORS.coral} />
                <Text style={[TYPE.headline, { flex: 1, fontWeight: "800", color: COLORS.warmBrown }]}>{p.name}</Text>
              </Card>
            </PressableScale>
          ))
        )}

        {insurer && (
          <>
            <Text style={[TYPE.subhead, { fontWeight: "800", color: COLORS.mutedBrown, marginTop: SPACING.lg, marginBottom: SPACING.sm }]}>
              {t("insurance.plans")}
            </Text>
            {plans.length === 0 ? (
              <Text testID="plans-empty" style={[TYPE.body, { color: COLORS.mutedBrown }]}>
                {t("insurance.noPlansYet")}
              </Text>
            ) : (
              plans.map((plan) => (
                <Card
                  key={plan.id}
                  testID={`plan-${plan.id}`}
                  level="none"
                  radius={RADIUS.control - 2}
                  borderColor={COLORS.peach}
                  style={{ padding: SPACING.md + 2, marginBottom: SPACING.sm }}
                >
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={[TYPE.body, { fontWeight: "800", color: COLORS.warmBrown }]}>
                      {plan.name}{plan.tier ? ` · ${plan.tier}` : ""}
                    </Text>
                    <Text style={[TYPE.body, { fontWeight: "800", color: COLORS.coral }]}>{priceRange(plan)}</Text>
                  </View>
                  {!!plan.deductible && (
                    <Text style={[TYPE.subhead, { color: COLORS.mutedBrown, fontWeight: "500", marginTop: 2 }]}>{t("insurance.deductibleLabel", { value: plan.deductible })}</Text>
                  )}
                  {!!plan.reimbursement && (
                    <Text style={[TYPE.subhead, { color: COLORS.mutedBrown, fontWeight: "500" }]}>{t("insurance.reimbursementLabel", { value: plan.reimbursement })}</Text>
                  )}
                  {(plan.coverage_highlights || []).map((h, i) => (
                    <Text key={i} style={[TYPE.subhead, { color: COLORS.warmBrown, fontWeight: "500", marginTop: 2 }]}>• {h}</Text>
                  ))}
                  <View style={{ flexDirection: "row", gap: SPACING.lg, marginTop: SPACING.sm + 2, alignItems: "center" }}>
                    <PressableScale
                      testID={`compare-${plan.id}`}
                      onPress={() => setCompare((c) => ({ ...c, [plan.id]: !c[plan.id] }))}
                      style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
                    >
                      {compare[plan.id] ? <CheckSquare size={18} color={COLORS.coral} /> : <Square size={18} color={COLORS.mutedBrown} />}
                      <Text style={[TYPE.subhead, { color: COLORS.mutedBrown, fontWeight: "700" }]}>{t("insurance.compare")}</Text>
                    </PressableScale>
                    <PressableScale
                      testID={`quote-${plan.id}`}
                      onPress={() => setQuotePlan(plan)}
                      style={{ borderWidth: 1.5, borderColor: COLORS.coral, borderRadius: RADIUS.sm, paddingHorizontal: SPACING.md + 2, paddingVertical: SPACING.sm }}
                    >
                      <Text style={[TYPE.subhead, { color: COLORS.coral, fontWeight: "800" }]}>{t("insurance.getQuote")}</Text>
                    </PressableScale>
                    <PressableScale
                      testID={`apply-${plan.id}`}
                      onPress={() =>
                        router.push(
                          `/insurance-policy?providerId=${insurer.id}&planId=${plan.id}&planName=${encodeURIComponent(plan.name || "")}&petId=${currentPet?.id ?? ""}&termsUrl=${encodeURIComponent(plan.terms_url || "")}&insurerName=${encodeURIComponent(insurer.name || "")}`,
                        )
                      }
                      style={{ backgroundColor: COLORS.coral, borderRadius: RADIUS.sm, paddingHorizontal: SPACING.md + 2, paddingVertical: SPACING.sm }}
                    >
                      <Text style={[TYPE.subhead, { color: "#fff", fontWeight: "800" }]}>{t("insurance.applyBuy")}</Text>
                    </PressableScale>
                  </View>
                </Card>
              ))
            )}

            {selected.length >= 2 && (
              <View testID="compare-view" style={{ backgroundColor: COLORS.sand, borderRadius: RADIUS.control - 2, padding: SPACING.md + 2, marginTop: 6 }}>
                <Text style={[TYPE.body, { fontWeight: "800", color: COLORS.warmBrown, marginBottom: SPACING.sm }]}>{t("insurance.compare")}</Text>
                {selected.map((p) => (
                  <View key={p.id} style={{ marginBottom: SPACING.sm }}>
                    <Text style={[TYPE.body, { fontWeight: "800", color: COLORS.warmBrown }]}>{p.name}</Text>
                    <Text style={[TYPE.subhead, { color: COLORS.mutedBrown, fontWeight: "500" }]}>
                      {t("insurance.compareRow", { price: priceRange(p), deductible: p.deductible || "—", reimb: p.reimbursement || "—" })}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </>
        )}

        {/* Quote form */}
        {quotePlan && (
          <Card testID="quote-form" level="none" radius={RADIUS.control} borderColor={COLORS.peach} style={{ padding: SPACING.lg, marginTop: SPACING.lg }}>
            <Text style={[TYPE.headline, { fontWeight: "800", color: COLORS.warmBrown }]}>
              {t("insurance.getQuoteFor", { name: quotePlan.name })}
            </Text>
            <Text style={[TYPE.subhead, { color: COLORS.mutedBrown, fontWeight: "500", marginTop: SPACING.xs }]}>
              {t("insurance.forPet", { name: currentPet?.name || t("common.yourPet") })}
              {currentPet?.species ? ` · ${currentPet.species}` : ""}
              {currentPet?.breed ? ` · ${currentPet.breed}` : ""}
            </Text>
            <TextInput
              testID="quote-email"
              value={email}
              onChangeText={setEmail}
              placeholder={t("insurance.contactEmail")}
              placeholderTextColor={COLORS.mutedBrown}
              keyboardType="email-address"
              autoCapitalize="none"
              style={{ marginTop: SPACING.md, backgroundColor: COLORS.sand, borderRadius: RADIUS.sm, padding: SPACING.sm + 2, color: COLORS.warmBrown }}
            />
            <TextInput
              testID="quote-phone"
              value={phone}
              onChangeText={setPhone}
              placeholder={t("insurance.contactPhoneOptional")}
              placeholderTextColor={COLORS.mutedBrown}
              style={{ marginTop: SPACING.sm, backgroundColor: COLORS.sand, borderRadius: RADIUS.sm, padding: SPACING.sm + 2, color: COLORS.warmBrown }}
            />
            <TextInput
              testID="quote-note"
              value={note}
              onChangeText={setNote}
              placeholder={t("insurance.noteOptional")}
              placeholderTextColor={COLORS.mutedBrown}
              multiline
              style={{ marginTop: SPACING.sm, backgroundColor: COLORS.sand, borderRadius: RADIUS.sm, padding: SPACING.sm + 2, minHeight: 56, color: COLORS.warmBrown }}
            />
            <PressableScale
              testID="submit-quote"
              onPress={sendQuote}
              disabled={submit.isPending}
              style={{ marginTop: SPACING.md, backgroundColor: COLORS.coral, borderRadius: RADIUS.control - 2, paddingVertical: SPACING.md, alignItems: "center" }}
            >
              <Text style={[TYPE.body, { color: "#fff", fontWeight: "800" }]}>
                {submit.isPending ? t("insurance.sending") : t("insurance.requestQuote")}
              </Text>
            </PressableScale>
            <Text style={[TYPE.caption, { color: COLORS.mutedBrown, fontWeight: "500", letterSpacing: 0, marginTop: SPACING.sm, textAlign: "center" }]}>
              {t("insurance.privacyNote")}
            </Text>
          </Card>
        )}
      </RefreshableScrollView>
    </View>
  );
}
