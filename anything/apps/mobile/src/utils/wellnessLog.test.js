import {
  WELLNESS_CHECK_TYPES,
  WELLNESS_FIELD_SCHEMA,
  getWellnessSchema,
  initialFormValues,
  validateWellnessForm,
  buildWellnessLogPayload,
  toDateStr,
} from "./wellnessLog";

const baseReminder = {
  id: "reminder_100_mobility_2_2026-06-11",
  petId: 7,
  routineId: 100,
  wellnessCheckItemIndex: 2,
  checkType: "mobility",
  title: "Mobility Check",
  scheduledAt: "2026-06-11T09:00:00.000Z",
};

describe("wellnessLog — field schema", () => {
  it("has a schema entry for every check type", () => {
    Object.values(WELLNESS_CHECK_TYPES).forEach((type) => {
      expect(WELLNESS_FIELD_SCHEMA[type]).toBeDefined();
      expect(WELLNESS_FIELD_SCHEMA[type].valueKey).toBeTruthy();
    });
  });

  it("covers all eight wellness check types named in the ticket", () => {
    expect(Object.keys(WELLNESS_FIELD_SCHEMA).sort()).toEqual(
      [
        "appetite_hydration",
        "body_condition",
        "custom",
        "general",
        "mobility",
        "mood_energy",
        "skin_coat",
        "weight",
      ].sort(),
    );
  });

  it("falls back to free-text for an unknown check type", () => {
    expect(getWellnessSchema("not_a_real_type").kind).toBe("text");
  });
});

describe("wellnessLog — buildWellnessLogPayload routing", () => {
  it("routes weight to the existing weight-logs / Insights path", () => {
    const reminder = { ...baseReminder, checkType: "weight" };
    const { endpoint, body } = buildWellnessLogPayload(reminder, {
      value: "12.4",
      unit: "kg",
      note: "after walk",
    });
    expect(endpoint).toBe("/api/health/weight-logs");
    expect(body).toEqual({
      petId: 7,
      weight: 12.4,
      weightUnit: "kg",
      notes: "after walk",
    });
    // weight rows intentionally carry no checkType / routine linkage here
    expect(body.checkType).toBeUndefined();
    expect(body.valuesJson).toBeUndefined();
  });

  it("routes option-based checks to wellness-logs with full linkage + scheduled date", () => {
    const { endpoint, body } = buildWellnessLogPayload(
      baseReminder,
      { value: "limping", note: "right hind leg" },
      { now: "2026-06-11T12:30:00.000Z" },
    );
    expect(endpoint).toBe("/api/health/wellness-logs");
    expect(body.petId).toBe(7);
    expect(body.checkType).toBe("mobility");
    expect(body.routineId).toBe(100);
    expect(body.wellnessCheckItemIndex).toBe(2);
    expect(body.notes).toBe("right hind leg");
    expect(body.loggedAt).toBe("2026-06-11T12:30:00.000Z");
    // captured value + human label + the scheduled date it satisfies
    expect(body.valuesJson).toEqual({
      mobility: "limping",
      label: "Limping",
      scheduledDate: toDateStr(baseReminder.scheduledAt),
    });
  });

  it("routes general through wellness-logs with check_type 'general'", () => {
    const reminder = { ...baseReminder, checkType: "general" };
    const { endpoint, body } = buildWellnessLogPayload(reminder, {
      value: "noticed_something",
      note: "limping a bit",
    });
    expect(endpoint).toBe("/api/health/wellness-logs");
    expect(body.checkType).toBe("general");
    expect(body.valuesJson.status).toBe("noticed_something");
    expect(body.valuesJson.label).toBe("Noticed something");
  });

  it("stores free-text custom values and nulls notes when empty", () => {
    const reminder = { ...baseReminder, checkType: "custom" };
    const { body } = buildWellnessLogPayload(reminder, {
      value: "Coat brushed",
      note: "",
    });
    expect(body.checkType).toBe("custom");
    expect(body.valuesJson.value).toBe("Coat brushed");
    expect(body.notes).toBeNull();
  });

  it("passes null routine/item references when the reminder lacks them", () => {
    const reminder = {
      petId: 7,
      checkType: "skin_coat",
      scheduledAt: "2026-06-11T09:00:00.000Z",
    };
    const { body } = buildWellnessLogPayload(reminder, { value: "dry", note: "" });
    expect(body.routineId).toBeNull();
    expect(body.wellnessCheckItemIndex).toBeNull();
  });
});

describe("wellnessLog — validation", () => {
  it("requires a positive numeric weight", () => {
    expect(validateWellnessForm("weight", { value: "" })).toBeTruthy();
    expect(validateWellnessForm("weight", { value: "abc" })).toBeTruthy();
    expect(validateWellnessForm("weight", { value: "0" })).toBeTruthy();
    expect(validateWellnessForm("weight", { value: "12.4", unit: "kg" })).toBeNull();
  });

  it("requires a selection for option-based checks", () => {
    expect(validateWellnessForm("mobility", { value: null })).toBeTruthy();
    expect(validateWellnessForm("mobility", { value: "stiff" })).toBeNull();
  });

  it("requires a note when a general check noticed something", () => {
    expect(
      validateWellnessForm("general", { value: "noticed_something", note: "" }),
    ).toBeTruthy();
    expect(
      validateWellnessForm("general", { value: "noticed_something", note: "rash" }),
    ).toBeNull();
    expect(validateWellnessForm("general", { value: "all_good", note: "" })).toBeNull();
  });

  it("requires a value for custom free-text checks", () => {
    expect(validateWellnessForm("custom", { value: "" })).toBeTruthy();
    expect(validateWellnessForm("custom", { value: "  " })).toBeTruthy();
    expect(validateWellnessForm("custom", { value: "Nails trimmed" })).toBeNull();
  });
});

describe("wellnessLog — initialFormValues", () => {
  it("seeds the weight unit from the last-used unit", () => {
    expect(initialFormValues("weight", { lastUnit: "kg" })).toEqual({
      value: "",
      unit: "kg",
      note: "",
    });
    expect(initialFormValues("weight").unit).toBe("lb");
  });

  it("starts non-weight checks with an empty selection", () => {
    expect(initialFormValues("mobility")).toEqual({ value: null, note: "" });
  });
});
