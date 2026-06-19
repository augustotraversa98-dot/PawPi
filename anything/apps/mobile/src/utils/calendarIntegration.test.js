// Ticket 2.79: smoke test for the unified calendar layer with expo-calendar MOCKED
// (the native EventKit/Calendar calls can't run in CI). This proves the de-duplicated
// wrappers still return their DOCUMENTED shapes after the refactor:
//   addWalkToCalendar               → boolean
//   addVetAppointmentToCalendar     → { success, eventId }
//   updateVetAppointmentInCalendar  → { success }
//   deleteVetAppointmentFromCalendar→ { success }
// and that the generic primitives (getOrCreatePawPiCalendar / upsertCalendarEvent /
// deleteCalendarEvent) drive the native API. The pure mapping is covered separately in
// calendarFormat.test.js.

// Inline factory (jest hoists jest.mock above imports — no external variable ref).
jest.mock("expo-calendar", () => ({
  getCalendarPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
  requestCalendarPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
  getCalendarsAsync: jest.fn(async () => [
    {
      id: "walk-cal",
      title: "Social Pet - Walks",
      source: { id: "src", name: "iCloud", type: "local" },
    },
    {
      id: "vet-cal",
      title: "Social Pet - Vet Appointments",
      source: { id: "src", name: "iCloud", type: "local" },
    },
  ]),
  createCalendarAsync: jest.fn(async () => "new-cal"),
  createEventAsync: jest.fn(async () => "evt-created"),
  updateEventAsync: jest.fn(async () => undefined),
  deleteEventAsync: jest.fn(async () => undefined),
  getEventsAsync: jest.fn(async () => [{ id: "e1" }]),
  EntityTypes: { EVENT: "event" },
  SourceType: { LOCAL: "local" },
  CalendarAccessLevel: { OWNER: "owner" },
  Availability: { BUSY: "busy" },
  EventAccessLevel: { PRIVATE: "private" },
  Frequency: { DAILY: "daily", WEEKLY: "weekly", MONTHLY: "monthly" },
}));

import * as Calendar from "expo-calendar";
import { Alert } from "react-native";
import {
  addWalkToCalendar,
  getWalkEvents,
  isCalendarAvailable,
  addVetAppointmentToCalendar,
  updateVetAppointmentInCalendar,
  deleteVetAppointmentFromCalendar,
  getOrCreatePawPiCalendar,
  upsertCalendarEvent,
  deleteCalendarEvent,
  formatFrequency,
  addBookingToCalendar,
  addTransportToCalendar,
  addTelehealthToCalendar,
  addEventToCalendar,
  removeSurfaceEventFromCalendar,
} from "./calendarIntegration";
import { ROUTINE_FREQUENCY } from "@/data/routinesData";

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
  // Default: permission granted, calendars present, create/update/delete succeed.
  Calendar.getCalendarPermissionsAsync.mockResolvedValue({ status: "granted" });
  Calendar.requestCalendarPermissionsAsync.mockResolvedValue({ status: "granted" });
  Calendar.getCalendarsAsync.mockResolvedValue([
    { id: "walk-cal", title: "Social Pet - Walks", source: { id: "src", name: "iCloud", type: "local" } },
    { id: "vet-cal", title: "Social Pet - Vet Appointments", source: { id: "src", name: "iCloud", type: "local" } },
  ]);
  Calendar.createCalendarAsync.mockResolvedValue("new-cal");
  Calendar.createEventAsync.mockResolvedValue("evt-created");
  Calendar.updateEventAsync.mockResolvedValue(undefined);
  Calendar.deleteEventAsync.mockResolvedValue(undefined);
  Calendar.getEventsAsync.mockResolvedValue([{ id: "e1" }]);
});

const WALK = { time: "08:00", durationMinutes: 30, frequency: ROUTINE_FREQUENCY.DAILY };
const APPT = {
  appointmentDate: "2026-07-01",
  appointmentTime: "10:00",
  title: "Checkup",
  clinic: "PawCare",
};

describe("addWalkToCalendar", () => {
  it("creates a walk event and returns true", async () => {
    const result = await addWalkToCalendar(WALK, "Rex");
    expect(result).toBe(true);
    expect(Calendar.createEventAsync).toHaveBeenCalledWith(
      "walk-cal",
      expect.objectContaining({ title: "Busy", availability: "busy" }),
    );
  });

  it("returns false when permission is denied", async () => {
    Calendar.getCalendarPermissionsAsync.mockResolvedValue({ status: "denied" });
    Calendar.requestCalendarPermissionsAsync.mockResolvedValue({ status: "denied" });
    // Auto-accept the rationale prompt so requestCalendarPermissionsAsync is reached.
    Alert.alert.mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.text === "Allow calendar access")?.onPress?.();
    });
    expect(await addWalkToCalendar(WALK, "Rex")).toBe(false);
  });
});

describe("getWalkEvents", () => {
  it("returns the events from the walks calendar", async () => {
    expect(await getWalkEvents()).toEqual([{ id: "e1" }]);
  });

  it("returns [] when permission is missing", async () => {
    Calendar.getCalendarPermissionsAsync.mockResolvedValue({ status: "denied" });
    expect(await getWalkEvents()).toEqual([]);
  });
});

describe("addVetAppointmentToCalendar", () => {
  it("returns { success: true, eventId }", async () => {
    const result = await addVetAppointmentToCalendar(APPT, "Rex");
    expect(result).toEqual({ success: true, eventId: "evt-created" });
    expect(Calendar.createEventAsync).toHaveBeenCalledWith(
      "vet-cal",
      expect.objectContaining({ title: "Vet appointment for Rex" }),
    );
  });

  it("returns permission_denied without creating an event", async () => {
    Calendar.getCalendarPermissionsAsync.mockResolvedValue({ status: "denied" });
    Calendar.requestCalendarPermissionsAsync.mockResolvedValue({ status: "denied" });
    Alert.alert.mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.text === "Allow calendar access")?.onPress?.();
    });
    const result = await addVetAppointmentToCalendar(APPT, "Rex");
    expect(result).toEqual({ success: false, error: "permission_denied" });
    expect(Calendar.createEventAsync).not.toHaveBeenCalled();
  });
});

describe("updateVetAppointmentInCalendar", () => {
  it("updates the existing event and returns { success: true }", async () => {
    const result = await updateVetAppointmentInCalendar("evt-1", APPT, "Rex");
    expect(result).toEqual({ success: true });
    expect(Calendar.updateEventAsync).toHaveBeenCalledWith(
      "evt-1",
      expect.objectContaining({ title: "Vet appointment for Rex" }),
    );
  });

  it("returns no_event_id when called without an id", async () => {
    expect(await updateVetAppointmentInCalendar(null, APPT)).toEqual({
      success: false,
      error: "no_event_id",
    });
  });
});

describe("deleteVetAppointmentFromCalendar / deleteCalendarEvent", () => {
  it("deletes the event and returns { success: true }", async () => {
    expect(await deleteVetAppointmentFromCalendar("evt-1")).toEqual({ success: true });
    expect(Calendar.deleteEventAsync).toHaveBeenCalledWith("evt-1");
  });

  it("is a no-op success when there is no event id", async () => {
    expect(await deleteCalendarEvent(undefined)).toEqual({ success: true });
    expect(Calendar.deleteEventAsync).not.toHaveBeenCalled();
  });
});

describe("generic primitives", () => {
  it("getOrCreatePawPiCalendar returns an existing calendar id by title", async () => {
    expect(
      await getOrCreatePawPiCalendar({
        title: "Social Pet - Walks",
        color: "#A7BFA3",
        name: "socialPetWalks",
      }),
    ).toBe("walk-cal");
    expect(Calendar.createCalendarAsync).not.toHaveBeenCalled();
  });

  it("getOrCreatePawPiCalendar creates one when missing", async () => {
    const id = await getOrCreatePawPiCalendar({
      title: "Social Pet - Events",
      color: "#FF6F61",
      name: "socialPetEvents",
    });
    expect(id).toBe("new-cal");
    expect(Calendar.createCalendarAsync).toHaveBeenCalled();
  });

  it("upsertCalendarEvent creates when no existing id, updates when given one", async () => {
    const created = await upsertCalendarEvent("cal", { title: "X" });
    expect(created).toBe("evt-created");
    expect(Calendar.createEventAsync).toHaveBeenCalled();

    const updated = await upsertCalendarEvent("cal", { title: "Y" }, "evt-9");
    expect(updated).toBe("evt-9");
    expect(Calendar.updateEventAsync).toHaveBeenCalledWith(
      "evt-9",
      expect.objectContaining({ title: "Y" }),
    );
  });
});

describe("2.80 surface wrappers", () => {
  const BOOKING = {
    title: "Grooming",
    appointment_date: "2026-07-01",
    appointment_time: "10:00",
    provider_name: "PawCare",
  };
  const TRIP = {
    scheduled_at: "2026-07-01T08:00:00Z",
    pickup_address: "1 Main St",
    dropoff_address: "Vet",
    provider_name: "PetTaxi",
  };
  const EVENT = {
    title: "Puppy Social",
    starts_at: "2026-08-01T15:00:00Z",
    ends_at: "2026-08-01T17:00:00Z",
    location_name: "Park",
  };

  it("addBookingToCalendar creates an event in the Bookings calendar", async () => {
    const r = await addBookingToCalendar(BOOKING, "Rex");
    expect(r).toEqual({ success: true, eventId: "evt-created" });
    expect(Calendar.createEventAsync).toHaveBeenCalledWith(
      "new-cal", // Bookings calendar doesn't exist in the mock → created
      expect.objectContaining({ title: "Grooming", availability: "busy" }),
    );
  });

  it("addTransportToCalendar / addTelehealthToCalendar / addEventToCalendar return eventId", async () => {
    expect(await addTransportToCalendar(TRIP)).toEqual({ success: true, eventId: "evt-created" });
    expect(await addTelehealthToCalendar(BOOKING, "Rex")).toEqual({ success: true, eventId: "evt-created" });
    expect(await addEventToCalendar(EVENT)).toEqual({ success: true, eventId: "evt-created" });
  });

  it("with an existingEventId it UPDATES (no new create) and returns that id", async () => {
    const r = await addEventToCalendar(EVENT, "evt-7");
    expect(r).toEqual({ success: true, eventId: "evt-7" });
    expect(Calendar.updateEventAsync).toHaveBeenCalledWith(
      "evt-7",
      expect.objectContaining({ title: "Puppy Social" }),
    );
  });

  it("degrades cleanly when permission is denied (does not create an event)", async () => {
    Calendar.getCalendarPermissionsAsync.mockResolvedValue({ status: "denied" });
    Calendar.requestCalendarPermissionsAsync.mockResolvedValue({ status: "denied" });
    Alert.alert.mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.text === "Allow calendar access")?.onPress?.();
    });
    const r = await addBookingToCalendar(BOOKING, "Rex");
    expect(r).toEqual({ success: false, error: "permission_denied" });
    expect(Calendar.createEventAsync).not.toHaveBeenCalled();
  });

  it("removeSurfaceEventFromCalendar deletes the device event", async () => {
    expect(await removeSurfaceEventFromCalendar("evt-1")).toEqual({ success: true });
    expect(Calendar.deleteEventAsync).toHaveBeenCalledWith("evt-1");
  });
});

describe("re-exports", () => {
  it("re-exports formatFrequency from calendarFormat", () => {
    expect(formatFrequency({ frequency: ROUTINE_FREQUENCY.DAILY })).toBe("daily");
  });

  it("isCalendarAvailable reflects permission state", async () => {
    expect(await isCalendarAvailable()).toBe(true);
    Calendar.getCalendarPermissionsAsync.mockResolvedValue({ status: "denied" });
    expect(await isCalendarAvailable()).toBe(false);
  });
});
