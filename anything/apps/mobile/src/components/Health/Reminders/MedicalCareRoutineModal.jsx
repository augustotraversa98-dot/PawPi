import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Switch,
  Alert,
} from "react-native";
import { X, Plus, Edit3, Trash2, ChevronRight } from "lucide-react-native";
import {
  ROUTINE_TYPES,
  ROUTINE_FREQUENCY,
  MEDICAL_CARE_SUBTYPES,
} from "@/data/routinesData";
import DateField from "@/components/DateField";
import TimeField from "@/components/TimeField";
import { canonicalizeDateValue } from "@/utils/canonicalDateTime";
import { CADENCE_OPTIONS_FULL } from "./CadenceFrequencySelector";
import ScheduleBlock, { scheduleFromItem } from "./ScheduleBlock";

// Dose-course (medication / supplement) cadence list = the full ScheduleBlock
// set MINUS Once: the dose-course generator branch has no Once handling (Once
// would fall through to the day-pattern path and fire daily), so it is not
// offered for these two subtypes. Every other subtype keeps its own UI.
export const MED_CADENCE_OPTIONS = CADENCE_OPTIONS_FULL.filter(
  (f) => f !== ROUTINE_FREQUENCY.ONCE,
);

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

const MEDICAL_CARE_OPTIONS = [
  {
    value: MEDICAL_CARE_SUBTYPES.MEDICATION,
    label: "Medication",
    icon: "💊",
  },
  { value: MEDICAL_CARE_SUBTYPES.VACCINE, label: "Vaccine", icon: "💉" },
  {
    value: MEDICAL_CARE_SUBTYPES.FLEA_TICK,
    label: "Flea / tick prevention",
    icon: "🛡️",
  },
  {
    value: MEDICAL_CARE_SUBTYPES.DEWORMING,
    label: "Deworming",
    icon: "🪱",
  },
  {
    value: MEDICAL_CARE_SUBTYPES.HEARTWORM,
    label: "Heartworm prevention",
    icon: "🫀",
  },
  {
    value: MEDICAL_CARE_SUBTYPES.SUPPLEMENT,
    label: "Supplement",
    icon: "🧪",
  },
  { value: MEDICAL_CARE_SUBTYPES.OTHER, label: "Other", icon: "📋" },
];

const getSubtypeLabel = (type) =>
  MEDICAL_CARE_OPTIONS.find((o) => o.value === type)?.label || "Medical care";

const getSubtypeIcon = (type) =>
  MEDICAL_CARE_OPTIONS.find((o) => o.value === type)?.icon || "📋";

const makeItemId = () =>
  `mc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const isDoseCourse = (subtype) =>
  subtype === MEDICAL_CARE_SUBTYPES.MEDICATION ||
  subtype === MEDICAL_CARE_SUBTYPES.SUPPLEMENT;

export const defaultItemFor = (subtype) => {
  const base = {
    id: makeItemId(),
    type: subtype,
    name: "",
    dose: "",
    frequency: ROUTINE_FREQUENCY.DAILY,
    times: ["09:00"],
    startDate: new Date().toISOString().split("T")[0],
    endDate: "",
    instructions: "",
    reminderEnabled: true,
    timeSensitive: true,
    notes: "",
    lastGiven: "",
    nextDue: "",
    vetClinic: "",
    productName: "",
    repeatInterval: "monthly",
    // Vaccine reminder lead time: "on_due" | "1w" | "2w" | "1m"
    reminderTiming: "1w",
    // Supplement timing mode: "time" | "linked"
    timingMode: "time",
    // Supplement linked meal: "breakfast" | "dinner" | "meal" | "custom"
    linkedMeal: "breakfast",
    // Other: free description
    description: "",
  };

  // Medication / supplement drive the shared ScheduleBlock, so they seed the
  // canonical schedule fields (mirrors defaultSchedule): daily today, empty day
  // chips, 4h interval, on-time lead. Dose times stay in times[]. Other subtypes
  // keep their due-date UIs and the legacy "1w" vaccine lead unchanged.
  if (isDoseCourse(subtype)) {
    return {
      ...base,
      frequency: ROUTINE_FREQUENCY.DAILY,
      startDate: canonicalizeDateValue(new Date()),
      days: [],
      intervalHours: 4,
      reminderTiming: "on_time",
    };
  }
  return base;
};

// Migrate legacy single-item medical care routine into items array
const itemsFromRoutine = (routine) => {
  if (!routine) return [];
  if (Array.isArray(routine.medicalCareItems)) return routine.medicalCareItems;
  if (routine.medicalCareSubtype) {
    return [
      {
        id: makeItemId(),
        type: routine.medicalCareSubtype,
        name: routine.name || routine.medicationName || "",
        dose: routine.dose || "",
        frequency: routine.frequency || ROUTINE_FREQUENCY.DAILY,
        times: routine.times || ["09:00"],
        startDate: routine.startDate || new Date().toISOString().split("T")[0],
        endDate: routine.endDate || "",
        instructions: routine.instructions || "",
        reminderEnabled: routine.notificationEnabled ?? true,
        timeSensitive: routine.timeSensitive ?? true,
        notes: routine.notes || "",
        lastGiven: routine.lastGiven || "",
        nextDue: routine.nextDue || "",
        vetClinic: routine.vetClinic || "",
        productName: routine.productName || "",
        repeatInterval: routine.repeatInterval || "monthly",
      },
    ];
  }
  return [];
};

export default function MedicalCareRoutineModal({
  visible,
  onClose,
  onSave,
  editingRoutine,
}) {
  // step: "list" | "pickType" | "itemForm"
  const [step, setStep] = useState("list");
  const [items, setItems] = useState([]);
  const [editingItem, setEditingItem] = useState(null);

  useEffect(() => {
    if (visible) {
      setItems(itemsFromRoutine(editingRoutine));
      setStep("list");
      setEditingItem(null);
    }
  }, [visible, editingRoutine]);

  const handleAddItem = () => {
    setEditingItem(null);
    setStep("pickType");
  };

  const handlePickType = (subtype) => {
    setEditingItem(defaultItemFor(subtype));
    setStep("itemForm");
  };

  const handleEditItem = (item) => {
    setEditingItem({ ...item });
    setStep("itemForm");
  };

  const handleDeleteItem = (itemId) => {
    Alert.alert(
      "Delete care item?",
      "This will remove this item from the Medical Care routine.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => setItems(items.filter((i) => i.id !== itemId)),
        },
      ],
    );
  };

  const handleSaveItem = (item) => {
    const exists = items.some((i) => i.id === item.id);
    if (exists) {
      setItems(items.map((i) => (i.id === item.id ? item : i)));
    } else {
      setItems([...items, item]);
    }
    setEditingItem(null);
    setStep("list");
  };

  const handleSaveRoutine = () => {
    if (items.length === 0) {
      Alert.alert("No care items", "Add at least one care item before saving.");
      return;
    }
    const routine = {
      type: ROUTINE_TYPES.MEDICAL_CARE,
      petId: editingRoutine?.petId ?? null,
      isActive: editingRoutine?.isActive ?? true,
      medicalCareItems: items,
      title: "Medical Care",
      description: `${items.length} care item${items.length > 1 ? "s" : ""}`,
      notificationEnabled: items.some((i) => i.reminderEnabled),
    };
    if (editingRoutine?.id) routine.id = editingRoutine.id;
    onSave(routine);
    onClose();
  };

  // ---------- LIST STEP ----------
  if (step === "list") {
    return (
      <Modal visible={visible} animationType="slide" transparent={true}>
        <View style={{ flex: 1, backgroundColor: C.cream }}>
          <Header
            title="💊 Medical Care"
            subtitle="Medications, vaccines, preventives, supplements"
            onClose={onClose}
          />

          <ScrollView
            contentContainerStyle={{ padding: 20, paddingBottom: 140 }}
            showsVerticalScrollIndicator={false}
          >
            <View
              style={{
                backgroundColor: "#FEF3C7",
                borderRadius: 12,
                padding: 14,
                marginBottom: 20,
                borderWidth: 1,
                borderColor: "#FDE68A",
              }}
            >
              <Text style={{ fontSize: 13, color: "#92400E", lineHeight: 19 }}>
                ⚠️ Follow your veterinarian's instructions for medication,
                vaccine, and preventive care schedules
              </Text>
            </View>

            {items.length === 0 ? (
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
                <Text style={{ fontSize: 32, marginBottom: 8 }}>💊</Text>
                <Text
                  style={{
                    fontSize: 16,
                    fontWeight: "700",
                    color: C.warmBrown,
                    marginBottom: 6,
                    textAlign: "center",
                  }}
                >
                  No medical care items yet
                </Text>
                <Text
                  style={{
                    fontSize: 14,
                    color: C.mutedBrown,
                    textAlign: "center",
                    lineHeight: 20,
                  }}
                >
                  Add medications, vaccines, preventives, or supplements to keep
                  track of care.
                </Text>
              </View>
            ) : (
              <View style={{ gap: 12, marginBottom: 20 }}>
                {items.map((item) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    onEdit={() => handleEditItem(item)}
                    onDelete={() => handleDeleteItem(item.id)}
                  />
                ))}
              </View>
            )}

            <TouchableOpacity
              onPress={handleAddItem}
              style={{
                backgroundColor: C.card,
                borderRadius: 14,
                paddingVertical: 14,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                borderWidth: 1.5,
                borderColor: C.terracotta,
                borderStyle: "dashed",
              }}
            >
              <Plus size={18} color={C.terracotta} />
              <Text
                style={{
                  fontSize: 15,
                  fontWeight: "700",
                  color: C.terracotta,
                }}
              >
                Add care item
              </Text>
            </TouchableOpacity>
          </ScrollView>

          <View
            style={{
              padding: 20,
              paddingBottom: 30,
              borderTopWidth: 1,
              borderTopColor: C.peach,
              backgroundColor: C.cream,
            }}
          >
            <TouchableOpacity
              onPress={handleSaveRoutine}
              disabled={items.length === 0}
              style={{
                backgroundColor: items.length === 0 ? C.sand : C.terracotta,
                borderRadius: 14,
                paddingVertical: 16,
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: "700",
                  color: items.length === 0 ? C.mutedBrown : "#FFF",
                }}
              >
                {editingRoutine ? "Save Changes" : "Create Routine"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }

  // ---------- PICK TYPE STEP ----------
  if (step === "pickType") {
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
              maxHeight: "80%",
            }}
          >
            <Header
              title="Add care item"
              subtitle="What type of care do you want to add?"
              onClose={() => setStep("list")}
              compact
            />
            <ScrollView contentContainerStyle={{ padding: 16 }}>
              <View style={{ gap: 12 }}>
                {MEDICAL_CARE_OPTIONS.map((option) => (
                  <TouchableOpacity
                    key={option.value}
                    onPress={() => handlePickType(option.value)}
                    style={{
                      backgroundColor: C.card,
                      borderRadius: 16,
                      padding: 16,
                      borderWidth: 1.5,
                      borderColor: C.peach,
                      flexDirection: "row",
                      alignItems: "center",
                    }}
                  >
                    <View
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: 24,
                        backgroundColor: C.terracotta + "20",
                        justifyContent: "center",
                        alignItems: "center",
                        marginRight: 14,
                      }}
                    >
                      <Text style={{ fontSize: 24 }}>{option.icon}</Text>
                    </View>
                    <Text
                      style={{
                        fontSize: 16,
                        fontWeight: "700",
                        color: C.warmBrown,
                        flex: 1,
                      }}
                    >
                      {option.label}
                    </Text>
                    <ChevronRight size={18} color={C.mutedBrown} />
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  }

  // ---------- ITEM FORM STEP ----------
  return (
    <ItemFormModal
      visible={visible}
      item={editingItem}
      onCancel={() => {
        setEditingItem(null);
        setStep("list");
      }}
      onSave={handleSaveItem}
    />
  );
}

// =========================================================================
// Header
// =========================================================================
function Header({ title, subtitle, onClose, compact }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        padding: 20,
        paddingTop: compact ? 20 : 60,
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
          {title}
        </Text>
        {!!subtitle && (
          <Text style={{ fontSize: 14, color: C.mutedBrown }}>{subtitle}</Text>
        )}
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
  );
}

// =========================================================================
// ItemRow - summary card for one item in the list
// =========================================================================
function ItemRow({ item, onEdit, onDelete }) {
  const subtitle = buildItemSubtitle(item);
  return (
    <View
      style={{
        backgroundColor: C.card,
        borderRadius: 16,
        padding: 14,
        borderWidth: 1.5,
        borderColor: C.peach,
        flexDirection: "row",
        alignItems: "center",
      }}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: C.terracotta + "20",
          justifyContent: "center",
          alignItems: "center",
          marginRight: 12,
        }}
      >
        <Text style={{ fontSize: 22 }}>{getSubtypeIcon(item.type)}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={{ fontSize: 15, fontWeight: "700", color: C.warmBrown }}
          numberOfLines={1}
        >
          {item.name || getSubtypeLabel(item.type)}
        </Text>
        <Text
          style={{ fontSize: 12, color: C.mutedBrown, marginTop: 2 }}
          numberOfLines={2}
        >
          {getSubtypeLabel(item.type)}
          {subtitle ? ` · ${subtitle}` : ""}
        </Text>
      </View>
      <TouchableOpacity
        onPress={onEdit}
        style={{
          width: 34,
          height: 34,
          borderRadius: 17,
          backgroundColor: C.sand,
          justifyContent: "center",
          alignItems: "center",
          marginLeft: 6,
        }}
      >
        <Edit3 size={16} color={C.mutedBrown} />
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onDelete}
        style={{
          width: 34,
          height: 34,
          borderRadius: 17,
          backgroundColor: C.sand,
          justifyContent: "center",
          alignItems: "center",
          marginLeft: 6,
        }}
      >
        <Trash2 size={16} color={C.coral} />
      </TouchableOpacity>
    </View>
  );
}

function buildItemSubtitle(item) {
  if (
    item.type === MEDICAL_CARE_SUBTYPES.MEDICATION ||
    item.type === MEDICAL_CARE_SUBTYPES.SUPPLEMENT
  ) {
    const parts = [];
    if (item.dose) parts.push(item.dose);
    if (item.times && item.times.length > 0) parts.push(item.times.join(" · "));
    return parts.join(" · ");
  }
  if (item.type === MEDICAL_CARE_SUBTYPES.VACCINE) {
    if (item.nextDue) return `Next due ${item.nextDue}`;
    if (item.lastGiven) return `Last given ${item.lastGiven}`;
    return "";
  }
  // preventives
  if (item.repeatInterval) {
    const map = {
      monthly: "Monthly",
      every_3_months: "Every 3 months",
      every_6_months: "Every 6 months",
      yearly: "Yearly",
    };
    return map[item.repeatInterval] || item.repeatInterval;
  }
  return "";
}

// =========================================================================
// ItemFormModal - form to create/edit one item
// =========================================================================
function ItemFormModal({ visible, item, onCancel, onSave }) {
  const [draft, setDraft] = useState(item);

  useEffect(() => {
    setDraft(item);
  }, [item]);

  if (!draft) return null;
  const set = (patch) => setDraft({ ...draft, ...patch });
  const subtype = draft.type;

  const handleSubmit = () => {
    if (!draft.name || draft.name.trim() === "") {
      Alert.alert("Name required", "Please enter a name for this care item.");
      return;
    }
    onSave(draft);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={{ flex: 1, backgroundColor: C.cream }}>
          <Header
            title={`${getSubtypeIcon(subtype)} ${getSubtypeLabel(subtype)}`}
            subtitle="Care item details"
            onClose={onCancel}
          />

          <ScrollView
            contentContainerStyle={{ padding: 20, paddingBottom: 120 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Safety copy per type */}
            {subtype === MEDICAL_CARE_SUBTYPES.MEDICATION && (
              <SafetyNote>
                Follow your veterinarian's instructions for medication dose and
                schedule.
              </SafetyNote>
            )}
            {subtype === MEDICAL_CARE_SUBTYPES.VACCINE && (
              <SafetyNote>
                Follow your veterinarian's vaccination schedule.
              </SafetyNote>
            )}
            {(subtype === MEDICAL_CARE_SUBTYPES.FLEA_TICK ||
              subtype === MEDICAL_CARE_SUBTYPES.DEWORMING ||
              subtype === MEDICAL_CARE_SUBTYPES.HEARTWORM) && (
              <SafetyNote>
                Follow your veterinarian's instructions for preventive care
                products and schedules.
              </SafetyNote>
            )}

            {/* Name field (label varies per type) */}
            <Label>
              {subtype === MEDICAL_CARE_SUBTYPES.MEDICATION
                ? "Medication name"
                : subtype === MEDICAL_CARE_SUBTYPES.VACCINE
                  ? "Vaccine name"
                  : subtype === MEDICAL_CARE_SUBTYPES.SUPPLEMENT
                    ? "Supplement name"
                    : subtype === MEDICAL_CARE_SUBTYPES.OTHER
                      ? "Care name"
                      : "Product / treatment name"}
            </Label>
            <Input
              value={draft.name}
              onChangeText={(v) => set({ name: v })}
              placeholder={
                subtype === MEDICAL_CARE_SUBTYPES.MEDICATION
                  ? "e.g., Apoquel"
                  : subtype === MEDICAL_CARE_SUBTYPES.VACCINE
                    ? "e.g., Rabies vaccine"
                    : subtype === MEDICAL_CARE_SUBTYPES.SUPPLEMENT
                      ? "e.g., Omega 3"
                      : subtype === MEDICAL_CARE_SUBTYPES.OTHER
                        ? "e.g., Ear cleaning"
                        : "e.g., Bravecto"
              }
            />

            {/* =========================== MEDICATION =========================== */}
            {subtype === MEDICAL_CARE_SUBTYPES.MEDICATION && (
              <>
                <Label>Dose</Label>
                <Input
                  value={draft.dose}
                  onChangeText={(v) => set({ dose: v })}
                  placeholder="e.g., 1 tablet"
                />

                {/* Schedule — shared ScheduleBlock owns Date / Frequency / day
                    chips / interval / Early reminder. hideTime: dose times stay
                    in the multi-add Time(s) field below (DoseTimes). */}
                <ScheduleBlock
                  value={scheduleFromItem(draft)}
                  onChange={(schedule) => set(schedule)}
                  hideTime
                  cadenceOptions={MED_CADENCE_OPTIONS}
                  color={C.terracotta}
                  style={{ marginBottom: 16 }}
                />

                <DoseTimes draft={draft} set={set} />

                {/* Stacked (not Row/Half) so the inline calendar has full width.
                    Dose-course honors item.endDate to bound the course. */}
                <Label small>End date (optional)</Label>
                <View style={{ marginBottom: 10 }}>
                  <DateField
                    value={draft.endDate}
                    onChange={(v) => set({ endDate: v })}
                  />
                </View>

                <Label>Instructions (optional)</Label>
                <Input
                  value={draft.instructions}
                  onChangeText={(v) => set({ instructions: v })}
                  placeholder="e.g., Give with food"
                  multiline
                />
              </>
            )}

            {/* =========================== VACCINE =========================== */}
            {subtype === MEDICAL_CARE_SUBTYPES.VACCINE && (
              <>
                <Label>Last given date (optional)</Label>
                <View style={{ marginBottom: 10 }}>
                  <DateField
                    value={draft.lastGiven}
                    onChange={(v) => set({ lastGiven: v })}
                  />
                </View>

                <Label>Next due date</Label>
                <View style={{ marginBottom: 10 }}>
                  <DateField
                    value={draft.nextDue}
                    onChange={(v) => set({ nextDue: v })}
                  />
                </View>

                <Label>Vet clinic (optional)</Label>
                <Input
                  value={draft.vetClinic}
                  onChangeText={(v) => set({ vetClinic: v })}
                  placeholder="Veterinarian or clinic name"
                />

                <Label>Reminder timing</Label>
                <View style={{ gap: 8, marginBottom: 20 }}>
                  {[
                    { value: "on_due", label: "On due date" },
                    { value: "1w", label: "1 week before" },
                    { value: "2w", label: "2 weeks before" },
                    { value: "1m", label: "1 month before" },
                  ].map((option) => (
                    <ChoiceRow
                      key={option.value}
                      selected={draft.reminderTiming === option.value}
                      label={option.label}
                      onPress={() => set({ reminderTiming: option.value })}
                    />
                  ))}
                </View>
              </>
            )}

            {/* =========================== PREVENTIVES =========================== */}
            {(subtype === MEDICAL_CARE_SUBTYPES.FLEA_TICK ||
              subtype === MEDICAL_CARE_SUBTYPES.DEWORMING ||
              subtype === MEDICAL_CARE_SUBTYPES.HEARTWORM) && (
              <>
                <Label>Last given date</Label>
                <View style={{ marginBottom: 10 }}>
                  <DateField
                    value={draft.lastGiven}
                    onChange={(v) => set({ lastGiven: v })}
                  />
                </View>

                <Label>Repeat interval</Label>
                <View style={{ gap: 8, marginBottom: 20 }}>
                  {[
                    { value: "monthly", label: "Monthly" },
                    { value: "every_3_months", label: "Every 3 months" },
                    { value: "every_6_months", label: "Every 6 months" },
                    { value: "yearly", label: "Yearly" },
                    { value: "custom", label: "Custom" },
                  ].map((option) => (
                    <ChoiceRow
                      key={option.value}
                      selected={draft.repeatInterval === option.value}
                      label={option.label}
                      onPress={() => set({ repeatInterval: option.value })}
                    />
                  ))}
                </View>

                <Label>Next due date</Label>
                <View style={{ marginBottom: 10 }}>
                  <DateField
                    value={draft.nextDue}
                    onChange={(v) => set({ nextDue: v })}
                  />
                </View>
              </>
            )}

            {/* =========================== SUPPLEMENT =========================== */}
            {subtype === MEDICAL_CARE_SUBTYPES.SUPPLEMENT && (
              <>
                <Label>Amount / dose</Label>
                <Input
                  value={draft.dose}
                  onChangeText={(v) => set({ dose: v })}
                  placeholder="e.g., 1 chew"
                />

                {/* Schedule — shared ScheduleBlock (hideTime); dose times stay in
                    the When-to-give controls below. */}
                <ScheduleBlock
                  value={scheduleFromItem(draft)}
                  onChange={(schedule) => set(schedule)}
                  hideTime
                  cadenceOptions={MED_CADENCE_OPTIONS}
                  color={C.terracotta}
                  style={{ marginBottom: 16 }}
                />

                <Label>When to give</Label>
                <View
                  style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}
                >
                  <SegmentBtn
                    selected={draft.timingMode === "linked"}
                    label="Linked to meal"
                    onPress={() => set({ timingMode: "linked" })}
                  />
                  <SegmentBtn
                    selected={draft.timingMode === "time"}
                    label="Custom time"
                    onPress={() => set({ timingMode: "time" })}
                  />
                </View>

                {draft.timingMode === "linked" ? (
                  <View style={{ gap: 8, marginBottom: 20 }}>
                    {[
                      { value: "breakfast", label: "With breakfast" },
                      { value: "dinner", label: "With dinner" },
                      { value: "meal", label: "With meal" },
                      { value: "custom", label: "Custom time" },
                    ].map((option) => (
                      <ChoiceRow
                        key={option.value}
                        selected={draft.linkedMeal === option.value}
                        label={option.label}
                        onPress={() => {
                          if (option.value === "custom") {
                            set({
                              linkedMeal: option.value,
                              timingMode: "time",
                            });
                          } else {
                            set({ linkedMeal: option.value });
                          }
                        }}
                      />
                    ))}
                  </View>
                ) : (
                  <DoseTimes draft={draft} set={set} />
                )}

                <Label>Instructions (optional)</Label>
                <Input
                  value={draft.instructions}
                  onChangeText={(v) => set({ instructions: v })}
                  placeholder="e.g., Give with food"
                  multiline
                />
              </>
            )}

            {/* =========================== OTHER =========================== */}
            {subtype === MEDICAL_CARE_SUBTYPES.OTHER && (
              <>
                <Label>Description</Label>
                <Input
                  value={draft.description}
                  onChangeText={(v) => set({ description: v })}
                  placeholder="What kind of care is this?"
                  multiline
                />

                <Label>Frequency</Label>
                <View style={{ gap: 8, marginBottom: 20 }}>
                  {[
                    { value: ROUTINE_FREQUENCY.DAILY, label: "Daily" },
                    { value: ROUTINE_FREQUENCY.WEEKLY, label: "Weekly" },
                    { value: ROUTINE_FREQUENCY.MONTHLY, label: "Monthly" },
                    { value: "one_time", label: "One time" },
                    { value: ROUTINE_FREQUENCY.CUSTOM, label: "Custom" },
                  ].map((option) => (
                    <ChoiceRow
                      key={option.value}
                      selected={draft.frequency === option.value}
                      label={option.label}
                      onPress={() => set({ frequency: option.value })}
                    />
                  ))}
                </View>

                {/* Stacked (not Row/Half) so the inline pickers have full width */}
                <Label small>Date</Label>
                <View style={{ marginBottom: 10 }}>
                  <DateField
                    value={draft.startDate}
                    onChange={(v) => set({ startDate: v })}
                  />
                </View>
                <Label small>Time</Label>
                <View style={{ marginBottom: 10 }}>
                  <TimeField
                    value={draft.times?.[0] || ""}
                    onChange={(v) => set({ times: [v] })}
                  />
                </View>
              </>
            )}

            {/* Reminder + time-sensitive toggles (all types) */}
            <View
              style={{
                backgroundColor: C.card,
                borderRadius: 16,
                padding: 16,
                borderWidth: 1,
                borderColor: C.peach,
                marginBottom: 16,
              }}
            >
              <ToggleRow
                label="Reminder enabled"
                value={draft.reminderEnabled}
                onValueChange={(v) => set({ reminderEnabled: v })}
                color={C.sage}
              />
              <View style={{ height: 14 }} />
              <ToggleRow
                label="Time-sensitive"
                value={draft.timeSensitive}
                onValueChange={(v) => set({ timeSensitive: v })}
                color={C.coral}
              />
            </View>

            <Label>Notes (optional)</Label>
            <Input
              value={draft.notes}
              onChangeText={(v) => set({ notes: v })}
              placeholder="Additional notes..."
              multiline
            />
          </ScrollView>

          <View
            style={{
              padding: 20,
              paddingBottom: 30,
              borderTopWidth: 1,
              borderTopColor: C.peach,
              backgroundColor: C.cream,
              flexDirection: "row",
              gap: 10,
            }}
          >
            <TouchableOpacity
              onPress={onCancel}
              style={{
                flex: 1,
                backgroundColor: C.sand,
                borderRadius: 14,
                paddingVertical: 16,
                alignItems: "center",
              }}
            >
              <Text
                style={{ fontSize: 16, fontWeight: "700", color: C.warmBrown }}
              >
                Cancel
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSubmit}
              style={{
                flex: 1,
                backgroundColor: C.terracotta,
                borderRadius: 14,
                paddingVertical: 16,
                alignItems: "center",
              }}
            >
              <Text style={{ fontSize: 16, fontWeight: "700", color: "#FFF" }}>
                Save item
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// =========================================================================
// Small shared form pieces
// =========================================================================
function Label({ children, small }) {
  return (
    <Text
      style={{
        fontSize: small ? 13 : 15,
        fontWeight: small ? "600" : "700",
        color: small ? C.mutedBrown : C.warmBrown,
        marginBottom: small ? 8 : 12,
      }}
    >
      {children}
    </Text>
  );
}

function Input(props) {
  return (
    <TextInput
      placeholderTextColor={C.mutedBrown}
      {...props}
      style={{
        backgroundColor: C.card,
        borderRadius: 12,
        padding: 12,
        fontSize: 15,
        color: C.warmBrown,
        borderWidth: 1,
        borderColor: C.peach,
        marginBottom: props.multiline ? 20 : 10,
        textAlignVertical: props.multiline ? "top" : "auto",
        minHeight: props.multiline ? 70 : 44,
      }}
    />
  );
}

function ChoiceRow({ selected, label, onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        backgroundColor: selected ? C.terracotta + "20" : C.card,
        borderRadius: 12,
        padding: 14,
        borderWidth: 1.5,
        borderColor: selected ? C.terracotta : C.peach,
      }}
    >
      <Text
        style={{
          fontSize: 15,
          fontWeight: selected ? "700" : "600",
          color: selected ? C.terracotta : C.warmBrown,
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function SafetyNote({ children }) {
  return (
    <View
      style={{
        backgroundColor: "#FEF3C7",
        borderRadius: 12,
        padding: 14,
        marginBottom: 20,
        borderWidth: 1,
        borderColor: "#FDE68A",
      }}
    >
      <Text style={{ fontSize: 13, color: "#92400E", lineHeight: 19 }}>
        ⚠️ {children}
      </Text>
    </View>
  );
}

function SegmentBtn({ selected, label, onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        flex: 1,
        backgroundColor: selected ? C.terracotta : C.card,
        borderRadius: 12,
        paddingVertical: 12,
        alignItems: "center",
        borderWidth: 1.5,
        borderColor: selected ? C.terracotta : C.peach,
      }}
    >
      <Text
        style={{
          fontSize: 14,
          fontWeight: "700",
          color: selected ? "#FFF" : C.warmBrown,
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// Dose-time editor for medication / supplement. The generator's emitDoseDay
// iterates times[] per cadence day, so each entry is a separate daily dose.
// HOURLY collapses to a SINGLE start-time anchor (multi-dose is meaningless when
// firing every N hours) — its value feeds medicalCareHourlyAnchorTime via
// preferredTime; every other cadence offers an add/remove list.
function DoseTimes({ draft, set }) {
  if (draft.frequency === ROUTINE_FREQUENCY.HOURLY) {
    const anchor = draft.preferredTime || draft.times?.[0] || "09:00";
    return (
      <>
        <Label>Start time</Label>
        <View style={{ marginBottom: 16 }}>
          <TimeField
            value={anchor}
            onChange={(v) => set({ preferredTime: v, times: [v] })}
          />
        </View>
      </>
    );
  }

  const times = Array.isArray(draft.times) ? draft.times : [];
  return (
    <>
      <Label>Time(s)</Label>
      {times.map((time, index) => (
        <View
          key={index}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            marginBottom: 10,
          }}
        >
          <View style={{ flex: 1 }}>
            <TimeField
              value={time}
              onChange={(next) => {
                const updated = [...times];
                updated[index] = next;
                set({ times: updated });
              }}
            />
          </View>
          {times.length > 1 && (
            <TouchableOpacity
              onPress={() => set({ times: times.filter((_, i) => i !== index) })}
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: C.sand,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Trash2 size={16} color={C.coral} />
            </TouchableOpacity>
          )}
        </View>
      ))}
      <TouchableOpacity
        onPress={() => set({ times: [...times, "12:00"] })}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          paddingVertical: 12,
          marginBottom: 10,
          borderRadius: 12,
          borderWidth: 1.5,
          borderColor: C.terracotta,
          borderStyle: "dashed",
        }}
      >
        <Plus size={16} color={C.terracotta} />
        <Text style={{ fontSize: 14, fontWeight: "700", color: C.terracotta }}>
          Add another time
        </Text>
      </TouchableOpacity>
    </>
  );
}

function ToggleRow({ label, value, onValueChange, color }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <Text style={{ fontSize: 15, fontWeight: "600", color: C.warmBrown }}>
        {label}
      </Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: C.sand, true: color + "60" }}
        thumbColor={value ? color : C.peach}
      />
    </View>
  );
}
