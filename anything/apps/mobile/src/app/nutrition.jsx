import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Linking,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, Utensils, AlertTriangle, X } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { COLORS } from "@/constants/colors";
import { useCurrentPet } from "@/hooks/usePetProfile";
import {
  useNutritionPlans,
  useSaveNutritionPlan,
  useRecallMatches,
  useDismissRecall,
} from "@/hooks/useNutrition";

// Nutrition + food-recall alerts (ticket 2.75). Owner records a per-pet nutrition plan (brand/product/
// portion/calories/notes) with a NON-DIAGNOSTIC disclaimer; food-recall alerts matching the pet's food
// surface here, dismissible. PawPi helps track + prepare vet conversations — it does not prescribe a
// diet. Real data + empty states.

const FORMS = ["dry", "wet", "raw", "mixed"];

export default function NutritionScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();
  const { data: currentPet } = useCurrentPet();
  const petId = currentPet?.id;

  const { data: plans = [] } = useNutritionPlans(petId ?? null);
  const { data: recalls = [] } = useRecallMatches();
  const save = useSaveNutritionPlan(petId);
  const dismiss = useDismissRecall();

  const existing = plans[0] || null;
  const [brand, setBrand] = useState("");
  const [product, setProduct] = useState("");
  const [form, setForm] = useState("");
  const [portion, setPortion] = useState("");
  const [calories, setCalories] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (existing) {
      setBrand(existing.food_brand || "");
      setProduct(existing.food_product || "");
      setForm(existing.food_form || "");
      setPortion(existing.daily_portion || "");
      setCalories(existing.target_calories != null ? String(existing.target_calories) : "");
      setNotes(existing.notes || "");
    }
  }, [existing?.id]);

  const myRecalls = recalls.filter((r) => r.pet_id === petId);

  const submit = async () => {
    if (!petId || !brand.trim()) return;
    try {
      await save.mutateAsync({
        id: existing?.id,
        pet_id: petId,
        food_brand: brand.trim(),
        food_product: product.trim() || null,
        food_form: form || null,
        daily_portion: portion.trim() || null,
        target_calories: calories ? Number(calories) : null,
        notes: notes.trim() || null,
      });
      Alert.alert(t("nutrition.savedTitle"), t("nutrition.savedBody"));
    } catch (e) {
      Alert.alert(t("nutrition.couldNotSave"), e.message || "");
    }
  };

  const inputStyle = {
    backgroundColor: COLORS.card,
    borderWidth: 1.5,
    borderColor: COLORS.peach,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: COLORS.warmBrown,
    marginBottom: 12,
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
        <Text style={{ fontSize: 20, fontWeight: "800", color: COLORS.warmBrown }}>
          {t("nutrition.title")}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
        {/* Recall alerts */}
        {myRecalls.map((r) => (
          <View
            key={r.id}
            testID={`recall-${r.id}`}
            style={{ backgroundColor: "#FBE7E4", borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: "#F3B5AD" }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
              <View style={{ flexDirection: "row", gap: 8, flex: 1, paddingRight: 8 }}>
                <AlertTriangle size={18} color="#B23A2E" />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: "800", color: "#B23A2E" }}>
                    {t("nutrition.recallTitle")}
                  </Text>
                  <Text style={{ color: COLORS.warmBrown, fontSize: 13, marginTop: 2 }}>
                    {t("nutrition.recallBody", {
                      pet: r.pet_name || "your pet",
                      reason: r.reason || r.brand || "",
                    })}
                  </Text>
                  {r.url ? (
                    <TouchableOpacity onPress={() => Linking.openURL(r.url)}>
                      <Text style={{ color: COLORS.sageDark, fontWeight: "700", fontSize: 13, marginTop: 4 }}>
                        {t("nutrition.recallLink")}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
              <TouchableOpacity testID={`recall-dismiss-${r.id}`} onPress={() => dismiss.mutate(r.id)} hitSlop={8}>
                <X size={18} color="#B23A2E" />
              </TouchableOpacity>
            </View>
          </View>
        ))}

        {/* Nutrition plan */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <Utensils size={18} color={COLORS.coral} />
          <Text style={{ fontSize: 16, fontWeight: "800", color: COLORS.warmBrown }}>
            {existing ? t("nutrition.yourPlan") : t("nutrition.addPlan")}
          </Text>
        </View>

        <Text testID="nutrition-disclaimer" style={{ fontSize: 12, color: COLORS.mutedBrown, lineHeight: 17, marginBottom: 12 }}>
          {t("nutrition.disclaimer")}
        </Text>

        <TextInput testID="nutrition-brand" value={brand} onChangeText={setBrand} placeholder={t("nutrition.brand")} placeholderTextColor={COLORS.mutedBrown} style={inputStyle} />
        <TextInput testID="nutrition-product" value={product} onChangeText={setProduct} placeholder={t("nutrition.product")} placeholderTextColor={COLORS.mutedBrown} style={inputStyle} />

        <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
          {FORMS.map((f) => (
            <TouchableOpacity
              key={f}
              testID={`nutrition-form-${f}`}
              onPress={() => setForm(f)}
              style={{
                flex: 1,
                paddingVertical: 8,
                borderRadius: 10,
                alignItems: "center",
                backgroundColor: form === f ? COLORS.coral : COLORS.card,
                borderWidth: 1,
                borderColor: COLORS.peach,
              }}
            >
              <Text style={{ fontWeight: "700", color: form === f ? "#fff" : COLORS.warmBrown, fontSize: 12 }}>
                {t(`nutrition.form_${f}`)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TextInput testID="nutrition-portion" value={portion} onChangeText={setPortion} placeholder={t("nutrition.portion")} placeholderTextColor={COLORS.mutedBrown} style={inputStyle} />
        <TextInput testID="nutrition-calories" value={calories} onChangeText={setCalories} placeholder={t("nutrition.calories")} placeholderTextColor={COLORS.mutedBrown} keyboardType="number-pad" style={inputStyle} />
        <TextInput testID="nutrition-notes" value={notes} onChangeText={setNotes} placeholder={t("nutrition.notes")} placeholderTextColor={COLORS.mutedBrown} multiline style={[inputStyle, { minHeight: 70, textAlignVertical: "top" }]} />

        <Text style={{ fontSize: 12, color: COLORS.mutedBrown, marginBottom: 12 }}>
          {t("nutrition.feedingLink")}
        </Text>

        <TouchableOpacity
          testID="nutrition-submit"
          onPress={submit}
          disabled={!brand.trim() || save.isPending}
          style={{
            backgroundColor: brand.trim() ? COLORS.coral : COLORS.peach,
            borderRadius: 14,
            paddingVertical: 14,
            alignItems: "center",
            opacity: save.isPending ? 0.6 : 1,
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>
            {existing ? t("nutrition.update") : t("nutrition.save")}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}
