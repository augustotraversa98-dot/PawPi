import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, ShieldCheck, CheckSquare, Square } from "lucide-react-native";
import { COLORS } from "@/constants/colors";
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
      Alert.alert("Request sent", `${insurer.name} will follow up with a quote.`);
      setQuotePlan(null);
      setEmail("");
      setPhone("");
      setNote("");
    } catch (e) {
      Alert.alert("Couldn't send", e.message || "Please try again.");
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
          <Text style={{ fontSize: 22, fontWeight: "800", color: COLORS.warmBrown }}>Insurance 🛡️</Text>
          <Text style={{ fontSize: 12, color: COLORS.mutedBrown, marginTop: 1 }}>
            Compare plans and get a quote
          </Text>
        </View>
      </View>

      <RefreshableScrollView refetch={refetch} contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 60 }}>
        <Text style={{ fontSize: 13, fontWeight: "800", color: COLORS.mutedBrown, marginBottom: 8 }}>
          INSURERS
        </Text>
        {isLoading ? (
          <Text style={{ color: COLORS.mutedBrown }}>Loading…</Text>
        ) : isError ? (
          <Text style={{ color: COLORS.mutedBrown }}>Couldn't load insurers.</Text>
        ) : insurers.length === 0 ? (
          <Text testID="insurers-empty" style={{ color: COLORS.mutedBrown }}>
            No insurers available yet.
          </Text>
        ) : (
          insurers.map((p) => (
            <TouchableOpacity
              key={p.id}
              testID={`insurer-${p.id}`}
              onPress={() => { setInsurer(p); setCompare({}); }}
              activeOpacity={0.85}
              style={{
                flexDirection: "row", alignItems: "center", gap: 10,
                backgroundColor: COLORS.card, borderRadius: 14, padding: 14, marginBottom: 8,
                borderWidth: insurer?.id === p.id ? 2 : 1,
                borderColor: insurer?.id === p.id ? COLORS.coral : COLORS.peach,
              }}
            >
              <ShieldCheck size={20} color={COLORS.coral} />
              <Text style={{ flex: 1, fontWeight: "800", color: COLORS.warmBrown }}>{p.name}</Text>
            </TouchableOpacity>
          ))
        )}

        {insurer && (
          <>
            <Text style={{ fontSize: 13, fontWeight: "800", color: COLORS.mutedBrown, marginTop: 16, marginBottom: 8 }}>
              PLANS
            </Text>
            {plans.length === 0 ? (
              <Text testID="plans-empty" style={{ color: COLORS.mutedBrown }}>
                No plans yet.
              </Text>
            ) : (
              plans.map((plan) => (
                <View
                  key={plan.id}
                  testID={`plan-${plan.id}`}
                  style={{ backgroundColor: COLORS.card, borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: COLORS.peach }}
                >
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={{ fontSize: 15, fontWeight: "800", color: COLORS.warmBrown }}>
                      {plan.name}{plan.tier ? ` · ${plan.tier}` : ""}
                    </Text>
                    <Text style={{ fontWeight: "800", color: COLORS.coral }}>{priceRange(plan)}</Text>
                  </View>
                  {!!plan.deductible && (
                    <Text style={{ color: COLORS.mutedBrown, fontSize: 13, marginTop: 2 }}>Deductible: {plan.deductible}</Text>
                  )}
                  {!!plan.reimbursement && (
                    <Text style={{ color: COLORS.mutedBrown, fontSize: 13 }}>Reimbursement: {plan.reimbursement}</Text>
                  )}
                  {(plan.coverage_highlights || []).map((h, i) => (
                    <Text key={i} style={{ color: COLORS.warmBrown, fontSize: 13, marginTop: 2 }}>• {h}</Text>
                  ))}
                  <View style={{ flexDirection: "row", gap: 16, marginTop: 10, alignItems: "center" }}>
                    <TouchableOpacity
                      testID={`compare-${plan.id}`}
                      onPress={() => setCompare((c) => ({ ...c, [plan.id]: !c[plan.id] }))}
                      style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
                    >
                      {compare[plan.id] ? <CheckSquare size={18} color={COLORS.coral} /> : <Square size={18} color={COLORS.mutedBrown} />}
                      <Text style={{ color: COLORS.mutedBrown, fontWeight: "700" }}>Compare</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      testID={`quote-${plan.id}`}
                      onPress={() => setQuotePlan(plan)}
                      style={{ borderWidth: 1.5, borderColor: COLORS.coral, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8 }}
                    >
                      <Text style={{ color: COLORS.coral, fontWeight: "800" }}>Get a quote</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      testID={`apply-${plan.id}`}
                      onPress={() =>
                        router.push(
                          `/insurance-policy?providerId=${insurer.id}&planId=${plan.id}&planName=${encodeURIComponent(plan.name || "")}&petId=${currentPet?.id ?? ""}&termsUrl=${encodeURIComponent(plan.terms_url || "")}&insurerName=${encodeURIComponent(insurer.name || "")}`,
                        )
                      }
                      style={{ backgroundColor: COLORS.coral, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8 }}
                    >
                      <Text style={{ color: "#fff", fontWeight: "800" }}>Apply / Buy</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}

            {selected.length >= 2 && (
              <View testID="compare-view" style={{ backgroundColor: COLORS.sand, borderRadius: 14, padding: 14, marginTop: 6 }}>
                <Text style={{ fontWeight: "800", color: COLORS.warmBrown, marginBottom: 8 }}>Compare</Text>
                {selected.map((p) => (
                  <View key={p.id} style={{ marginBottom: 8 }}>
                    <Text style={{ fontWeight: "800", color: COLORS.warmBrown }}>{p.name}</Text>
                    <Text style={{ color: COLORS.mutedBrown, fontSize: 13 }}>
                      {priceRange(p)} · Deductible {p.deductible || "—"} · Reimb. {p.reimbursement || "—"}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </>
        )}

        {/* Quote form */}
        {quotePlan && (
          <View testID="quote-form" style={{ backgroundColor: COLORS.card, borderRadius: 16, padding: 16, marginTop: 16, borderWidth: 1, borderColor: COLORS.peach }}>
            <Text style={{ fontSize: 16, fontWeight: "800", color: COLORS.warmBrown }}>
              Get a quote: {quotePlan.name}
            </Text>
            <Text style={{ color: COLORS.mutedBrown, fontSize: 13, marginTop: 4 }}>
              For {currentPet?.name || "your pet"}
              {currentPet?.species ? ` · ${currentPet.species}` : ""}
              {currentPet?.breed ? ` · ${currentPet.breed}` : ""}
            </Text>
            <TextInput
              testID="quote-email"
              value={email}
              onChangeText={setEmail}
              placeholder="Contact email"
              placeholderTextColor={COLORS.mutedBrown}
              keyboardType="email-address"
              autoCapitalize="none"
              style={{ marginTop: 12, backgroundColor: COLORS.sand, borderRadius: 12, padding: 10, color: COLORS.warmBrown }}
            />
            <TextInput
              testID="quote-phone"
              value={phone}
              onChangeText={setPhone}
              placeholder="Contact phone (optional)"
              placeholderTextColor={COLORS.mutedBrown}
              style={{ marginTop: 8, backgroundColor: COLORS.sand, borderRadius: 12, padding: 10, color: COLORS.warmBrown }}
            />
            <TextInput
              testID="quote-note"
              value={note}
              onChangeText={setNote}
              placeholder="Anything the insurer should know? (optional)"
              placeholderTextColor={COLORS.mutedBrown}
              multiline
              style={{ marginTop: 8, backgroundColor: COLORS.sand, borderRadius: 12, padding: 10, minHeight: 56, color: COLORS.warmBrown }}
            />
            <TouchableOpacity
              testID="submit-quote"
              onPress={sendQuote}
              disabled={submit.isPending}
              style={{ marginTop: 12, backgroundColor: COLORS.coral, borderRadius: 14, paddingVertical: 12, alignItems: "center" }}
            >
              <Text style={{ color: "#fff", fontWeight: "800" }}>
                {submit.isPending ? "Sending…" : "Request quote"}
              </Text>
            </TouchableOpacity>
            <Text style={{ color: COLORS.mutedBrown, fontSize: 11, marginTop: 8, textAlign: "center" }}>
              We only share what you enter here — never your Vet Record.
            </Text>
          </View>
        )}
      </RefreshableScrollView>
    </View>
  );
}
