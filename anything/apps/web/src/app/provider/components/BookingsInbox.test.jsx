import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";

// The screen's data + mutation hooks are mocked so this test isolates rendering,
// the per-status action gating, and the filter wiring (no DB / react-query).
const navigateMock = vi.fn();
vi.mock("react-router", () => ({
  useNavigate: () => navigateMock,
}));
vi.mock("../hooks/useProviders", () => ({
  useProviderBookings: vi.fn(),
  useBookingAction: vi.fn(),
  useProviderStaff: vi.fn(),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import {
  useProviderBookings,
  useBookingAction,
  useProviderStaff,
} from "../hooks/useProviders";
import BookingsInbox from "./BookingsInbox";

const STAFF = [
  {
    id: 1,
    user_profile_id: 7,
    role: "owner",
    status: "active",
    username: "doc",
    full_name: "Dr Vet",
  },
  {
    id: 2,
    user_profile_id: 42,
    role: "staff",
    status: "active",
    username: "frontdesk",
    full_name: "Front Desk",
  },
  {
    id: 3,
    user_profile_id: 9,
    role: "vet",
    status: "removed",
    username: "gone",
    full_name: "Ex Vet",
  },
];

const REQUESTED = {
  id: 1,
  pet_id: 55,
  appointment_date: "2026-07-01",
  appointment_time: "09:00",
  pet_name: "Rex",
  owner_name: "Sam Owner",
  service_name: "Checkup",
  booking_status: "requested",
  staff_user_id: null,
};
const CONFIRMED = {
  id: 2,
  pet_id: 77,
  appointment_date: "2026-07-02",
  appointment_time: "14:30",
  pet_name: "Milo",
  owner_name: "Jo Owner",
  service_name: null,
  booking_status: "confirmed",
  staff_user_id: 42,
};

let mutateMock;

function setBookings(data, extra = {}) {
  useProviderBookings.mockReturnValue({
    data,
    isLoading: false,
    isError: false,
    error: null,
    ...extra,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mutateMock = vi.fn();
  useBookingAction.mockReturnValue({
    mutate: mutateMock,
    isPending: false,
    variables: undefined,
  });
  useProviderStaff.mockReturnValue({
    data: STAFF,
    isLoading: false,
    isError: false,
    error: null,
  });
  setBookings([REQUESTED, CONFIRMED]);
});

describe("BookingsInbox", () => {
  it("renders a row per booking with pet / owner / service / when", () => {
    render(<BookingsInbox providerId={3} />);
    expect(screen.getByText("Rex")).toBeInTheDocument();
    expect(screen.getByText("Sam Owner")).toBeInTheDocument();
    expect(screen.getByText("Checkup")).toBeInTheDocument();
    expect(screen.getByText("2026-07-01 · 09:00")).toBeInTheDocument();
    // null service_name renders the em-dash fallback.
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("shows the empty state when there are no bookings", () => {
    setBookings([]);
    render(<BookingsInbox providerId={3} />);
    expect(screen.getByText("No bookings yet")).toBeInTheDocument();
  });

  it("shows Confirm only for requested bookings and calls the confirm action", () => {
    render(<BookingsInbox providerId={3} />);
    const confirmButtons = screen.getAllByText("Confirm");
    // Only the requested row (id 1) gets a Confirm button, not the confirmed one.
    expect(confirmButtons).toHaveLength(1);

    fireEvent.click(confirmButtons[0]);
    expect(mutateMock).toHaveBeenCalledWith(
      expect.objectContaining({ appointmentId: 1, action: "confirm" }),
      expect.any(Object),
    );
  });

  it("calls the decline action (after confirm dialog) for a requested booking", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<BookingsInbox providerId={3} />);
    fireEvent.click(screen.getByText("Decline"));
    expect(mutateMock).toHaveBeenCalledWith(
      expect.objectContaining({ appointmentId: 1, action: "decline" }),
      expect.any(Object),
    );
  });

  it("calls the cancel action (after confirm dialog)", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<BookingsInbox providerId={3} />);
    // Cancel is available on both rows; click the first.
    fireEvent.click(screen.getAllByText("Cancel")[0]);
    expect(mutateMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "cancel" }),
      expect.any(Object),
    );
  });

  it("does NOT call the action when the cancel dialog is dismissed", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<BookingsInbox providerId={3} />);
    fireEvent.click(screen.getAllByText("Cancel")[0]);
    expect(mutateMock).not.toHaveBeenCalled();
  });

  it("re-queries with the chosen booking_status when the filter changes", () => {
    render(<BookingsInbox providerId={3} />);
    // Initial render: 'all' → undefined status passed to the query hook.
    expect(useProviderBookings).toHaveBeenLastCalledWith(3, undefined);

    fireEvent.change(screen.getByLabelText("Filter by booking status"), {
      target: { value: "confirmed" },
    });
    expect(useProviderBookings).toHaveBeenLastCalledWith(3, "confirmed");
  });

  it("maps a booking's staff_user_id to the staff member's name", () => {
    render(<BookingsInbox providerId={3} />);
    // CONFIRMED.staff_user_id 42 → 'Front Desk' (not the raw "Staff #42").
    expect(screen.getByText("Front Desk")).toBeInTheDocument();
    expect(screen.queryByText("Staff #42")).not.toBeInTheDocument();
    // The requested (unassigned) booking still reads Unassigned.
    expect(screen.getByText("Unassigned")).toBeInTheDocument();
  });

  it("Assign opens a picker of ACTIVE staff by name (removed members excluded)", () => {
    render(<BookingsInbox providerId={3} />);
    // Open the picker on the first booking offering Assign.
    fireEvent.click(screen.getAllByText("Assign")[0]);
    const dialog = screen.getByRole("dialog");
    // Both active members are pickable; the removed one is not offered.
    expect(within(dialog).getByText("Dr Vet")).toBeInTheDocument();
    expect(within(dialog).getByText("Front Desk")).toBeInTheDocument();
    expect(within(dialog).queryByText("Ex Vet")).not.toBeInTheDocument();
  });

  it("picking a staff member assigns with that member's user_profile_id", () => {
    render(<BookingsInbox providerId={3} />);
    fireEvent.click(screen.getAllByText("Assign")[0]);
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByText("Front Desk"));
    expect(mutateMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "assign", staffUserId: 42 }),
      expect.any(Object),
    );
  });

  it("Open record navigates to the booking's pet clinical record", () => {
    render(<BookingsInbox providerId={3} />);
    // Every booking with a pet exposes Open record; click the first (Rex, pet 55).
    fireEvent.click(screen.getAllByText("Open record")[0]);
    expect(navigateMock).toHaveBeenCalledTimes(1);
    const dest = navigateMock.mock.calls[0][0];
    expect(dest).toContain("/provider/pets/55/record");
    expect(dest).toContain("petName=Rex");
    expect(dest).toContain("bookingId=1");
  });
});
