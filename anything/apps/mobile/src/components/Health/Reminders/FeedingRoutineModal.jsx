import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Modal,
  TextInput,
  Switch,
  Alert,
} from "react-native";
import { X, Plus, Trash2, ChevronDown, ChevronUp } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { ROUTINE_TYPES, ROUTINE_FREQUENCY } from "@/data/routinesData";
import KeyboardAvoidingAnimatedView from "@/components/KeyboardAvoidingAnimatedView";
import TimeField from "@/components/TimeField";

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

const DEFAULT_MEALS = {
  1: [
    {
      name: "Meal",
      time: "12:00",
      frequency: ROUTINE_FREQUENCY.DAILY,
      days: [],
      reminderEnabled: true,
      timeSensitive: true,
      notes: "",
    },
  ],
  2: [
    {
      name: "Breakfast",
      time: "08:00",
      frequency: ROUTINE_FREQUENCY.DAILY,
      days: [],
      reminderEnabled: true,
      timeSensitive: true,
      notes: "",
    },
    {
      name: "Dinner",
      time: "20:00",
      frequency: ROUTINE_FREQUENCY.DAILY,
      days: [],
      reminderEnabled: true,
      timeSensitive: true,
      notes: "",
    },
  ],
  3: [
    {
      name: "Breakfast",
      time: "08:00",
      frequency: ROUTINE_FREQUENCY.DAILY,
      days: [],
      reminderEnabled: true,
      timeSensitive: true,
      notes: "",
    },
    {
      name: "Lunch",
      time: "13:00",
      frequency: ROUTINE_FREQUENCY.DAILY,
      days: [],
      reminderEnabled: true,
      timeSensitive: true,
      notes: "",
    },
    {
      name: "Dinner",
      time: "19:00",
      frequency: ROUTINE_FREQUENCY.DAILY,
      days: [],
      reminderEnabled: true,
      timeSensitive: true,
      notes: "",
    },
  ],
};

export default function FeedingRoutineModal({
  visible,
  onClose,
  onSave,
  editingRoutine,
  petName = "your pet",
}) {
  const { t } = useTranslation();
  const [step, setStep] = useState("count"); // 'count' or 'details'
  const [mealCount, setMealCount] = useState(2);
  const [meals, setMeals] = useState(DEFAULT_MEALS[2]);
  const [expandedMeal, setExpandedMeal] = useState(0); // Track which meal card is expanded

  useEffect(() => {
    if (editingRoutine) {
      setStep("details");
      // Migrate old routines to new structure
      const migratedMeals = (editingRoutine.meals || DEFAULT_MEALS[2]).map(
        (meal) => ({
          name: meal.name || "Meal",
          time: meal.time || "12:00",
          frequency:
            meal.frequency ||
            editingRoutine.frequency ||
            ROUTINE_FREQUENCY.DAILY,
          days: meal.days || editingRoutine.days || [],
          reminderEnabled:
            meal.reminderEnabled ?? editingRoutine.notificationEnabled ?? true,
          timeSensitive:
            meal.timeSensitive ?? editingRoutine.timeSensitive ?? true,
          notes: meal.notes || "",
        }),
      );
      setMeals(migratedMeals);
      setMealCount(migratedMeals.length);
      setExpandedMeal(0);
    } else {
      setStep("count");
      setMealCount(2);
      setMeals(DEFAULT_MEALS[2]);
      setExpandedMeal(0);
    }
  }, [editingRoutine, visible]);

  const handleCountSelect = (count) => {
    setMealCount(count);
    setMeals(DEFAULT_MEALS[count] || DEFAULT_MEALS[2]);
    setStep("details");
    setExpandedMeal(0);
  };

  const handleMealChange = (index, field, value) => {
    const updated = [...meals];
    updated[index] = { ...updated[index], [field]: value };
    setMeals(updated);
  };

  const handleAddMeal = () => {
    const newMeal = {
      id: `meal_${meals.length + 1}`,
      name: "Snack",
      time: "15:00",
      frequency: ROUTINE_FREQUENCY.DAILY,
      days: [],
      reminderEnabled: true,
      timeSensitive: true,
      notes: "",
    };
    setMeals([...meals, newMeal]);
    setMealCount(meals.length + 1);
    setExpandedMeal(meals.length); // Expand the newly added meal
  };

  const handleRemoveMeal = (index) => {
    if (meals.length <= 1) {
      Alert.alert(t("feeding.minMealsTitle"), t("feeding.minMealsBody"));
      return;
    }
    const updated = meals.filter((_, i) => i !== index);
    setMeals(updated);
    setMealCount(updated.length);
    // Adjust expanded meal if needed
    if (expandedMeal >= updated.length) {
      setExpandedMeal(Math.max(0, updated.length - 1));
    }
  };

  const toggleDay = (mealIndex, day) => {
    const meal = meals[mealIndex];
    const currentDays = meal.days || [];
    let newDays;
    if (currentDays.includes(day)) {
      newDays = currentDays.filter((d) => d !== day);
    } else {
      newDays = [...currentDays, day].sort();
    }
    handleMealChange(mealIndex, "days", newDays);
  };

  const handleSave = () => {
    const routine = {
      type: ROUTINE_TYPES.FEEDING,
      petId: editingRoutine?.petId ?? null,
      isActive: true,
      meals,
      times: meals.map((m) => m.time),
      // For backward compatibility with old structure
      frequency: ROUTINE_FREQUENCY.CUSTOM, // Mark as custom since each meal has its own schedule
      days: [],
      notificationEnabled: meals.some((m) => m.reminderEnabled),
      timeSensitive: meals.some((m) => m.timeSensitive),
      notes: meals
        .map((m) => m.notes)
        .filter(Boolean)
        .join("; "),
      title: "Feeding",
      description: `${meals.length} meal${meals.length > 1 ? "s" : ""} per day`,
    };

    if (editingRoutine) {
      routine.id = editingRoutine.id;
    }

    onSave(routine);
    onClose();
  };

  // Step 1: Meal Count Selection
  if (step === "count" && !editingRoutine) {
    return (
      <Modal visible={visible} animationType="slide" transparent={true}>
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            justifyContent: "flex-end",
          }}
        >
          <View
            style={{
              backgroundColor: C.cream,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              paddingBottom: 40,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                padding: 20,
                borderBottomWidth: 1,
                borderBottomColor: C.peach,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 20,
                    fontWeight: "800",
                    color: C.warmBrown,
                    marginBottom: 4,
                  }}
                >
                  🍽️ Feeding Routine
                </Text>
                <Text style={{ fontSize: 14, color: C.mutedBrown }}>
                  How many meals does {petName} eat per day?
                </Text>
              </View>
              <TouchableOpacity
                onPress={onClose}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: C.sand,
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <X size={20} color={C.warmBrown} />
              </TouchableOpacity>
            </View>

            <View style={{ padding: 20, gap: 12 }}>
              {[1, 2, 3].map((count) => (
                <TouchableOpacity
                  key={count}
                  onPress={() => handleCountSelect(count)}
                  style={{
                    backgroundColor: C.card,
                    borderRadius: 16,
                    padding: 20,
                    borderWidth: 1.5,
                    borderColor: C.peach,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 18,
                      fontWeight: "700",
                      color: C.warmBrown,
                      textAlign: "center",
                    }}
                  >
                    {count} meal{count > 1 ? "s" : ""} per day
                  </Text>
                </TouchableOpacity>
              ))}

              <TouchableOpacity
                onPress={() => {
                  setMealCount(2);
                  setMeals(DEFAULT_MEALS[2]);
                  setStep("details");
                }}
                style={{
                  backgroundColor: C.sand,
                  borderRadius: 16,
                  padding: 20,
                  borderWidth: 1.5,
                  borderColor: C.peach,
                }}
              >
                <Text
                  style={{
                    fontSize: 18,
                    fontWeight: "700",
                    color: C.mutedBrown,
                    textAlign: "center",
                  }}
                >
                  Custom
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  }

  // Step 2: Details with meal-specific schedules
  return (
    <Modal visible={visible} animationType="slide" transparent={true}>
      <KeyboardAvoidingAnimatedView
        style={{ flex: 1, backgroundColor: C.cream }}
        behavior="padding"
      >
        {/* Header */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            padding: 20,
            paddingTop: 60,
            borderBottomWidth: 1,
            borderBottomColor: C.peach,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: 20,
                fontWeight: "800",
                color: C.warmBrown,
                marginBottom: 4,
              }}
            >
              🍽️ {editingRoutine ? "Edit" : "Create"} Feeding Routine
            </Text>
            <Text style={{ fontSize: 14, color: C.mutedBrown }}>
              Set meal-specific schedules
            </Text>
          </View>
          <TouchableOpacity
            onPress={onClose}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: C.sand,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <X size={20} color={C.warmBrown} />
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={{ padding: 20, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Meals Section */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 12,
            }}
          >
            <Text
              style={{
                fontSize: 15,
                fontWeight: "700",
                color: C.warmBrown,
              }}
            >
              Meals
            </Text>
            <Text style={{ fontSize: 13, color: C.mutedBrown }}>
              Tap to expand
            </Text>
          </View>

          {/* Meal Cards */}
          {meals.map((meal, index) => {
            const isExpanded = expandedMeal === index;
            return (
              <View
                key={index}
                style={{
                  backgroundColor: C.card,
                  borderRadius: 16,
                  padding: 16,
                  borderWidth: 1.5,
                  borderColor: isExpanded ? C.coral : C.peach,
                  marginBottom: 12,
                }}
              >
                {/* Meal Header - Always Visible */}
                <TouchableOpacity
                  onPress={() => setExpandedMeal(isExpanded ? -1 : index)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontSize: 16,
                        fontWeight: "700",
                        color: C.warmBrown,
                        marginBottom: 2,
                      }}
                    >
                      {meal.name || `Meal ${index + 1}`}
                    </Text>
                    <Text style={{ fontSize: 13, color: C.mutedBrown }}>
                      {meal.time} •{" "}
                      {meal.frequency === ROUTINE_FREQUENCY.DAILY
                        ? "Every day"
                        : meal.frequency === ROUTINE_FREQUENCY.WEEKDAYS
                          ? "Weekdays"
                          : meal.frequency === ROUTINE_FREQUENCY.WEEKENDS
                            ? "Weekends"
                            : "Custom days"}
                    </Text>
                  </View>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    {meals.length > 1 && (
                      <TouchableOpacity
                        onPress={() => handleRemoveMeal(index)}
                        style={{ padding: 4 }}
                      >
                        <Trash2 size={18} color={C.coral} />
                      </TouchableOpacity>
                    )}
                    {isExpanded ? (
                      <ChevronUp size={20} color={C.mutedBrown} />
                    ) : (
                      <ChevronDown size={20} color={C.mutedBrown} />
                    )}
                  </View>
                </TouchableOpacity>

                {/* Expanded Content */}
                {isExpanded && (
                  <View style={{ marginTop: 16 }}>
                    {/* Meal Name */}
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: "600",
                        color: C.mutedBrown,
                        marginBottom: 6,
                      }}
                    >
                      Meal Name
                    </Text>
                    <TextInput
                      value={meal.name}
                      onChangeText={(text) =>
                        handleMealChange(index, "name", text)
                      }
                      placeholder="e.g., Breakfast"
                      placeholderTextColor={C.mutedBrown}
                      style={{
                        backgroundColor: C.sand,
                        borderRadius: 12,
                        padding: 12,
                        fontSize: 15,
                        color: C.warmBrown,
                        marginBottom: 12,
                      }}
                    />

                    {/* Meal Time */}
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: "600",
                        color: C.mutedBrown,
                        marginBottom: 6,
                      }}
                    >
                      Time
                    </Text>
                    <View style={{ marginBottom: 16 }}>
                      <TimeField
                        value={meal.time}
                        onChange={(time) =>
                          handleMealChange(index, "time", time)
                        }
                        fieldStyle={{
                          backgroundColor: C.sand,
                          borderWidth: 0,
                        }}
                      />
                    </View>

                    {/* Repeat Frequency */}
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: "600",
                        color: C.mutedBrown,
                        marginBottom: 8,
                      }}
                    >
                      Repeat
                    </Text>
                    <View style={{ gap: 8, marginBottom: 12 }}>
                      {[
                        { value: ROUTINE_FREQUENCY.DAILY, label: "Every day" },
                        {
                          value: ROUTINE_FREQUENCY.WEEKDAYS,
                          label: "Weekdays",
                        },
                        {
                          value: ROUTINE_FREQUENCY.WEEKENDS,
                          label: "Weekends",
                        },
                        {
                          value: ROUTINE_FREQUENCY.CUSTOM,
                          label: "Custom days",
                        },
                      ].map((option) => (
                        <TouchableOpacity
                          key={option.value}
                          onPress={() =>
                            handleMealChange(index, "frequency", option.value)
                          }
                          style={{
                            backgroundColor:
                              meal.frequency === option.value
                                ? C.sage + "20"
                                : C.sand,
                            borderRadius: 12,
                            padding: 12,
                            borderWidth: 1.5,
                            borderColor:
                              meal.frequency === option.value
                                ? C.sage
                                : C.peach,
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 14,
                              fontWeight:
                                meal.frequency === option.value ? "700" : "600",
                              color:
                                meal.frequency === option.value
                                  ? C.sage
                                  : C.warmBrown,
                            }}
                          >
                            {option.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    {/* Custom Days Selection */}
                    {meal.frequency === ROUTINE_FREQUENCY.CUSTOM && (
                      <View style={{ marginBottom: 16 }}>
                        <Text
                          style={{
                            fontSize: 12,
                            fontWeight: "600",
                            color: C.mutedBrown,
                            marginBottom: 8,
                          }}
                        >
                          Select Days
                        </Text>
                        <View
                          style={{
                            flexDirection: "row",
                            flexWrap: "wrap",
                            gap: 8,
                          }}
                        >
                          {[
                            "Mon",
                            "Tue",
                            "Wed",
                            "Thu",
                            "Fri",
                            "Sat",
                            "Sun",
                          ].map((day, dayIndex) => {
                            const isSelected = (meal.days || []).includes(
                              dayIndex,
                            );
                            return (
                              <TouchableOpacity
                                key={dayIndex}
                                onPress={() => toggleDay(index, dayIndex)}
                                style={{
                                  width: 45,
                                  height: 45,
                                  borderRadius: 23,
                                  backgroundColor: isSelected ? C.sage : C.sand,
                                  justifyContent: "center",
                                  alignItems: "center",
                                  borderWidth: 1,
                                  borderColor: isSelected ? C.sage : C.peach,
                                }}
                              >
                                <Text
                                  style={{
                                    fontSize: 11,
                                    fontWeight: "700",
                                    color: isSelected ? "#FFF" : C.mutedBrown,
                                  }}
                                >
                                  {day}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>
                    )}

                    {/* Reminder Settings */}
                    <View
                      style={{
                        backgroundColor: C.sand,
                        borderRadius: 12,
                        padding: 12,
                        marginBottom: 12,
                      }}
                    >
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "space-between",
                          marginBottom: 10,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 14,
                            fontWeight: "600",
                            color: C.warmBrown,
                          }}
                        >
                          Reminder enabled
                        </Text>
                        <Switch
                          value={meal.reminderEnabled}
                          onValueChange={(value) =>
                            handleMealChange(index, "reminderEnabled", value)
                          }
                          trackColor={{ false: C.peach, true: C.sage + "60" }}
                          thumbColor={meal.reminderEnabled ? C.sage : C.peach}
                        />
                      </View>
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "space-between",
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 14,
                            fontWeight: "600",
                            color: C.warmBrown,
                          }}
                        >
                          Time-sensitive
                        </Text>
                        <Switch
                          value={meal.timeSensitive}
                          onValueChange={(value) =>
                            handleMealChange(index, "timeSensitive", value)
                          }
                          trackColor={{ false: C.peach, true: C.coral + "60" }}
                          thumbColor={meal.timeSensitive ? C.coral : C.peach}
                        />
                      </View>
                    </View>

                    {/* Notes */}
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: "600",
                        color: C.mutedBrown,
                        marginBottom: 6,
                      }}
                    >
                      Notes (optional)
                    </Text>
                    <TextInput
                      value={meal.notes}
                      onChangeText={(text) =>
                        handleMealChange(index, "notes", text)
                      }
                      placeholder="e.g., Morning kibble with supplement"
                      placeholderTextColor={C.mutedBrown}
                      multiline
                      numberOfLines={2}
                      style={{
                        backgroundColor: C.sand,
                        borderRadius: 12,
                        padding: 12,
                        fontSize: 14,
                        color: C.warmBrown,
                        textAlignVertical: "top",
                        minHeight: 60,
                      }}
                    />
                  </View>
                )}
              </View>
            );
          })}

          {/* Add Meal Button */}
          <TouchableOpacity
            onPress={handleAddMeal}
            style={{
              backgroundColor: C.sand,
              borderRadius: 14,
              paddingVertical: 14,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              borderWidth: 1,
              borderColor: C.peach,
              marginBottom: 24,
            }}
          >
            <Plus size={18} color={C.mutedBrown} />
            <Text
              style={{ fontSize: 15, fontWeight: "600", color: C.mutedBrown }}
            >
              Add Another Meal
            </Text>
          </TouchableOpacity>
        </ScrollView>

        {/* Save Button - Fixed at bottom */}
        <View
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            padding: 20,
            borderTopWidth: 1,
            borderTopColor: C.peach,
            backgroundColor: C.cream,
          }}
        >
          <TouchableOpacity
            onPress={handleSave}
            style={{
              backgroundColor: C.coral,
              borderRadius: 14,
              paddingVertical: 16,
              alignItems: "center",
            }}
          >
            <Text style={{ fontSize: 16, fontWeight: "700", color: "#FFF" }}>
              {editingRoutine ? "Save Changes" : "Create Routine"}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingAnimatedView>
    </Modal>
  );
}
