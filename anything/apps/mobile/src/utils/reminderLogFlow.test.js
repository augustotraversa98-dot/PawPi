// Contract tests for the shared log-flow router (reminderLogFlow.js).
//
// Pins the parity rule: a tap on ANY reminder card — today's or Overdue — routes
// through routeReminderLog into the same type-specific detail flow, and the
// medical payload builder logs against the instance's scheduledAt so resolution
// clears exactly that instance. Choice flows save nothing by themselves, which is
// what makes Cancel a no-op.

import {
  LOG_FLOWS,
  routeReminderLog,
  buildMedicalCareLogPayload,
  buildQuickFoodLogPayload,
} from "./reminderLogFlow";

// An overdue medication instance, scheduled 3 days ago — the shape
// generateOverdueInstances emits.
const overdueMedication = {
  id: "reminder_r1_item1_2026-06-07_0",
  routineId: "r1",
  medicalCareItemId: "item1",
  petId: "pet1",
  type: "medical_care",
  careType: "medication",
  title: "Apoquel",
  dose: "16mg",
  scheduledAt: "2026-06-07T08:00:00.000Z",
  nextTriggerAt: "2026-06-07T08:00:00.000Z",
  status: "overdue",
  primaryAction: "Mark as given",
};

describe("routeReminderLog — each type routes to its today-flow", () => {
  it("wellness check opens the config-driven wellness modal", () => {
    expect(
      routeReminderLog({ type: "wellness_check", checkType: "mobility" }).flow,
    ).toBe(LOG_FLOWS.WELLNESS_MODAL);
  });

  it("photo check opens the capture flow", () => {
    expect(routeReminderLog({ type: "photo_check" }).flow).toBe(
      LOG_FLOWS.PHOTO_CAPTURE,
    );
  });

  it("vet appointment routes to its acknowledge flow", () => {
    expect(routeReminderLog({ type: "vet_appointment" }).flow).toBe(
      LOG_FLOWS.VET_APPOINTMENT,
    );
  });

  it("medical care with no explicit action asks given-or-issue", () => {
    const route = routeReminderLog(overdueMedication);
    expect(route.flow).toBe(LOG_FLOWS.MEDICAL_CHOICE);
    expect(route.options.map((o) => o.action)).toEqual(["given", "issue"]);
    // Primary option mirrors the today-card's primary button label.
    expect(route.options[0].label).toBe("Mark as given");
    expect(route.options[1].label).toBe("Something was off");
  });

  it("vaccine care offers vet-record / completed instead", () => {
    const route = routeReminderLog({
      ...overdueMedication,
      careType: "vaccine",
      primaryAction: "Add vet record",
    });
    expect(route.flow).toBe(LOG_FLOWS.MEDICAL_CHOICE);
    expect(route.options.map((o) => o.action)).toEqual([
      "add_vet_record",
      "completed",
    ]);
  });

  it("feeding with no explicit action asks as-usual-or-issue", () => {
    const route = routeReminderLog({ type: "feeding", title: "Breakfast" });
    expect(route.flow).toBe(LOG_FLOWS.FEEDING_CHOICE);
    expect(route.options.map((o) => o.action)).toEqual([
      "log_as_usual",
      "issue",
    ]);
  });

  it("types without a detail flow complete immediately", () => {
    expect(routeReminderLog({ type: "walk" }).flow).toBe(LOG_FLOWS.COMPLETE);
    expect(routeReminderLog(null).flow).toBe(LOG_FLOWS.COMPLETE);
  });
});

describe("routeReminderLog — explicit actions resolve to save/issue flows", () => {
  it("medical 'given' saves with status given", () => {
    const route = routeReminderLog(overdueMedication, { action: "given" });
    expect(route).toMatchObject({
      flow: LOG_FLOWS.MEDICAL_SAVE,
      status: "given",
      notes: null,
      savedToVetRecord: false,
    });
  });

  it("medical 'completed' and 'add_vet_record' save with status completed", () => {
    expect(
      routeReminderLog(overdueMedication, { action: "completed" }),
    ).toMatchObject({ flow: LOG_FLOWS.MEDICAL_SAVE, status: "completed" });
    expect(
      routeReminderLog(overdueMedication, { action: "add_vet_record" }),
    ).toMatchObject({
      flow: LOG_FLOWS.MEDICAL_SAVE,
      status: "completed",
      notes: "Added to vet record",
      savedToVetRecord: true,
    });
  });

  it("medical 'issue' opens the issue flow instead of saving", () => {
    const route = routeReminderLog(overdueMedication, { action: "issue" });
    expect(route.flow).toBe(LOG_FLOWS.MEDICAL_ISSUE);
    expect(route.status).toBeUndefined();
  });

  it("feeding actions resolve to quick-save / issue flows", () => {
    expect(
      routeReminderLog({ type: "feeding" }, { action: "log_as_usual" }).flow,
    ).toBe(LOG_FLOWS.FEEDING_SAVE);
    expect(routeReminderLog({ type: "feeding" }, { action: "issue" }).flow).toBe(
      LOG_FLOWS.FEEDING_ISSUE,
    );
  });
});

describe("routeReminderLog — cancel is a no-op", () => {
  it("choice flows carry no save instruction and don't touch the reminder", () => {
    const before = JSON.parse(JSON.stringify(overdueMedication));
    const route = routeReminderLog(overdueMedication);
    // Nothing to persist until an option is picked — dismissing the ask leaves
    // the overdue instance exactly as it was.
    expect(route.status).toBeUndefined();
    expect(overdueMedication).toEqual(before);
  });
});

describe("buildMedicalCareLogPayload — overdue instance metadata threading", () => {
  it("logs against the instance's scheduled day, not today", () => {
    const payload = buildMedicalCareLogPayload(
      overdueMedication,
      { status: "given" },
      { now: "2026-06-10T12:00:00.000Z" },
    );
    expect(payload).toMatchObject({
      petId: "pet1",
      routineId: "r1",
      medicalCareItemId: "item1",
      careType: "medication",
      name: "Apoquel",
      dose: "16mg",
      givenAt: "2026-06-07T08:00:00.000Z", // the overdue day — NOT now
      status: "given",
      notes: null,
      reactionOrIssue: null,
    });
  });

  it("falls back to now only when the reminder has no scheduledAt", () => {
    const { scheduledAt, ...noSchedule } = overdueMedication;
    const payload = buildMedicalCareLogPayload(
      noSchedule,
      { status: "given" },
      { now: "2026-06-10T12:00:00.000Z" },
    );
    expect(payload.givenAt).toBe("2026-06-10T12:00:00.000Z");
  });

  it("threads issue details through", () => {
    const payload = buildMedicalCareLogPayload(overdueMedication, {
      status: "issue_reported",
      notes: "vomited after dose",
      reactionOrIssue: "vomiting",
    });
    expect(payload.status).toBe("issue_reported");
    expect(payload.notes).toBe("vomited after dose");
    expect(payload.reactionOrIssue).toBe("vomiting");
    expect(payload.givenAt).toBe(overdueMedication.scheduledAt);
  });
});

describe("buildQuickFoodLogPayload", () => {
  it("builds the as-usual food log for the given pet", () => {
    expect(
      buildQuickFoodLogPayload(
        { type: "feeding", title: "Breakfast", notes: "" },
        "pet1",
      ),
    ).toEqual({
      petId: "pet1",
      mealType: "Breakfast",
      foodName: null,
      amount: null,
      appetite: "normal",
      finishedMeal: true,
      waterIntake: null,
      vomitingOrReaction: false,
      notes: "Logged as usual",
    });
  });
});
