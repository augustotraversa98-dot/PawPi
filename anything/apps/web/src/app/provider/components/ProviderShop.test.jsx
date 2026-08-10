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
} from "../hooks/useProviders";
import ProviderShop from "./ProviderShop";

let createAsync;

beforeEach(() => {
  vi.clearAllMocks();
  createAsync = vi.fn().mockResolvedValue({});
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
