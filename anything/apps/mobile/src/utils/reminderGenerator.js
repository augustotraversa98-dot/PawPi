import { ROUTINE_TYPES, ROUTINE_FREQUENCY } from "@/data/routinesData";
import { REMINDER_STATUS } from "@/data/remindersData";

// A soft-deleted routine must generate NO reminders — neither forward nor overdue —
// independent of its is_active flag (delete also flips is_active off, but pausing
// shares that flag, so deletion needs its own marker). Checks both the app-format
// `deletedAt` and the raw `deleted_at` so any shape that reaches the generators is
// caught. This is the one boundary that distinguishes "deleted" (gone everywhere)
// from "inactive/paused" (still listed, regenerates when re-enabled).
export function isRoutineDeleted(routine) {
  return Boolean(routine?.deletedAt || routine?.deleted_at);
}

// =========================================================================
// Dev-time cadence guard
//
// Every cadence-driven routine type now resolves its schedule through the shared
// cadence layer, so the redesigned ScheduleBlock can offer any cadence on any of
// these types and it will actually fire. This guard makes that contract explicit:
// if a routine ever carries a cadence its generator path cannot honor, fail
// LOUDLY in development instead of silently emitting nothing. No-op in production.
//
// "ALL" = every value in ROUTINE_FREQUENCY is honored (forward and, for the
// persistent types, overdue). A Set lists the only honored cadences. A type
// absent from the map is not driven by this layer and is left unchecked (the
// legacy single-purpose types — medication/general-check/weight-check/preventive/
// vaccine — keep their own narrower handling and are out of the redesign's
// ScheduleBlock scope).
// =========================================================================
const CADENCE_SUPPORT = {
  [ROUTINE_TYPES.WELLNESS_CHECK]: "ALL",
  [ROUTINE_TYPES.PHOTO_CHECK]: "ALL",
  [ROUTINE_TYPES.FEEDING]: "ALL",
  [ROUTINE_TYPES.WALK]: "ALL",
  [ROUTINE_TYPES.MEDICAL_CARE]: "ALL",
  // A vet appointment is a single dated event — recurring/hourly cadences are
  // genuinely N/A and must never be offered for it.
  [ROUTINE_TYPES.VET_APPOINTMENT]: new Set([ROUTINE_FREQUENCY.ONCE]),
};

// The cadences a routine actually carries. Most types hold one per schedule item;
// the legacy date-set types carry a single routine-level frequency.
function collectRoutineCadences(routine) {
  const itemLists = {
    [ROUTINE_TYPES.WELLNESS_CHECK]: routine.wellnessCheckItems,
    [ROUTINE_TYPES.PHOTO_CHECK]: routine.photoCheckSchedule,
    [ROUTINE_TYPES.FEEDING]: routine.meals,
    [ROUTINE_TYPES.WALK]: routine.walks,
    [ROUTINE_TYPES.MEDICAL_CARE]: routine.medicalCareItems,
  };
  const items = itemLists[routine.type];
  if (Array.isArray(items)) {
    return items.map((i) => i?.frequency).filter(Boolean);
  }
  return routine.frequency ? [routine.frequency] : [];
}

function assertCadenceHonored(routine) {
  if (typeof __DEV__ === "undefined" || !__DEV__) return;
  if (!routine) return;
  const support = CADENCE_SUPPORT[routine.type];
  if (!support || support === "ALL") return;
  for (const frequency of collectRoutineCadences(routine)) {
    if (!support.has(frequency)) {
      throw new Error(
        `[reminderGenerator] ${routine.type} cannot honor cadence "${frequency}" — ` +
          `the schedule would silently never fire. Supported: ${[...support].join(", ")}.`,
      );
    }
  }
}

/**
 * Generate reminders from a routine
 * Creates reminders for the next 7-14 days based on routine schedule
 */
export function generateRemindersFromRoutine(routine, daysAhead = 14) {
  assertCadenceHonored(routine);
  if (isRoutineDeleted(routine) || !routine.isActive || !routine.notificationEnabled) {
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

// =========================================================================
// Instance id convention — `reminder_<routineId>_<item/part>_<dateStr>[_idx]`,
// where dateStr is `currentDate.toISOString().split("T")[0]`: the UTC date of
// LOCAL midnight. For UTC+ timezones that is one day BEHIND the local calendar
// day (local Jun 10 → "2026-06-09"). Ids are deterministic and double as the
// durable dismissal key (reminder_dismissals.instance_key), so this scheme is
// locked for compatibility with stored rows. NEVER derive a local/user-facing
// date from an id — use the reminder's scheduledAt. (Migrating the id scheme
// is backlogged; it requires migrating stored dismissal keys.)
//
// INTRA-DAY EXCEPTION (HOURLY only): a date-only id collides for sibling
// occurrences on the same day, so the HOURLY cadence — and ONLY that cadence —
// appends the occurrence's local time as `_HHMM` (e.g. `..._2026-06-10_1200`).
// All other cadences (daily/once/weekly/biweekly/month-multiple) keep the
// date-only form byte-for-byte, so their existing dismissal keys still match.
// =========================================================================
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

    const mealId = meal.id || `${routine.id}_meal_${mealIndex}`;
    const [hours, minutes] = meal.time.split(":");
    const frequency = meal.frequency || ROUTINE_FREQUENCY.DAILY;

    const pushMeal = (scheduledTime, id) => {
      reminders.push({
        id,
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
    };

    // HOURLY: intra-day interval series — same machinery as the other paths.
    if (isHourlyFrequency(frequency)) {
      const intervalHours = resolveIntervalHours(meal, routine);
      const anchor = getHourlyAnchor(
        routine,
        meal,
        parseInt(hours),
        parseInt(minutes),
        now,
      );
      hourlyOccurrences(anchor, intervalHours, now, endDate, {
        includeEnd: true,
      }).forEach((occ) => {
        pushMeal(
          occ,
          `reminder_${routine.id}_${mealId}_${
            startOfDay(occ).toISOString().split("T")[0]
          }_${hourlyIdSuffix(occ)}`,
        );
      });
      return;
    }

    // Day-pattern set (DAILY/WEEKDAYS/WEEKENDS/CUSTOM), anchored date set
    // (month-multiple/once), and weekly/biweekly preferred-day matching.
    const mealDays = getMealActiveDays(meal);
    const cadenceDates = buildCadenceDateSet(
      routine,
      meal,
      frequency,
      endDate,
      now,
    );
    const isWeekly = frequency === ROUTINE_FREQUENCY.WEEKLY;
    const isBiweekly = frequency === ROUTINE_FREQUENCY.BIWEEKLY;
    const preferredDay = meal.preferredDay ?? 6;
    // Multi-day weekly/biweekly: explicit days[] (Mon=0); null → legacy single
    // preferredDay path (byte-for-byte). Biweekly "on" weeks anchor on startDate.
    const multiDays = weeklyMultiDays(meal, frequency);
    const biweeklyAnchor = multiDays ? getScheduleAnchor(routine, meal, now) : null;

    let currentDate = new Date(now);
    currentDate.setHours(0, 0, 0, 0);

    while (currentDate <= endDate) {
      const dayOfWeek = (currentDate.getDay() + 6) % 7; // Convert to Monday=0
      let shouldSchedule;
      if (cadenceDates) {
        shouldSchedule = cadenceDates.has(currentDate.getTime());
      } else if (isWeekly || isBiweekly) {
        shouldSchedule = multiDays
          ? multiDays.includes(dayOfWeek) &&
            (isWeekly || isBiweeklyOnWeek(currentDate, biweeklyAnchor))
          : dayOfWeek === preferredDay;
      } else {
        // DAILY / WEEKDAYS / WEEKENDS / CUSTOM
        shouldSchedule = mealDays.includes(dayOfWeek);
      }

      if (shouldSchedule) {
        const scheduledTime = new Date(currentDate);
        scheduledTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);

        if (scheduledTime >= now) {
          const dateStr = currentDate.toISOString().split("T")[0];
          pushMeal(scheduledTime, `reminder_${routine.id}_${mealId}_${dateStr}`);
        }

        if (isWeekly && !multiDays) {
          currentDate.setDate(currentDate.getDate() + 7);
        } else if (isBiweekly && !multiDays) {
          currentDate.setDate(currentDate.getDate() + 14);
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

function generateWalkReminders(
  routine,
  now,
  endDate,
  primaryAction,
  relatedTracker,
) {
  const reminders = [];
  const walks = Array.isArray(routine.walks) ? routine.walks : [];

  walks.forEach((walk, index) => {
    const [hours, minutes] = walk.time.split(":");
    const frequency = walk.frequency || ROUTINE_FREQUENCY.DAILY;

    const pushWalk = (scheduledTime, id) => {
      reminders.push({
        id,
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
    };

    // HOURLY: intra-day interval series — same machinery as the other paths.
    if (isHourlyFrequency(frequency)) {
      const intervalHours = resolveIntervalHours(walk, routine);
      const anchor = getHourlyAnchor(
        routine,
        walk,
        parseInt(hours),
        parseInt(minutes),
        now,
      );
      hourlyOccurrences(anchor, intervalHours, now, endDate, {
        includeEnd: true,
      }).forEach((occ) => {
        pushWalk(
          occ,
          `reminder_${routine.id}_${
            startOfDay(occ).toISOString().split("T")[0]
          }_${index}_${hourlyIdSuffix(occ)}`,
        );
      });
      return;
    }

    // Day-pattern set (DAILY/WEEKDAYS/WEEKENDS/CUSTOM), anchored date set
    // (month-multiple/once), and weekly/biweekly preferred-day matching.
    const walkDays = getWalkActiveDays(walk);
    const cadenceDates = buildCadenceDateSet(
      routine,
      walk,
      frequency,
      endDate,
      now,
    );
    const isWeekly = frequency === ROUTINE_FREQUENCY.WEEKLY;
    const isBiweekly = frequency === ROUTINE_FREQUENCY.BIWEEKLY;
    const preferredDay = walk.preferredDay ?? 6;
    // Multi-day weekly/biweekly: explicit days[] (Mon=0); null → legacy single
    // preferredDay path (byte-for-byte). Biweekly "on" weeks anchor on startDate.
    const multiDays = weeklyMultiDays(walk, frequency);
    const biweeklyAnchor = multiDays ? getScheduleAnchor(routine, walk, now) : null;

    let currentDate = new Date(now);
    currentDate.setHours(0, 0, 0, 0);

    while (currentDate <= endDate) {
      const dayOfWeek = (currentDate.getDay() + 6) % 7; // Convert to Monday=0
      let shouldSchedule;
      if (cadenceDates) {
        shouldSchedule = cadenceDates.has(currentDate.getTime());
      } else if (isWeekly || isBiweekly) {
        shouldSchedule = multiDays
          ? multiDays.includes(dayOfWeek) &&
            (isWeekly || isBiweeklyOnWeek(currentDate, biweeklyAnchor))
          : dayOfWeek === preferredDay;
      } else {
        // DAILY / WEEKDAYS / WEEKENDS / CUSTOM
        shouldSchedule = walkDays.includes(dayOfWeek);
      }

      if (shouldSchedule) {
        const scheduledTime = new Date(currentDate);
        scheduledTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);

        if (scheduledTime >= now) {
          const dateStr = currentDate.toISOString().split("T")[0];
          pushWalk(scheduledTime, `reminder_${routine.id}_${dateStr}_${index}`);
        }

        if (isWeekly && !multiDays) {
          currentDate.setDate(currentDate.getDate() + 7);
        } else if (isBiweekly && !multiDays) {
          currentDate.setDate(currentDate.getDate() + 14);
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

    // HOURLY: intra-day interval series — the same machinery as the wellness /
    // medical-care hourly cadence. Replaces the once-per-day weekday walk.
    if (isHourlyFrequency(frequency)) {
      const intervalHours = resolveIntervalHours(schedule, routine);
      const anchor = getHourlyAnchor(
        routine,
        schedule,
        parseInt(hours),
        parseInt(minutes),
        now,
      );
      const bodyAreaLabel = schedule.bodyArea?.toUpperCase() || "BODY";
      hourlyOccurrences(anchor, intervalHours, now, endDate, {
        includeEnd: true,
      }).forEach((occ) => {
        reminders.push({
          id: `reminder_${routine.id}_${schedule.bodyArea}_${
            startOfDay(occ).toISOString().split("T")[0]
          }_${hourlyIdSuffix(occ)}`,
          routineId: routine.id,
          photoCheckScheduleIndex: scheduleIndex,
          petId: routine.petId,
          type: "photo_check",
          title: `${bodyAreaLabel} Check`,
          description: `Take photo of ${
            schedule.bodyArea?.replace("_", " ") || "body area"
          }`,
          scheduledAt: occ.toISOString(),
          nextTriggerAt: occ.toISOString(),
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
      });
      return;
    }

    // Daily photo checks fire every day, ignoring preferredDay (same rule as
    // daily wellness checks).
    const isDaily = frequency === ROUTINE_FREQUENCY.DAILY;
    // Month-multiple and ONCE cadences match by an anchored date set, not weekday.
    const cadenceDates = buildCadenceDateSet(
      routine,
      schedule,
      frequency,
      endDate,
      now,
    );
    // weekday / weekend / custom cadences match by a weekday set (null otherwise).
    const activeDays = dayPatternActiveDays(schedule, frequency);
    // Multi-day weekly/biweekly: explicit days[] (Mon=0); null → legacy single
    // preferredDay path (byte-for-byte). Biweekly "on" weeks anchor on startDate.
    const multiDays = weeklyMultiDays(schedule, frequency);
    const biweeklyAnchor = multiDays
      ? getScheduleAnchor(routine, schedule, now)
      : null;

    // Never emit before the schedule's startDate (forward twin of the overdue
    // clamp): daily/weekday/weekly cadences enumerate from `now`, so without this
    // a schedule starting tomorrow would emit a today (pre-start) occurrence.
    const forwardStart = forwardEnumStart(now, schedule.startDate);

    let currentDate = new Date(now);
    currentDate.setHours(0, 0, 0, 0);

    // Find next occurrence of preferred day
    while (currentDate <= endDate) {
      const dayOfWeek = (currentDate.getDay() + 6) % 7;
      const matchesDay = cadenceDates
        ? cadenceDates.has(currentDate.getTime())
        : activeDays
          ? activeDays.includes(dayOfWeek)
          : multiDays
            ? multiDays.includes(dayOfWeek) &&
              (frequency === ROUTINE_FREQUENCY.WEEKLY ||
                isBiweeklyOnWeek(currentDate, biweeklyAnchor))
            : isDaily || dayOfWeek === preferredDay;

      if (matchesDay) {
        const scheduledTime = new Date(currentDate);
        scheduledTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);

        if (scheduledTime >= forwardStart) {
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

        // Move to next occurrence based on frequency (date-set, day-pattern and
        // multi-day weekly/biweekly cadences walk day-by-day; their predicate
        // governs matching)
        if (isDaily || cadenceDates || activeDays || multiDays) {
          currentDate.setDate(currentDate.getDate() + 1);
        } else if (frequency === ROUTINE_FREQUENCY.WEEKLY) {
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
    // Weekly/Biweekly anchor on preferredDay; month-multiple and ONCE cadences
    // on the anchored date set.
    const preferredDay = routine.preferredDay ?? 6;
    const cadenceDates = buildCadenceDateSet(
      routine,
      null,
      routine.frequency,
      endDate,
      now,
    );
    let currentDate = new Date(now);
    currentDate.setHours(0, 0, 0, 0);

    while (currentDate <= endDate) {
      const dayOfWeek = (currentDate.getDay() + 6) % 7;
      const matchesDay = cadenceDates
        ? cadenceDates.has(currentDate.getTime())
        : dayOfWeek === preferredDay;

      if (matchesDay) {
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

        if (cadenceDates) {
          currentDate.setDate(currentDate.getDate() + 1);
        } else {
          const increment =
            routine.frequency === ROUTINE_FREQUENCY.WEEKLY ? 7 : 14;
          currentDate.setDate(currentDate.getDate() + increment);
        }
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
  // Month-multiple and ONCE cadences match by an anchored date set, not weekday.
  const cadenceDates = buildCadenceDateSet(
    routine,
    null,
    routine.frequency,
    endDate,
    now,
  );

  let currentDate = new Date(now);
  currentDate.setHours(0, 0, 0, 0);

  while (currentDate <= endDate) {
    const dayOfWeek = (currentDate.getDay() + 6) % 7;
    const matchesDay = cadenceDates
      ? cadenceDates.has(currentDate.getTime())
      : dayOfWeek === preferredDay;

    if (matchesDay) {
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

      const increment = cadenceDates
        ? 1 // date-set cadences walk day-by-day; the anchored date set governs matching
        : routine.frequency === ROUTINE_FREQUENCY.WEEKLY
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

    const frequency = item.frequency;

    // --- HOURLY (every N hours): an intra-day interval series — the same machinery
    // as the wellness hourly cadence. Replaces the per-day dose / once logic. ---
    if (isHourlyFrequency(frequency)) {
      const intervalHours = resolveIntervalHours(item, routine);
      const [h, m] = medicalCareHourlyAnchorTime(item).split(":");
      const anchor = getHourlyAnchor(
        routine,
        item,
        parseInt(h),
        parseInt(m),
        now,
      );
      hourlyOccurrences(anchor, intervalHours, now, endDate, {
        includeEnd: true,
      }).forEach((occ) => {
        reminders.push({
          ...baseFields,
          id: medicalCareHourlyInstanceId(routine.id, item.id, occ),
          scheduledAt: occ.toISOString(),
          nextTriggerAt: occ.toISOString(),
        });
      });
      return;
    }

    // --- Dose-course items: medication, supplement (one or more times per day) ---
    if (careType === "medication" || careType === "supplement") {
      const times = Array.isArray(item.times) ? item.times : [];
      const startDate = item.startDate ? new Date(item.startDate) : new Date();
      const itemEndDate = item.endDate ? new Date(item.endDate) : endDate;

      // Emit every dose of one cadence day (>= now). Shared by the back-compat
      // daily walk and the recurring-cadence path so the id (a durable dismissal
      // key) is derived identically in both.
      const emitDoseDay = (dayDate) => {
        times.forEach((time, timeIdx) => {
          const [hours, minutes] = time.split(":");
          const scheduledTime = new Date(dayDate);
          scheduledTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);

          if (scheduledTime >= now) {
            const dateStr = dayDate.toISOString().split("T")[0];
            reminders.push({
              ...baseFields,
              id: `reminder_${routine.id}_${item.id}_${dateStr}_${timeIdx}`,
              scheduledAt: scheduledTime.toISOString(),
              nextTriggerAt: scheduledTime.toISOString(),
            });
          }
        });
      };

      // Back-compat / DAILY: a dose every day across the course window. Kept
      // BYTE-FOR-BYTE (same currentDate walk and bounds as before).
      if (!frequency || frequency === ROUTINE_FREQUENCY.DAILY) {
        let currentDate = new Date(Math.max(now.getTime(), startDate.getTime()));
        currentDate.setHours(0, 0, 0, 0);

        while (currentDate <= endDate && currentDate <= itemEndDate) {
          emitDoseDay(currentDate);
          currentDate.setDate(currentDate.getDate() + 1);
        }
        return;
      }

      // Recurring cadence: gate the dose days by the shared schedule, anchored on
      // the course start, never past the course end or the horizon.
      const anchor = getScheduleAnchor(routine, item, now);
      const rangeStart = new Date(Math.max(now.getTime(), startDate.getTime()));
      const horizonEnd = itemEndDate < endDate ? itemEndDate : endDate;
      medicalCareOccurrences(
        item,
        frequency,
        anchor,
        rangeStart,
        horizonEnd,
      ).forEach((day) => emitDoseDay(day));
      return;
    }

    // --- Date-based items: vaccine, preventives, other ---
    const nextDueStr = item.nextDue;
    if (!nextDueStr) return;

    const nextDue = new Date(nextDueStr);
    if (isNaN(nextDue.getTime())) return;

    // Back-compat / ONCE: a single occurrence at nextDue. Kept BYTE-FOR-BYTE
    // (including the legacy UTC-parsed nextDue) — this id is a durable dismissal
    // key, so the no-cadence path must not shift.
    if (!frequency || isOnceFrequency(frequency)) {
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
      return;
    }

    // Recurring cadence (daily / weekly / biweekly / month-multiple / weekday /
    // weekend / custom): occurrences are phase-anchored on nextDue and parsed as a
    // LOCAL date so the schedule is timezone-robust. The vaccine reminder-timing
    // offset shifts each occurrence's trigger off its due date.
    const anchor = parseLocalDate(nextDueStr) || nextDue;
    const offsetDays = dateBasedReminderOffsetDays(item);
    // A "remind N days before due" offset can pull an occurrence just past the
    // horizon into range, so widen the occurrence horizon by that offset and let
    // the emit-time bounds do the precise cut.
    const occHorizon = new Date(endDate);
    occHorizon.setDate(occHorizon.getDate() + Math.max(0, -offsetDays));

    medicalCareOccurrences(
      item,
      frequency,
      anchor,
      startOfDay(now),
      occHorizon,
    ).forEach((due) => {
      const triggerTime = new Date(due);
      triggerTime.setDate(triggerTime.getDate() + offsetDays);
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

    // Intra-day HOURLY cadence: step the occurrence series directly instead of
    // walking days. Each occurrence is an independent instance with its own
    // time-bearing id.
    if (isHourlyFrequency(frequency)) {
      const intervalHours = resolveIntervalHours(item, routine);
      const anchor = getHourlyAnchor(
        routine,
        item,
        parseInt(hours),
        parseInt(minutes),
        now,
      );
      hourlyOccurrences(anchor, intervalHours, now, endDate, {
        includeEnd: true,
      }).forEach((occ) => {
        reminders.push({
          id: wellnessInstanceId(routine.id, checkType, itemIndex, occ, frequency),
          routineId: routine.id,
          wellnessCheckItemIndex: itemIndex,
          petId: routine.petId,
          type: "wellness_check",
          checkType,
          title: checkLabel,
          description: getWellnessCheckDescription(item),
          scheduledAt: occ.toISOString(),
          nextTriggerAt: occ.toISOString(),
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
      });
      return;
    }

    // Month-multiple and ONCE cadences match by an anchored date set, not weekday.
    const cadenceDates = buildCadenceDateSet(
      routine,
      item,
      frequency,
      endDate,
      now,
    );
    // weekday / weekend / custom cadences match by a weekday set (null otherwise).
    const activeDays = dayPatternActiveDays(item, frequency);
    // Multi-day weekly/biweekly: explicit days[] (Mon=0); null → legacy single
    // preferredDay path (byte-for-byte). Biweekly "on" weeks anchor on startDate.
    const multiDays = weeklyMultiDays(item, frequency);
    const biweeklyAnchor = multiDays ? getScheduleAnchor(routine, item, now) : null;

    // Never emit before the item's startDate (forward twin of the overdue
    // clamp): daily/weekday/weekly cadences enumerate from `now`, so without this
    // an item starting tomorrow would emit a today (pre-start) occurrence.
    const forwardStart = forwardEnumStart(now, item.startDate);

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
        shouldSchedule = multiDays
          ? multiDays.includes(dayOfWeek) &&
            (frequency === ROUTINE_FREQUENCY.WEEKLY ||
              isBiweeklyOnWeek(currentDate, biweeklyAnchor))
          : dayOfWeek === preferredDay;
      } else if (activeDays) {
        shouldSchedule = activeDays.includes(dayOfWeek);
      } else if (cadenceDates) {
        shouldSchedule = cadenceDates.has(currentDate.getTime());
      }

      if (shouldSchedule) {
        const scheduledTime = new Date(currentDate);
        scheduledTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);

        if (scheduledTime >= forwardStart) {
          reminders.push({
            id: wellnessInstanceId(
              routine.id,
              checkType,
              itemIndex,
              currentDate,
              frequency,
            ),
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

        // Move to next occurrence based on frequency (month cadences and
        // multi-day weekly/biweekly walk day-by-day; their predicate governs
        // matching)
        if (frequency === ROUTINE_FREQUENCY.WEEKLY && !multiDays) {
          currentDate.setDate(currentDate.getDate() + 7);
        } else if (frequency === ROUTINE_FREQUENCY.BIWEEKLY && !multiDays) {
          currentDate.setDate(currentDate.getDate() + 14);
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

// =========================================================================
// Month-multiple cadences — MONTHLY / EVERY_3_MONTHS / EVERY_6_MONTHS / YEARLY
// are DATE-ANCHORED: instances fire on the day-of-month of the routine's true
// start date, stepping +1/+3/+6/+12 calendar months from that start — never
// from "now" or a lookback-window start, so the phase is stable no matter when
// generation runs. Month overflow clamps to the last day of the target month
// (an anchor on the 31st fires Feb 28/29, Apr 30, …; it never rolls into the
// next month).
// =========================================================================
const MONTH_CADENCE_STEPS = {
  [ROUTINE_FREQUENCY.MONTHLY]: 1,
  [ROUTINE_FREQUENCY.EVERY_3_MONTHS]: 3,
  [ROUTINE_FREQUENCY.EVERY_6_MONTHS]: 6,
  [ROUTINE_FREQUENCY.YEARLY]: 12,
};

export function isMonthCadenceFrequency(frequency) {
  return frequency in MONTH_CADENCE_STEPS;
}

// Non-repeating cadence — fires exactly once at the routine's scheduled
// date+time and never recurs (iOS "Never").
export function isOnceFrequency(frequency) {
  return frequency === ROUTINE_FREQUENCY.ONCE;
}

// Intra-day interval cadence — fires every `intervalHours` hours from the start
// anchor (iOS "Hourly"). The only cadence with multiple occurrences per day, so
// its instance ids carry the occurrence time (see wellnessInstanceId).
export function isHourlyFrequency(frequency) {
  return frequency === ROUTINE_FREQUENCY.HOURLY;
}

// Instance id for a wellness-check occurrence. Non-intra-day cadences keep the
// locked `reminder_<routine>_<checkType>_<itemIndex>_<dateStr>` form
// byte-for-byte (the durable dismissal key). The HOURLY cadence appends the
// occurrence's local time (`_HHMM`) so sibling occurrences on the same day get
// distinct, deterministic ids — see the id-convention block above.
function wellnessInstanceId(routineId, checkType, itemIndex, occurrence, frequency) {
  const dateStr = startOfDay(occurrence).toISOString().split("T")[0];
  const base = `reminder_${routineId}_${checkType}_${itemIndex}_${dateStr}`;
  if (!isHourlyFrequency(frequency)) return base;
  const hh = String(occurrence.getHours()).padStart(2, "0");
  const mm = String(occurrence.getMinutes()).padStart(2, "0");
  return `${base}_${hh}${mm}`;
}

// Date-only strings ("YYYY-MM-DD", the app's canonical date format) must parse
// as LOCAL dates — new Date("2026-01-31") is UTC midnight, which is Jan 30 in
// UTC- timezones and would shift the day-of-month anchor.
function parseLocalDate(value) {
  if (typeof value === "string") {
    const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  }
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

// The anchor is the schedule's true start: the item/schedule-level startDate
// when present, else the routine-level startDate, else the routine's
// createdAt. A routine with none of these (being created right now) anchors
// at `fallback` (the generation clock). Shared by the month-multiple and ONCE
// cadence families — both fire on the day-of-month of this true start.
function getScheduleAnchor(routine, item, fallback) {
  for (const candidate of [
    item?.startDate,
    routine?.startDate,
    routine?.createdAt,
  ]) {
    if (!candidate) continue;
    const parsed = parseLocalDate(candidate);
    if (parsed) return parsed;
  }
  return new Date(fallback);
}

// Local-midnight date of the nth occurrence (anchor month + n*step). If the
// anchor day exceeds the target month's length, clamp to that month's last day.
function monthCadenceOccurrence(anchor, stepMonths, n) {
  const month = anchor.getMonth() + n * stepMonths;
  const lastDay = new Date(anchor.getFullYear(), month + 1, 0).getDate();
  return new Date(
    anchor.getFullYear(),
    month,
    Math.min(anchor.getDate(), lastDay),
  );
}

// Set of local-midnight time values for every occurrence up to rangeEnd. The
// generators' day-walk loops (forward AND overdue) use this as their day-match
// predicate, so both enumerate the identical schedule.
function buildMonthCadenceDates(routine, item, frequency, rangeEnd, fallback) {
  const stepMonths = MONTH_CADENCE_STEPS[frequency];
  const anchor = getScheduleAnchor(routine, item, fallback);
  anchor.setHours(0, 0, 0, 0);
  const dates = new Set();
  for (let n = 0; ; n++) {
    const occurrence = monthCadenceOccurrence(anchor, stepMonths, n);
    if (occurrence > rangeEnd) break;
    dates.add(occurrence.getTime());
  }
  return dates;
}

// Single local-midnight date for a non-repeating (ONCE) schedule: the anchor's
// own day. Returned as a one-element Set so the generators' day-walk loops
// consume it with the identical date-membership predicate they use for the
// month-multiple family — guaranteeing EXACTLY ONE instance with no recurrence.
function buildOnceDate(routine, item, fallback) {
  const anchor = getScheduleAnchor(routine, item, fallback);
  anchor.setHours(0, 0, 0, 0);
  return new Set([anchor.getTime()]);
}

// Cadences whose schedule is an explicit set of local-midnight dates (rather
// than a weekday match): the month-multiple family and the non-repeating ONCE
// value. One builder serves every forward/overdue call site, so both paths
// enumerate the identical schedule. Returns null for weekday/day-pattern
// cadences, which the callers match by day-of-week instead.
function buildCadenceDateSet(routine, item, frequency, rangeEnd, fallback) {
  if (isMonthCadenceFrequency(frequency)) {
    return buildMonthCadenceDates(routine, item, frequency, rangeEnd, fallback);
  }
  if (isOnceFrequency(frequency)) {
    return buildOnceDate(routine, item, fallback);
  }
  return null;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Weekday set (Mon=0) for a day-pattern cadence; null means the cadence is not a
// day pattern (the caller matches it another way — e.g. DAILY every day, or a
// weekday/date-set match). Mirrors getMealActiveDays so the patterns match the
// rest of the app. Shared by every item-driven generator path.
function dayPatternActiveDays(item, frequency) {
  if (frequency === ROUTINE_FREQUENCY.WEEKDAYS) return [0, 1, 2, 3, 4];
  if (frequency === ROUTINE_FREQUENCY.WEEKENDS) return [5, 6];
  if (frequency === ROUTINE_FREQUENCY.CUSTOM) {
    return Array.isArray(item.days) ? item.days : [0, 1, 2, 3, 4, 5, 6];
  }
  return null;
}

// =========================================================================
// Multi-day WEEKLY / BIWEEKLY — an item may fire on several weekdays per
// (on-)week via an explicit days[] (Mon=0), e.g. "every Wed and Fri". This is
// purely ADDITIVE and gated on a non-empty days[]: when days[] is absent the
// callers keep their locked single-`preferredDay` path BYTE-FOR-BYTE (same
// instances + ids), so existing weekly/biweekly routines are untouched. No
// existing weekly/biweekly schedule item persists a multi-element days[] (the
// modals only ever wrote preferredDay), so the fallback is exhaustive for stored
// data. Biweekly "on" weeks are anchored on the schedule's startDate (via
// getScheduleAnchor), matching the month-multiple / hourly / once anchor.
// =========================================================================

// Selected weekdays (Mon=0) for a multi-day weekly/biweekly item, or null to use
// the legacy single-preferredDay path. Only weekly/biweekly with a non-empty
// days[] opt in; every other cadence returns null and is matched elsewhere.
function weeklyMultiDays(item, frequency) {
  if (
    frequency !== ROUTINE_FREQUENCY.WEEKLY &&
    frequency !== ROUTINE_FREQUENCY.BIWEEKLY
  ) {
    return null;
  }
  return Array.isArray(item?.days) && item.days.length ? item.days : null;
}

// Local-midnight Monday (Mon=0) of the week containing `date`.
function startOfWeekMonday(date) {
  const d = startOfDay(date);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

// Whether `date` lands in a biweekly "on" week: the week containing `anchor` is
// on (week 0), every other week after/before it is on. The whole-week delta uses
// Math.round so a DST hour can't skew the parity. Weekday-independent — every
// selected day in an on-week fires together.
function isBiweeklyOnWeek(date, anchor) {
  const weeks = Math.round(
    (startOfWeekMonday(date).getTime() - startOfWeekMonday(anchor).getTime()) /
      (7 * MS_PER_DAY),
  );
  return (((weeks % 2) + 2) % 2) === 0;
}

// Occurrence dates (local midnight) of a recurring medical-care schedule within
// [rangeStart, rangeEnd] inclusive, phase-anchored at `anchor` (the item's due
// date). One generator serves both the forward and overdue paths so they
// enumerate the identical schedule. Month-multiple cadences step off the anchor's
// day-of-month (clamped to short months); weekly/biweekly hold the anchor's
// weekday + week phase; the day patterns (daily/weekday/weekend/custom) match by
// weekday across the range. The anchor may sit in the future (a not-yet-due
// item), so month cadences walk their index backward to reach rangeStart.
function medicalCareOccurrences(item, frequency, anchor, rangeStart, rangeEnd) {
  const out = [];
  const start = startOfDay(rangeStart);
  if (rangeEnd < start) return out;
  const anchorDay = startOfDay(anchor);

  if (isMonthCadenceFrequency(frequency)) {
    const step = MONTH_CADENCE_STEPS[frequency];
    let n = 0;
    while (monthCadenceOccurrence(anchorDay, step, n - 1) >= start) n--;
    while (monthCadenceOccurrence(anchorDay, step, n) < start) n++;
    for (; ; n++) {
      const occ = monthCadenceOccurrence(anchorDay, step, n);
      if (occ > rangeEnd) break;
      out.push(occ);
    }
    return out;
  }

  const stepDays =
    frequency === ROUTINE_FREQUENCY.WEEKLY
      ? 7
      : frequency === ROUTINE_FREQUENCY.BIWEEKLY
        ? 14
        : 0;
  const activeDays = stepDays ? null : dayPatternActiveDays(item, frequency);

  for (
    let cur = new Date(start);
    cur <= rangeEnd;
    cur.setDate(cur.getDate() + 1)
  ) {
    let match;
    if (stepDays) {
      // Whole-day delta from the anchor (Math.round absorbs any DST hour); a
      // multiple of the step lands on the anchor's weekday and week phase.
      const diff = Math.round((cur.getTime() - anchorDay.getTime()) / MS_PER_DAY);
      match = diff % stepDays === 0;
    } else {
      const dow = (cur.getDay() + 6) % 7;
      match = !activeDays || activeDays.includes(dow);
    }
    if (match) out.push(new Date(cur));
  }
  return out;
}

// Vaccine "remind me before due" offset in days (≤ 0). Date-based medical items
// fire at this offset from the due date; everything else fires on the due date.
const VACCINE_REMINDER_OFFSETS = { on_due: 0, "1w": -7, "2w": -14, "1m": -30 };

function dateBasedReminderOffsetDays(item) {
  if (item.type === "vaccine" && item.reminderTiming) {
    return VACCINE_REMINDER_OFFSETS[item.reminderTiming] ?? 0;
  }
  return 0;
}

// Time-of-day anchor for an hourly medical-care item: an explicit preferredTime,
// else the first scheduled dose time, else the date-based default (09:00).
function medicalCareHourlyAnchorTime(item) {
  if (item.preferredTime) return item.preferredTime;
  if (Array.isArray(item.times) && item.times[0]) return item.times[0];
  return "09:00";
}

// The `HHMM` local-time fragment appended to a date-only base id for HOURLY
// occurrences (the only cadence with sibling occurrences within a day).
function hourlyIdSuffix(occurrence) {
  const hh = String(occurrence.getHours()).padStart(2, "0");
  const mm = String(occurrence.getMinutes()).padStart(2, "0");
  return `${hh}${mm}`;
}

// Hourly medical-care instance id — the locked `_HHMM` intra-day suffix, keyed on
// the item id like every other medical-care id.
function medicalCareHourlyInstanceId(routineId, itemId, occurrence) {
  const dateStr = startOfDay(occurrence).toISOString().split("T")[0];
  return `reminder_${routineId}_${itemId}_${dateStr}_${hourlyIdSuffix(occurrence)}`;
}

// =========================================================================
// Intra-day interval cadence — HOURLY fires every `intervalHours` hours from
// the schedule's start anchor datetime (anchor day-of-month at the preferred
// time-of-day), e.g. interval 4 + start 08:00 → 08:00, 12:00, 16:00, 20:00,
// 00:00(+1d), … Unlike the once-per-day cadences this enumerates DATETIMES, not
// a set of local-midnight dates, so each occurrence is an independent instance
// with its own time-bearing id (see wellnessInstanceId).
// =========================================================================

// Safe default when intervalHours is absent or invalid. The UI always sets it;
// 4h keeps a never-configured routine to a sane 6 occurrences/day.
const DEFAULT_INTERVAL_HOURS = 4;

// Hours between occurrences, read from the item then the routine config. Coerces
// to a positive integer; anything missing/invalid falls back to the safe default.
function resolveIntervalHours(item, routine) {
  const raw = item?.intervalHours ?? routine?.intervalHours;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : DEFAULT_INTERVAL_HOURS;
}

// Every occurrence datetime of an hourly cadence within a range. Stepping is
// anchored to `anchor` and INDEXED (anchor + n*step) rather than accumulated, so
// it never drifts and the index fast-forward keeps it bounded to the range no
// matter how old the anchor is. `includeEnd` admits rangeEnd itself (forward
// uses the inclusive horizon end; overdue excludes "now").
function hourlyOccurrences(anchor, intervalHours, rangeStart, rangeEnd, { includeEnd }) {
  const stepMs = intervalHours * 60 * 60 * 1000;
  const out = [];
  let n = Math.max(
    0,
    Math.ceil((rangeStart.getTime() - anchor.getTime()) / stepMs),
  );
  for (;;) {
    const occ = new Date(anchor.getTime() + n * stepMs);
    if (includeEnd ? occ > rangeEnd : occ >= rangeEnd) break;
    if (occ >= rangeStart) out.push(occ);
    n++;
  }
  return out;
}

// Start anchor datetime for an hourly schedule: the cadence anchor's day at the
// preferred hour:minute. Shared by the forward and overdue paths so both step
// the identical occurrence series.
function getHourlyAnchor(routine, item, hours, minutes, fallback) {
  const anchor = getScheduleAnchor(routine, item, fallback);
  anchor.setHours(hours, minutes, 0, 0);
  return anchor;
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
// that biweekly cadence is phase-anchored to the window start here; daily and
// weekly (the common cases) are exact, and the month-multiple family (monthly/
// every 3/6 months/yearly) is anchored to the routine's true start date via the
// shared month-cadence date set. Feeding/Walk are intentionally NOT
// enumerated — they are today-only/transient (handled separately).
// =========================================================================
export function generateOverdueInstances(
  routine,
  { lookbackDays = 30, now = new Date() } = {},
) {
  assertCadenceHonored(routine);
  if (
    !routine ||
    isRoutineDeleted(routine) ||
    !routine.isActive ||
    !routine.notificationEnabled
  ) {
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

// Step `currentDate` forward by one cadence period, matching the locked
// generators. Month-multiple cadences never reach this — they walk day-by-day
// against the anchored month-cadence date set.
function advanceByFrequency(currentDate, frequency) {
  if (frequency === ROUTINE_FREQUENCY.WEEKLY) {
    currentDate.setDate(currentDate.getDate() + 7);
  } else if (frequency === ROUTINE_FREQUENCY.BIWEEKLY) {
    currentDate.setDate(currentDate.getDate() + 14);
  } else {
    currentDate.setDate(currentDate.getDate() + 1);
  }
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Effective enumeration start for overdue instances: never before the lookback
// window, never before the routine was created, never before the item's own start.
// You can't have missed a reminder that didn't exist yet — without this clamp a
// freshly-created routine backfills a full window of phantom OVERDUE instances.
// Returns a precise timestamp (not floored) so the creation-day, pre-creation-time
// occurrence is also excluded.
function clampOverdueStart(windowStart, routine, item) {
  let start = windowStart.getTime();
  for (const candidate of [routine?.createdAt, item?.startDate]) {
    if (!candidate) continue;
    const t = new Date(candidate).getTime();
    if (!Number.isNaN(t) && t > start) start = t;
  }
  return new Date(start);
}

// Forward twin of clampOverdueStart: the floor the FORWARD generators enumerate
// from, so a schedule/item that starts on a future day emits no occurrence
// before its startDate. First occurrence = max(now, startDate). When startDate
// is absent, today, or in the past the floor is `now` — byte-for-byte as before.
// startDate is parsed as a LOCAL day (parseLocalDate) and compared at day
// granularity, so a date-only value can't trip the UTC-midnight off-by-one and
// the start-day's own occurrence is admitted.
function forwardEnumStart(now, startDate) {
  const parsed = startDate ? parseLocalDate(startDate) : null;
  if (parsed) {
    const startDay = startOfDay(parsed);
    if (startDay.getTime() > startOfDay(now).getTime()) return startDay;
  }
  return now;
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

    // Intra-day HOURLY cadence: overdue is capped to TODAY only (NOT the 30-day
    // lookback). A dose missed earlier today is actionable; one missed weeks ago
    // is not and would flood the list. Each unresolved past occurrence from today
    // shows once, resolving independently. The start still clamps to the
    // routine's creation / item start so a routine made today backfills nothing.
    if (isHourlyFrequency(frequency)) {
      const intervalHours = resolveIntervalHours(item, routine);
      const anchor = getHourlyAnchor(
        routine,
        item,
        parseInt(hours),
        parseInt(minutes),
        now,
      );
      const hourlyStart = clampOverdueStart(startOfDay(now), routine, item);
      hourlyOccurrences(anchor, intervalHours, hourlyStart, now, {
        includeEnd: false,
      }).forEach((occ) => {
        reminders.push({
          id: wellnessInstanceId(routine.id, checkType, itemIndex, occ, frequency),
          routineId: routine.id,
          wellnessCheckItemIndex: itemIndex,
          petId: routine.petId,
          type: "wellness_check",
          checkType,
          title: checkLabel,
          description: getWellnessCheckDescription(item),
          scheduledAt: occ.toISOString(),
          nextTriggerAt: occ.toISOString(),
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
      });
      return;
    }

    // Month-multiple and ONCE cadences match by an anchored date set (same set as
    // the forward generator), so overdue and future instances share one schedule.
    const cadenceDates = buildCadenceDateSet(
      routine,
      item,
      frequency,
      now,
      now,
    );
    // weekday / weekend / custom cadences match by a weekday set (null otherwise).
    const activeDays = dayPatternActiveDays(item, frequency);
    // Multi-day weekly/biweekly: explicit days[] (Mon=0); null → legacy single
    // preferredDay path (byte-for-byte). Biweekly "on" weeks anchor on startDate.
    const multiDays = weeklyMultiDays(item, frequency);
    const biweeklyAnchor = multiDays ? getScheduleAnchor(routine, item, now) : null;

    const effectiveStart = clampOverdueStart(windowStart, routine, item);
    let currentDate = startOfDay(effectiveStart);

    while (currentDate < now) {
      const dayOfWeek = (currentDate.getDay() + 6) % 7;
      let shouldSchedule = false;

      if (frequency === ROUTINE_FREQUENCY.DAILY) {
        shouldSchedule = true;
      } else if (
        frequency === ROUTINE_FREQUENCY.WEEKLY ||
        frequency === ROUTINE_FREQUENCY.BIWEEKLY
      ) {
        shouldSchedule = multiDays
          ? multiDays.includes(dayOfWeek) &&
            (frequency === ROUTINE_FREQUENCY.WEEKLY ||
              isBiweeklyOnWeek(currentDate, biweeklyAnchor))
          : dayOfWeek === preferredDay;
      } else if (activeDays) {
        shouldSchedule = activeDays.includes(dayOfWeek);
      } else if (cadenceDates) {
        shouldSchedule = cadenceDates.has(currentDate.getTime());
      }

      if (shouldSchedule) {
        const scheduledTime = new Date(currentDate);
        scheduledTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);

        if (scheduledTime < now && scheduledTime >= effectiveStart) {
          reminders.push({
            id: wellnessInstanceId(
              routine.id,
              checkType,
              itemIndex,
              currentDate,
              frequency,
            ),
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

        if (multiDays) {
          currentDate.setDate(currentDate.getDate() + 1);
        } else {
          advanceByFrequency(currentDate, frequency);
        }
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

    const frequency = item.frequency;

    // --- HOURLY (every N hours): overdue is capped to TODAY only (never the
    // lookback window) — a dose missed earlier today is actionable, one missed
    // weeks ago would flood the list. Same machinery as wellness hourly overdue. ---
    if (isHourlyFrequency(frequency)) {
      const intervalHours = resolveIntervalHours(item, routine);
      const [h, m] = medicalCareHourlyAnchorTime(item).split(":");
      const anchor = getHourlyAnchor(
        routine,
        item,
        parseInt(h),
        parseInt(m),
        now,
      );
      const hourlyStart = clampOverdueStart(startOfDay(now), routine, item);
      hourlyOccurrences(anchor, intervalHours, hourlyStart, now, {
        includeEnd: false,
      }).forEach((occ) => {
        reminders.push({
          ...baseFields,
          id: medicalCareHourlyInstanceId(routine.id, item.id, occ),
          scheduledAt: occ.toISOString(),
          nextTriggerAt: occ.toISOString(),
        });
      });
      return;
    }

    // --- Dose-course items: medication, supplement (one or more times per day) ---
    if (careType === "medication" || careType === "supplement") {
      const times = Array.isArray(item.times) ? item.times : [];
      const effectiveStart = clampOverdueStart(windowStart, routine, item);
      // Parity with the future generator: don't emit doses after the course ended.
      const itemEnd = item.endDate ? new Date(item.endDate) : null;
      const itemEndValid = itemEnd && !isNaN(itemEnd.getTime());

      // Emit every past, in-window, pre-course-end dose of one cadence day.
      const emitOverdueDoseDay = (dayDate) => {
        times.forEach((time, timeIdx) => {
          const [hours, minutes] = time.split(":");
          const scheduledTime = new Date(dayDate);
          scheduledTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);

          if (
            scheduledTime < now &&
            scheduledTime >= effectiveStart &&
            (!itemEndValid || scheduledTime <= itemEnd)
          ) {
            const dateStr = dayDate.toISOString().split("T")[0];
            reminders.push({
              ...baseFields,
              id: `reminder_${routine.id}_${item.id}_${dateStr}_${timeIdx}`,
              scheduledAt: scheduledTime.toISOString(),
              nextTriggerAt: scheduledTime.toISOString(),
            });
          }
        });
      };

      // Back-compat / DAILY — a missed dose every day in the window. BYTE-FOR-BYTE.
      if (!frequency || frequency === ROUTINE_FREQUENCY.DAILY) {
        let currentDate = startOfDay(effectiveStart);
        while (currentDate < now) {
          emitOverdueDoseDay(currentDate);
          currentDate.setDate(currentDate.getDate() + 1);
        }
        return;
      }

      // Recurring cadence — same anchored schedule as the forward path, enumerated
      // backward across the lookback window.
      const anchor = getScheduleAnchor(routine, item, now);
      medicalCareOccurrences(
        item,
        frequency,
        anchor,
        effectiveStart,
        now,
      ).forEach((day) => emitOverdueDoseDay(day));
      return;
    }

    // --- Date-based items: vaccine, preventives, other ---
    const nextDueStr = item.nextDue;
    if (!nextDueStr) return;

    const nextDue = new Date(nextDueStr);
    if (isNaN(nextDue.getTime())) return;

    const effectiveStart = clampOverdueStart(windowStart, routine, item);

    // Back-compat / ONCE — single past occurrence, byte-for-byte legacy behavior.
    if (!frequency || isOnceFrequency(frequency)) {
      let triggerTime = new Date(nextDue);
      if (careType === "vaccine" && item.reminderTiming) {
        const offsetDays = { on_due: 0, "1w": -7, "2w": -14, "1m": -30 };
        const days = offsetDays[item.reminderTiming] ?? 0;
        triggerTime.setDate(triggerTime.getDate() + days);
      }
      triggerTime.setHours(9, 0, 0, 0);

      if (triggerTime < now && triggerTime >= effectiveStart) {
        const dateStr = triggerTime.toISOString().split("T")[0];
        reminders.push({
          ...baseFields,
          id: `reminder_${routine.id}_${item.id}_${dateStr}`,
          scheduledAt: triggerTime.toISOString(),
          nextTriggerAt: triggerTime.toISOString(),
        });
      }
      return;
    }

    // Recurring cadence — same anchored schedule as the forward path, enumerated
    // backward across the lookback window.
    const anchor = parseLocalDate(nextDueStr) || nextDue;
    const offsetDays = dateBasedReminderOffsetDays(item);
    // A "remind N days before due" offset can put a still-future occurrence's
    // trigger in the past, so widen the search past `now` by that offset.
    const occEnd = new Date(now);
    occEnd.setDate(occEnd.getDate() + Math.max(0, -offsetDays));

    medicalCareOccurrences(
      item,
      frequency,
      anchor,
      effectiveStart,
      occEnd,
    ).forEach((due) => {
      const triggerTime = new Date(due);
      triggerTime.setDate(triggerTime.getDate() + offsetDays);
      triggerTime.setHours(9, 0, 0, 0);

      if (triggerTime < now && triggerTime >= effectiveStart) {
        const dateStr = triggerTime.toISOString().split("T")[0];
        reminders.push({
          ...baseFields,
          id: `reminder_${routine.id}_${item.id}_${dateStr}`,
          scheduledAt: triggerTime.toISOString(),
          nextTriggerAt: triggerTime.toISOString(),
        });
      }
    });
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

    // HOURLY: overdue capped to TODAY only (same as wellness / medical-care
    // hourly overdue), clamped to the routine/schedule start.
    if (isHourlyFrequency(frequency)) {
      const intervalHours = resolveIntervalHours(schedule, routine);
      const anchor = getHourlyAnchor(
        routine,
        schedule,
        parseInt(hours),
        parseInt(minutes),
        now,
      );
      const hourlyStart = clampOverdueStart(startOfDay(now), routine, schedule);
      const bodyAreaLabel = schedule.bodyArea?.toUpperCase() || "BODY";
      hourlyOccurrences(anchor, intervalHours, hourlyStart, now, {
        includeEnd: false,
      }).forEach((occ) => {
        reminders.push({
          id: `reminder_${routine.id}_${schedule.bodyArea}_${
            startOfDay(occ).toISOString().split("T")[0]
          }_${hourlyIdSuffix(occ)}`,
          routineId: routine.id,
          photoCheckScheduleIndex: scheduleIndex,
          petId: routine.petId,
          type: "photo_check",
          title: `${bodyAreaLabel} Check`,
          description: `Take photo of ${
            schedule.bodyArea?.replace("_", " ") || "body area"
          }`,
          scheduledAt: occ.toISOString(),
          nextTriggerAt: occ.toISOString(),
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
      });
      return;
    }

    // Same rule as the upcoming generator: daily ignores preferredDay.
    const isDaily = frequency === ROUTINE_FREQUENCY.DAILY;
    // Month-multiple and ONCE cadences match by an anchored date set (same set as
    // the forward generator), so overdue and future instances share one schedule.
    const cadenceDates = buildCadenceDateSet(
      routine,
      schedule,
      frequency,
      now,
      now,
    );
    // weekday / weekend / custom cadences match by a weekday set (null otherwise).
    const activeDays = dayPatternActiveDays(schedule, frequency);
    // Multi-day weekly/biweekly: explicit days[] (Mon=0); null → legacy single
    // preferredDay path (byte-for-byte). Biweekly "on" weeks anchor on startDate.
    const multiDays = weeklyMultiDays(schedule, frequency);
    const biweeklyAnchor = multiDays
      ? getScheduleAnchor(routine, schedule, now)
      : null;

    const effectiveStart = clampOverdueStart(windowStart, routine, schedule);
    let currentDate = startOfDay(effectiveStart);

    while (currentDate < now) {
      const dayOfWeek = (currentDate.getDay() + 6) % 7;
      const matchesDay = cadenceDates
        ? cadenceDates.has(currentDate.getTime())
        : activeDays
          ? activeDays.includes(dayOfWeek)
          : multiDays
            ? multiDays.includes(dayOfWeek) &&
              (frequency === ROUTINE_FREQUENCY.WEEKLY ||
                isBiweeklyOnWeek(currentDate, biweeklyAnchor))
            : isDaily || dayOfWeek === preferredDay;

      if (matchesDay) {
        const scheduledTime = new Date(currentDate);
        scheduledTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);

        if (scheduledTime < now && scheduledTime >= effectiveStart) {
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

        if (isDaily || cadenceDates || activeDays || multiDays) {
          currentDate.setDate(currentDate.getDate() + 1);
        } else if (frequency === ROUTINE_FREQUENCY.WEEKLY) {
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
