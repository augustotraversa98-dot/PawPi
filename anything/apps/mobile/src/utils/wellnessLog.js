// Config-driven wellness log entry.
//
// One field schema per wellness check type drives a single shared modal
// (WellnessLogModal) — no per-type screens. This module is pure (no React, no
// fetch) so the routing + validation contract can be unit-tested directly.
//
// Routing:
//   - "weight" persists to the existing weight history / Insights path
//     (POST /api/health/weight-logs), so it lacks routine/item linkage by design.
//   - every other type persists to POST /api/health/wellness-logs with the pet +
//     owner scope, the routine/item reference, and the scheduled date it satisfies
//     carried inside values_json (jsonb).

export const WELLNESS_CHECK_TYPES = {
  WEIGHT: "weight",
  BODY_CONDITION: "body_condition",
  MOBILITY: "mobility",
  MOOD_ENERGY: "mood_energy",
  SKIN_COAT: "skin_coat",
  APPETITE_HYDRATION: "appetite_hydration",
  GENERAL: "general",
  CUSTOM: "custom",
};

// Field schema per check type. `kind` selects the renderer in WellnessLogModal;
// `valueKey` is the key the captured value is stored under inside values_json.
export const WELLNESS_FIELD_SCHEMA = {
  weight: {
    label: "Weight",
    kind: "weight",
    valueKey: "weight",
    units: ["kg", "lb"],
    defaultUnit: "lb",
  },
  body_condition: {
    label: "Body condition",
    kind: "options",
    valueKey: "bodyCondition",
    options: [
      { key: "under", label: "Under" },
      { key: "ideal", label: "Ideal" },
      { key: "over", label: "Over" },
    ],
  },
  mobility: {
    label: "Mobility",
    kind: "options",
    valueKey: "mobility",
    options: [
      { key: "normal", label: "Normal" },
      { key: "slightly_stiff", label: "Slightly stiff" },
      { key: "stiff", label: "Stiff" },
      { key: "limping", label: "Limping" },
      { key: "cant_bear_weight", label: "Can't bear weight" },
    ],
  },
  mood_energy: {
    label: "Mood / Energy",
    kind: "options",
    valueKey: "moodEnergy",
    options: [
      { key: "low", label: "Low" },
      { key: "normal", label: "Normal" },
      { key: "high", label: "High" },
    ],
  },
  skin_coat: {
    label: "Skin / Coat",
    kind: "options",
    valueKey: "skinCoat",
    options: [
      { key: "healthy", label: "Healthy" },
      { key: "dry", label: "Dry" },
      { key: "itchy", label: "Itchy" },
      { key: "redness", label: "Redness" },
      { key: "hot_spots", label: "Hot spots" },
      { key: "other", label: "Other" },
    ],
  },
  appetite_hydration: {
    label: "Appetite / Hydration",
    kind: "options",
    valueKey: "appetiteHydration",
    options: [
      { key: "normal", label: "Normal" },
      { key: "reduced", label: "Reduced" },
      { key: "increased", label: "Increased" },
      { key: "not_consuming", label: "Not eating/drinking" },
    ],
  },
  general: {
    label: "General check",
    kind: "general",
    valueKey: "status",
    options: [
      { key: "all_good", label: "All good" },
      { key: "noticed_something", label: "Noticed something" },
    ],
  },
  custom: {
    label: "Custom",
    kind: "text",
    valueKey: "value",
  },
};

// Unknown check types fall back to a free-text entry rather than crashing.
export function getWellnessSchema(checkType) {
  return WELLNESS_FIELD_SCHEMA[checkType] || WELLNESS_FIELD_SCHEMA.custom;
}

// Local (not UTC) calendar date of an ISO timestamp, as YYYY-MM-DD. Matches the
// human-meaningful "scheduled day" a reminder satisfies.
export function toDateStr(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Fresh form state for a check type. `lastUnit` (e.g. from the pet's most recent
// weight log) seeds the weight unit so it defaults to whatever was last used.
export function initialFormValues(checkType, { lastUnit } = {}) {
  const schema = getWellnessSchema(checkType);
  if (schema.kind === "weight") {
    return { value: "", unit: lastUnit || schema.defaultUnit, note: "" };
  }
  return { value: null, note: "" };
}

// Returns an error message string, or null when the form is valid.
export function validateWellnessForm(checkType, form) {
  const schema = getWellnessSchema(checkType);

  if (schema.kind === "weight") {
    const n = Number(form?.value);
    if (form?.value == null || form.value === "" || Number.isNaN(n) || n <= 0) {
      return "Please enter a valid weight";
    }
    return null;
  }

  if (schema.kind === "text") {
    if (!form?.value || !String(form.value).trim()) {
      return "Please enter a value";
    }
    return null;
  }

  // options + general both require a selection.
  if (!form?.value) {
    return "Please choose an option";
  }
  if (
    schema.kind === "general" &&
    form.value === "noticed_something" &&
    (!form.note || !form.note.trim())
  ) {
    return "Please add a note about what you noticed";
  }
  return null;
}

// Builds the POST request ({ endpoint, body }) for a save. Pure: pass `now` to
// keep it deterministic in tests.
export function buildWellnessLogPayload(reminder, form, { now } = {}) {
  const checkType = reminder?.checkType;
  const schema = getWellnessSchema(checkType);
  const note = form?.note ? String(form.note).trim() : "";
  const loggedAt = (now ? new Date(now) : new Date()).toISOString();
  const scheduledDate = toDateStr(reminder?.scheduledAt);

  // Weight feeds the existing weight history / Insights path.
  if (schema.kind === "weight") {
    return {
      endpoint: "/api/health/weight-logs",
      body: {
        petId: reminder.petId,
        weight: Number(form.value),
        weightUnit: form.unit || schema.defaultUnit,
        notes: note,
      },
    };
  }

  // Everything else: one pet-scoped wellness_logs row, tied to the routine item
  // and the scheduled date it satisfies (carried in values_json).
  const valuesJson = { [schema.valueKey]: form.value, scheduledDate };
  if (schema.kind === "options" || schema.kind === "general") {
    const selected = (schema.options || []).find((o) => o.key === form.value);
    if (selected) valuesJson.label = selected.label;
  }

  return {
    endpoint: "/api/health/wellness-logs",
    body: {
      petId: reminder.petId,
      checkType,
      notes: note || null,
      routineId: reminder.routineId ?? null,
      wellnessCheckItemIndex: reminder.wellnessCheckItemIndex ?? null,
      loggedAt,
      valuesJson,
    },
  };
}
