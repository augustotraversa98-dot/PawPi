import * as Calendar from "expo-calendar";
import { Platform, Alert } from "react-native";
import { ROUTINE_FREQUENCY } from "@/data/routinesData";

// Request calendar permissions
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
        "Social Pet can add walk blocks to your calendar so your time stays protected.",
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

// Get or create the Social Pet calendar
async function getSocialPetCalendar() {
  try {
    const calendars = await Calendar.getCalendarsAsync(
      Calendar.EntityTypes.EVENT,
    );

    // Check if Social Pet calendar already exists
    const existingCalendar = calendars.find(
      (cal) => cal.title === "Social Pet - Walks",
    );

    if (existingCalendar) {
      return existingCalendar.id;
    }

    // Create new calendar
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
      title: "Social Pet - Walks",
      color: "#A7BFA3", // Sage green
      entityType: Calendar.EntityTypes.EVENT,
      sourceId: defaultCalendarSource.id,
      source: defaultCalendarSource,
      name: "socialPetWalks",
      ownerAccount: "social-pet",
      accessLevel: Calendar.CalendarAccessLevel.OWNER,
    });

    return calendarId;
  } catch (error) {
    console.error("[Calendar] Error getting/creating calendar:", error);
    return null;
  }
}

// Convert walk schedule to recurrence rule
function getRecurrenceRule(walk) {
  if (walk.frequency === ROUTINE_FREQUENCY.DAILY) {
    return {
      frequency: Calendar.Frequency.DAILY,
      interval: 1,
    };
  }

  if (walk.frequency === ROUTINE_FREQUENCY.WEEKLY && walk.days?.length > 0) {
    // Convert days (0 = Sunday) to Calendar format
    const daysOfWeek = walk.days.map((day) => {
      // walk.days uses 0 = Sunday, Calendar uses same format
      return day;
    });

    return {
      frequency: Calendar.Frequency.WEEKLY,
      interval: 1,
      daysOfTheWeek: daysOfWeek.map((day) => ({ dayOfTheWeek: day })),
    };
  }

  if (walk.frequency === ROUTINE_FREQUENCY.MONTHLY && walk.preferredDay) {
    return {
      frequency: Calendar.Frequency.MONTHLY,
      interval: 1,
      daysOfTheMonth: [walk.preferredDay],
    };
  }

  // Default to no recurrence for one-time events
  return null;
}

// Parse time string (HH:mm) to today's date with that time
function parseWalkTime(timeString) {
  const [hours, minutes] = timeString.split(":").map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date;
}

// Add walk to calendar
export async function addWalkToCalendar(walk, petName = "Your pet") {
  try {
    // Check permission
    const hasPermission = await requestCalendarPermission();
    if (!hasPermission) {
      Alert.alert(
        "Permission needed",
        "Calendar access is required to add walk events.",
      );
      return false;
    }

    // Get or create calendar
    const calendarId = await getSocialPetCalendar();
    if (!calendarId) {
      Alert.alert(
        "Calendar unavailable",
        "Could not access or create calendar. Please try again.",
      );
      return false;
    }

    // Parse walk time
    const startDate = parseWalkTime(walk.time);
    const durationMinutes = walk.durationMinutes || 30;
    const endDate = new Date(startDate.getTime() + durationMinutes * 60 * 1000);

    // Get recurrence rule
    const recurrenceRule = getRecurrenceRule(walk);

    // Create event details
    const eventDetails = {
      title: "Busy", // Private title
      startDate,
      endDate,
      timeZone: "default",
      calendarId,
      notes: "Dog walk scheduled in Social Pet",
      alarms: [],
      availability: Calendar.Availability.BUSY,
    };

    // Add recurrence if applicable
    if (recurrenceRule) {
      eventDetails.recurrenceRule = recurrenceRule;
    }

    // iOS supports accessLevel for privacy
    if (Platform.OS === "ios") {
      eventDetails.accessLevel = Calendar.EventAccessLevel.PRIVATE;
    }

    const eventId = await Calendar.createEventAsync(calendarId, eventDetails);

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

// Check if calendar is available
export async function isCalendarAvailable() {
  try {
    const { status } = await Calendar.getCalendarPermissionsAsync();
    return status === "granted";
  } catch (error) {
    console.error("[Calendar] Error checking calendar availability:", error);
    return false;
  }
}

// Get all walk events from Social Pet calendar
export async function getWalkEvents() {
  try {
    const hasPermission = await isCalendarAvailable();
    if (!hasPermission) {
      return [];
    }

    const calendarId = await getSocialPetCalendar();
    if (!calendarId) {
      return [];
    }

    // Get events for the next 30 days
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

// Format frequency for display
export function formatFrequency(walk) {
  if (walk.frequency === ROUTINE_FREQUENCY.DAILY) {
    return "daily";
  }

  if (walk.frequency === ROUTINE_FREQUENCY.WEEKLY && walk.days?.length > 0) {
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const selectedDays = walk.days.map((d) => dayNames[d]).join(", ");
    return `every ${selectedDays}`;
  }

  if (walk.frequency === ROUTINE_FREQUENCY.MONTHLY && walk.preferredDay) {
    return `monthly on day ${walk.preferredDay}`;
  }

  return "one time";
}

// ===== VET APPOINTMENT CALENDAR FUNCTIONS =====

// Get or create the Social Pet Vet Appointments calendar
async function getVetAppointmentsCalendar() {
  try {
    const calendars = await Calendar.getCalendarsAsync(
      Calendar.EntityTypes.EVENT,
    );

    // Check if calendar exists
    const existingCalendar = calendars.find(
      (cal) => cal.title === "Social Pet - Vet Appointments",
    );

    if (existingCalendar) {
      return existingCalendar.id;
    }

    // Create new calendar
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
      title: "Social Pet - Vet Appointments",
      color: "#4DB8E8", // Blue
      entityType: Calendar.EntityTypes.EVENT,
      sourceId: defaultCalendarSource.id,
      source: defaultCalendarSource,
      name: "socialPetVetAppointments",
      ownerAccount: "social-pet",
      accessLevel: Calendar.CalendarAccessLevel.OWNER,
    });

    return calendarId;
  } catch (error) {
    console.error("[Calendar] Error getting/creating vet calendar:", error);
    return null;
  }
}

// Add vet appointment to calendar
export async function addVetAppointmentToCalendar(
  appointment,
  petName = "Your pet",
) {
  try {
    // Check permission
    const hasPermission = await requestCalendarPermission();
    if (!hasPermission) {
      return { success: false, error: "permission_denied" };
    }

    // Get or create calendar
    const calendarId = await getVetAppointmentsCalendar();
    if (!calendarId) {
      return { success: false, error: "calendar_unavailable" };
    }

    // Parse appointment date and time
    const appointmentDateTime = new Date(
      `${appointment.appointmentDate}T${appointment.appointmentTime}:00`,
    );

    // Default 30 min duration
    const endDate = new Date(appointmentDateTime.getTime() + 30 * 60 * 1000);

    // Build notes
    let notes = `Vet appointment for ${petName}\n\n`;
    if (appointment.title) notes += `Appointment: ${appointment.title}\n`;
    if (appointment.reasonForVisit)
      notes += `Reason: ${appointment.reasonForVisit}\n`;
    if (appointment.veterinarian)
      notes += `Veterinarian: ${appointment.veterinarian}\n`;
    if (appointment.notes) notes += `\nNotes: ${appointment.notes}\n`;
    notes += `\nManaged by Social Pet`;

    // Create event details
    const eventDetails = {
      title: `Vet appointment for ${petName}`,
      startDate: appointmentDateTime,
      endDate,
      timeZone: "default",
      calendarId,
      location: appointment.clinic || undefined,
      notes,
      alarms: [],
      availability: Calendar.Availability.BUSY,
    };

    // iOS supports accessLevel for privacy
    if (Platform.OS === "ios") {
      eventDetails.accessLevel = Calendar.EventAccessLevel.PRIVATE;
    }

    const eventId = await Calendar.createEventAsync(calendarId, eventDetails);

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

// Update vet appointment in calendar
export async function updateVetAppointmentInCalendar(
  eventId,
  appointment,
  petName = "Your pet",
) {
  try {
    if (!eventId) {
      return { success: false, error: "no_event_id" };
    }

    // Check permission
    const hasPermission = await isCalendarAvailable();
    if (!hasPermission) {
      return { success: false, error: "permission_denied" };
    }

    // Parse appointment date and time
    const appointmentDateTime = new Date(
      `${appointment.appointmentDate}T${appointment.appointmentTime}:00`,
    );
    const endDate = new Date(appointmentDateTime.getTime() + 30 * 60 * 1000);

    // Build notes
    let notes = `Vet appointment for ${petName}\n\n`;
    if (appointment.title) notes += `Appointment: ${appointment.title}\n`;
    if (appointment.reasonForVisit)
      notes += `Reason: ${appointment.reasonForVisit}\n`;
    if (appointment.veterinarian)
      notes += `Veterinarian: ${appointment.veterinarian}\n`;
    if (appointment.notes) notes += `\nNotes: ${appointment.notes}\n`;
    notes += `\nManaged by Social Pet`;

    // Update event details
    const eventDetails = {
      title: `Vet appointment for ${petName}`,
      startDate: appointmentDateTime,
      endDate,
      location: appointment.clinic || undefined,
      notes,
    };

    await Calendar.updateEventAsync(eventId, eventDetails);

    return { success: true };
  } catch (error) {
    console.error(
      "[Calendar] Error updating vet appointment in calendar:",
      error,
    );
    return { success: false, error: error.message };
  }
}

// Delete vet appointment from calendar
export async function deleteVetAppointmentFromCalendar(eventId) {
  try {
    if (!eventId) {
      return { success: true }; // No event to delete
    }

    const hasPermission = await isCalendarAvailable();
    if (!hasPermission) {
      return { success: false, error: "permission_denied" };
    }

    await Calendar.deleteEventAsync(eventId);
    return { success: true };
  } catch (error) {
    console.error(
      "[Calendar] Error deleting vet appointment from calendar:",
      error,
    );
    return { success: false, error: error.message };
  }
}
