import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";

// The data + mutation hooks are mocked so this test isolates rendering the weekday grid, the
// add/edit form, the timezone selector save, and the hard-delete confirm (no DB / react-query).
vi.mock("../hooks/useProviders", () => ({
  useProvider: vi.fn(),
  useUpdateProviderProfile: vi.fn(),
  useAvailabilityWindows: vi.fn(),
  useCreateAvailabilityWindow: vi.fn(),
  useUpdateAvailabilityWindow: vi.fn(),
  useDeleteAvailabilityWindow: vi.fn(),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import {
  useProvider,
  useUpdateProviderProfile,
  useAvailabilityWindows,
  useCreateAvailabilityWindow,
  useUpdateAvailabilityWindow,
  useDeleteAvailabilityWindow,
} from "../hooks/useProviders";
import ProviderAvailability from "./ProviderAvailability";

const MON = {
  id: 11,
  weekday: 0,
  start_time: "09:00:00",
  end_time: "18:00:00",
  slot_minutes: 30,
  active: true,
};

let createMutate, updateMutate, deleteMutate, profileMutate;

function setWindows(payload, extra = {}) {
  useAvailabilityWindows.mockReturnValue({
    data: payload,
    isLoading: false,
    isError: false,
    error: null,
    ...extra,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  createMutate = vi.fn();
  updateMutate = vi.fn();
  deleteMutate = vi.fn();
  profileMutate = vi.fn();
  useProvider.mockReturnValue({
    data: { provider: { id: 3, time_zone: "America/Argentina/Buenos_Aires" } },
  });
  useUpdateProviderProfile.mockReturnValue({ mutate: profileMutate, isPending: false });
  useCreateAvailabilityWindow.mockReturnValue({ mutate: createMutate, isPending: false });
  useUpdateAvailabilityWindow.mockReturnValue({ mutate: updateMutate, isPending: false });
  useDeleteAvailabilityWindow.mockReturnValue({
    mutate: deleteMutate,
    isPending: false,
    variables: undefined,
  });
  setWindows({ windows: [MON], scoped_count: 0 });
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

describe("ProviderAvailability", () => {
  it("renders each weekday, with Monday's window and Tuesday closed", () => {
    render(<ProviderAvailability providerId={3} />);
    expect(screen.getByText("Mon")).toBeInTheDocument();
    expect(screen.getByText("Sun")).toBeInTheDocument();
    expect(screen.getByText(/09:00 – 18:00/)).toBeInTheDocument();
    expect(screen.getByText(/30 min slots/)).toBeInTheDocument();
    // Days with no window show "Closed".
    expect(screen.getAllByText("Closed").length).toBe(6);
  });

  it("saves the time zone via the profile PATCH when changed", () => {
    render(<ProviderAvailability providerId={3} />);
    fireEvent.change(screen.getByLabelText("Time zone"), {
      target: { value: "America/Montevideo" },
    });
    expect(profileMutate).toHaveBeenCalledTimes(1);
    expect(profileMutate.mock.calls[0][0]).toEqual({
      time_zone: "America/Montevideo",
    });
  });

  it("surfaces a note when non-provider-wide windows exist", () => {
    setWindows({ windows: [MON], scoped_count: 2 });
    render(<ProviderAvailability providerId={3} />);
    expect(screen.getByText(/aren't shown here/i)).toBeInTheDocument();
  });

  it("Add creates a provider-wide window for the chosen day", async () => {
    render(<ProviderAvailability providerId={3} />);
    // Click the first "Add hours" (Monday).
    fireEvent.click(screen.getAllByRole("button", { name: /add hours/i })[0]);

    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Start time"), {
      target: { value: "10:00" },
    });
    fireEvent.change(within(dialog).getByLabelText("End time"), {
      target: { value: "16:00" },
    });
    fireEvent.change(within(dialog).getByLabelText("Slot length"), {
      target: { value: "60" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /add hours/i }));

    await waitFor(() => expect(createMutate).toHaveBeenCalledTimes(1));
    expect(createMutate.mock.calls[0][0]).toEqual({
      weekday: 0,
      start_time: "10:00",
      end_time: "16:00",
      slot_minutes: 60,
      active: true,
    });
  });

  it("blocks end<=start before any request", async () => {
    render(<ProviderAvailability providerId={3} />);
    fireEvent.click(screen.getAllByRole("button", { name: /add hours/i })[0]);
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Start time"), {
      target: { value: "16:00" },
    });
    fireEvent.change(within(dialog).getByLabelText("End time"), {
      target: { value: "09:00" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /add hours/i }));

    expect(
      await within(dialog).findByText(/end time must be after start time/i),
    ).toBeInTheDocument();
    expect(createMutate).not.toHaveBeenCalled();
  });

  it("Edit PATCHes the window with its id", async () => {
    render(<ProviderAvailability providerId={3} />);
    fireEvent.click(screen.getByRole("button", { name: /edit/i }));

    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Slot length"), {
      target: { value: "15" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(updateMutate).toHaveBeenCalledTimes(1));
    expect(updateMutate.mock.calls[0][0]).toMatchObject({
      availabilityId: 11,
      slot_minutes: 15,
    });
  });

  it("Delete confirms then DELETEs the window", () => {
    render(<ProviderAvailability providerId={3} />);
    fireEvent.click(screen.getByRole("button", { name: /delete/i }));
    expect(window.confirm).toHaveBeenCalledWith(
      expect.stringMatching(/cannot be undone/i),
    );
    expect(deleteMutate).toHaveBeenCalledWith(MON.id, expect.anything());
  });
});
