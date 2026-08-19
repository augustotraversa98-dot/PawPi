// Events list + create (ticket 2.74):
//   - list + map render from real events; RSVP toggles; host-only cancel affordance;
//   - empty state when none;
//   - create-event posts the right body incl. the map location.
// Map (2.68), DateField/TimeField/LocationField, expo-location, and hooks are mocked.

import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";

let mockEvents;
let mockRsvp;
let mockCancel;
let mockCreate;

jest.mock("expo-router", () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn() }) }));
jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("react-i18next", () => require("@/i18n/testMock").makeReactI18nextMock());
jest.mock("expo-location", () => ({
  requestForegroundPermissionsAsync: jest.fn().mockResolvedValue({ status: "denied" }),
  getCurrentPositionAsync: jest.fn(),
}));
jest.mock("@/components/Map/MapLocationView", () => {
  const { Text } = require("react-native");
  return ({ points }) => <Text testID="map-view">{`m:${points?.length || 0}`}</Text>;
});
jest.mock("@/hooks/useEvents", () => ({
  useEvents: () => mockEvents,
  useRsvpEvent: () => mockRsvp,
  useCancelEvent: () => mockCancel,
  useCreateEvent: () => mockCreate,
}));

const mockAddEventToCalendar = jest.fn();
const mockRemoveSurfaceEvent = jest.fn();
jest.mock("@/utils/calendarIntegration", () => ({
  addEventToCalendar: (...a) => mockAddEventToCalendar(...a),
  removeSurfaceEventFromCalendar: (...a) => mockRemoveSurfaceEvent(...a),
}));

import EventsScreen from "./events";

const EVENT = {
  id: 9,
  title: "Puppy Social",
  starts_at: "2026-08-01T17:00:00Z",
  location_name: "Central Park",
  lat: 40.7,
  lng: -74,
  attendee_count: 3,
  host_username: "rex",
  my_rsvp: null,
  is_host: false,
};

beforeEach(() => {
  mockEvents = { data: [EVENT], isLoading: false };
  mockRsvp = { mutate: jest.fn() };
  mockCancel = { mutate: jest.fn() };
  mockCreate = { mutateAsync: jest.fn().mockResolvedValue({}), isPending: false };
  mockAddEventToCalendar.mockResolvedValue({ success: true, eventId: "evt-1" });
  mockRemoveSurfaceEvent.mockResolvedValue({ success: true });
});

it("renders the map + an event row and RSVPs", async () => {
  const { findByTestId, getByTestId } = render(<EventsScreen />);
  expect(await findByTestId("event-9")).toBeTruthy();
  expect(getByTestId("map-view").props.children).toBe("m:1");
  fireEvent.press(getByTestId("event-rsvp-9"));
  expect(mockRsvp.mutate).toHaveBeenCalledWith(
    expect.objectContaining({ eventId: 9, status: "going" }),
    expect.anything(),
  );
});

it("shows the host cancel affordance only for the host's events", async () => {
  mockEvents = { data: [{ ...EVENT, is_host: true }], isLoading: false };
  const { findByTestId } = render(<EventsScreen />);
  expect(await findByTestId("event-cancel-9")).toBeTruthy();
});

it("hides the cancel affordance for non-host events", async () => {
  const { findByTestId, queryByTestId } = render(<EventsScreen />);
  await findByTestId("event-9");
  expect(queryByTestId("event-cancel-9")).toBeNull();
});

it("shows an empty state when there are no events", async () => {
  mockEvents = { data: [], isLoading: false };
  const { findByTestId } = render(<EventsScreen />);
  expect(await findByTestId("events-empty")).toBeTruthy();
});

// ── 2.80: add-to-calendar is gated on a "going" RSVP ──
it("hides the add-to-calendar button until the user is going", async () => {
  const { findByTestId, queryByTestId } = render(<EventsScreen />);
  await findByTestId("event-9"); // my_rsvp: null
  expect(queryByTestId("event-add-calendar-9")).toBeNull();
});

it("shows add-to-calendar when going, and persists the device event id", async () => {
  mockEvents = { data: [{ ...EVENT, my_rsvp: "going" }], isLoading: false };
  const { findByTestId, getByTestId } = render(<EventsScreen />);
  await findByTestId("event-add-calendar-9");
  fireEvent.press(getByTestId("event-add-calendar-9"));
  await waitFor(() => expect(mockAddEventToCalendar).toHaveBeenCalled());
  await waitFor(() =>
    expect(mockRsvp.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: 9, status: "going", calendar_event_id: "evt-1" }),
    ),
  );
});

it("un-RSVP removes the device calendar event and clears the stored id", async () => {
  mockEvents = {
    data: [{ ...EVENT, my_rsvp: "going", my_calendar_event_id: "evt-1" }],
    isLoading: false,
  };
  const { getByTestId } = render(<EventsScreen />);
  fireEvent.press(getByTestId("event-rsvp-9")); // going → not_going
  await waitFor(() => expect(mockRemoveSurfaceEvent).toHaveBeenCalledWith("evt-1"));
  await waitFor(() =>
    expect(mockRsvp.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: 9, status: "not_going", calendar_event_id: null }),
      expect.anything(),
    ),
  );
});
