// Reminder log routing — pure logic for "the user tapped log/done on a reminder".
//
// Today reminders and Overdue instances must go through the SAME type-specific
// logging flow: medication asks given/issue, wellness opens the config-driven
// modal, photo check opens the capture flow, feeding offers as-usual/issue. This
// module is the single routing table for that decision so the Overdue path can
// never grow a per-type shortcut again (an overdue medication was once marked
// "given" with no detail ask). It is pure (no React, no fetch) so the routing
// contract can be unit-tested directly — the component layer (HealthToday)
// executes the returned flow.
//
// Choice flows (MEDICAL_CHOICE / FEEDING_CHOICE) carry only the options to
// present; nothing is saved until the user picks one, so a cancel is a no-op and
// the instance stays in place.

import { REMINDER_TYPES } from "@/data/remindersData";

export const LOG_FLOWS = {
  VET_APPOINTMENT: "vet_appointment",
  PHOTO_CAPTURE: "photo_capture",
  WELLNESS_MODAL: "wellness_modal",
  MEDICAL_CHOICE: "medical_choice",
  MEDICAL_SAVE: "medical_save",
  MEDICAL_ISSUE: "medical_issue",
  FEEDING_CHOICE: "feeding_choice",
  FEEDING_SAVE: "feeding_save",
  FEEDING_ISSUE: "feeding_issue",
  COMPLETE: "complete",
};

// Decide which logging flow a tap routes to. `extra.action` is the explicit
// choice the user already made (a card button or a choice-dialog option); when
// absent, types with a detail ask return a *_CHOICE flow listing the same
// options their today-card presents as buttons.
export function routeReminderLog(reminder, extra) {
  if (!reminder) return { flow: LOG_FLOWS.COMPLETE };

  switch (reminder.type) {
    case REMINDER_TYPES.VET_APPOINTMENT:
      // Completion is handled in VetAppointmentDetailModal; just acknowledge.
      return { flow: LOG_FLOWS.VET_APPOINTMENT };

    case REMINDER_TYPES.PHOTO_CHECK:
      return { flow: LOG_FLOWS.PHOTO_CAPTURE };

    case REMINDER_TYPES.WELLNESS_CHECK:
      return { flow: LOG_FLOWS.WELLNESS_MODAL };

    case REMINDER_TYPES.MEDICAL_CARE: {
      const action = extra?.action;
      if (action === "issue") return { flow: LOG_FLOWS.MEDICAL_ISSUE };
      if (!action) {
        // Mirror CountdownCard's buttons: vaccines offer record/complete, all
        // other care asks given vs something-was-off.
        const options =
          reminder.careType === "vaccine"
            ? [
                {
                  action: "add_vet_record",
                  label: reminder.primaryAction || "Add vet record",
                },
                { action: "completed", label: "Mark completed" },
              ]
            : [
                {
                  action: "given",
                  label: reminder.primaryAction || "Mark as given",
                },
                { action: "issue", label: "Something was off" },
              ];
        return { flow: LOG_FLOWS.MEDICAL_CHOICE, options };
      }
      const savedToVetRecord = action === "add_vet_record";
      return {
        flow: LOG_FLOWS.MEDICAL_SAVE,
        status: savedToVetRecord || action === "completed" ? "completed" : "given",
        notes: savedToVetRecord ? "Added to vet record" : null,
        savedToVetRecord,
      };
    }

    case REMINDER_TYPES.FEEDING: {
      const action = extra?.action;
      if (action === "issue") return { flow: LOG_FLOWS.FEEDING_ISSUE };
      if (action === "log_as_usual") return { flow: LOG_FLOWS.FEEDING_SAVE };
      return {
        flow: LOG_FLOWS.FEEDING_CHOICE,
        options: [
          { action: "log_as_usual", label: "Log as usual" },
          { action: "issue", label: "Something was off" },
        ],
      };
    }

    default:
      return { flow: LOG_FLOWS.COMPLETE };
  }
}

// POST body for /api/health/medical-care-logs. Logs against the instance's
// scheduled day: medical resolution matches given_at's date to the scheduledDate
// exactly (so a genuinely missed dose is never hidden by a later one) — acting on
// an overdue dose must therefore record it on its own day, not today. Pass `now`
// to keep the no-scheduledAt fallback deterministic in tests.
export function buildMedicalCareLogPayload(
  reminder,
  { status, notes = null, reactionOrIssue = null } = {},
  { now } = {},
) {
  return {
    petId: reminder.petId,
    routineId: reminder.routineId,
    medicalCareItemId: reminder.medicalCareItemId,
    careType: reminder.careType,
    name: reminder.title,
    dose: reminder.dose || null,
    givenAt:
      reminder.scheduledAt || (now ? new Date(now) : new Date()).toISOString(),
    status,
    notes: notes || null,
    reactionOrIssue: reactionOrIssue || null,
  };
}

// POST body for /api/health/food-logs when feeding is logged "as usual" (no
// issue). Shared by FeedingCountdownCard's quick log and the choice-dialog path.
export function buildQuickFoodLogPayload(reminder, petId) {
  return {
    petId,
    mealType: reminder.title || "meal",
    foodName: null,
    amount: null,
    appetite: "normal",
    finishedMeal: true,
    waterIntake: null,
    vomitingOrReaction: false,
    notes: reminder.notes || "Logged as usual",
  };
}
