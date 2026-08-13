import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Walk packages editor (ticket B2). Data/mutation hooks are mocked so this isolates rendering,
// the default-size quick-add suggestions, and the create flow.
vi.mock("../hooks/useProviders", () => ({
  useWalkPackages: vi.fn(),
  useCreateWalkPackage: vi.fn(),
  useUpdateWalkPackage: vi.fn(),
  useDeactivateWalkPackage: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import {
  useWalkPackages,
  useCreateWalkPackage,
  useUpdateWalkPackage,
  useDeactivateWalkPackage,
} from "../hooks/useProviders";
import ProviderWalkPackages from "./ProviderWalkPackages";

let createMutate, updateMutate, deactivateMutate;

function setPackages(data, extra = {}) {
  useWalkPackages.mockReturnValue({ data, isLoading: false, isError: false, error: null, ...extra });
}

beforeEach(() => {
  vi.clearAllMocks();
  createMutate = vi.fn();
  updateMutate = vi.fn();
  deactivateMutate = vi.fn();
  useCreateWalkPackage.mockReturnValue({ mutate: createMutate, isPending: false });
  useUpdateWalkPackage.mockReturnValue({ mutate: updateMutate, isPending: false, variables: undefined });
  useDeactivateWalkPackage.mockReturnValue({ mutate: deactivateMutate, isPending: false, variables: undefined });
});

describe("ProviderWalkPackages", () => {
  it("shows the empty state + all three default quick-add suggestions when there are no packages", () => {
    setPackages([]);
    render(<ProviderWalkPackages providerId={1} />);
    expect(screen.getByText("No packages yet")).toBeTruthy();
    expect(screen.getByText("+ Single walk")).toBeTruthy();
    expect(screen.getByText("+ 10-pack")).toBeTruthy();
    expect(screen.getByText("+ 20-pack")).toBeTruthy();
  });

  it("only suggests default sizes not already offered", () => {
    setPackages([{ id: 1, walks_count: 10, price_cents: 90000, active: true }]);
    render(<ProviderWalkPackages providerId={1} />);
    expect(screen.queryByText("+ 10-pack")).toBeNull(); // already offered
    expect(screen.getByText("+ Single walk")).toBeTruthy();
    expect(screen.getByText("+ 20-pack")).toBeTruthy();
  });

  it("renders a package row with price + per-walk", () => {
    setPackages([{ id: 1, walks_count: 10, price_cents: 90000, active: true }]);
    render(<ProviderWalkPackages providerId={1} />);
    expect(screen.getByText("10 walks")).toBeTruthy();
    expect(screen.getByText("Active")).toBeTruthy();
  });

  it("creates a package from the Add form with integer walks + cents price", async () => {
    setPackages([]);
    render(<ProviderWalkPackages providerId={1} />);
    fireEvent.click(screen.getByText("Add package"));
    fireEvent.change(screen.getByPlaceholderText("10"), { target: { value: "10" } });
    fireEvent.change(screen.getByPlaceholderText("90.00"), { target: { value: "90.00" } });
    fireEvent.click(screen.getByText("Add package", { selector: "button[type=submit]" }));
    await waitFor(() => expect(createMutate).toHaveBeenCalled());
    expect(createMutate.mock.calls[0][0]).toEqual({ walks_count: 10, price_cents: 9000 });
  });

  it("a quick-add chip pre-seeds the walks count", async () => {
    setPackages([]);
    render(<ProviderWalkPackages providerId={1} />);
    fireEvent.click(screen.getByText("+ 20-pack"));
    // The form opens pre-filled with 20 walks.
    expect(screen.getByDisplayValue("20")).toBeTruthy();
  });
});
