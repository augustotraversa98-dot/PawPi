import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// ProviderDaycare (ticket 2.8) — the facility workspace. The data hooks are mocked; we
// assert: the occupancy list renders stays with status + owner instructions, a booked
// stay offers Check in, a checked-in stay offers Check out, the empty state shows, and the
// per-stay "Check vaccines" triggers the consent-gated query refetch (not auto-fetched).

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("../hooks/useProviders", () => ({
  useDaycareStays: vi.fn(),
  useDaycareStayAction: vi.fn(),
  usePostReportCard: vi.fn(),
  useDaycareRequirements: vi.fn(),
  useAddDaycareRequirement: vi.fn(),
  usePetVaccineCheck: vi.fn(),
}));

import {
  useDaycareStays,
  useDaycareStayAction,
  usePostReportCard,
  useDaycareRequirements,
  useAddDaycareRequirement,
  usePetVaccineCheck,
} from "../hooks/useProviders";
import ProviderDaycare from "./ProviderDaycare";

const mutationStub = (overrides = {}) => ({
  mutateAsync: vi.fn().mockResolvedValue({}),
  isPending: false,
  ...overrides,
});

function setStays(data, extra = {}) {
  useDaycareStays.mockReturnValue({
    data,
    isLoading: false,
    isError: false,
    error: null,
    ...extra,
  });
}

const refetch = vi.fn().mockResolvedValue({});

beforeEach(() => {
  vi.clearAllMocks();
  useDaycareStayAction.mockReturnValue(mutationStub());
  usePostReportCard.mockReturnValue(mutationStub());
  useAddDaycareRequirement.mockReturnValue(mutationStub());
  useDaycareRequirements.mockReturnValue({ data: [], isLoading: false });
  usePetVaccineCheck.mockReturnValue({
    data: undefined,
    isFetching: false,
    error: null,
    refetch,
  });
});

describe("ProviderDaycare occupancy", () => {
  it("renders stays with status + the owner's feeding instructions", () => {
    setStays([
      {
        id: 1,
        pet_id: 55,
        pet_name: "Rex",
        owner_name: "Sam",
        status: "booked",
        start_date: "2026-08-01",
        end_date: "2026-08-03",
        feeding_instructions: "Two cups",
      },
    ]);
    render(<ProviderDaycare providerId={3} />);
    expect(screen.getByText("Rex")).toBeInTheDocument();
    expect(screen.getByText("Booked")).toBeInTheDocument();
    expect(screen.getByText(/Two cups/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Check in/i })).toBeInTheDocument();
  });

  it("a checked-in stay offers Check out", () => {
    setStays([
      {
        id: 1,
        pet_id: 55,
        pet_name: "Rex",
        status: "checked_in",
        start_date: "2026-08-01",
        end_date: "2026-08-01",
      },
    ]);
    render(<ProviderDaycare providerId={3} />);
    expect(screen.getByRole("button", { name: /Check out/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Check in$/i })).not.toBeInTheDocument();
  });

  it("Check in calls the action mutation with check_in", () => {
    const action = mutationStub();
    useDaycareStayAction.mockReturnValue(action);
    setStays([
      {
        id: 7,
        pet_id: 55,
        pet_name: "Rex",
        status: "booked",
        start_date: "2026-08-01",
        end_date: "2026-08-01",
      },
    ]);
    render(<ProviderDaycare providerId={3} />);
    fireEvent.click(screen.getByRole("button", { name: /Check in/i }));
    expect(action.mutateAsync).toHaveBeenCalledWith({ stayId: 7, action: "check_in" });
  });

  it("the consent-gated vaccine check is NOT auto-fetched; the button triggers refetch", () => {
    setStays([
      {
        id: 1,
        pet_id: 55,
        pet_name: "Rex",
        status: "booked",
        start_date: "2026-08-01",
        end_date: "2026-08-01",
      },
    ]);
    render(<ProviderDaycare providerId={3} />);
    // usePetVaccineCheck was created with enabled:false (no fetch yet).
    expect(refetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Check vaccines/i }));
    expect(refetch).toHaveBeenCalled();
  });

  it("shows the empty state when there are no stays", () => {
    setStays([]);
    render(<ProviderDaycare providerId={3} />);
    expect(screen.getByText("No stays yet")).toBeInTheDocument();
  });
});
