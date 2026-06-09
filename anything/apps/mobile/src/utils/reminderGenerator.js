import { ROUTINE_TYPES, ROUTINE_FREQUENCY } from "@/data/routinesData";
import { REMINDER_STATUS } from "@/data/remindersData";

/**
 * Generate reminders from a routine
 * Creates reminders for the next 7-14 days based on routine schedule
 */
export function generateRemindersFromRoutine(routine, daysAhead = 14) {
  if (!routine.isActive || !routine.notificationEnabled) {
    return [];
  }

  const reminders = [];
  const now = new Date();
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + daysAhead);

  // Get primary action based on routine type
  const primaryAction = getPrimaryActionForRoutineType(routine.type);

  // Get related tracker
  const relatedTracker = getRelatedTrackerForRoutineType(routine.type);

  switch (routine.type) {
    case ROUTINE_TYPES.FEEDING:
      return generateFeedingReminders(
        routine,
        now,
        endDate,
        primaryAction,
        relatedTracker,
      );

    case ROUTINE_TYPES.WALK:
      return generateWalkReminders(
        routine,
        now,
        endDate,
        primaryAction,
        relatedTracker,
      );

    case ROUTINE_TYPES.MEDICATION:
      return generateMedicationReminders(
        routine,
        now,
        endDate,
        primaryAction,
        relatedTracker,
      );

    case ROUTINE_TYPES.PHOTO_CHECK:
      return generatePhotoCheckReminders(
        routine,
        now,
        endDate,
        primaryAction,
        relatedTracker,
      );

    case ROUTINE_TYPES.GENERAL_CHECK:
      return generateGeneralCheckReminders(
        routine,
        now,
        endDate,
        primaryAction,
        relatedTracker,
      );

    case ROUTINE_TYPES.WEIGHT_CHECK:
      return generateWeightCheckReminders(
        routine,
        now,
        endDate,
        primaryAction,
        relatedTracker,
      );

    case ROUTINE_TYPES.PREVENTIVE:
      return generatePreventiveReminders(
        routine,
        now,
        endDate,
        primaryAction,
        relatedTracker,
      );

    case ROUTINE_TYPES.VACCINE:
      return generateVaccineReminders(
        routine,
        now,
        endDate,
        primaryAction,
        relatedTracker,
      );

    case ROUTINE_TYPES.VET_APPOINTMENT:
      return generateVetAppointmentReminders(
        routine,
        now,
        endDate,
        primaryAction,
        relatedTracker,
      );

    case ROUTINE_TYPES.MEDICAL_CARE:
      return generateMedicalCareReminders(routine, now, endDate);

    case ROUTINE_TYPES.WELLNESS_CHECK:
      return generateWellnessCheckReminders(
        routine,
        now,
        endDate,
        primaryAction,
        relatedTracker,
      );

    default:
      return [];
  }
}

function generateFeedingReminders(
  routine,
  now,
  endDate,
  primaryAction,
  relatedTracker,
) {
  const reminders = [];
  const meals = Array.isArray(routine.meals) ? routine.meals : [];

  // Generate reminders for each meal based on its individual schedule
  meals.forEach((meal, mealIndex) => {
    // Skip if meal reminders are disabled
    if (meal.reminderEnabled === false) {
      return;
    }

    // Get active days for this specific meal
    const mealDays = getMealActiveDays(meal);

    let currentDate = new Date(now);
    currentDate.setHours(0, 0, 0, 0);

    while (currentDate <= endDate) {
      const dayOfWeek = (currentDate.getDay() + 6) % 7; // Convert to Monday=0

      if (mealDays.includes(dayOfWeek)) {
        const [hours, minutes] = meal.time.split(":");
        const scheduledTime = new Date(currentDate);
        scheduledTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);

        if (scheduledTime >= now) {
          const mealId = meal.id || `${routine.id}_meal_${mealIndex}`;
          const dateStr = currentDate.toISOString().split("T")[0];

          reminders.push({
            id: `reminder_${routine.id}_${mealId}_${dateStr}`,
            routineId: routine.id,
            mealId: mealId,
            petId: routine.petId,
            type: "feeding",
            title: meal.name || "Meal",
            description:
              meal.notes || `Time for ${(meal.name || "meal").toLowerCase()}`,
            scheduledAt: scheduledTime.toISOString(),
            nextTriggerAt: scheduledTime.toISOString(),
            status: REMINDER_STATUS.UPCOMING,
            priority: "medium",
            timeSensitive: meal.timeSensitive ?? true,
            notificationEnabled: meal.reminderEnabled ?? true,
            relatedTracker: relatedTracker,
            primaryAction,
            notes: meal.notes || "",
            completedAt: null,
            snoozedUntil: null,
          });
        }
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }
  });

  return reminders;
}

function generateWalkReminders(
  routine,
  now,
  endDate,
  primaryAction,
  relatedTracker,
) {
  const reminders = [];
  const walks = Array.isArray(routine.walks) ? routine.walks : [];

  let currentDate = new Date(now);
  currentDate.setHours(0, 0, 0, 0);

  while (currentDate <= endDate) {
    const dayOfWeek = (currentDate.getDay() + 6) % 7; // Convert to Monday=0

    walks.forEach((walk, index) => {
      // Get walk-specific schedule
      const walkDays = getWalkActiveDays(walk);

      // Check if this walk is scheduled for this day
      if (!walkDays.includes(dayOfWeek)) return;

      const [hours, minutes] = walk.time.split(":");
      const scheduledTime = new Date(currentDate);
      scheduledTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);

      if (scheduledTime >= now) {
        reminders.push({
          id: `reminder_${routine.id}_${
            currentDate.toISOString().split("T")[0]
          }_${index}`,
          routineId: routine.id,
          petId: routine.petId,
          type: "walk",
          title: walk.name,
          description: `Time for ${walk.name.toLowerCase()}`,
          scheduledAt: scheduledTime.toISOString(),
          nextTriggerAt: scheduledTime.toISOString(),
          status: REMINDER_STATUS.UPCOMING,
          priority: "medium",
          timeSensitive: walk.timeSensitive ?? routine.timeSensitive ?? true,
          notificationEnabled:
            walk.reminderEnabled ?? routine.notificationEnabled ?? true,
          relatedTracker: relatedTracker,
          primaryAction,
          // Walk-specific data for countdown card and start walk flow
          relatedWalk: {
            name: walk.name,
            durationMinutes: walk.durationMinutes || 30,
            pace: walk.pace || "normal",
            notes: walk.notes || "",
          },
          walkDuration: walk.durationMinutes || 30,
          walkPace: walk.pace || "normal",
          notes: walk.notes || "",
          completedAt: null,
          snoozedUntil: null,
        });
      }
    });

    currentDate.setDate(currentDate.getDate() + 1);
  }

  return reminders;
}

function generateMedicationReminders(
  routine,
  now,
  endDate,
  primaryAction,
  relatedTracker,
) {
  const reminders = [];
  const times = Array.isArray(routine.times) ? routine.times : [];
  const startDate = routine.startDate
    ? new Date(routine.startDate)
    : new Date();
  const medicationEndDate = routine.endDate
    ? new Date(routine.endDate)
    : endDate;

  let currentDate = new Date(Math.max(now, startDate));
  currentDate.setHours(0, 0, 0, 0);

  while (currentDate <= endDate && currentDate <= medicationEndDate) {
    times.forEach((time, index) => {
      const [hours, minutes] = time.split(":");
      const scheduledTime = new Date(currentDate);
      scheduledTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);

      if (scheduledTime >= now) {
        reminders.push({
          id: `reminder_${routine.id}_${
            currentDate.toISOString().split("T")[0]
          }_${index}`,
          routineId: routine.id,
          petId: routine.petId,
          type: "medication",
          title: routine.medicationName || "Medication",
          description: `${routine.dose || "Dose"} - ${
            routine.instructions || "Take medication"
          }`,
          scheduledAt: scheduledTime.toISOString(),
          nextTriggerAt: scheduledTime.toISOString(),
          status: REMINDER_STATUS.UPCOMING,
          priority: "high",
          timeSensitive: routine.timeSensitive ?? true,
          notificationEnabled: routine.notificationEnabled ?? true,
          relatedTracker: relatedTracker,
          primaryAction,
          completedAt: null,
          snoozedUntil: null,
        });
      }
    });

    currentDate.setDate(currentDate.getDate() + 1);
  }

  return reminders;
}

function generatePhotoCheckReminders(
  routine,
  now,
  endDate,
  primaryAction,
  relatedTracker,
) {
  const reminders = [];

  // Support both new multi-area format and legacy single-area format
  const photoCheckSchedules =
    routine.photoCheckSchedule && Array.isArray(routine.photoCheckSchedule)
      ? routine.photoCheckSchedule
      : routine.bodyArea
        ? [
            {
              bodyArea: routine.bodyArea,
              frequency: routine.frequency || ROUTINE_FREQUENCY.WEEKLY,
              preferredDay: routine.preferredDay ?? 6,
              preferredTime: routine.times?.[0] || "10:00",
              reminderEnabled: routine.notificationEnabled ?? true,
              timeSensitive: routine.timeSensitive ?? false,
              notes: routine.notes || "",
            },
          ]
        : [];

  // Generate reminders for each body area
  photoCheckSchedules.forEach((schedule, scheduleIndex) => {
    // Skip if reminders disabled for this area
    if (schedule.reminderEnabled === false) {
      return;
    }

    const preferredDay = schedule.preferredDay ?? 6; // Sunday
    const [hours, minutes] = (schedule.preferredTime || "10:00").split(":");
    const frequency = schedule.frequency || ROUTINE_FREQUENCY.WEEKLY;

    let currentDate = new Date(now);
    currentDate.setHours(0, 0, 0, 0);

    // Find next occurrence of preferred day
    while (currentDate <= endDate) {
      const dayOfWeek = (currentDate.getDay() + 6) % 7;

      if (dayOfWeek === preferredDay) {
        const scheduledTime = new Date(currentDate);
        scheduledTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);

        if (scheduledTime >= now) {
          const bodyAreaLabel = schedule.bodyArea?.toUpperCase() || "BODY";

          reminders.push({
            id: `reminder_${routine.id}_${schedule.bodyArea}_${
              currentDate.toISOString().split("T")[0]
            }`,
            routineId: routine.id,
            photoCheckScheduleIndex: scheduleIndex,
            petId: routine.petId,
            type: "photo_check",
            title: `${bodyAreaLabel} Check`,
            description: `Take photo of ${
              schedule.bodyArea?.replace("_", " ") || "body area"
            }`,
            scheduledAt: scheduledTime.toISOString(),
            nextTriggerAt: scheduledTime.toISOString(),
            status: REMINDER_STATUS.UPCOMING,
            priority: "medium",
            timeSensitive: schedule.timeSensitive ?? false,
            notificationEnabled: schedule.reminderEnabled ?? true,
            relatedTracker: relatedTracker,
            relatedBodyArea: schedule.bodyArea,
            primaryAction,
            notes: schedule.notes || "",
            completedAt: null,
            snoozedUntil: null,
          });
        }

        // Move to next occurrence based on frequency
        if (frequency === ROUTINE_FREQUENCY.WEEKLY) {
          currentDate.setDate(currentDate.getDate() + 7);
        } else if (frequency === ROUTINE_FREQUENCY.BIWEEKLY) {
          currentDate.setDate(currentDate.getDate() + 14);
        } else {
          currentDate.setDate(currentDate.getDate() + 30);
        }
      } else {
        currentDate.setDate(currentDate.getDate() + 1);
      }
    }
  });

  return reminders;
}

function generateGeneralCheckReminders(
  routine,
  now,
  endDate,
  primaryAction,
  relatedTracker,
) {
  const reminders = [];
  const [hours, minutes] = (routine.times?.[0] || "20:00").split(":");

  if (routine.frequency === ROUTINE_FREQUENCY.DAILY) {
    let currentDate = new Date(now);
    currentDate.setHours(0, 0, 0, 0);

    while (currentDate <= endDate) {
      const scheduledTime = new Date(currentDate);
      scheduledTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);

      if (scheduledTime >= now) {
        reminders.push({
          id: `reminder_${routine.id}_${
            currentDate.toISOString().split("T")[0]
          }`,
          routineId: routine.id,
          petId: routine.petId,
          type: "general_check",
          title: "General Check",
          description: "Check Phoebe's overall health",
          scheduledAt: scheduledTime.toISOString(),
          nextTriggerAt: scheduledTime.toISOString(),
          status: REMINDER_STATUS.UPCOMING,
          priority: "medium",
          timeSensitive: routine.timeSensitive ?? true,
          notificationEnabled: routine.notificationEnabled ?? true,
          relatedTracker: relatedTracker,
          primaryAction,
          completedAt: null,
          snoozedUntil: null,
        });
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }
  } else {
    // Weekly/Biweekly
    const preferredDay = routine.preferredDay ?? 6;
    let currentDate = new Date(now);
    currentDate.setHours(0, 0, 0, 0);

    while (currentDate <= endDate) {
      const dayOfWeek = (currentDate.getDay() + 6) % 7;

      if (dayOfWeek === preferredDay) {
        const scheduledTime = new Date(currentDate);
        scheduledTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);

        if (scheduledTime >= now) {
          reminders.push({
            id: `reminder_${routine.id}_${
              currentDate.toISOString().split("T")[0]
            }`,
            routineId: routine.id,
            petId: routine.petId,
            type: "general_check",
            title: "General Check",
            description: "Check Phoebe's overall health",
            scheduledAt: scheduledTime.toISOString(),
            nextTriggerAt: scheduledTime.toISOString(),
            status: REMINDER_STATUS.UPCOMING,
            priority: "medium",
            timeSensitive: routine.timeSensitive ?? true,
            notificationEnabled: routine.notificationEnabled ?? true,
            relatedTracker: relatedTracker,
            primaryAction,
            completedAt: null,
            snoozedUntil: null,
          });
        }

        const increment =
          routine.frequency === ROUTINE_FREQUENCY.WEEKLY ? 7 : 14;
        currentDate.setDate(currentDate.getDate() + increment);
      } else {
        currentDate.setDate(currentDate.getDate() + 1);
      }
    }
  }

  return reminders;
}

function generateWeightCheckReminders(
  routine,
  now,
  endDate,
  primaryAction,
  relatedTracker,
) {
  const reminders = [];
  const preferredDay = routine.preferredDay ?? 6;
  const [hours, minutes] = (routine.times?.[0] || "09:00").split(":");

  let currentDate = new Date(now);
  currentDate.setHours(0, 0, 0, 0);

  while (currentDate <= endDate) {
    const dayOfWeek = (currentDate.getDay() + 6) % 7;

    if (dayOfWeek === preferredDay) {
      const scheduledTime = new Date(currentDate);
      scheduledTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);

      if (scheduledTime >= now) {
        reminders.push({
          id: `reminder_${routine.id}_${
            currentDate.toISOString().split("T")[0]
          }`,
          routineId: routine.id,
          petId: routine.petId,
          type: "weight_check",
          title: "Weight Check",
          description: "Log Phoebe's weight",
          scheduledAt: scheduledTime.toISOString(),
          nextTriggerAt: scheduledTime.toISOString(),
          status: REMINDER_STATUS.UPCOMING,
          priority: "low",
          timeSensitive: false,
          notificationEnabled: routine.notificationEnabled ?? true,
          relatedTracker: relatedTracker,
          primaryAction,
          completedAt: null,
          snoozedUntil: null,
        });
      }

      const increment =
        routine.frequency === ROUTINE_FREQUENCY.WEEKLY
          ? 7
          : routine.frequency === ROUTINE_FREQUENCY.BIWEEKLY
            ? 14
            : 30;
      currentDate.setDate(currentDate.getDate() + increment);
    } else {
      currentDate.setDate(currentDate.getDate() + 1);
    }
  }

  return reminders;
}

function generatePreventiveReminders(
  routine,
  now,
  endDate,
  primaryAction,
  relatedTracker,
) {
  const reminders = [];
  const nextDue = routine.nextDue ? new Date(routine.nextDue) : null;

  if (nextDue && nextDue >= now && nextDue <= endDate) {
    reminders.push({
      id: `reminder_${routine.id}_${nextDue.toISOString().split("T")[0]}`,
      routineId: routine.id,
      petId: routine.petId,
      type: "preventive",
      title: routine.productName || "Preventive Care",
      description: `${
        routine.treatmentType?.charAt(0).toUpperCase() +
          routine.treatmentType?.slice(1) || "Treatment"
      } prevention due`,
      scheduledAt: nextDue.toISOString(),
      nextTriggerAt: nextDue.toISOString(),
      status: REMINDER_STATUS.UPCOMING,
      priority: "high",
      timeSensitive: routine.timeSensitive ?? true,
      notificationEnabled: routine.notificationEnabled ?? true,
      relatedTracker: relatedTracker,
      primaryAction,
      completedAt: null,
      snoozedUntil: null,
    });
  }

  return reminders;
}

function generateVaccineReminders(
  routine,
  now,
  endDate,
  primaryAction,
  relatedTracker,
) {
  const reminders = [];
  const nextDue = routine.nextDue ? new Date(routine.nextDue) : null;

  if (nextDue && nextDue >= now && nextDue <= endDate) {
    reminders.push({
      id: `reminder_${routine.id}_${nextDue.toISOString().split("T")[0]}`,
      routineId: routine.id,
      petId: routine.petId,
      type: "vaccine",
      title: `${routine.vaccineName || "Vaccine"} Due`,
      description: `Time for ${routine.vaccineName || "vaccine"}`,
      scheduledAt: nextDue.toISOString(),
      nextTriggerAt: nextDue.toISOString(),
      status: REMINDER_STATUS.UPCOMING,
      priority: "high",
      timeSensitive: routine.timeSensitive ?? true,
      notificationEnabled: routine.notificationEnabled ?? true,
      relatedTracker: relatedTracker,
      primaryAction,
      completedAt: null,
      snoozedUntil: null,
    });
  }

  return reminders;
}

function generateVetAppointmentReminders(
  routine,
  now,
  endDate,
  primaryAction,
  relatedTracker,
) {
  const reminders = [];
  const appointmentDate = routine.date ? new Date(routine.date) : null;

  if (appointmentDate && routine.times?.[0]) {
    const [hours, minutes] = routine.times[0].split(":");
    const scheduledTime = new Date(appointmentDate);
    scheduledTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);

    if (scheduledTime >= now && scheduledTime <= endDate) {
      reminders.push({
        id: `reminder_${routine.id}_${
          appointmentDate.toISOString().split("T")[0]
        }`,
        routineId: routine.id,
        petId: routine.petId,
        type: "vet_appointment",
        title: routine.appointmentTitle || "Vet Appointment",
        description: `${routine.clinic || "Vet visit"} - ${
          routine.reason || "Appointment"
        }`,
        scheduledAt: scheduledTime.toISOString(),
        nextTriggerAt: scheduledTime.toISOString(),
        status: REMINDER_STATUS.UPCOMING,
        priority: "high",
        timeSensitive: routine.timeSensitive ?? true,
        notificationEnabled: routine.notificationEnabled ?? true,
        relatedTracker: relatedTracker,
        primaryAction,
        completedAt: null,
        snoozedUntil: null,
      });
    }
  }

  return reminders;
}

// =========================================================================
// Medical Care: one reminder per care item
// =========================================================================
function generateMedicalCareReminders(routine, now, endDate) {
  const items = Array.isArray(routine.medicalCareItems)
    ? routine.medicalCareItems
    : [];
  const reminders = [];

  items.forEach((item) => {
    // Skip disabled items, but keep routine-level disabling separate
    if (item.active === false) return;
    if (item.reminderEnabled === false) return;

    const careType = item.type;
    const title = buildMedicalCareTitle(item);
    const description = buildMedicalCareDescription(item);
    const primaryAction = getMedicalCarePrimaryAction(careType);

    const baseFields = {
      routineId: routine.id,
      medicalCareItemId: item.id,
      petId: routine.petId,
      type: "medical_care",
      careType,
      title,
      description,
      status: REMINDER_STATUS.UPCOMING,
      priority: getMedicalCarePriority(careType),
      timeSensitive: item.timeSensitive ?? true,
      notificationEnabled: item.reminderEnabled ?? true,
      relatedTracker: "medical_care",
      primaryAction,
      notes: item.notes || "",
      completedAt: null,
      snoozedUntil: null,
    };

    // --- Daily-schedule items: medication, supplement ---
    if (careType === "medication" || careType === "supplement") {
      const times = Array.isArray(item.times) ? item.times : [];
      const startDate = item.startDate ? new Date(item.startDate) : new Date();
      const itemEndDate = item.endDate ? new Date(item.endDate) : endDate;

      let currentDate = new Date(Math.max(now.getTime(), startDate.getTime()));
      currentDate.setHours(0, 0, 0, 0);

      while (currentDate <= endDate && currentDate <= itemEndDate) {
        times.forEach((time, timeIdx) => {
          const [hours, minutes] = time.split(":");
          const scheduledTime = new Date(currentDate);
          scheduledTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);

          if (scheduledTime >= now) {
            const dateStr = currentDate.toISOString().split("T")[0];
            reminders.push({
              ...baseFields,
              id: `reminder_${routine.id}_${item.id}_${dateStr}_${timeIdx}`,
              scheduledAt: scheduledTime.toISOString(),
              nextTriggerAt: scheduledTime.toISOString(),
            });
          }
        });
        currentDate.setDate(currentDate.getDate() + 1);
      }
      return;
    }

    // --- Date-based items: vaccine, preventives, other ---
    const nextDueStr = item.nextDue;
    if (!nextDueStr) return;

    const nextDue = new Date(nextDueStr);
    if (isNaN(nextDue.getTime())) return;

    // Vaccine reminder timing offset
    let triggerTime = new Date(nextDue);
    if (careType === "vaccine" && item.reminderTiming) {
      const offsetDays = {
        on_due: 0,
        "1w": -7,
        "2w": -14,
        "1m": -30,
      };
      const days = offsetDays[item.reminderTiming] ?? 0;
      triggerTime.setDate(triggerTime.getDate() + days);
    }
    // Default scheduled time of day for date-based items
    triggerTime.setHours(9, 0, 0, 0);

    if (triggerTime >= now && triggerTime <= endDate) {
      const dateStr = triggerTime.toISOString().split("T")[0];
      reminders.push({
        ...baseFields,
        id: `reminder_${routine.id}_${item.id}_${dateStr}`,
        scheduledAt: triggerTime.toISOString(),
        nextTriggerAt: triggerTime.toISOString(),
      });
    }
  });

  return reminders;
}

// =========================================================================
// Wellness Check: one reminder per check item
// =========================================================================
function generateWellnessCheckReminders(
  routine,
  now,
  endDate,
  primaryAction,
  relatedTracker,
) {
  const reminders = [];

  // Support both new multi-item format and legacy format
  const wellnessCheckItems =
    routine.wellnessCheckItems && Array.isArray(routine.wellnessCheckItems)
      ? routine.wellnessCheckItems
      : [];

  // Generate reminders for each check item
  wellnessCheckItems.forEach((item, itemIndex) => {
    // Skip if reminders disabled for this item
    if (item.reminderEnabled === false) {
      return;
    }

    const checkType = item.checkType || "general";
    const checkLabel = getWellnessCheckLabel(item);
    const [hours, minutes] = (item.preferredTime || "09:00").split(":");
    const frequency = item.frequency || ROUTINE_FREQUENCY.WEEKLY;
    const preferredDay = item.preferredDay ?? 6;

    let currentDate = new Date(now);
    currentDate.setHours(0, 0, 0, 0);

    // Find next occurrence based on frequency
    while (currentDate <= endDate) {
      const dayOfWeek = (currentDate.getDay() + 6) % 7;
      let shouldSchedule = false;

      if (frequency === ROUTINE_FREQUENCY.DAILY) {
        shouldSchedule = true;
      } else if (
        frequency === ROUTINE_FREQUENCY.WEEKLY ||
        frequency === ROUTINE_FREQUENCY.BIWEEKLY
      ) {
        shouldSchedule = dayOfWeek === preferredDay;
      } else if (frequency === ROUTINE_FREQUENCY.MONTHLY) {
        // For monthly, use preferredDay as day-of-month approximation
        shouldSchedule = currentDate.getDate() === (preferredDay % 28) + 1;
      }

      if (shouldSchedule) {
        const scheduledTime = new Date(currentDate);
        scheduledTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);

        if (scheduledTime >= now) {
          const dateStr = currentDate.toISOString().split("T")[0];

          reminders.push({
            id: `reminder_${routine.id}_${checkType}_${itemIndex}_${dateStr}`,
            routineId: routine.id,
            wellnessCheckItemIndex: itemIndex,
            petId: routine.petId,
            type: "wellness_check",
            checkType,
            title: checkLabel,
            description: getWellnessCheckDescription(item),
            scheduledAt: scheduledTime.toISOString(),
            nextTriggerAt: scheduledTime.toISOString(),
            status: REMINDER_STATUS.UPCOMING,
            priority: "medium",
            timeSensitive: item.timeSensitive ?? false,
            notificationEnabled: item.reminderEnabled ?? true,
            relatedTracker: getWellnessCheckTracker(checkType),
            primaryAction: getWellnessCheckAction(checkType),
            notes: item.notes || "",
            completedAt: null,
            snoozedUntil: null,
          });
        }

        // Move to next occurrence based on frequency
        if (frequency === ROUTINE_FREQUENCY.DAILY) {
          currentDate.setDate(currentDate.getDate() + 1);
        } else if (frequency === ROUTINE_FREQUENCY.WEEKLY) {
          currentDate.setDate(currentDate.getDate() + 7);
        } else if (frequency === ROUTINE_FREQUENCY.BIWEEKLY) {
          currentDate.setDate(currentDate.getDate() + 14);
        } else if (frequency === ROUTINE_FREQUENCY.MONTHLY) {
          currentDate.setDate(currentDate.getDate() + 30);
        } else {
          currentDate.setDate(currentDate.getDate() + 1);
        }
      } else {
        currentDate.setDate(currentDate.getDate() + 1);
      }
    }
  });

  return reminders;
}

function getWellnessCheckLabel(item) {
  if (item.checkType === "custom" && item.customName) {
    return item.customName;
  }

  const labels = {
    general: "General Check",
    weight: "Weight Check",
    body_condition: "Body Condition Check",
    mobility: "Mobility Check",
    mood_energy: "Mood/Energy Check",
    skin_coat: "Skin/Coat Check",
    appetite_hydration: "Appetite/Hydration Check",
  };
  return labels[item.checkType] || "Wellness Check";
}

function getWellnessCheckDescription(item) {
  if (item.notes) return item.notes;

  const descriptions = {
    general: "Check Phoebe's overall health",
    weight: "Log Phoebe's weight",
    body_condition: "Assess Phoebe's body condition",
    mobility: "Check Phoebe's mobility and movement",
    mood_energy: "Check Phoebe's mood and energy level",
    skin_coat: "Inspect Phoebe's skin and coat",
    appetite_hydration: "Check Phoebe's appetite and water intake",
  };
  return descriptions[item.checkType] || "Complete wellness check";
}

function getWellnessCheckAction(checkType) {
  const actions = {
    weight: "Log weight",
    general: "Start check",
    body_condition: "Start check",
    mobility: "Start check",
    mood_energy: "Log check",
    skin_coat: "Start check",
    appetite_hydration: "Log check",
  };
  return actions[checkType] || "Start check";
}

function getWellnessCheckTracker(checkType) {
  const trackers = {
    general: "general_check",
    weight: "weight",
    body_condition: "general_check",
    mobility: "mobility",
    mood_energy: "general_check",
    skin_coat: "general_check",
    appetite_hydration: "food_water",
  };
  return trackers[checkType] || "general_check";
}

function buildMedicalCareTitle(item) {
  const name = item.name || "";
  switch (item.type) {
    case "medication":
      return name || "Medication";
    case "supplement":
      return name || "Supplement";
    case "vaccine":
      return name ? `${name} vaccine due` : "Vaccine due";
    case "flea_tick":
      return name ? `${name} due` : "Flea/tick prevention due";
    case "deworming":
      return name ? `${name} due` : "Deworming due";
    case "heartworm":
      return name ? `${name} due` : "Heartworm prevention due";
    case "other":
      return name || "Medical care";
    default:
      return name || "Medical care";
  }
}

function buildMedicalCareDescription(item) {
  switch (item.type) {
    case "medication": {
      const parts = [];
      if (item.dose) parts.push(item.dose);
      if (item.instructions) parts.push(item.instructions);
      return parts.join(" · ") || "Medication due";
    }
    case "supplement": {
      const parts = [];
      if (item.dose) parts.push(item.dose);
      if (item.timingMode === "linked" && item.linkedMeal) {
        const map = {
          breakfast: "With breakfast",
          dinner: "With dinner",
          meal: "With meal",
        };
        parts.push(map[item.linkedMeal] || "With meal");
      }
      if (item.instructions) parts.push(item.instructions);
      return parts.join(" · ") || "Supplement due";
    }
    case "vaccine":
      return item.nextDue
        ? `Due ${formatShortDate(item.nextDue)}`
        : "Vaccine due";
    case "flea_tick":
      return "Flea/tick prevention";
    case "deworming":
      return "Deworming";
    case "heartworm":
      return "Heartworm prevention";
    case "other":
      return item.description || "Care due";
    default:
      return "Medical care due";
  }
}

function getMedicalCarePrimaryAction(careType) {
  switch (careType) {
    case "medication":
    case "supplement":
    case "flea_tick":
    case "deworming":
    case "heartworm":
      return "Mark as given";
    case "vaccine":
      return "Add vet record";
    case "other":
      return "Mark completed";
    default:
      return "Done";
  }
}

function getMedicalCarePriority(careType) {
  if (careType === "medication" || careType === "vaccine") return "high";
  return "medium";
}

function formatShortDate(dateStr) {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return dateStr;
  }
}

// Helper: Get active days for a routine
function getActiveDays(routine) {
  if (routine.frequency === ROUTINE_FREQUENCY.DAILY) {
    return [0, 1, 2, 3, 4, 5, 6]; // All days
  } else if (routine.frequency === ROUTINE_FREQUENCY.WEEKDAYS) {
    return [0, 1, 2, 3, 4]; // Mon-Fri
  } else if (routine.frequency === ROUTINE_FREQUENCY.WEEKENDS) {
    return [5, 6]; // Sat-Sun
  } else if (routine.frequency === ROUTINE_FREQUENCY.CUSTOM) {
    return routine.days || [0, 1, 2, 3, 4, 5, 6];
  }
  return [0, 1, 2, 3, 4, 5, 6];
}

// Helper: Get active days for a specific meal
function getMealActiveDays(meal) {
  const frequency = meal.frequency || ROUTINE_FREQUENCY.DAILY;

  if (frequency === ROUTINE_FREQUENCY.DAILY) {
    return [0, 1, 2, 3, 4, 5, 6]; // All days
  } else if (frequency === ROUTINE_FREQUENCY.WEEKDAYS) {
    return [0, 1, 2, 3, 4]; // Mon-Fri
  } else if (frequency === ROUTINE_FREQUENCY.WEEKENDS) {
    return [5, 6]; // Sat-Sun
  } else if (frequency === ROUTINE_FREQUENCY.CUSTOM) {
    return meal.days || [0, 1, 2, 3, 4, 5, 6];
  }
  return [0, 1, 2, 3, 4, 5, 6];
}

// Helper: Get active days for a specific walk
function getWalkActiveDays(walk) {
  const frequency = walk.frequency || ROUTINE_FREQUENCY.DAILY;

  if (frequency === ROUTINE_FREQUENCY.DAILY) {
    return [0, 1, 2, 3, 4, 5, 6]; // All days
  } else if (frequency === ROUTINE_FREQUENCY.WEEKDAYS) {
    return [0, 1, 2, 3, 4]; // Mon-Fri
  } else if (frequency === ROUTINE_FREQUENCY.WEEKENDS) {
    return [5, 6]; // Sat-Sun
  } else if (frequency === ROUTINE_FREQUENCY.CUSTOM) {
    return walk.days || [0, 1, 2, 3, 4, 5, 6];
  }
  return [0, 1, 2, 3, 4, 5, 6];
}

// Helper: Get primary action for routine type
function getPrimaryActionForRoutineType(type) {
  const actions = {
    [ROUTINE_TYPES.FEEDING]: "Log food",
    [ROUTINE_TYPES.WALK]: "Start walk",
    [ROUTINE_TYPES.MEDICATION]: "Mark as given",
    [ROUTINE_TYPES.PHOTO_CHECK]: "Take photo",
    [ROUTINE_TYPES.GENERAL_CHECK]: "Start check",
    [ROUTINE_TYPES.WEIGHT_CHECK]: "Log weight",
    [ROUTINE_TYPES.WELLNESS_CHECK]: "Start check",
    [ROUTINE_TYPES.PREVENTIVE]: "Mark as given",
    [ROUTINE_TYPES.VACCINE]: "View vaccine record",
    [ROUTINE_TYPES.VET_APPOINTMENT]: "Prepare vet summary",
    [ROUTINE_TYPES.MEDICAL_CARE]: "Mark as given",
  };
  return actions[type] || "Done";
}

// Helper: Get related tracker for routine type
function getRelatedTrackerForRoutineType(type) {
  const trackers = {
    [ROUTINE_TYPES.FEEDING]: "feeding",
    [ROUTINE_TYPES.WALK]: "walk",
    [ROUTINE_TYPES.MEDICATION]: "medication",
    [ROUTINE_TYPES.PHOTO_CHECK]: "photo_check",
    [ROUTINE_TYPES.GENERAL_CHECK]: "general_check",
    [ROUTINE_TYPES.WEIGHT_CHECK]: "weight",
    [ROUTINE_TYPES.WELLNESS_CHECK]: "wellness_check",
    [ROUTINE_TYPES.PREVENTIVE]: "preventive",
    [ROUTINE_TYPES.VACCINE]: "vaccine",
    [ROUTINE_TYPES.VET_APPOINTMENT]: "vet_appointment",
    [ROUTINE_TYPES.MEDICAL_CARE]: "medical_care",
  };
  return trackers[type] || null;
}

// =========================================================================
// Overdue enumeration — ADDITIVE sibling of generateRemindersFromRoutine.
//
// The locked default generator above emits future-only instances
// (scheduledTime >= now), so a past-due instance can never be re-emitted after a
// reload/restart. For the PERSISTENT reminder types — wellness check, medical
// care, photo check — "overdue" must carry across days and survive restart until
// the instance is resolved (logged) or dismissed. This function enumerates the
// PAST scheduled instances for those types within a bounded lookback window so the
// Today screen can reconcile them against the DB.
//
// It deliberately mirrors the schedule math of the locked generators (reusing the
// same item/label/id helpers so the emitted reminder shape and id are identical),
// rather than refactoring them to share code — the generator contract is locked +
// tested. The only differences are: the time window is [windowStart, now) instead
// of [now, endDate], and the emitted status is OVERDUE.
//
// Bounds: instances older than `lookbackDays` age out of Overdue silently. Note
// that biweekly/monthly cadence is phase-anchored to the window start here; daily
// and weekly (the common cases) are exact. Feeding/Walk are intentionally NOT
// enumerated — they are today-only/transient (handled separately).
// =========================================================================
export function generateOverdueInstances(
  routine,
  { lookbackDays = 30, now = new Date() } = {},
) {
  if (!routine || !routine.isActive || !routine.notificationEnabled) {
    return [];
  }

  const windowStart = new Date(now);
  windowStart.setDate(windowStart.getDate() - lookbackDays);
  windowStart.setHours(0, 0, 0, 0);

  switch (routine.type) {
    case ROUTINE_TYPES.WELLNESS_CHECK:
      return generateOverdueWellnessChecks(routine, now, windowStart);
    case ROUTINE_TYPES.MEDICAL_CARE:
      return generateOverdueMedicalCare(routine, now, windowStart);
    case ROUTINE_TYPES.PHOTO_CHECK:
      return generateOverduePhotoChecks(routine, now, windowStart);
    default:
      return [];
  }
}

// Step `currentDate` forward by one cadence period, matching the locked generators.
function advanceByFrequency(currentDate, frequency) {
  if (frequency === ROUTINE_FREQUENCY.WEEKLY) {
    currentDate.setDate(currentDate.getDate() + 7);
  } else if (frequency === ROUTINE_FREQUENCY.BIWEEKLY) {
    currentDate.setDate(currentDate.getDate() + 14);
  } else if (frequency === ROUTINE_FREQUENCY.MONTHLY) {
    currentDate.setDate(currentDate.getDate() + 30);
  } else {
    currentDate.setDate(currentDate.getDate() + 1);
  }
}

function generateOverdueWellnessChecks(routine, now, windowStart) {
  const reminders = [];
  const wellnessCheckItems = Array.isArray(routine.wellnessCheckItems)
    ? routine.wellnessCheckItems
    : [];

  wellnessCheckItems.forEach((item, itemIndex) => {
    if (item.reminderEnabled === false) return;

    const checkType = item.checkType || "general";
    const checkLabel = getWellnessCheckLabel(item);
    const [hours, minutes] = (item.preferredTime || "09:00").split(":");
    const frequency = item.frequency || ROUTINE_FREQUENCY.WEEKLY;
    const preferredDay = item.preferredDay ?? 6;

    let currentDate = new Date(windowStart);

    while (currentDate < now) {
      const dayOfWeek = (currentDate.getDay() + 6) % 7;
      let shouldSchedule = false;

      if (frequency === ROUTINE_FREQUENCY.DAILY) {
        shouldSchedule = true;
      } else if (
        frequency === ROUTINE_FREQUENCY.WEEKLY ||
        frequency === ROUTINE_FREQUENCY.BIWEEKLY
      ) {
        shouldSchedule = dayOfWeek === preferredDay;
      } else if (frequency === ROUTINE_FREQUENCY.MONTHLY) {
        shouldSchedule = currentDate.getDate() === (preferredDay % 28) + 1;
      }

      if (shouldSchedule) {
        const scheduledTime = new Date(currentDate);
        scheduledTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);

        if (scheduledTime < now && scheduledTime >= windowStart) {
          const dateStr = currentDate.toISOString().split("T")[0];
          reminders.push({
            id: `reminder_${routine.id}_${checkType}_${itemIndex}_${dateStr}`,
            routineId: routine.id,
            wellnessCheckItemIndex: itemIndex,
            petId: routine.petId,
            type: "wellness_check",
            checkType,
            title: checkLabel,
            description: getWellnessCheckDescription(item),
            scheduledAt: scheduledTime.toISOString(),
            nextTriggerAt: scheduledTime.toISOString(),
            status: REMINDER_STATUS.OVERDUE,
            priority: "medium",
            timeSensitive: item.timeSensitive ?? false,
            notificationEnabled: item.reminderEnabled ?? true,
            relatedTracker: getWellnessCheckTracker(checkType),
            primaryAction: getWellnessCheckAction(checkType),
            notes: item.notes || "",
            completedAt: null,
            snoozedUntil: null,
          });
        }

        advanceByFrequency(currentDate, frequency);
      } else {
        currentDate.setDate(currentDate.getDate() + 1);
      }
    }
  });

  return reminders;
}

function generateOverdueMedicalCare(routine, now, windowStart) {
  const items = Array.isArray(routine.medicalCareItems)
    ? routine.medicalCareItems
    : [];
  const reminders = [];

  items.forEach((item) => {
    if (item.active === false) return;
    if (item.reminderEnabled === false) return;

    const careType = item.type;
    const baseFields = {
      routineId: routine.id,
      medicalCareItemId: item.id,
      petId: routine.petId,
      type: "medical_care",
      careType,
      title: buildMedicalCareTitle(item),
      description: buildMedicalCareDescription(item),
      status: REMINDER_STATUS.OVERDUE,
      priority: getMedicalCarePriority(careType),
      timeSensitive: item.timeSensitive ?? true,
      notificationEnabled: item.reminderEnabled ?? true,
      relatedTracker: "medical_care",
      primaryAction: getMedicalCarePrimaryAction(careType),
      notes: item.notes || "",
      completedAt: null,
      snoozedUntil: null,
    };

    // --- Daily-schedule items: medication, supplement ---
    if (careType === "medication" || careType === "supplement") {
      const times = Array.isArray(item.times) ? item.times : [];
      const startDate = item.startDate ? new Date(item.startDate) : windowStart;

      let currentDate = new Date(
        Math.max(windowStart.getTime(), startDate.getTime()),
      );
      currentDate.setHours(0, 0, 0, 0);

      while (currentDate < now) {
        times.forEach((time, timeIdx) => {
          const [hours, minutes] = time.split(":");
          const scheduledTime = new Date(currentDate);
          scheduledTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);

          if (scheduledTime < now && scheduledTime >= windowStart) {
            const dateStr = currentDate.toISOString().split("T")[0];
            reminders.push({
              ...baseFields,
              id: `reminder_${routine.id}_${item.id}_${dateStr}_${timeIdx}`,
              scheduledAt: scheduledTime.toISOString(),
              nextTriggerAt: scheduledTime.toISOString(),
            });
          }
        });
        currentDate.setDate(currentDate.getDate() + 1);
      }
      return;
    }

    // --- Date-based items: vaccine, preventives, other ---
    const nextDueStr = item.nextDue;
    if (!nextDueStr) return;

    const nextDue = new Date(nextDueStr);
    if (isNaN(nextDue.getTime())) return;

    let triggerTime = new Date(nextDue);
    if (careType === "vaccine" && item.reminderTiming) {
      const offsetDays = { on_due: 0, "1w": -7, "2w": -14, "1m": -30 };
      const days = offsetDays[item.reminderTiming] ?? 0;
      triggerTime.setDate(triggerTime.getDate() + days);
    }
    triggerTime.setHours(9, 0, 0, 0);

    if (triggerTime < now && triggerTime >= windowStart) {
      const dateStr = triggerTime.toISOString().split("T")[0];
      reminders.push({
        ...baseFields,
        id: `reminder_${routine.id}_${item.id}_${dateStr}`,
        scheduledAt: triggerTime.toISOString(),
        nextTriggerAt: triggerTime.toISOString(),
      });
    }
  });

  return reminders;
}

function generateOverduePhotoChecks(routine, now, windowStart) {
  const reminders = [];

  const photoCheckSchedules =
    routine.photoCheckSchedule && Array.isArray(routine.photoCheckSchedule)
      ? routine.photoCheckSchedule
      : routine.bodyArea
        ? [
            {
              bodyArea: routine.bodyArea,
              frequency: routine.frequency || ROUTINE_FREQUENCY.WEEKLY,
              preferredDay: routine.preferredDay ?? 6,
              preferredTime: routine.times?.[0] || "10:00",
              reminderEnabled: routine.notificationEnabled ?? true,
              timeSensitive: routine.timeSensitive ?? false,
              notes: routine.notes || "",
            },
          ]
        : [];

  photoCheckSchedules.forEach((schedule, scheduleIndex) => {
    if (schedule.reminderEnabled === false) return;

    const preferredDay = schedule.preferredDay ?? 6;
    const [hours, minutes] = (schedule.preferredTime || "10:00").split(":");
    const frequency = schedule.frequency || ROUTINE_FREQUENCY.WEEKLY;

    let currentDate = new Date(windowStart);

    while (currentDate < now) {
      const dayOfWeek = (currentDate.getDay() + 6) % 7;

      if (dayOfWeek === preferredDay) {
        const scheduledTime = new Date(currentDate);
        scheduledTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);

        if (scheduledTime < now && scheduledTime >= windowStart) {
          const bodyAreaLabel = schedule.bodyArea?.toUpperCase() || "BODY";
          reminders.push({
            id: `reminder_${routine.id}_${schedule.bodyArea}_${
              currentDate.toISOString().split("T")[0]
            }`,
            routineId: routine.id,
            photoCheckScheduleIndex: scheduleIndex,
            petId: routine.petId,
            type: "photo_check",
            title: `${bodyAreaLabel} Check`,
            description: `Take photo of ${
              schedule.bodyArea?.replace("_", " ") || "body area"
            }`,
            scheduledAt: scheduledTime.toISOString(),
            nextTriggerAt: scheduledTime.toISOString(),
            status: REMINDER_STATUS.OVERDUE,
            priority: "medium",
            timeSensitive: schedule.timeSensitive ?? false,
            notificationEnabled: schedule.reminderEnabled ?? true,
            relatedTracker: "photo_check",
            relatedBodyArea: schedule.bodyArea,
            primaryAction: "Take photo",
            notes: schedule.notes || "",
            completedAt: null,
            snoozedUntil: null,
          });
        }

        if (frequency === ROUTINE_FREQUENCY.WEEKLY) {
          currentDate.setDate(currentDate.getDate() + 7);
        } else if (frequency === ROUTINE_FREQUENCY.BIWEEKLY) {
          currentDate.setDate(currentDate.getDate() + 14);
        } else {
          currentDate.setDate(currentDate.getDate() + 30);
        }
      } else {
        currentDate.setDate(currentDate.getDate() + 1);
      }
    }
  });

  return reminders;
}
