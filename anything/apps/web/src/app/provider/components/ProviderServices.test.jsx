import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";

// The data + mutation hooks are mocked so this test isolates rendering, the
// active/inactive distinction, the add/edit form, and the deactivate/reactivate
// gating (no DB / react-query).
vi.mock("../hooks/useProviders", () => ({
  useProviderServices: vi.fn(),
  useCreateService: vi.fn(),
  useUpdateService: vi.fn(),
  useDeactivateService: vi.fn(),
  // Walk packages section (ticket B2) is walker-only; default to a non-walker so this suite stays
  // focused on services. ProviderWalkPackages (its own test) never renders here.
  useProviderCapabilities: vi.fn(() => ({ data: [] })),
}));
// The walk-packages sibling section has its own component + test; stub it so this suite is isolated.
vi.mock("./ProviderWalkPackages", () => ({ default: () => null }));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
// The document-import panel (ticket 2.82) is its own component with its own hooks; stub it here so
// this suite stays focused on the services list/form (DocumentCatalogImport has its own test).
vi.mock("./DocumentCatalogImport", () => ({ default: () => null }));

import {
  useProviderServices,
  useCreateService,
  useUpdateService,
  useDeactivateService,
} from "../hooks/useProviders";
import ProviderServices from "./ProviderServices";

const ACTIVE = {
  id: 1,
  name: "Annual checkup",
  description: "Full physical exam",
  duration_min: 30,
  price_cents: 5000,
  deposit_cents: 1000,
  payment_policy: "deposit",
  active: true,
};
const INACTIVE = {
  id: 2,
  name: "Old grooming",
  description: null,
  duration_min: null,
  price_cents: null,
  deposit_cents: null,
  active: false,
};

let createMutate, updateMutate, deactivateMutate;

function setServices(data, extra = {}) {
  useProviderServices.mockReturnValue({
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
  deactivateMutate = vi.fn();
  useCreateService.mockReturnValue({ mutate: createMutate, isPending: false });
  useUpdateService.mockReturnValue({
    mutate: updateMutate,
    isPending: false,
    variables: undefined,
  });
  useDeactivateService.mockReturnValue({
    mutate: deactivateMutate,
    isPending: false,
    variables: undefined,
  });
  setServices([ACTIVE, INACTIVE]);
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

describe("ProviderServices", () => {
  it("renders both active and inactive services with their money + status", () => {
    render(<ProviderServices providerId={3} />);
    expect(screen.getByText("Annual checkup")).toBeInTheDocument();
    expect(screen.getByText("Old grooming")).toBeInTheDocument();
    // price_cents 5000 → $50.00; null → em-dash
    expect(screen.getByText("$50.00")).toBeInTheDocument();
    expect(screen.getByText("$10.00")).toBeInTheDocument();
    expect(screen.getByText("30 min")).toBeInTheDocument();
    // status badges distinguish active vs inactive
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Inactive")).toBeInTheDocument();
  });

  it("shows the empty state when there are no services", () => {
    setServices([]);
    render(<ProviderServices providerId={3} />);
    expect(screen.getByText("No services yet")).toBeInTheDocument();
  });

  it("Add opens the form and POSTs the entered fields (money → cents)", async () => {
    render(<ProviderServices providerId={3} />);
    fireEvent.click(screen.getByRole("button", { name: /add service/i }));

    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByPlaceholderText("Annual checkup"), {
      target: { value: "Teeth cleaning" },
    });
    fireEvent.change(within(dialog).getByPlaceholderText("30"), {
      target: { value: "45" },
    });
    fireEvent.change(within(dialog).getByPlaceholderText("50.00"), {
      target: { value: "75.50" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /add service/i }));

    await waitFor(() => expect(createMutate).toHaveBeenCalledTimes(1));
    expect(createMutate.mock.calls[0][0]).toEqual({
      name: "Teeth cleaning",
      description: "",
      duration_min: 45,
      price_cents: 7550,
      deposit_cents: null,
      payment_policy: "none",
      nightly_rate_cents: null,
      image_urls: [],
    });
  });

  it("sends the chosen payment_policy when creating a service", async () => {
    render(<ProviderServices providerId={3} />);
    fireEvent.click(screen.getByRole("button", { name: /add service/i }));

    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByPlaceholderText("Annual checkup"), {
      target: { value: "Grooming" },
    });
    fireEvent.change(within(dialog).getByPlaceholderText("50.00"), {
      target: { value: "40.00" },
    });
    // Choose "Full price up front"
    fireEvent.change(within(dialog).getByDisplayValue(/no online payment/i), {
      target: { value: "full" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /add service/i }));

    await waitFor(() => expect(createMutate).toHaveBeenCalledTimes(1));
    expect(createMutate.mock.calls[0][0].payment_policy).toBe("full");
  });

  it("seeds the existing payment_policy when editing a service", () => {
    render(<ProviderServices providerId={3} />);
    // Open the edit form for the first service (seeded with payment_policy).
    fireEvent.click(screen.getAllByRole("button", { name: /edit/i })[0]);
    const dialog = screen.getByRole("dialog");
    // payment_policy now lives behind the Advanced section — expand it first.
    fireEvent.click(within(dialog).getByRole("button", { name: "Advanced" }));
    const select = within(dialog).getByRole("combobox");
    expect(select.value).toBe("deposit");
  });

  it("blocks a non-numeric price before any POST and shows an error", async () => {
    render(<ProviderServices providerId={3} />);
    fireEvent.click(screen.getByRole("button", { name: /add service/i }));

    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByPlaceholderText("Annual checkup"), {
      target: { value: "Bad price" },
    });
    fireEvent.change(within(dialog).getByPlaceholderText("50.00"), {
      target: { value: "abc" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /add service/i }));

    expect(
      await within(dialog).findByText(/enter a valid amount/i),
    ).toBeInTheDocument();
    expect(createMutate).not.toHaveBeenCalled();
  });

  it("keeps deposit/payment/nightly/photos/description behind Advanced; expanding reveals them and their values still submit", async () => {
    render(<ProviderServices providerId={3} />);
    fireEvent.click(screen.getByRole("button", { name: /add service/i }));
    const dialog = screen.getByRole("dialog");

    // Essentials are visible.
    expect(within(dialog).getByPlaceholderText("Annual checkup")).toBeVisible();
    expect(within(dialog).getByPlaceholderText("30")).toBeVisible(); // duration
    expect(within(dialog).getByPlaceholderText("50.00")).toBeVisible(); // price
    // Duration is a PRIMARY field with slot-length helper text (drives booking slot length).
    expect(within(dialog).getByText(/sets the slot length/i)).toBeVisible();

    // An advanced field (deposit) is present but hidden until the section expands.
    const deposit = within(dialog).getByPlaceholderText("0.00");
    expect(deposit).not.toBeVisible();

    fireEvent.click(within(dialog).getByRole("button", { name: "Advanced" }));
    expect(deposit).toBeVisible();

    // A value set in the advanced section still submits.
    fireEvent.change(within(dialog).getByPlaceholderText("Annual checkup"), {
      target: { value: "Bath" },
    });
    fireEvent.change(deposit, { target: { value: "5.00" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /add service/i }));

    await waitFor(() => expect(createMutate).toHaveBeenCalledTimes(1));
    expect(createMutate.mock.calls[0][0].deposit_cents).toBe(500);
  });

  it("Deactivate confirms then DELETEs (soft delete) the active service", () => {
    render(<ProviderServices providerId={3} />);
    fireEvent.click(screen.getByRole("button", { name: /deactivate/i }));
    expect(window.confirm).toHaveBeenCalled();
    expect(deactivateMutate).toHaveBeenCalledWith(ACTIVE.id, expect.anything());
  });

  it("Reactivate PATCHes { active: true } for the inactive service", () => {
    render(<ProviderServices providerId={3} />);
    fireEvent.click(screen.getByRole("button", { name: /reactivate/i }));
    expect(updateMutate).toHaveBeenCalledWith(
      { serviceId: INACTIVE.id, active: true },
      expect.anything(),
    );
  });
});
