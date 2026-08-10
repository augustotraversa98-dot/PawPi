import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";

// The screen's data + mutation hooks are mocked so this test isolates rendering,
// the per-status action gating, and the filter wiring (no DB / react-query).
const navigateMock = vi.fn();
vi.mock("react-router", () => ({
  useNavigate: () => navigateMock,
  Link: ({ to, children, ...props }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("../hooks/useProviders", () => ({
  useProviderBookings: vi.fn(),
  useBookingAction: vi.fn(),
  useProviderStaff: vi.fn(),
  useEndTelehealthConsult: vi.fn(),
  useProvider: vi.fn(),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import {
  useProviderBookings,
  useBookingAction,
  useProviderStaff,
  useEndTelehealthConsult,
  useProvider,
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

const TELEHEALTH_LIVE = {
  id: 3,
  pet_id: 88,
  appointment_date: "2026-07-03",
  appointment_time: "10:00",
  pet_name: "Nala",
  owner_name: "Ali Owner",
  service_name: "Video consult",
  booking_status: "confirmed",
  staff_user_id: 7,
  capability: "telehealth",
  telehealth_session_id: 55,
  telehealth_session_status: "in_progress",
};

let mutateMock;
let endConsultMock;

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
  endConsultMock = vi.fn();
  useEndTelehealthConsult.mockReturnValue({
    mutate: endConsultMock,
    isPending: false,
    variables: undefined,
  });
  useProviderStaff.mockReturnValue({
    data: STAFF,
    isLoading: false,
    isError: false,
    error: null,
  });
  useProvider.mockReturnValue({
    data: { provider: { time_zone: "America/Argentina/Buenos_Aires" } },
  });
  setBookings([REQUESTED, CONFIRMED]);
});

describe("BookingsInbox", () => {
  it("renders a row per booking with pet / owner / service / when", () => {
    render(<BookingsInbox providerId={3} />);
    expect(screen.getByText("Rex")).toBeInTheDocument();
    expect(screen.getByText("Sam Owner")).toBeInTheDocument();
    expect(screen.getByText("Checkup")).toBeInTheDocument();
    // Wall-clock render — a clean "d MMM yyyy · HH:MM", no ISO zeros / trailing Z.
    expect(screen.getByText("1 Jul 2026 · 09:00")).toBeInTheDocument();
    // null service_name renders the em-dash fallback.
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("shows the empty state when there are no bookings", () => {
    setBookings([]);
    render(<BookingsInbox providerId={3} />);
    expect(screen.getByText("No bookings yet")).toBeInTheDocument();
  });

  it("renders the customer's notes for a booking", () => {
    setBookings([{ ...REQUESTED, notes: "Limps on left hind leg" }]);
    render(<BookingsInbox providerId={3} />);
    expect(screen.getByText("Notes")).toBeInTheDocument(); // column header
    expect(screen.getByText("Limps on left hind leg")).toBeInTheDocument();
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

  it("calls the cancel action (after confirm dialog) for a confirmed booking", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<BookingsInbox providerId={3} />);
    // Cancel is a confirmed-only action now (the confirmed row, id 2).
    fireEvent.click(screen.getByText("Cancel"));
    expect(mutateMock).toHaveBeenCalledWith(
      expect.objectContaining({ appointmentId: 2, action: "cancel" }),
      expect.any(Object),
    );
  });

  it("does NOT call the action when the cancel dialog is dismissed", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<BookingsInbox providerId={3} />);
    fireEvent.click(screen.getByText("Cancel"));
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

  it("shows End consult for a telehealth booking with an active session, and calls the PATCH-backed mutation", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.spyOn(window, "prompt").mockReturnValue("Recheck in 2 weeks");
    setBookings([TELEHEALTH_LIVE]);
    render(<BookingsInbox providerId={3} />);

    const endButton = screen.getByText("End consult");
    fireEvent.click(endButton);

    expect(endConsultMock).toHaveBeenCalledWith(
      { sessionId: 55, summary: "Recheck in 2 weeks" },
      expect.any(Object),
    );
  });

  it("does NOT call the end mutation when the confirm dialog is dismissed", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    setBookings([TELEHEALTH_LIVE]);
    render(<BookingsInbox providerId={3} />);

    fireEvent.click(screen.getByText("End consult"));
    expect(endConsultMock).not.toHaveBeenCalled();
  });

  it("hides End consult once the session is already ended", () => {
    setBookings([{ ...TELEHEALTH_LIVE, telehealth_session_status: "ended" }]);
    render(<BookingsInbox providerId={3} />);
    expect(screen.queryByText("End consult")).not.toBeInTheDocument();
  });

  it("hides End consult when no session has ever been created for the booking", () => {
    setBookings([
      { ...TELEHEALTH_LIVE, telehealth_session_id: null, telehealth_session_status: null },
    ]);
    render(<BookingsInbox providerId={3} />);
    expect(screen.queryByText("End consult")).not.toBeInTheDocument();
  });

  it("Open record navigates to the booking's pet clinical record", () => {
    // Single booking so row order (now client-sorted) can't pick the wrong one.
    setBookings([REQUESTED]);
    render(<BookingsInbox providerId={3} />);
    // Rex (pet 55) exposes Open record.
    fireEvent.click(screen.getByText("Open record"));
    expect(navigateMock).toHaveBeenCalledTimes(1);
    const dest = navigateMock.mock.calls[0][0];
    expect(dest).toContain("/provider/pets/55/record");
    expect(dest).toContain("petName=Rex");
    expect(dest).toContain("bookingId=1");
  });

  it("renders the date/time as a clean 'd MMM yyyy · HH:MM' (no ISO zeros / trailing Z)", () => {
    setBookings([
      { ...REQUESTED, appointment_date: "2026-08-15", appointment_time: "14:30" },
    ]);
    render(<BookingsInbox providerId={3} />);
    expect(screen.getByText("15 Aug 2026 · 14:30")).toBeInTheDocument();
    // No raw ISO leaked into the cell.
    expect(screen.queryByText(/T\d{2}:\d{2}/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Z\b/)).not.toBeInTheDocument();
  });

  it("gates actions by status: requested → Confirm + Decline (no Cancel); confirmed → Cancel", () => {
    render(<BookingsInbox providerId={3} />); // [REQUESTED, CONFIRMED]
    // requested row offers Confirm + Decline...
    expect(screen.getByText("Confirm")).toBeInTheDocument();
    expect(screen.getByText("Decline")).toBeInTheDocument();
    // ...and Cancel appears ONCE — on the confirmed row only, not the requested one.
    expect(screen.getAllByText("Cancel")).toHaveLength(1);
  });

  it("declined / cancelled bookings expose no state-changing or End consult actions", () => {
    setBookings([
      { ...CONFIRMED, id: 4, booking_status: "declined" },
      // A cancelled telehealth booking whose session is somehow still 'in_progress'
      // must NOT offer End consult — the gate now also requires booking_status confirmed.
      { ...TELEHEALTH_LIVE, id: 5, booking_status: "cancelled" },
    ]);
    render(<BookingsInbox providerId={3} />);
    expect(screen.queryByText("Confirm")).not.toBeInTheDocument();
    expect(screen.queryByText("Decline")).not.toBeInTheDocument();
    expect(screen.queryByText("Cancel")).not.toBeInTheDocument();
    expect(screen.queryByText("Assign")).not.toBeInTheDocument();
    expect(screen.queryByText("End consult")).not.toBeInTheDocument();
    expect(screen.queryByText("Join consult")).not.toBeInTheDocument();
  });

  it("shows the booking number (#id) and search matches on it", () => {
    render(<BookingsInbox providerId={3} />);
    expect(screen.getByText("#1")).toBeInTheDocument();
    expect(screen.getByText("#2")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Search bookings"), {
      target: { value: "#2" },
    });
    // Only booking #2 (Milo) survives.
    expect(screen.getByText("Milo")).toBeInTheDocument();
    expect(screen.queryByText("Rex")).not.toBeInTheDocument();
  });

  it("search filters rows over pet / owner / service (case-insensitive)", () => {
    render(<BookingsInbox providerId={3} />);
    fireEvent.change(screen.getByLabelText("Search bookings"), {
      target: { value: "rex" },
    });
    expect(screen.getByText("Rex")).toBeInTheDocument();
    expect(screen.queryByText("Milo")).not.toBeInTheDocument();
  });

  it("sort toggle reorders rows by appointment date vs date created", () => {
    // A is the later appointment but the older booking; B is the earlier
    // appointment but the newer booking — so the two orders differ.
    const A = {
      ...REQUESTED,
      id: 10,
      pet_name: "Alpha",
      appointment_date: "2026-07-20",
      appointment_time: "09:00",
      created_at: "2026-06-01T00:00:00.000Z",
    };
    const B = {
      ...CONFIRMED,
      id: 11,
      pet_name: "Bravo",
      appointment_date: "2026-07-10",
      appointment_time: "09:00",
      created_at: "2026-06-15T00:00:00.000Z",
    };
    setBookings([A, B]);
    render(<BookingsInbox providerId={3} />);

    const ids = () =>
      screen.getAllByText(/^#\d+$/).map((el) => el.textContent);

    // Default (appointment date, desc): later appointment (A, #10) first.
    expect(ids()).toEqual(["#10", "#11"]);

    // Date created (desc): newer booking (B, #11) first.
    fireEvent.change(screen.getByLabelText("Sort bookings"), {
      target: { value: "created" },
    });
    expect(ids()).toEqual(["#11", "#10"]);
  });

  it("offers a Completed status filter and renders its badge", () => {
    setBookings([{ ...CONFIRMED, id: 6, booking_status: "completed" }]);
    render(<BookingsInbox providerId={3} />);
    // The chip exists...
    expect(
      screen.getByRole("option", { name: "Completed" }),
    ).toBeInTheDocument();
    // ...and a completed booking gets its own badge.
    expect(screen.getByText("completed")).toBeInTheDocument();
  });
});
