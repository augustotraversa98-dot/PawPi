import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// The data + mutation hooks and the query client are mocked so this isolates the editor: the
// per-provider-type controls, Save enable/disable + payload assembly, and the failure toast.
// Real pointer drags aren't simulated in jsdom (dnd-kit needs a layout) — the reorder math is
// covered directly in lib/storefrontEditor.test.js; here we drive the toggle/input handlers.
vi.mock("../hooks/useProviders", () => ({
  useProvider: vi.fn(),
  useProviderServices: vi.fn(),
  useShopProducts: vi.fn(),
  useProviderPosts: vi.fn(),
  useProviderLocations: vi.fn(),
  useSetStorefrontLayout: vi.fn(),
  useReorderShopProducts: vi.fn(),
  useReorderServices: vi.fn(),
  useUpdateShopProduct: vi.fn(),
  useUpdateService: vi.fn(),
  providerKey: (id) => ["provider", String(id)],
  shopProductsKey: (id) => ["provider", id, "shop-products"],
  servicesKey: (id) => ["provider-services", String(id)],
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    getQueryData: () => undefined,
    setQueryData: () => {},
    invalidateQueries: () => {},
  }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import {
  useProvider,
  useProviderServices,
  useShopProducts,
  useProviderPosts,
  useProviderLocations,
  useSetStorefrontLayout,
  useReorderShopProducts,
  useReorderServices,
  useUpdateShopProduct,
  useUpdateService,
} from "../hooks/useProviders";
import { toast } from "sonner";
import StorefrontEditor from "./StorefrontEditor";

const mut = () => ({ mutateAsync: vi.fn().mockResolvedValue(undefined) });
let setLayout, reorderProducts, reorderServices, updateProduct, updateService;

function setup({ provider, capabilities = [], services = [], products = [], posts = [], locations = [] }) {
  useProvider.mockReturnValue({ data: { provider, capabilities }, isLoading: false });
  useProviderServices.mockReturnValue({ data: services });
  useShopProducts.mockReturnValue({ data: products });
  useProviderPosts.mockReturnValue({ data: posts });
  useProviderLocations.mockReturnValue({ data: locations });
  return render(<StorefrontEditor providerId={100} onDone={vi.fn()} />);
}

const PUBLISHED = { id: 100, name: "Store", status: "published" };

beforeEach(() => {
  vi.clearAllMocks();
  setLayout = mut();
  reorderProducts = mut();
  reorderServices = mut();
  updateProduct = mut();
  updateService = mut();
  useSetStorefrontLayout.mockReturnValue(setLayout);
  useReorderShopProducts.mockReturnValue(reorderProducts);
  useReorderServices.mockReturnValue(reorderServices);
  useUpdateShopProduct.mockReturnValue(updateProduct);
  useUpdateService.mockReturnValue(updateService);
});

describe("StorefrontEditor", () => {
  it("shop provider: shows product rows with drag handles, promote toggles, and sale inputs", () => {
    setup({
      provider: PUBLISHED,
      capabilities: ["shop"],
      products: [
        { id: 1, name: "Kibble", price_cents: 5000, currency: "ARS", image_urls: [], is_featured: false, compare_at_cents: null },
        { id: 2, name: "Toy", price_cents: 3000, currency: "ARS", image_urls: [], is_featured: false, compare_at_cents: null },
      ],
    });
    expect(screen.getByTestId("product-grip-1")).toBeTruthy();
    expect(screen.getByTestId("product-feature-1")).toBeTruthy();
    expect(screen.getByTestId("product-sale-1")).toBeTruthy();
    // Save is disabled with no pending changes.
    expect(screen.getByTestId("storefront-save").disabled).toBe(true);
    // Shop-capable → the shop-products query IS enabled.
    expect(useShopProducts).toHaveBeenCalledWith(100, { enabled: true });
  });

  it("bookable provider: shows service rows with promote toggles (no product controls)", () => {
    setup({
      provider: PUBLISHED,
      capabilities: ["vet"],
      services: [{ id: 7, name: "Checkup", price_cents: 5000, is_featured: false, sort_order: 0, created_at: "2024-01-01" }],
    });
    expect(screen.getByTestId("service-feature-7")).toBeTruthy();
    expect(screen.queryByTestId("product-feature-7")).toBeNull();
    // Non-shop provider → the shop-products query is DISABLED (no 403 poll).
    expect(useShopProducts).toHaveBeenCalledWith(100, { enabled: false });
  });

  it("promoting a product enables Save and fires ONLY the product PATCH with the right payload", async () => {
    setup({
      provider: PUBLISHED,
      capabilities: ["shop"],
      products: [{ id: 1, name: "Kibble", price_cents: 5000, currency: "ARS", image_urls: [], is_featured: false, compare_at_cents: null }],
    });
    fireEvent.click(screen.getByTestId("product-feature-1"));
    const save = screen.getByTestId("storefront-save");
    expect(save.disabled).toBe(false);

    fireEvent.click(save);
    await waitFor(() => expect(updateProduct.mutateAsync).toHaveBeenCalledWith({ productId: 1, is_featured: true }));
    expect(reorderProducts.mutateAsync).not.toHaveBeenCalled();
    expect(setLayout.mutateAsync).not.toHaveBeenCalled();
    expect(reorderServices.mutateAsync).not.toHaveBeenCalled();
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
  });

  it("promoting a service fires ONLY the service PATCH", async () => {
    setup({
      provider: PUBLISHED,
      capabilities: ["vet"],
      services: [{ id: 7, name: "Checkup", price_cents: 5000, is_featured: false, sort_order: 0, created_at: "2024-01-01" }],
    });
    fireEvent.click(screen.getByTestId("service-feature-7"));
    fireEvent.click(screen.getByTestId("storefront-save"));
    await waitFor(() => expect(updateService.mutateAsync).toHaveBeenCalledWith({ serviceId: 7, is_featured: true }));
    expect(updateProduct.mutateAsync).not.toHaveBeenCalled();
  });

  it("sale-price validation: a compare-at <= price shows an error and blocks Save", () => {
    setup({
      provider: PUBLISHED,
      capabilities: ["shop"],
      products: [{ id: 1, name: "Kibble", price_cents: 5000, currency: "ARS", image_urls: [], is_featured: false, compare_at_cents: null }],
    });
    // $40 compare-at is not > the $50 price → invalid.
    fireEvent.change(screen.getByTestId("product-sale-1"), { target: { value: "40" } });
    expect(screen.getByTestId("product-sale-error-1")).toBeTruthy();
    expect(screen.getByTestId("storefront-save").disabled).toBe(true);
  });

  it("a valid compare-at enables Save and fires the product PATCH with compare_at_cents", async () => {
    setup({
      provider: PUBLISHED,
      capabilities: ["shop"],
      products: [{ id: 1, name: "Kibble", price_cents: 5000, currency: "ARS", image_urls: [], is_featured: false, compare_at_cents: null }],
    });
    fireEvent.change(screen.getByTestId("product-sale-1"), { target: { value: "60" } }); // $60 > $50
    expect(screen.queryByTestId("product-sale-error-1")).toBeNull();
    const save = screen.getByTestId("storefront-save");
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    await waitFor(() => expect(updateProduct.mutateAsync).toHaveBeenCalledWith({ productId: 1, compare_at_cents: 6000 }));
  });

  it("shows an error toast when a save call fails (rollback path)", async () => {
    setup({
      provider: PUBLISHED,
      capabilities: ["shop"],
      products: [{ id: 1, name: "Kibble", price_cents: 5000, currency: "ARS", image_urls: [], is_featured: false, compare_at_cents: null }],
    });
    updateProduct.mutateAsync.mockRejectedValueOnce(new Error("boom"));
    fireEvent.click(screen.getByTestId("product-feature-1"));
    fireEvent.click(screen.getByTestId("storefront-save"));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(toast.success).not.toHaveBeenCalled();
  });
});
