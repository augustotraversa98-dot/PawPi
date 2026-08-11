import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Focused on the product create form's Phase-3 Advanced collapse. The hooks are mocked
// and ImageUploader is stubbed so this isolates the form (no DB / react-query / uploads).
vi.mock("../hooks/useProviders", () => ({
  useShopProducts: vi.fn(),
  useCreateShopProduct: vi.fn(),
  useUpdateShopProduct: vi.fn(),
  useDeleteShopProduct: vi.fn(),
  useShopOrders: vi.fn(),
  useSetOrderFulfillment: vi.fn(),
  useProviderCapabilities: vi.fn(),
  useAddCapability: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("./ImageUploader", () => ({ default: () => null }));

import {
  useShopProducts,
  useCreateShopProduct,
  useUpdateShopProduct,
  useDeleteShopProduct,
  useShopOrders,
  useSetOrderFulfillment,
  useProviderCapabilities,
  useAddCapability,
} from "../hooks/useProviders";
import ProviderShop from "./ProviderShop";

let createAsync;
let addCapMutate;

beforeEach(() => {
  vi.clearAllMocks();
  createAsync = vi.fn().mockResolvedValue({});
  addCapMutate = vi.fn();
  // Default: the business already sells products (has the `shop` offering) → catalog renders.
  useProviderCapabilities.mockReturnValue({ data: ["shop"], isLoading: false });
  useAddCapability.mockReturnValue({ mutate: addCapMutate, isPending: false });
  useShopProducts.mockReturnValue({ data: [], isLoading: false });
  useShopOrders.mockReturnValue({ data: [], isLoading: false });
  useCreateShopProduct.mockReturnValue({ mutateAsync: createAsync, isPending: false });
  useUpdateShopProduct.mockReturnValue({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false });
  useDeleteShopProduct.mockReturnValue({ mutate: vi.fn(), isPending: false });
  useSetOrderFulfillment.mockReturnValue({ mutate: vi.fn(), isPending: false });
});

describe("ProviderShop — product create form", () => {
  it("keeps category/Rx/photos behind Advanced; expanding reveals them and their values still submit", async () => {
    render(<ProviderShop providerId={3} />);

    // Essentials visible.
    expect(screen.getByPlaceholderText("Product name")).toBeVisible();
    expect(screen.getByPlaceholderText("Price (e.g. 49.90)")).toBeVisible();
    expect(screen.getByPlaceholderText("Stock quantity")).toBeVisible();

    // Category (advanced) present but hidden until expanded.
    const category = screen.getByPlaceholderText(/Category/i);
    expect(category).not.toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Advanced" }));
    expect(category).toBeVisible();

    // Fill essentials + an advanced value; it still submits.
    fireEvent.change(screen.getByPlaceholderText("Product name"), {
      target: { value: "Kibble" },
    });
    fireEvent.change(screen.getByPlaceholderText("Price (e.g. 49.90)"), {
      target: { value: "49.90" },
    });
    fireEvent.change(category, { target: { value: "food" } });
    fireEvent.click(screen.getByRole("button", { name: /add product/i }));

    await waitFor(() => expect(createAsync).toHaveBeenCalledTimes(1));
    expect(createAsync.mock.calls[0][0]).toMatchObject({
      name: "Kibble",
      price_cents: 4990,
      category: "food",
    });
  });
});

describe("ProviderShop — Products not enabled (2.90)", () => {
  beforeEach(() => {
    // A business that does NOT sell products yet.
    useProviderCapabilities.mockReturnValue({ data: [], isLoading: false });
  });

  it("shows a friendly enable prompt (no jargon, no product form) instead of a 403 message", () => {
    render(<ProviderShop providerId={3} />);

    // Friendly explainer + the single enable CTA.
    expect(screen.getByText("Sell products to pet owners")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /enable products/i }),
    ).toBeInTheDocument();

    // No internal jargon and no old 403 message.
    expect(screen.queryByText(/capability/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/does not have/i)).not.toBeInTheDocument();
    // The add-product form is NOT shown until Products is enabled.
    expect(screen.queryByPlaceholderText("Product name")).not.toBeInTheDocument();
  });

  it("clicking Enable Products turns on the `shop` offering (same profile toggle)", () => {
    render(<ProviderShop providerId={3} />);
    fireEvent.click(screen.getByRole("button", { name: /enable products/i }));
    expect(addCapMutate).toHaveBeenCalledWith("shop", expect.any(Object));
  });
});

describe("ProviderShop — enabled but empty (2.90)", () => {
  it("shows the add-first-product form + an inviting empty state (not an error)", () => {
    // Sells products, but none added yet.
    useProviderCapabilities.mockReturnValue({ data: ["shop"], isLoading: false });
    useShopProducts.mockReturnValue({ data: [], isLoading: false });
    render(<ProviderShop providerId={3} />);

    // The add-product form is front and centre.
    expect(screen.getByPlaceholderText("Product name")).toBeInTheDocument();
    // Inviting empty state, not an error.
    expect(screen.getByText("No products yet")).toBeInTheDocument();
    expect(screen.queryByText(/couldn't load/i)).not.toBeInTheDocument();
  });
});
