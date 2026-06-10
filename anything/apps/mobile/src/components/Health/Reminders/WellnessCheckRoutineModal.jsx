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
  Pressable,
} from "react-native";
import { X, Plus, Trash2, ChevronDown, ChevronUp } from "lucide-react-native";
import {
  ROUTINE_TYPES,
  ROUTINE_FREQUENCY,
  WELLNESS_CHECK_ITEMS,
} from "@/data/routinesData";
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

const WELLNESS_OPTIONS = [
  { value: WELLNESS_CHECK_ITEMS.GENERAL, label: "General check", icon: "✅" },
  { value: WELLNESS_CHECK_ITEMS.WEIGHT, label: "Weight", icon: "⚖️" },
  {
    value: WELLNESS_CHECK_ITEMS.BODY_CONDITION,
    label: "Body condition",
    icon: "🫀",
  },
  { value: WELLNESS_CHECK_ITEMS.MOBILITY, label: "Mobility", icon: "🚶" },
  {
    value: WELLNESS_CHECK_ITEMS.MOOD_ENERGY,
    label: "Mood / Energy",
    icon: "😊",
  },
  {
    value: WELLNESS_CHECK_ITEMS.SKIN_COAT,
    label: "Skin / Coat",
    icon: "🧴",
  },
  {
    value: WELLNESS_CHECK_ITEMS.APPETITE_HYDRATION,
    label: "Appetite / Hydration",
    icon: "💧",
  },
  { value: WELLNESS_CHECK_ITEMS.CUSTOM, label: "Custom", icon: "📋" },
];

// Map for type picker - using the same data
const CHECK_TYPES = WELLNESS_OPTIONS.map((opt) => ({
  id: opt.value,
  label: opt.label,
  icon: opt.icon,
}));

export default function WellnessCheckRoutineModal({
  visible,
  onClose,
  onSave,
  editingRoutine,
}) {
  const [items, setItems] = useState([]);
  const [expandedItemId, setExpandedItemId] = useState(null);
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (visible) {
      setError(null);
      // Load from wellness_check_schedule (JSONB field from database)
      if (
        editingRoutine &&
        editingRoutine.wellness_check_schedule &&
        Array.isArray(editingRoutine.wellness_check_schedule)
      ) {
        // Filter out deleted/inactive items
        const activeItems = editingRoutine.wellness_check_schedule.filter(
          (item) => item.active !== false && item.deleted !== true,
        );

        const loadedItems = activeItems.map((item) => ({
          id:
            item.id ||
            `wellness_${item.checkType}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          checkType: item.checkType || WELLNESS_CHECK_ITEMS.GENERAL,
          customName: item.name || "",
          frequency: item.frequency || ROUTINE_FREQUENCY.WEEKLY,
          preferredDay: item.preferredDay ?? 6,
          preferredTime: item.preferredTime || "09:00",
          reminderEnabled: item.reminderEnabled ?? true,
          timeSensitive: item.timeSensitive ?? false,
          notes: item.notes || "",
          weightUnit: item.unit || "lbs",
          areasToInclude: item.areasToInclude || [],
          observations: item.observations || [],
          description: item.description || "",
        }));
        setItems(loadedItems);
        setExpandedItemId(loadedItems.length > 0 ? loadedItems[0].id : null);
      } else if (
        editingRoutine &&
        editingRoutine.wellnessCheckItems &&
        Array.isArray(editingRoutine.wellnessCheckItems)
      ) {
        // Legacy format support: wellnessCheckItems (old structure)
        const firstItem = editingRoutine.wellnessCheckItems[0];

        if (typeof firstItem === "object" && firstItem.checkType) {
          // Filter out deleted/inactive items
          const activeItems = editingRoutine.wellnessCheckItems.filter(
            (item) => item.active !== false && item.deleted !== true,
          );

          // New structure - load as is
          const loadedItems = activeItems.map((item) => ({
            id:
              item.id ||
              `wellness_${item.checkType}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            checkType: item.checkType || WELLNESS_CHECK_ITEMS.GENERAL,
            customName: item.customName || "",
            frequency: item.frequency || ROUTINE_FREQUENCY.WEEKLY,
            preferredDay: item.preferredDay ?? 6,
            preferredTime: item.preferredTime || "18:00",
            reminderEnabled: item.reminderEnabled ?? true,
            timeSensitive: item.timeSensitive ?? false,
            notes: item.notes || "",
            weightUnit: item.weightUnit || "lbs",
            areasToInclude: item.areasToInclude || [],
            observations: item.observations || [],
            description: item.description || "",
          }));
          setItems(loadedItems);
          setExpandedItemId(loadedItems.length > 0 ? loadedItems[0].id : null);
        } else if (typeof firstItem === "string") {
          // Old structure (array of check type strings) - migrate
          const migratedItems = editingRoutine.wellnessCheckItems.map(
            (checkType, idx) => ({
              id: `wellness_${checkType}_${Date.now()}_${idx}`,
              checkType,
              customName: "",
              frequency: editingRoutine.frequency || ROUTINE_FREQUENCY.WEEKLY,
              preferredDay: editingRoutine.preferredDay ?? 6,
              preferredTime: editingRoutine.times?.[0] || "18:00",
              reminderEnabled: editingRoutine.notificationEnabled ?? true,
              timeSensitive: editingRoutine.timeSensitive ?? false,
              notes: editingRoutine.notes || "",
              weightUnit: "lbs",
              areasToInclude: [],
              observations: [],
              description: "",
            }),
          );
          setItems(migratedItems);
          setExpandedItemId(
            migratedItems.length > 0 ? migratedItems[0].id : null,
          );
        } else {
          // Empty or unknown - start fresh
          setItems([]);
          setExpandedItemId(null);
        }
      } else {
        // New routine - start empty
        setItems([]);
        setExpandedItemId(null);
      }
    }
  }, [visible, editingRoutine]);

  const handleAddCheckType = (checkType) => {
    try {
      setError(null);
      console.log(`[WellnessCheck] Adding check type: ${checkType}`);

      // Check for duplicates (except Custom)
      if (checkType !== WELLNESS_CHECK_ITEMS.CUSTOM) {
        const exists = items.find((item) => item.checkType === checkType);
        if (exists) {
          console.log(
            `[WellnessCheck] Duplicate check type detected: ${checkType}`,
          );
          Alert.alert(
            "Already Added",
            "You already added this check.\nYou can edit its schedule or delete it first.",
          );
          setShowTypePicker(false);
          return;
        }
      }

      const newId = `wellness_${checkType}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const newItem = {
        id: newId,
        checkType,
        customName: checkType === WELLNESS_CHECK_ITEMS.CUSTOM ? "" : "",
        frequency: ROUTINE_FREQUENCY.WEEKLY,
        preferredDay: 6,
        preferredTime: "09:00",
        reminderEnabled: true,
        timeSensitive: false,
        notes: "",
        weightUnit: "lbs",
        areasToInclude: [],
        observations: [],
        description: "",
      };

      setItems((prev) => {
        const safePrev = Array.isArray(prev) ? prev : [];
        console.log(
          `[WellnessCheck] Current items count: ${safePrev.length}, adding new item with id: ${newId}`,
        );
        return [...safePrev, newItem];
      });
      setExpandedItemId(newId);
      setShowTypePicker(false);
      console.log(
        `[WellnessCheck] Successfully added check item: ${checkType}`,
      );
    } catch (err) {
      console.error("[WellnessCheck] Error adding check item:", err);
      setError(`Could not add check item: ${err.message}`);
      setShowTypePicker(false);
    }
  };

  const handleCloseTypePicker = () => {
    console.log("[WellnessCheck] Closing type picker");
    setShowTypePicker(false);
  };

  const handleSelectCheckType = (checkType) => {
    console.log("[WellnessCheck] Selecting check type:", checkType);
    handleAddCheckType(checkType);
  };

  const handleItemChange = (itemId, field, value) => {
    setItems((prev) => {
      const safePrev = Array.isArray(prev) ? prev : [];
      return safePrev.map((item) =>
        item.id === itemId ? { ...item, [field]: value } : item,
      );
    });
  };

  const handleRemoveItem = (itemId) => {
    // Check if this is the last item
    if (items.length === 1) {
      // Last item - delete full routine or just clear for new routine
      if (editingRoutine?.id) {
        // Existing routine - show delete routine confirmation
        Alert.alert(
          "Delete Wellness Check Routine?",
          "This is the last wellness check. Deleting it will remove future wellness reminders. Past wellness history will stay saved.",
          [
            {
              text: "Cancel",
              style: "cancel",
            },
            {
              text: "Delete routine",
              style: "destructive",
              onPress: async () => {
                try {
                  const response = await fetch(
                    `/api/routines?id=${editingRoutine.id}`,
                    { method: "DELETE" },
                  );

                  if (!response.ok) {
                    throw new Error("Failed to delete routine");
                  }

                  Alert.alert("Routine deleted");
                  setItems([]);
                  onClose();
                } catch (error) {
                  console.error(
                    "[WellnessCheck] Error deleting routine:",
                    error,
                  );
                  Alert.alert(
                    "Error",
                    "Could not delete routine. Please try again.",
                  );
                }
              },
            },
          ],
        );
      } else {
        // New unsaved routine - just clear items
        setItems([]);
        setExpandedItemId(null);
      }
    } else {
      // Multiple items - show remove check confirmation
      Alert.alert(
        "Remove this check?",
        "This will stop future reminders for this check. Past wellness history will stay saved.",
        [
          {
            text: "Cancel",
            style: "cancel",
          },
          {
            text: "Remove check",
            style: "destructive",
            onPress: async () => {
              try {
                // Remove item from local array
                const updatedItems = items.filter((item) => item.id !== itemId);

                // If editing existing routine, save to database immediately
                if (editingRoutine?.id) {
                  const wellnessCheckSchedule = updatedItems.map(
                    (item, idx) => ({
                      id:
                        item.id ||
                        `wellness_${item.checkType}_${Date.now()}_${idx}`,
                      checkType: item.checkType,
                      name: item.customName || null,
                      frequency: item.frequency,
                      preferredDay: item.preferredDay,
                      preferredTime: item.preferredTime,
                      areasToInclude: item.areasToInclude || null,
                      observations: item.observations || null,
                      unit: item.weightUnit || null,
                      description: item.description || null,
                      reminderEnabled: item.reminderEnabled,
                      timeSensitive: item.timeSensitive,
                      notes: item.notes,
                      active: true,
                    }),
                  );

                  const response = await fetch("/api/routines", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      id: parseInt(editingRoutine.id),
                      wellnessCheckSchedule,
                    }),
                  });

                  if (!response.ok) {
                    throw new Error("Failed to update routine");
                  }

                  // Update local state
                  setItems(updatedItems);
                  if (expandedItemId === itemId) {
                    setExpandedItemId(null);
                  }

                  // Notify parent to update its state
                  const updatedRoutine = {
                    id: editingRoutine.id,
                    type: ROUTINE_TYPES.WELLNESS_CHECK,
                    petId: editingRoutine.petId,
                    isActive: true,
                    wellnessCheckSchedule: wellnessCheckSchedule,
                    frequency:
                      updatedItems.length > 0
                        ? updatedItems[0].frequency
                        : ROUTINE_FREQUENCY.WEEKLY,
                    preferredDay:
                      updatedItems.length > 0
                        ? updatedItems[0].preferredDay
                        : 6,
                    times:
                      updatedItems.length > 0
                        ? [updatedItems[0].preferredTime]
                        : [],
                    days:
                      updatedItems.length > 0
                        ? [updatedItems[0].preferredDay]
                        : [],
                    notificationEnabled: updatedItems.some(
                      (item) => item.reminderEnabled,
                    ),
                    timeSensitive: updatedItems.some(
                      (item) => item.timeSensitive,
                    ),
                    notes: updatedItems
                      .map((item) => item.notes)
                      .filter(Boolean)
                      .join("; "),
                    title: "Wellness Check",
                    description: `${updatedItems.length} check${updatedItems.length > 1 ? "s" : ""}`,
                  };

                  if (onSave) {
                    onSave(updatedRoutine);
                  }

                  Alert.alert("Check removed");
                } else {
                  // New unsaved routine - just update local state
                  setItems(updatedItems);
                  if (expandedItemId === itemId) {
                    setExpandedItemId(null);
                  }
                }
              } catch (error) {
                console.error("[WellnessCheck] Error removing check:", error);
                Alert.alert(
                  "Error",
                  "Could not remove check. Please try again.",
                );
              }
            },
          },
        ],
      );
    }
  };

  const handleSave = () => {
    if (items.length === 0) {
      Alert.alert("No Items", "Add at least one wellness check item.");
      return;
    }

    // Validate custom items have names
    const invalidCustom = items.find(
      (item) =>
        item.checkType === WELLNESS_CHECK_ITEMS.CUSTOM &&
        !item.customName?.trim(),
    );
    if (invalidCustom) {
      Alert.alert("Missing Name", "Please enter a name for your custom check.");
      return;
    }

    // Structure wellness check items for persistence
    const wellnessCheckSchedule = items.map((item, idx) => ({
      id: item.id || `wellness_${item.checkType}_${Date.now()}_${idx}`,
      checkType: item.checkType,
      name: item.customName || null,
      frequency: item.frequency,
      preferredDay: item.preferredDay,
      preferredTime: item.preferredTime,
      areasToInclude: item.areasToInclude || null,
      observations: item.observations || null,
      unit: item.weightUnit || null,
      description: item.description || null,
      reminderEnabled: item.reminderEnabled,
      timeSensitive: item.timeSensitive,
      notes: item.notes,
      active: true,
    }));

    const routine = {
      type: ROUTINE_TYPES.WELLNESS_CHECK,
      petId: editingRoutine?.petId || "phoebe",
      isActive: true,
      wellnessCheckSchedule,
      // Legacy fields for backward compatibility
      frequency:
        items.length > 0 ? items[0].frequency : ROUTINE_FREQUENCY.WEEKLY,
      preferredDay: items.length > 0 ? items[0].preferredDay : 6,
      times: items.length > 0 ? [items[0].preferredTime] : [],
      days: items.length > 0 ? [items[0].preferredDay] : [],
      notificationEnabled: items.some((item) => item.reminderEnabled),
      timeSensitive: items.some((item) => item.timeSensitive),
      notes: items
        .map((item) => item.notes)
        .filter(Boolean)
        .join("; "),
      title: "Wellness Check",
      description: `${items.length} check${items.length > 1 ? "s" : ""}`,
    };

    if (editingRoutine?.id) routine.id = editingRoutine.id;
    onSave(routine);
    onClose();
  };

  const getItemLabel = (item) => {
    if (item.checkType === WELLNESS_CHECK_ITEMS.CUSTOM) {
      return item.customName || "Custom check";
    }
    const option = WELLNESS_OPTIONS.find((o) => o.value === item.checkType);
    return option?.label || "Check";
  };

  const getItemIcon = (item) => {
    const option = WELLNESS_OPTIONS.find((o) => o.value === item.checkType);
    return option?.icon || "📋";
  };

  // Main Modal - Wellness Check Routine Builder
  return (
    <Modal visible={visible} animationType="slide">
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
              ⚖️ {editingRoutine ? "Edit" : "Create"} Wellness Check
            </Text>
            <Text style={{ fontSize: 14, color: C.mutedBrown }}>
              Track health changes over time
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
          {items.length === 0 ? (
            // Empty State
            <View
              style={{
                backgroundColor: C.card,
                borderRadius: 16,
                padding: 24,
                borderWidth: 1.5,
                borderColor: C.peach,
                alignItems: "center",
                marginBottom: 20,
              }}
            >
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: "700",
                  color: C.warmBrown,
                  marginBottom: 8,
                  textAlign: "center",
                }}
              >
                No wellness checks yet
              </Text>
              <Text
                style={{
                  fontSize: 14,
                  color: C.mutedBrown,
                  textAlign: "center",
                  lineHeight: 20,
                }}
              >
                Add weight, body condition, mobility, mood, or general checks to
                keep track of changes.
              </Text>
            </View>
          ) : (
            <>
              {/* Items Header */}
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
                  Check Items
                </Text>
                <Text style={{ fontSize: 13, color: C.mutedBrown }}>
                  Tap to expand
                </Text>
              </View>

              {/* Item Cards */}
              {items.map((item, index) => {
                const isExpanded = expandedItemId === item.id;
                return (
                  <View
                    key={item.id || `item-${index}`}
                    style={{
                      backgroundColor: C.card,
                      borderRadius: 16,
                      padding: 16,
                      borderWidth: 1.5,
                      borderColor: isExpanded ? "#F4A460" : C.peach,
                      marginBottom: 12,
                    }}
                  >
                    {/* Item Header - Always Visible */}
                    <TouchableOpacity
                      onPress={() =>
                        setExpandedItemId(isExpanded ? null : item.id)
                      }
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          flex: 1,
                        }}
                      >
                        <Text style={{ fontSize: 24, marginRight: 10 }}>
                          {getItemIcon(item)}
                        </Text>
                        <View style={{ flex: 1 }}>
                          <Text
                            style={{
                              fontSize: 16,
                              fontWeight: "700",
                              color: C.warmBrown,
                              marginBottom: 2,
                            }}
                          >
                            {getItemLabel(item)}
                          </Text>
                          <Text style={{ fontSize: 13, color: C.mutedBrown }}>
                            {item.preferredTime} •{" "}
                            {item.frequency === ROUTINE_FREQUENCY.DAILY
                              ? "Daily"
                              : item.frequency === ROUTINE_FREQUENCY.WEEKLY
                                ? "Weekly"
                                : item.frequency === ROUTINE_FREQUENCY.BIWEEKLY
                                  ? "Every 2 weeks"
                                  : "Monthly"}
                          </Text>
                        </View>
                      </View>
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <TouchableOpacity
                          onPress={() => handleRemoveItem(item.id)}
                          style={{ padding: 4 }}
                        >
                          <Trash2 size={18} color={C.coral} />
                        </TouchableOpacity>
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
                        {/* Custom Name (for Custom check type only) */}
                        {item.checkType === WELLNESS_CHECK_ITEMS.CUSTOM && (
                          <>
                            <Text
                              style={{
                                fontSize: 12,
                                fontWeight: "600",
                                color: C.mutedBrown,
                                marginBottom: 6,
                              }}
                            >
                              Check Name
                            </Text>
                            <TextInput
                              value={item.customName}
                              onChangeText={(text) =>
                                handleItemChange(item.id, "customName", text)
                              }
                              placeholder="e.g., Allergy check"
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
                          </>
                        )}

                        {/* Frequency */}
                        <Text
                          style={{
                            fontSize: 12,
                            fontWeight: "600",
                            color: C.mutedBrown,
                            marginBottom: 8,
                          }}
                        >
                          Frequency
                        </Text>
                        <View style={{ gap: 8, marginBottom: 12 }}>
                          {[
                            {
                              value: ROUTINE_FREQUENCY.DAILY,
                              label: "Daily",
                            },
                            {
                              value: ROUTINE_FREQUENCY.WEEKLY,
                              label: "Weekly",
                            },
                            {
                              value: ROUTINE_FREQUENCY.BIWEEKLY,
                              label: "Every 2 weeks",
                            },
                            {
                              value: ROUTINE_FREQUENCY.MONTHLY,
                              label: "Monthly",
                            },
                          ].map((option) => (
                            <TouchableOpacity
                              key={option.value}
                              onPress={() =>
                                handleItemChange(
                                  item.id,
                                  "frequency",
                                  option.value,
                                )
                              }
                              style={{
                                backgroundColor:
                                  item.frequency === option.value
                                    ? "#F4A460" + "20"
                                    : C.sand,
                                borderRadius: 12,
                                padding: 12,
                                borderWidth: 1.5,
                                borderColor:
                                  item.frequency === option.value
                                    ? "#F4A460"
                                    : C.peach,
                              }}
                            >
                              <Text
                                style={{
                                  fontSize: 14,
                                  fontWeight:
                                    item.frequency === option.value
                                      ? "700"
                                      : "600",
                                  color:
                                    item.frequency === option.value
                                      ? "#F4A460"
                                      : C.warmBrown,
                                }}
                              >
                                {option.label}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>

                        {/* Preferred Day (if weekly/biweekly) */}
                        {(item.frequency === ROUTINE_FREQUENCY.WEEKLY ||
                          item.frequency === ROUTINE_FREQUENCY.BIWEEKLY) && (
                          <>
                            <Text
                              style={{
                                fontSize: 12,
                                fontWeight: "600",
                                color: C.mutedBrown,
                                marginBottom: 8,
                              }}
                            >
                              Preferred Day
                            </Text>
                            <View
                              style={{
                                flexDirection: "row",
                                flexWrap: "wrap",
                                gap: 8,
                                marginBottom: 12,
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
                                const isSelected =
                                  item.preferredDay === dayIndex;
                                return (
                                  <TouchableOpacity
                                    key={dayIndex}
                                    onPress={() =>
                                      handleItemChange(
                                        item.id,
                                        "preferredDay",
                                        dayIndex,
                                      )
                                    }
                                    style={{
                                      width: 45,
                                      height: 45,
                                      borderRadius: 23,
                                      backgroundColor: isSelected
                                        ? "#F4A460"
                                        : C.sand,
                                      justifyContent: "center",
                                      alignItems: "center",
                                      borderWidth: 1,
                                      borderColor: isSelected
                                        ? "#F4A460"
                                        : C.peach,
                                    }}
                                  >
                                    <Text
                                      style={{
                                        fontSize: 11,
                                        fontWeight: "700",
                                        color: isSelected
                                          ? "#FFF"
                                          : C.mutedBrown,
                                      }}
                                    >
                                      {day}
                                    </Text>
                                  </TouchableOpacity>
                                );
                              })}
                            </View>
                          </>
                        )}

                        {/* Preferred Time */}
                        <Text
                          style={{
                            fontSize: 12,
                            fontWeight: "600",
                            color: C.mutedBrown,
                            marginBottom: 6,
                          }}
                        >
                          Preferred Time
                        </Text>
                        <View style={{ marginBottom: 12 }}>
                          <TimeField
                            value={item.preferredTime}
                            onChange={(time) =>
                              handleItemChange(item.id, "preferredTime", time)
                            }
                            fieldStyle={{
                              backgroundColor: C.sand,
                              borderWidth: 0,
                            }}
                          />
                        </View>

                        {/* Weight Unit (for Weight check only) */}
                        {item.checkType === WELLNESS_CHECK_ITEMS.WEIGHT && (
                          <>
                            <Text
                              style={{
                                fontSize: 12,
                                fontWeight: "600",
                                color: C.mutedBrown,
                                marginBottom: 8,
                              }}
                            >
                              Unit
                            </Text>
                            <View
                              style={{
                                flexDirection: "row",
                                gap: 8,
                                marginBottom: 12,
                              }}
                            >
                              {["lbs", "kg"].map((unit) => (
                                <TouchableOpacity
                                  key={unit}
                                  onPress={() =>
                                    handleItemChange(
                                      item.id,
                                      "weightUnit",
                                      unit,
                                    )
                                  }
                                  style={{
                                    flex: 1,
                                    backgroundColor:
                                      item.weightUnit === unit
                                        ? "#F4A460" + "20"
                                        : C.sand,
                                    borderRadius: 12,
                                    padding: 12,
                                    borderWidth: 1.5,
                                    borderColor:
                                      item.weightUnit === unit
                                        ? "#F4A460"
                                        : C.peach,
                                    alignItems: "center",
                                  }}
                                >
                                  <Text
                                    style={{
                                      fontSize: 14,
                                      fontWeight:
                                        item.weightUnit === unit
                                          ? "700"
                                          : "600",
                                      color:
                                        item.weightUnit === unit
                                          ? "#F4A460"
                                          : C.warmBrown,
                                    }}
                                  >
                                    {unit}
                                  </Text>
                                </TouchableOpacity>
                              ))}
                            </View>
                          </>
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
                              value={item.reminderEnabled}
                              onValueChange={(value) =>
                                handleItemChange(
                                  item.id,
                                  "reminderEnabled",
                                  value,
                                )
                              }
                              trackColor={{
                                false: C.peach,
                                true: C.sage + "60",
                              }}
                              thumbColor={
                                item.reminderEnabled ? C.sage : C.peach
                              }
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
                              value={item.timeSensitive}
                              onValueChange={(value) =>
                                handleItemChange(
                                  item.id,
                                  "timeSensitive",
                                  value,
                                )
                              }
                              trackColor={{
                                false: C.peach,
                                true: C.coral + "60",
                              }}
                              thumbColor={
                                item.timeSensitive ? C.coral : C.peach
                              }
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
                          value={item.notes}
                          onChangeText={(text) =>
                            handleItemChange(item.id, "notes", text)
                          }
                          placeholder="What to look for..."
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
            </>
          )}

          {/* Add Check Item Button */}
          <TouchableOpacity
            onPress={() => {
              console.log("[WellnessCheck] Add check item pressed");
              setShowTypePicker(true);
            }}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: C.card,
              borderRadius: 14,
              padding: 16,
              borderWidth: 1.5,
              borderColor: C.peach,
              borderStyle: "dashed",
            }}
          >
            <Plus size={20} color={C.coral} strokeWidth={2.5} />
            <Text
              style={{
                fontSize: 15,
                fontWeight: "700",
                color: C.coral,
                marginLeft: 8,
              }}
            >
              Add check item
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
            paddingBottom: 30,
            borderTopWidth: 1,
            borderTopColor: C.peach,
            backgroundColor: C.cream,
          }}
        >
          <TouchableOpacity
            onPress={handleSave}
            style={{
              backgroundColor: "#F4A460",
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

        {/* Type Picker Overlay - renders inside main modal */}
        {showTypePicker && (
          <View
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(0,0,0,0.45)",
              justifyContent: "center",
              alignItems: "center",
              padding: 24,
              zIndex: 9999,
            }}
          >
            <View
              style={{
                width: "100%",
                backgroundColor: "#FFF8F0",
                borderRadius: 28,
                padding: 24,
                maxHeight: "80%",
              }}
            >
              <Text
                style={{
                  fontSize: 28,
                  fontWeight: "800",
                  color: "#321E17",
                  marginBottom: 8,
                }}
              >
                Add check item
              </Text>
              <Text
                style={{
                  fontSize: 16,
                  color: "#8A6F5B",
                  marginBottom: 20,
                }}
              >
                Choose what you want to track.
              </Text>
              <ScrollView
                style={{ maxHeight: 400 }}
                showsVerticalScrollIndicator={false}
              >
                {CHECK_TYPES.map((type) => (
                  <Pressable
                    key={type.id}
                    onPress={() => handleSelectCheckType(type.id)}
                    style={{
                      padding: 18,
                      borderRadius: 18,
                      backgroundColor: "#FFFFFF",
                      borderWidth: 1,
                      borderColor: "#F4D6C8",
                      marginBottom: 12,
                      flexDirection: "row",
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ fontSize: 24, marginRight: 12 }}>
                      {type.icon}
                    </Text>
                    <Text
                      style={{
                        fontSize: 18,
                        fontWeight: "700",
                        color: "#321E17",
                      }}
                    >
                      {type.label}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
              <Pressable
                onPress={() => setShowTypePicker(false)}
                style={{
                  marginTop: 8,
                  padding: 16,
                  alignItems: "center",
                }}
              >
                <Text
                  style={{
                    fontSize: 17,
                    fontWeight: "700",
                    color: "#8A6F5B",
                  }}
                >
                  Cancel
                </Text>
              </Pressable>
            </View>
          </View>
        )}
      </KeyboardAvoidingAnimatedView>
    </Modal>
  );
}
