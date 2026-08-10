// Contract for the slot picker (Phase 1 — service-duration slots):
//   - the availability query is keyed on the SELECTED service (serviceId), so the server
//     generates slots at that service's duration and switching service refetches;
//   - the returned slots render as chips once a day is chosen.
// useProviderAvailability is mocked (a jest.fn so we can assert its call args); the slot data
// it returns is what the picker renders.

import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

const mockUseProviderAvailability = jest.fn();
jest.mock("@/hooks/useProviders", () => ({
  useProviderAvailability: (...args) => mockUseProviderAvailability(...args),
}));
jest.mock("lucide-react-native", () =>
  new Proxy({}, { get: () => () => null }),
);

import BookingSlotPicker from "./BookingSlotPicker";

const TZ = "America/Argentina/Buenos_Aires";
const pad = (n) => String(n).padStart(2, "0");
const now = new Date();
const TODAY = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
// One 1-hour slot today at 09:00 Buenos Aires (= 12:00 UTC) — a service-duration slot.
const SLOT_START = `${TODAY}T12:00:00.000Z`;
const SLOT_END = `${TODAY}T13:00:00.000Z`;

beforeEach(() => {
  mockUseProviderAvailability.mockReset();
  mockUseProviderAvailability.mockReturnValue({
    data: {
      time_zone: TZ,
      availability: [{ date: TODAY, slots: [{ start: SLOT_START, end: SLOT_END }] }],
    },
    isLoading: false,
  });
});

describe("BookingSlotPicker — service-duration slots", () => {
  it("requests availability keyed on the selected service", () => {
    render(
      <BookingSlotPicker
        providerId={3}
        capability="vet"
        serviceId={7}
        selected={null}
        onSelect={jest.fn()}
        t={(k) => k}
      />,
    );
    expect(mockUseProviderAvailability).toHaveBeenCalledWith(
      3,
      expect.objectContaining({ capability: "vet", serviceId: 7 }),
    );
  });

  it("renders the service-duration slots after a day is chosen", () => {
    const { getByTestId } = render(
      <BookingSlotPicker
        providerId={3}
        capability="vet"
        serviceId={7}
        selected={null}
        onSelect={jest.fn()}
        t={(k) => k}
      />,
    );
    // Progressive disclosure: tap the available day, then its slot chip renders.
    fireEvent.press(getByTestId(`booking-day-${TODAY}`));
    expect(getByTestId(`booking-slot-${SLOT_START}`)).toBeTruthy();
  });
});
