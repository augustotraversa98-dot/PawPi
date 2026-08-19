import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  TextInput,
  ActivityIndicator,
} from "react-native";
import KeyboardAwareScrollView from "@/components/KeyboardAwareScrollView";
import {
  X,
  Check,
  Coffee,
  UtensilsCrossed,
  Droplet,
} from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useLogFood } from "@/hooks/useHealthTracking";

const C = {
  cream: "#FFF7EF",
  card: "#FFFBF7",
  coral: "#FF6F61",
  peach: "#FFE5D9",
  terracotta: "#B75D32",
  warmBrown: "#3B241B",
  mutedBrown: "#8B7355",
  sage: "#A7BFA3",
  sand: "#F5EDE4",
};

// Default meal configuration
const defaultMeal = {
  breakfast: {
    foodName: "Regular dog food",
    amount: "1 cup",
    appetite: "normal",
    finishedMeal: "yes",
    vomiting: false,
  },
  lunch: {
    foodName: "Regular dog food",
    amount: "0.5 cup",
    appetite: "normal",
    finishedMeal: "yes",
    vomiting: false,
  },
  dinner: {
    foodName: "Regular dog food",
    amount: "1 cup",
    appetite: "normal",
    finishedMeal: "yes",
    vomiting: false,
  },
};

export default function FoodWaterTrackerModal({
  visible,
  onClose,
  initialType = "food",
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const logFoodMutation = useLogFood();
  const [step, setStep] = useState("type"); // type, quickChoice, foodForm, waterForm, confirmation
  const [trackingType, setTrackingType] = useState(initialType);
  const [showConfirmation, setShowConfirmation] = useState(false);

  // Food form state
  const [mealType, setMealType] = useState("breakfast");
  const [foodName, setFoodName] = useState("");
  const [amount, setAmount] = useState("");
  const [appetite, setAppetite] = useState("normal");
  const [finishedMeal, setFinishedMeal] = useState("yes");
  const [vomiting, setVomiting] = useState(false);
  const [foodNotes, setFoodNotes] = useState("");

  // Water form state
  const [waterIntake, setWaterIntake] = useState("normal");
  const [moreThirsty, setMoreThirsty] = useState(false);
  const [lessThirsty, setLessThirsty] = useState(false);
  const [waterNotes, setWaterNotes] = useState("");

  const resetForm = () => {
    setStep("type");
    setTrackingType(initialType);
    setShowConfirmation(false);
    setMealType("breakfast");
    setFoodName("");
    setAmount("");
    setAppetite("normal");
    setFinishedMeal("yes");
    setVomiting(false);
    setFoodNotes("");
    setWaterIntake("normal");
    setMoreThirsty(false);
    setLessThirsty(false);
    setWaterNotes("");
  };

  const handleQuickLog = async () => {
    // Determine current meal type based on time
    const hour = new Date().getHours();
    let currentMealType = "breakfast";
    if (hour >= 11 && hour < 16) currentMealType = "lunch";
    else if (hour >= 16) currentMealType = "dinner";

    const defaultData = defaultMeal[currentMealType];

    try {
      await logFoodMutation.mutateAsync({
        mealType: currentMealType,
        ...defaultData,
        notes: "",
      });

      setShowConfirmation(true);
      setTimeout(() => {
        resetForm();
        onClose();
      }, 1500);
    } catch (error) {
      // Error already handled by mutation
      console.error("Quick log failed:", error);
    }
  };

  const handleDetailedFoodSubmit = async () => {
    try {
      await logFoodMutation.mutateAsync({
        mealType,
        foodName,
        amount,
        appetite,
        finishedMeal,
        vomiting,
        notes: foodNotes,
      });

      setShowConfirmation(true);
      setTimeout(() => {
        resetForm();
        onClose();
      }, 1500);
    } catch (error) {
      // Error already handled by mutation
      console.error("Detailed food submit failed:", error);
    }
  };

  const handleWaterSubmit = async () => {
    try {
      await logFoodMutation.mutateAsync({
        mealType: "water",
        waterIntake,
        notes: waterNotes,
      });

      setShowConfirmation(true);
      setTimeout(() => {
        resetForm();
        onClose();
      }, 1500);
    } catch (error) {
      // Error already handled by mutation
      console.error("Water submit failed:", error);
    }
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View
        style={{ flex: 1, backgroundColor: C.cream, paddingTop: insets.top }}
      >
        {/* Header */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 20,
            paddingVertical: 16,
            borderBottomWidth: 1,
            borderBottomColor: C.peach,
          }}
        >
          <Text style={{ fontSize: 20, fontWeight: "800", color: C.warmBrown }}>
            {trackingType === "food" ? "Log Food" : "Log Water"}
          </Text>
          <TouchableOpacity
            onPress={handleClose}
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: C.sand,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <X size={18} color={C.warmBrown} />
          </TouchableOpacity>
        </View>

        <KeyboardAwareScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 20 }}
        >
          {/* Confirmation Screen */}
          {showConfirmation && (
            <View style={{ alignItems: "center", paddingVertical: 60 }}>
              <View
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: 40,
                  backgroundColor: C.sage + "20",
                  justifyContent: "center",
                  alignItems: "center",
                  marginBottom: 20,
                }}
              >
                <Check size={40} color={C.sage} />
              </View>
              <Text
                style={{
                  fontSize: 22,
                  fontWeight: "800",
                  color: C.warmBrown,
                  marginBottom: 8,
                }}
              >
                Logged!
              </Text>
              <Text
                style={{
                  fontSize: 14,
                  color: C.mutedBrown,
                  textAlign: "center",
                }}
              >
                {trackingType === "food"
                  ? "Food entry added to today's timeline"
                  : "Water intake logged successfully"}
              </Text>
            </View>
          )}

          {/* Step 1: Choose Type */}
          {!showConfirmation && step === "type" && (
            <View style={{ gap: 16 }}>
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: "700",
                  color: C.warmBrown,
                  marginBottom: 8,
                }}
              >
                What would you like to log?
              </Text>

              <TouchableOpacity
                onPress={() => {
                  setTrackingType("food");
                  setStep("quickChoice");
                }}
                style={{
                  backgroundColor: C.card,
                  borderRadius: 18,
                  padding: 20,
                  borderWidth: 1.5,
                  borderColor: trackingType === "food" ? C.sage : C.peach,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 16,
                }}
              >
                <View
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 28,
                    backgroundColor: C.sage + "20",
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <UtensilsCrossed size={26} color={C.sage} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: 16,
                      fontWeight: "700",
                      color: C.warmBrown,
                      marginBottom: 4,
                    }}
                  >
                    Food & Treats
                  </Text>
                  <Text style={{ fontSize: 13, color: C.mutedBrown }}>
                    Log meals, snacks, and treats
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  setTrackingType("water");
                  setStep("waterForm");
                }}
                style={{
                  backgroundColor: C.card,
                  borderRadius: 18,
                  padding: 20,
                  borderWidth: 1.5,
                  borderColor: trackingType === "water" ? "#64B5F6" : C.peach,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 16,
                }}
              >
                <View
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 28,
                    backgroundColor: "#64B5F620",
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <Droplet size={26} color="#64B5F6" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: 16,
                      fontWeight: "700",
                      color: C.warmBrown,
                      marginBottom: 4,
                    }}
                  >
                    Water Intake
                  </Text>
                  <Text style={{ fontSize: 13, color: C.mutedBrown }}>
                    Track hydration and thirst
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          )}

          {/* Step 2: Quick Choice (Food Only) */}
          {!showConfirmation && step === "quickChoice" && (
            <View style={{ gap: 16 }}>
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: "700",
                  color: C.warmBrown,
                  marginBottom: 4,
                }}
              >
                What did your pet eat?
              </Text>
              <Text
                style={{ fontSize: 14, color: C.mutedBrown, marginBottom: 12 }}
              >
                Quick log to save time, or add details for tracking patterns.
              </Text>

              <TouchableOpacity
                onPress={handleQuickLog}
                disabled={logFoodMutation.isPending}
                style={{
                  backgroundColor: logFoodMutation.isPending
                    ? C.mutedBrown
                    : C.sage,
                  borderRadius: 18,
                  padding: 20,
                  alignItems: "center",
                  shadowColor: C.sage,
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.25,
                  shadowRadius: 8,
                  elevation: 4,
                }}
              >
                {logFoodMutation.isPending ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <>
                    <Text
                      style={{
                        fontSize: 16,
                        fontWeight: "800",
                        color: "#FFF",
                        marginBottom: 6,
                      }}
                    >
                      Same as usual
                    </Text>
                    <Text
                      style={{
                        fontSize: 13,
                        color: "#FFF",
                        opacity: 0.9,
                        textAlign: "center",
                      }}
                    >
                      Regular meal, normal appetite, finished food
                    </Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setStep("foodForm")}
                style={{
                  backgroundColor: C.card,
                  borderRadius: 18,
                  padding: 20,
                  alignItems: "center",
                  borderWidth: 1.5,
                  borderColor: C.peach,
                }}
              >
                <Text
                  style={{
                    fontSize: 16,
                    fontWeight: "800",
                    color: C.warmBrown,
                    marginBottom: 6,
                  }}
                >
                  Something changed
                </Text>
                <Text
                  style={{
                    fontSize: 13,
                    color: C.mutedBrown,
                    textAlign: "center",
                  }}
                >
                  Different food, appetite, or behavior
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setStep("type")}
                style={{ alignItems: "center", paddingVertical: 12 }}
              >
                <Text style={{ fontSize: 14, color: C.mutedBrown }}>
                  ← Back
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Step 3: Detailed Food Form */}
          {!showConfirmation && step === "foodForm" && (
            <View style={{ gap: 20 }}>
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: "700",
                  color: C.warmBrown,
                  marginBottom: -8,
                }}
              >
                Food details
              </Text>

              {/* Meal Type */}
              <View>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "600",
                    color: C.warmBrown,
                    marginBottom: 10,
                  }}
                >
                  Meal type
                </Text>
                <View
                  style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
                >
                  {["breakfast", "lunch", "dinner", "snack", "treat"].map(
                    (type) => (
                      <TouchableOpacity
                        key={type}
                        onPress={() => setMealType(type)}
                        style={{
                          paddingVertical: 10,
                          paddingHorizontal: 16,
                          borderRadius: 12,
                          backgroundColor: mealType === type ? C.sage : C.sand,
                          borderWidth: 1.5,
                          borderColor: mealType === type ? C.sage : C.peach,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: mealType === type ? "700" : "600",
                            color: mealType === type ? "#FFF" : C.warmBrown,
                            textTransform: "capitalize",
                          }}
                        >
                          {type}
                        </Text>
                      </TouchableOpacity>
                    ),
                  )}
                </View>
              </View>

              {/* Food Name */}
              <View>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "600",
                    color: C.warmBrown,
                    marginBottom: 8,
                  }}
                >
                  Food name or type
                </Text>
                <TextInput
                  value={foodName}
                  onChangeText={setFoodName}
                  placeholder="e.g., Royal Canin, chicken & rice"
                  placeholderTextColor={C.mutedBrown + "80"}
                  style={{
                    backgroundColor: C.card,
                    borderRadius: 12,
                    padding: 14,
                    fontSize: 14,
                    color: C.warmBrown,
                    borderWidth: 1.5,
                    borderColor: C.peach,
                  }}
                />
              </View>

              {/* Amount */}
              <View>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "600",
                    color: C.warmBrown,
                    marginBottom: 8,
                  }}
                >
                  Amount
                </Text>
                <TextInput
                  value={amount}
                  onChangeText={setAmount}
                  placeholder="e.g., 1 cup, 5 treats"
                  placeholderTextColor={C.mutedBrown + "80"}
                  style={{
                    backgroundColor: C.card,
                    borderRadius: 12,
                    padding: 14,
                    fontSize: 14,
                    color: C.warmBrown,
                    borderWidth: 1.5,
                    borderColor: C.peach,
                  }}
                />
              </View>

              {/* Appetite */}
              <View>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "600",
                    color: C.warmBrown,
                    marginBottom: 10,
                  }}
                >
                  Appetite
                </Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {["low", "normal", "high"].map((level) => (
                    <TouchableOpacity
                      key={level}
                      onPress={() => setAppetite(level)}
                      style={{
                        flex: 1,
                        paddingVertical: 12,
                        borderRadius: 12,
                        backgroundColor: appetite === level ? C.sage : C.sand,
                        borderWidth: 1.5,
                        borderColor: appetite === level ? C.sage : C.peach,
                        alignItems: "center",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: appetite === level ? "700" : "600",
                          color: appetite === level ? "#FFF" : C.warmBrown,
                          textTransform: "capitalize",
                        }}
                      >
                        {level}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Finished Meal */}
              <View>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "600",
                    color: C.warmBrown,
                    marginBottom: 10,
                  }}
                >
                  Did your pet finish the food?
                </Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {[
                    { value: "yes", label: "Yes" },
                    { value: "partially", label: "Partially" },
                    { value: "no", label: "No" },
                  ].map((option) => (
                    <TouchableOpacity
                      key={option.value}
                      onPress={() => setFinishedMeal(option.value)}
                      style={{
                        flex: 1,
                        paddingVertical: 12,
                        borderRadius: 12,
                        backgroundColor:
                          finishedMeal === option.value ? C.sage : C.sand,
                        borderWidth: 1.5,
                        borderColor:
                          finishedMeal === option.value ? C.sage : C.peach,
                        alignItems: "center",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight:
                            finishedMeal === option.value ? "700" : "600",
                          color:
                            finishedMeal === option.value
                              ? "#FFF"
                              : C.warmBrown,
                        }}
                      >
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Vomiting */}
              <View>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "600",
                    color: C.warmBrown,
                    marginBottom: 10,
                  }}
                >
                  Any vomiting, refusal to eat, or unusual behavior?
                </Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <TouchableOpacity
                    onPress={() => setVomiting(false)}
                    style={{
                      flex: 1,
                      paddingVertical: 12,
                      borderRadius: 12,
                      backgroundColor: !vomiting ? C.sage : C.sand,
                      borderWidth: 1.5,
                      borderColor: !vomiting ? C.sage : C.peach,
                      alignItems: "center",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: !vomiting ? "700" : "600",
                        color: !vomiting ? "#FFF" : C.warmBrown,
                      }}
                    >
                      No
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setVomiting(true)}
                    style={{
                      flex: 1,
                      paddingVertical: 12,
                      borderRadius: 12,
                      backgroundColor: vomiting ? C.coral : C.sand,
                      borderWidth: 1.5,
                      borderColor: vomiting ? C.coral : C.peach,
                      alignItems: "center",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: vomiting ? "700" : "600",
                        color: vomiting ? "#FFF" : C.warmBrown,
                      }}
                    >
                      Yes
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Notes */}
              <View>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "600",
                    color: C.warmBrown,
                    marginBottom: 8,
                  }}
                >
                  Notes (optional)
                </Text>
                <TextInput
                  value={foodNotes}
                  onChangeText={setFoodNotes}
                  placeholder={t("trackers.foodWater.notesPlaceholder")}
                  placeholderTextColor={C.mutedBrown + "80"}
                  multiline
                  numberOfLines={3}
                  style={{
                    backgroundColor: C.card,
                    borderRadius: 12,
                    padding: 14,
                    fontSize: 14,
                    color: C.warmBrown,
                    borderWidth: 1.5,
                    borderColor: C.peach,
                    minHeight: 80,
                    textAlignVertical: "top",
                  }}
                />
              </View>

              {/* Submit */}
              <TouchableOpacity
                onPress={handleDetailedFoodSubmit}
                disabled={logFoodMutation.isPending}
                style={{
                  backgroundColor: logFoodMutation.isPending
                    ? C.mutedBrown
                    : C.coral,
                  borderRadius: 16,
                  paddingVertical: 16,
                  alignItems: "center",
                  marginTop: 8,
                  shadowColor: C.coral,
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.25,
                  shadowRadius: 8,
                  elevation: 4,
                }}
              >
                {logFoodMutation.isPending ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text
                    style={{ fontSize: 16, fontWeight: "800", color: "#FFF" }}
                  >
                    Log Food Entry
                  </Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setStep("quickChoice")}
                style={{ alignItems: "center", paddingVertical: 8 }}
              >
                <Text style={{ fontSize: 14, color: C.mutedBrown }}>
                  ← Back
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Step 4: Water Form */}
          {!showConfirmation && step === "waterForm" && (
            <View style={{ gap: 20 }}>
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: "700",
                  color: C.warmBrown,
                  marginBottom: -8,
                }}
              >
                Water intake
              </Text>

              {/* Water Intake Level */}
              <View>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "600",
                    color: C.warmBrown,
                    marginBottom: 10,
                  }}
                >
                  Water intake level
                </Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {["low", "normal", "high"].map((level) => (
                    <TouchableOpacity
                      key={level}
                      onPress={() => setWaterIntake(level)}
                      style={{
                        flex: 1,
                        paddingVertical: 12,
                        borderRadius: 12,
                        backgroundColor:
                          waterIntake === level ? "#64B5F6" : C.sand,
                        borderWidth: 1.5,
                        borderColor:
                          waterIntake === level ? "#64B5F6" : C.peach,
                        alignItems: "center",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: waterIntake === level ? "700" : "600",
                          color: waterIntake === level ? "#FFF" : C.warmBrown,
                          textTransform: "capitalize",
                        }}
                      >
                        {level}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* More Thirsty */}
              <View>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "600",
                    color: C.warmBrown,
                    marginBottom: 10,
                  }}
                >
                  More thirsty than usual?
                </Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <TouchableOpacity
                    onPress={() => setMoreThirsty(false)}
                    style={{
                      flex: 1,
                      paddingVertical: 12,
                      borderRadius: 12,
                      backgroundColor: !moreThirsty ? "#64B5F6" : C.sand,
                      borderWidth: 1.5,
                      borderColor: !moreThirsty ? "#64B5F6" : C.peach,
                      alignItems: "center",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: !moreThirsty ? "700" : "600",
                        color: !moreThirsty ? "#FFF" : C.warmBrown,
                      }}
                    >
                      No
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      setMoreThirsty(true);
                      setLessThirsty(false);
                    }}
                    style={{
                      flex: 1,
                      paddingVertical: 12,
                      borderRadius: 12,
                      backgroundColor: moreThirsty ? "#64B5F6" : C.sand,
                      borderWidth: 1.5,
                      borderColor: moreThirsty ? "#64B5F6" : C.peach,
                      alignItems: "center",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: moreThirsty ? "700" : "600",
                        color: moreThirsty ? "#FFF" : C.warmBrown,
                      }}
                    >
                      Yes
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Less Thirsty */}
              <View>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "600",
                    color: C.warmBrown,
                    marginBottom: 10,
                  }}
                >
                  Less thirsty than usual?
                </Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <TouchableOpacity
                    onPress={() => setLessThirsty(false)}
                    style={{
                      flex: 1,
                      paddingVertical: 12,
                      borderRadius: 12,
                      backgroundColor: !lessThirsty ? "#64B5F6" : C.sand,
                      borderWidth: 1.5,
                      borderColor: !lessThirsty ? "#64B5F6" : C.peach,
                      alignItems: "center",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: !lessThirsty ? "700" : "600",
                        color: !lessThirsty ? "#FFF" : C.warmBrown,
                      }}
                    >
                      No
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      setLessThirsty(true);
                      setMoreThirsty(false);
                    }}
                    style={{
                      flex: 1,
                      paddingVertical: 12,
                      borderRadius: 12,
                      backgroundColor: lessThirsty ? "#64B5F6" : C.sand,
                      borderWidth: 1.5,
                      borderColor: lessThirsty ? "#64B5F6" : C.peach,
                      alignItems: "center",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: lessThirsty ? "700" : "600",
                        color: lessThirsty ? "#FFF" : C.warmBrown,
                      }}
                    >
                      Yes
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Notes */}
              <View>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "600",
                    color: C.warmBrown,
                    marginBottom: 8,
                  }}
                >
                  Notes (optional)
                </Text>
                <TextInput
                  value={waterNotes}
                  onChangeText={setWaterNotes}
                  placeholder={t("trackers.foodWater.notesPlaceholder")}
                  placeholderTextColor={C.mutedBrown + "80"}
                  multiline
                  numberOfLines={3}
                  style={{
                    backgroundColor: C.card,
                    borderRadius: 12,
                    padding: 14,
                    fontSize: 14,
                    color: C.warmBrown,
                    borderWidth: 1.5,
                    borderColor: C.peach,
                    minHeight: 80,
                    textAlignVertical: "top",
                  }}
                />
              </View>

              {/* Submit */}
              <TouchableOpacity
                onPress={handleWaterSubmit}
                disabled={logFoodMutation.isPending}
                style={{
                  backgroundColor: logFoodMutation.isPending
                    ? C.mutedBrown
                    : "#64B5F6",
                  borderRadius: 16,
                  paddingVertical: 16,
                  alignItems: "center",
                  marginTop: 8,
                  shadowColor: "#64B5F6",
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.25,
                  shadowRadius: 8,
                  elevation: 4,
                }}
              >
                {logFoodMutation.isPending ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text
                    style={{ fontSize: 16, fontWeight: "800", color: "#FFF" }}
                  >
                    Log Water Intake
                  </Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setStep("type")}
                style={{ alignItems: "center", paddingVertical: 8 }}
              >
                <Text style={{ fontSize: 14, color: C.mutedBrown }}>
                  ← Back
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </KeyboardAwareScrollView>
      </View>
    </Modal>
  );
}
