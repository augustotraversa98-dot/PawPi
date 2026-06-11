// Routine-card schedule summaries must render human cadence labels for the full
// ROUTINE_FREQUENCY set — no raw enum (underscored) may ever surface. Guards the
// shared CADENCE_LABELS map / getCadenceLabel fallback wired into the wellness,
// photo-check, and medical-care branches of getScheduleSummary.

import {
  getScheduleSummary,
  getCadenceLabel,
  CADENCE_LABELS,
  ROUTINE_FREQUENCY,
  ROUTINE_TYPES,
} from "./routinesData";

const ALL_CADENCES = Object.values(ROUTINE_FREQUENCY);

const wellnessRoutine = (frequency) => ({
  type: ROUTINE_TYPES.WELLNESS_CHECK,
  isActive: true,
  wellnessCheckItems: [
    {
      checkType: "general",
      frequency,
      preferredDay: 6,
      preferredTime: "09:00",
      reminderEnabled: true,
    },
  ],
});

const photoRoutine = (frequency) => ({
  type: ROUTINE_TYPES.PHOTO_CHECK,
  isActive: true,
  photoCheckSchedule: [
    {
      bodyArea: "ears",
      frequency,
      preferredDay: 6,
      preferredTime: "10:00",
      reminderEnabled: true,
    },
  ],
});

describe("getCadenceLabel", () => {
  it("maps every ROUTINE_FREQUENCY value to an underscore-free label", () => {
    for (const freq of ALL_CADENCES) {
      const label = getCadenceLabel(freq);
      expect(label).toBe(CADENCE_LABELS[freq]);
      expect(label).not.toContain("_");
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it("renders the expected human labels", () => {
    expect(getCadenceLabel("every_3_months")).toBe("every 3 months");
    expect(getCadenceLabel("every_6_months")).toBe("every 6 months");
    expect(getCadenceLabel("yearly")).toBe("yearly");
    expect(getCadenceLabel("hourly")).toBe("hourly");
    expect(getCadenceLabel("once")).toBe("once");
    expect(getCadenceLabel("biweekly")).toBe("every 2 weeks");
  });

  it("humanizes an unknown/future enum instead of leaking underscores", () => {
    expect(getCadenceLabel("every_4_months")).toBe("every 4 months");
  });

  it("returns empty string for a falsy cadence", () => {
    expect(getCadenceLabel(undefined)).toBe("");
    expect(getCadenceLabel(null)).toBe("");
    expect(getCadenceLabel("")).toBe("");
  });
});

describe("getScheduleSummary — cadence labels, no raw enum", () => {
  it.each(ALL_CADENCES)(
    "wellness card shows a human label for %s and never an underscore",
    (freq) => {
      const summary = getScheduleSummary(wellnessRoutine(freq));
      expect(summary).toContain(getCadenceLabel(freq));
      expect(summary).not.toContain("_");
    },
  );

  it.each(ALL_CADENCES)(
    "photo-check card shows a human label for %s and never an underscore",
    (freq) => {
      const summary = getScheduleSummary(photoRoutine(freq));
      expect(summary).toContain(getCadenceLabel(freq));
      expect(summary).not.toContain("_");
    },
  );

  it("regression: 'every 3 months' wellness shows the label, not every_3_months", () => {
    const summary = getScheduleSummary(
      wellnessRoutine(ROUTINE_FREQUENCY.EVERY_3_MONTHS),
    );
    expect(summary).toContain("every 3 months");
    expect(summary).not.toContain("every_3_months");
  });

  it("medical-care repeatInterval renders via the shared label map", () => {
    const summary = getScheduleSummary({
      type: ROUTINE_TYPES.MEDICAL_CARE,
      isActive: true,
      medicalCareItems: [
        { type: "heartworm", name: "Heartgard", repeatInterval: "every_3_months" },
      ],
    });
    expect(summary).toBe("Heartgard (every 3 months)");
    expect(summary).not.toContain("_");
  });
});
