import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";

// The data + mutation hooks are mocked so this test isolates rendering, the
// add/edit form (incl. the hours editor round-trip), and the hard-delete confirm
// (no DB / react-query).
vi.mock("../hooks/useProviders", () => ({
  useProviderLocations: vi.fn(),
  useCreateLocation: vi.fn(),
  useUpdateLocation: vi.fn(),
  useDeleteLocation: vi.fn(),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import {
  useProviderLocations,
  useCreateLocation,
  useUpdateLocation,
  useDeleteLocation,
} from "../hooks/useProviders";
import ProviderLocations from "./ProviderLocations";

const MAIN = {
  id: 1,
  name: "Main clinic",
  address: "123 Bark Street",
  phone: "+1 555 0100",
  lat: 40.7128,
  lng: -74.006,
  hours_json: { mon: { open: "09:00", close: "17:00" } },
};

let createMutate, updateMutate, deleteMutate;

function setLocations(data, extra = {}) {
  useProviderLocations.mockReturnValue({
    data,
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
  useCreateLocation.mockReturnValue({ mutate: createMutate, isPending: false });
  useUpdateLocation.mockReturnValue({ mutate: updateMutate, isPending: false });
  useDeleteLocation.mockReturnValue({
    mutate: deleteMutate,
    isPending: false,
    variables: undefined,
  });
  setLocations([MAIN]);
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

describe("ProviderLocations", () => {
  it("renders a card per location with name, address, phone and hours summary", () => {
    render(<ProviderLocations providerId={3} />);
    expect(screen.getByText("Main clinic")).toBeInTheDocument();
    expect(screen.getByText("123 Bark Street")).toBeInTheDocument();
    expect(screen.getByText("+1 555 0100")).toBeInTheDocument();
    expect(screen.getByText("Mon 09:00–17:00")).toBeInTheDocument();
  });

  it("shows the empty state when there are no locations", () => {
    setLocations([]);
    render(<ProviderLocations providerId={3} />);
    expect(screen.getByText("No locations yet")).toBeInTheDocument();
  });

  it("Add posts the entered fields and round-trips the hours editor into hours_json", async () => {
    render(<ProviderLocations providerId={3} />);
    fireEvent.click(screen.getByRole("button", { name: /add location/i }));

    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByPlaceholderText("Main clinic"), {
      target: { value: "Branch" },
    });
    fireEvent.change(within(dialog).getByLabelText("Mon open"), {
      target: { value: "09:00" },
    });
    fireEvent.change(within(dialog).getByLabelText("Mon close"), {
      target: { value: "17:00" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /add location/i }));

    await waitFor(() => expect(createMutate).toHaveBeenCalledTimes(1));
    expect(createMutate.mock.calls[0][0]).toEqual({
      name: "Branch",
      address: "",
      phone: "",
      lat: null,
      lng: null,
      hours_json: { mon: { open: "09:00", close: "17:00" } },
    });
  });

  it("blocks an out-of-range latitude before any POST", async () => {
    render(<ProviderLocations providerId={3} />);
    fireEvent.click(screen.getByRole("button", { name: /add location/i }));

    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByPlaceholderText("40.7128"), {
      target: { value: "999" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /add location/i }));

    expect(
      await within(dialog).findByText(/latitude must be between/i),
    ).toBeInTheDocument();
    expect(createMutate).not.toHaveBeenCalled();
  });

  it("Delete confirms (permanent) then DELETEs the location", () => {
    render(<ProviderLocations providerId={3} />);
    fireEvent.click(screen.getByRole("button", { name: /delete/i }));
    expect(window.confirm).toHaveBeenCalledWith(
      expect.stringMatching(/permanently delete/i),
    );
    expect(deleteMutate).toHaveBeenCalledWith(MAIN.id, expect.anything());
  });
});
