// Contract for the booking form:
//   - with no active pet it blocks (alerts, never books);
//   - Confirm books with the active pet's petId + the provider id + the chosen
//     canonical date/time;
//   - the service/location ids it sends are ones from THIS provider's profile.
// useCurrentPet + useBookProvider are mocked; DateField/TimeField are stubbed to
// emit canonical values on press, so no native picker is involved.

import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";

let mockCurrentPet;
const mockMutateAsync = jest.fn(() => Promise.resolve({ appointment: { id: 1 } }));

jest.mock("@/hooks/usePetProfile", () => ({
  useCurrentPet: () => ({ data: mockCurrentPet }),
}));
jest.mock("@/hooks/useProviders", () => ({
  useBookProvider: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
}));
jest.mock("lucide-react-native", () =>
  new Proxy({}, { get: () => () => null }),
);
// Stub the shared fields to emit canonical values on press (no native picker).
jest.mock("@/components/DateField", () => {
  const { Text, Pressable } = require("react-native");
  return {
    __esModule: true,
    default: ({ onChange, testID }) => (
      <Pressable testID={testID} onPress={() => onChange("2026-07-01")}>
        <Text>date</Text>
      </Pressable>
    ),
  };
});
jest.mock("@/components/TimeField", () => {
  const { Text, Pressable } = require("react-native");
  return {
    __esModule: true,
    default: ({ onChange, testID }) => (
      <Pressable testID={testID} onPress={() => onChange("09:30")}>
        <Text>time</Text>
      </Pressable>
    ),
  };
});

import BookingFormModal from "./BookingFormModal";

const PROVIDER = { id: 3, name: "Happy Paws" };
const SERVICES = [{ id: 5, name: "Checkup", price_cents: 5000, active: true }];
const LOCATIONS = [{ id: 8, name: "Main St", address: "1 Main" }];

beforeEach(() => {
  mockMutateAsync.mockClear();
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

function renderForm() {
  return render(
    <BookingFormModal
      visible
      onClose={jest.fn()}
      provider={PROVIDER}
      locations={LOCATIONS}
      services={SERVICES}
    />,
  );
}

test("blocks (alerts, no POST) when there is no active pet", () => {
  mockCurrentPet = null;
  const { getByText, getByTestId } = renderForm();

  // Even with a valid date/time, no pet → no booking.
  fireEvent.press(getByTestId("booking-date"));
  fireEvent.press(getByTestId("booking-time"));
  fireEvent.press(getByText("Confirm appointment"));

  expect(mockMutateAsync).not.toHaveBeenCalled();
  expect(Alert.alert).toHaveBeenCalledWith(
    "No active pet",
    expect.any(String),
  );
});

test("Confirm books with the active petId, provider id and canonical date/time", async () => {
  mockCurrentPet = { id: 7, name: "Rex" };
  const { getByText, getByTestId } = renderForm();

  fireEvent.press(getByTestId("booking-date"));
  fireEvent.press(getByTestId("booking-time"));
  fireEvent.press(getByText("Confirm appointment"));

  await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));

  const arg = mockMutateAsync.mock.calls[0][0];
  expect(arg).toMatchObject({
    providerId: 3,
    petId: 7,
    appointment_date: "2026-07-01",
    appointment_time: "09:30",
  });
  // No service/location chosen → those ids are omitted.
  expect(arg.service_id).toBeUndefined();
  expect(arg.provider_location_id).toBeUndefined();
});

test("only sends service/location ids that belong to this provider", async () => {
  mockCurrentPet = { id: 7, name: "Rex" };
  const { getByText, getByTestId } = renderForm();

  fireEvent.press(getByTestId("booking-date"));
  fireEvent.press(getByTestId("booking-time"));
  fireEvent.press(getByTestId("booking-service-5")); // from SERVICES
  fireEvent.press(getByTestId("booking-location-8")); // from LOCATIONS
  fireEvent.press(getByText("Confirm appointment"));

  await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));

  const arg = mockMutateAsync.mock.calls[0][0];
  expect(arg.service_id).toBe(5);
  expect(arg.provider_location_id).toBe(8);
});

// ── Ticket 2.4: generalized to any capability ─────────────────────────────────
test("defaults capability to 'vet' and shows the appointment CTA", async () => {
  mockCurrentPet = { id: 7, name: "Rex" };
  const { getByText, getByTestId } = renderForm();

  fireEvent.press(getByTestId("booking-date"));
  fireEvent.press(getByTestId("booking-time"));
  fireEvent.press(getByText("Confirm appointment")); // vet noun = "appointment"

  await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));
  expect(mockMutateAsync.mock.calls[0][0].capability).toBe("vet");
});

test("a groomer capability books with capability 'groomer' and grooming copy", async () => {
  mockCurrentPet = { id: 7, name: "Rex" };
  const { getByText, getByTestId } = render(
    <BookingFormModal
      visible
      onClose={jest.fn()}
      provider={{ id: 3, name: "Pet Spa", provider_type: "groomer" }}
      locations={[]}
      services={[]}
    />,
  );

  fireEvent.press(getByTestId("booking-date"));
  fireEvent.press(getByTestId("booking-time"));
  fireEvent.press(getByText("Confirm grooming")); // groomer noun = "grooming"

  await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));
  expect(mockMutateAsync.mock.calls[0][0].capability).toBe("groomer");
});
