import * as Calendar from "expo-calendar";
import { Platform, Alert } from "react-native";
import {
  getRecurrenceRule,
  parseWalkTime,
  formatFrequency,
  buildEventNotes,
  buildBookingCalendarDetails,
  buildTelehealthCalendarDetails,
  buildTransportCalendarDetails,
  buildEventCalendarDetails,
} from "@/utils/calendarFormat";

// Calendar integration (ticket 2.79 unified layer).
//
// This file is the ONLY one that imports `expo-calendar`. The pure mapping/formatting
// logic lives in calendarFormat.js (jest-covered). Here we keep:
//   - the permission flow,
//   - ONE generic getOrCreatePawPiCalendar({ title, color, name }) that de-dupes the two
//     near-identical getters that used to exist (Walks + Vet Appointments),
//   - generic upsertCalendarEvent / deleteCalendarEvent primitives,
//   - thin walk + vet wrappers over them, with IDENTICAL exported names, signatures and
//     return shapes so every call site is unchanged.
//
// 2.80 reuses getOrCreatePawPiCalendar / upsertCalendarEvent / deleteCalendarEvent for
// the remaining scheduled surfaces (bookings / transport / telehealth / events).

// Re-export the pure display helper so existing imports
// (`import { formatFrequency } from "@/utils/calendarIntegration"`) keep working.
export { formatFrequency };

// Per-feature calendar identities (title is the lookup key; color/name set on create).
const WALK_CALENDAR = {
  title: "PawPi - Walks",
  color: "#A7BFA3", // Sage green
  name: "socialPetWalks",
};
const VET_CALENDAR = {
  title: "PawPi - Vet Appointments",
  color: "#4DB8E8", // Blue
  name: "socialPetVetAppointments",
};

// Request calendar permissions (with a rationale prompt before the OS dialog).
export async function requestCalendarPermission() {
  try {
    const { status: existingStatus } =
      await Calendar.getCalendarPermissionsAsync();

    if (existingStatus === "granted") {
      return true;
    }

    // Show rationale before requesting
    return new Promise((resolve) => {
      Alert.alert(
        "Calendar Access",
        "PawPi can add walk blocks to your calendar so your time stays protected.",
        [
          {
            text: "Not now",
            style: "cancel",
            onPress: () => resolve(false),
          },
          {
            text: "Allow calendar access",
            onPress: async () => {
              const { status } =
                await Calendar.requestCalendarPermissionsAsync();
              resolve(status === "granted");
            },
          },
        ],
      );
    });
  } catch (error) {
    console.error("[Calendar] Error requesting permission:", error);
    return false;
  }
}

// Check if calendar access is currently granted.
export async function isCalendarAvailable() {
  try {
    const { status } = await Calendar.getCalendarPermissionsAsync();
    return status === "granted";
  } catch (error) {
    console.error("[Calendar] Error checking calendar availability:", error);
    return false;
  }
}

// Generic: get (by title) or create a dedicated PawPi calendar. Replaces the two
// previously-duplicated getters. Returns the calendar id, or null on failure.
export async function getOrCreatePawPiCalendar({ title, color, name }) {
  try {
    const calendars = await Calendar.getCalendarsAsync(
      Calendar.EntityTypes.EVENT,
    );

    const existingCalendar = calendars.find((cal) => cal.title === title);
    if (existingCalendar) {
      return existingCalendar.id;
    }

    // Pick a writable source for a new calendar (iCloud/Google preferred, else LOCAL).
    let defaultCalendarSource;

    if (Platform.OS === "ios") {
      defaultCalendarSource = calendars.find(
        (cal) => cal.source && cal.source.name === "iCloud",
      )?.source;

      if (!defaultCalendarSource) {
        defaultCalendarSource = calendars.find(
          (cal) => cal.source && cal.source.type === Calendar.SourceType.LOCAL,
        )?.source;
      }
    } else if (Platform.OS === "android") {
      defaultCalendarSource = calendars.find(
        (cal) =>
          cal.source &&
          cal.source.name &&
          cal.source.name.toLowerCase().includes("google"),
      )?.source;

      if (!defaultCalendarSource) {
        defaultCalendarSource = calendars.find(
          (cal) => cal.source && cal.source.type === Calendar.SourceType.LOCAL,
        )?.source;
      }
    }

    if (!defaultCalendarSource) {
      console.error("[Calendar] No calendar source found");
      return null;
    }

    const calendarId = await Calendar.createCalendarAsync({
      title,
      color,
      entityType: Calendar.EntityTypes.EVENT,
      sourceId: defaultCalendarSource.id,
      source: defaultCalendarSource,
      name,
      ownerAccount: "social-pet",
      accessLevel: Calendar.CalendarAccessLevel.OWNER,
    });

    return calendarId;
  } catch (error) {
    console.error("[Calendar] Error getting/creating calendar:", error);
    return null;
  }
}

// Generic create-OR-update primitive. With `existingEventId` → update that event and
// return its id; otherwise create a new event and return the new id.
//
// On CREATE it applies the shared defaults the app has always used: BUSY availability
// and, on iOS, PRIVATE accessLevel. On UPDATE it patches only the fields the caller
// passes (matching the previous vet-update behavior, which set neither availability nor
// accessLevel). Throws on native failure so callers' try/catch report it unchanged.
export async function upsertCalendarEvent(calendarId, details, existingEventId) {
  if (existingEventId) {
    await Calendar.updateEventAsync(existingEventId, details);
    return existingEventId;
  }

  const createDetails = {
    ...details,
    availability: details.availability ?? Calendar.Availability.BUSY,
  };
  if (Platform.OS === "ios") {
    createDetails.accessLevel = Calendar.EventAccessLevel.PRIVATE;
  }

  return await Calendar.createEventAsync(calendarId, createDetails);
}

// Generic delete primitive. No-op-safe (no eventId → success). Mirrors the previous
// deleteVetAppointmentFromCalendar return shape so callers are unchanged.
export async function deleteCalendarEvent(eventId) {
  try {
    if (!eventId) {
      return { success: true }; // Nothing to delete.
    }

    const hasPermission = await isCalendarAvailable();
    if (!hasPermission) {
      return { success: false, error: "permission_denied" };
    }

    await Calendar.deleteEventAsync(eventId);
    return { success: true };
  } catch (error) {
    console.error("[Calendar] Error deleting event from calendar:", error);
    return { success: false, error: error.message };
  }
}

// ===== WALK CALENDAR (thin wrappers — unchanged return shape: boolean) =====

// Add a (possibly recurring) walk block to the Walks calendar. Returns true on success.
export async function addWalkToCalendar(walk, petName = "Your pet") {
  try {
    const hasPermission = await requestCalendarPermission();
    if (!hasPermission) {
      Alert.alert(
        "Permission needed",
        "Calendar access is required to add walk events.",
      );
      return false;
    }

    const calendarId = await getOrCreatePawPiCalendar(WALK_CALENDAR);
    if (!calendarId) {
      Alert.alert(
        "Calendar unavailable",
        "Could not access or create calendar. Please try again.",
      );
      return false;
    }

    const startDate = parseWalkTime(walk.time);
    const durationMinutes = walk.durationMinutes || 30;
    const endDate = new Date(startDate.getTime() + durationMinutes * 60 * 1000);

    const recurrenceRule = getRecurrenceRule(walk);

    const details = {
      title: "Busy", // Private title
      startDate,
      endDate,
      timeZone: "default",
      calendarId,
      notes: buildEventNotes("walk"),
      alarms: [],
      availability: Calendar.Availability.BUSY,
    };
    if (recurrenceRule) {
      details.recurrenceRule = recurrenceRule;
    }

    const eventId = await upsertCalendarEvent(calendarId, details);

    if (eventId) {
      Alert.alert(
        "Added to calendar",
        `Walk block added to your calendar${recurrenceRule ? " as a repeating event" : ""}.`,
      );
      return true;
    }

    return false;
  } catch (error) {
    console.error("[Calendar] Error adding walk to calendar:", error);
    Alert.alert("Error", "Could not add walk to calendar. Please try again.");
    return false;
  }
}

// Read the next 30 days of events from the Walks calendar.
export async function getWalkEvents() {
  try {
    const hasPermission = await isCalendarAvailable();
    if (!hasPermission) {
      return [];
    }

    const calendarId = await getOrCreatePawPiCalendar(WALK_CALENDAR);
    if (!calendarId) {
      return [];
    }

    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 30);

    const events = await Calendar.getEventsAsync(
      [calendarId],
      startDate,
      endDate,
    );

    return events;
  } catch (error) {
    console.error("[Calendar] Error getting walk events:", error);
    return [];
  }
}

// ===== VET APPOINTMENT CALENDAR (thin wrappers — unchanged return shapes) =====

// Add a vet appointment to the Vet Appointments calendar.
// Returns { success, eventId } / { success: false, error }.
export async function addVetAppointmentToCalendar(
  appointment,
  petName = "Your pet",
) {
  try {
    const hasPermission = await requestCalendarPermission();
    if (!hasPermission) {
      return { success: false, error: "permission_denied" };
    }

    const calendarId = await getOrCreatePawPiCalendar(VET_CALENDAR);
    if (!calendarId) {
      return { success: false, error: "calendar_unavailable" };
    }

    const appointmentDateTime = new Date(
      `${appointment.appointmentDate}T${appointment.appointmentTime}:00`,
    );
    // Default 30 min duration
    const endDate = new Date(appointmentDateTime.getTime() + 30 * 60 * 1000);

    const details = {
      title: `Vet appointment for ${petName}`,
      startDate: appointmentDateTime,
      endDate,
      timeZone: "default",
      calendarId,
      location: appointment.clinic || undefined,
      notes: buildEventNotes("vet", { ...appointment, petName }),
      alarms: [],
      availability: Calendar.Availability.BUSY,
    };

    const eventId = await upsertCalendarEvent(calendarId, details);

    if (eventId) {
      return { success: true, eventId };
    }

    return { success: false, error: "creation_failed" };
  } catch (error) {
    console.error(
      "[Calendar] Error adding vet appointment to calendar:",
      error,
    );
    return { success: false, error: error.message };
  }
}

// Update an existing vet-appointment calendar event. Returns { success } / { success: false, error }.
export async function updateVetAppointmentInCalendar(
  eventId,
  appointment,
  petName = "Your pet",
) {
  try {
    if (!eventId) {
      return { success: false, error: "no_event_id" };
    }

    const hasPermission = await isCalendarAvailable();
    if (!hasPermission) {
      return { success: false, error: "permission_denied" };
    }

    const appointmentDateTime = new Date(
      `${appointment.appointmentDate}T${appointment.appointmentTime}:00`,
    );
    const endDate = new Date(appointmentDateTime.getTime() + 30 * 60 * 1000);

    const details = {
      title: `Vet appointment for ${petName}`,
      startDate: appointmentDateTime,
      endDate,
      location: appointment.clinic || undefined,
      notes: buildEventNotes("vet", { ...appointment, petName }),
    };

    await upsertCalendarEvent(null, details, eventId);

    return { success: true };
  } catch (error) {
    console.error(
      "[Calendar] Error updating vet appointment in calendar:",
      error,
    );
    return { success: false, error: error.message };
  }
}

// Delete a vet-appointment calendar event (thin wrapper over the generic primitive).
export async function deleteVetAppointmentFromCalendar(eventId) {
  return deleteCalendarEvent(eventId);
}

// ===== 2.80 SURFACES — bookings / transport / telehealth / events =====
//
// Each surface adds (or, with existingEventId, updates) a device calendar event via the
// 2.79 generics, using a per-feature calendar and the pure detail builders. All return
// { success, eventId } / { success: false, error } so callers degrade cleanly and NEVER
// block the underlying save (mirrors addVetAppointmentToCalendar). Removal reuses the
// generic deleteCalendarEvent.

const BOOKING_CALENDAR = {
  title: "PawPi - Bookings",
  color: "#FF6F61", // Coral
  name: "socialPetBookings",
};
const TRANSPORT_CALENDAR = {
  title: "PawPi - Transport",
  color: "#B75D32", // Terracotta
  name: "socialPetTransport",
};
const TELEHEALTH_CALENDAR = {
  title: "PawPi - Telehealth",
  color: "#4DB8E8", // Blue
  name: "socialPetTelehealth",
};
const EVENT_CALENDAR = {
  title: "PawPi - Events",
  color: "#A7BFA3", // Sage green
  name: "socialPetEvents",
};

// Generic add/update for a 2.80 surface. `details` = { summary, startDate, endDate,
// location?, notes? } (from the pure calendarFormat builders). With `existingEventId` it
// updates that event; otherwise it creates a new one and returns its id.
export async function addSurfaceEventToCalendar(calendar, details, existingEventId) {
  try {
    const hasPermission = existingEventId
      ? await isCalendarAvailable()
      : await requestCalendarPermission();
    if (!hasPermission) {
      return { success: false, error: "permission_denied" };
    }

    const calendarId = await getOrCreatePawPiCalendar(calendar);
    if (!calendarId) {
      return { success: false, error: "calendar_unavailable" };
    }

    const eventDetails = {
      title: details.summary,
      startDate: details.startDate,
      endDate: details.endDate,
      timeZone: "default",
      calendarId,
      location: details.location || undefined,
      notes: details.notes || undefined,
      alarms: [],
      availability: Calendar.Availability.BUSY,
    };

    const eventId = await upsertCalendarEvent(calendarId, eventDetails, existingEventId);
    if (eventId) {
      return { success: true, eventId };
    }
    return { success: false, error: "creation_failed" };
  } catch (error) {
    console.error("[Calendar] Error adding surface event to calendar:", error);
    return { success: false, error: error.message };
  }
}

export async function addBookingToCalendar(
  booking,
  petName = "Your pet",
  existingEventId,
) {
  return addSurfaceEventToCalendar(
    BOOKING_CALENDAR,
    buildBookingCalendarDetails(booking, petName),
    existingEventId,
  );
}

export async function addTransportToCalendar(trip, existingEventId) {
  return addSurfaceEventToCalendar(
    TRANSPORT_CALENDAR,
    buildTransportCalendarDetails(trip),
    existingEventId,
  );
}

export async function addTelehealthToCalendar(
  consult,
  petName = "Your pet",
  existingEventId,
) {
  return addSurfaceEventToCalendar(
    TELEHEALTH_CALENDAR,
    buildTelehealthCalendarDetails(consult, petName),
    existingEventId,
  );
}

export async function addEventToCalendar(event, existingEventId) {
  return addSurfaceEventToCalendar(
    EVENT_CALENDAR,
    buildEventCalendarDetails(event),
    existingEventId,
  );
}

// Remove any 2.80 surface calendar event (thin wrapper over the generic primitive).
export async function removeSurfaceEventFromCalendar(eventId) {
  return deleteCalendarEvent(eventId);
}
