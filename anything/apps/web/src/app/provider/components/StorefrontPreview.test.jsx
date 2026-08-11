import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";

// The six data hooks are mocked so this isolates the read-only preview render: the shell
// (header → tab bar → panels), the 2a featured/discount badges, the storefront_section_order
// override, and the owner-only "Hidden" chip on inactive items. No react-query / DB.
vi.mock("../hooks/useProviders", () => ({
  useProvider: vi.fn(),
  useProviderServices: vi.fn(),
  useShopProducts: vi.fn(),
  useProviderPosts: vi.fn(),
  useProviderLocations: vi.fn(),
  useProviderReviews: vi.fn(),
}));
// The editor is its own component (2c-ii) with its own hooks/tests — stub it so this suite
// stays focused on the read-only preview + the edit toggle wiring.
vi.mock("./StorefrontEditor", () => ({
  default: () => <div data-testid="storefront-editor-stub" />,
}));

import {
  useProvider,
  useProviderServices,
  useShopProducts,
  useProviderPosts,
  useProviderLocations,
  useProviderReviews,
} from "../hooks/useProviders";
import StorefrontPreview from "./StorefrontPreview";

function setup({ provider, capabilities = [], services = [], products = [], posts = [], locations = [], reviews = [] }) {
  useProvider.mockReturnValue({ data: { provider, capabilities }, isLoading: false });
  useProviderServices.mockReturnValue({ data: services });
  useShopProducts.mockReturnValue({ data: products });
  useProviderPosts.mockReturnValue({ data: posts });
  useProviderLocations.mockReturnValue({ data: locations });
  useProviderReviews.mockReturnValue({ data: reviews });
  return render(<StorefrontPreview providerId={100} />);
}

const PUBLISHED = { id: 100, name: "Happy Paws", provider_type: "vet", status: "published" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("StorefrontPreview", () => {
  it("shop-first provider: renders the store header + an Items grid with featured and discount badges", () => {
    setup({
      provider: { ...PUBLISHED, name: "Pet Bodega", status: "published" },
      capabilities: ["shop"],
      products: [
        { id: 1, name: "Kibble", price_cents: 80000, compare_at_cents: 100000, currency: "ARS", stock_qty: 5, image_urls: [], is_featured: true, active: true },
        { id: 2, name: "Chew Toy", price_cents: 150000, currency: "ARS", stock_qty: 3, image_urls: [], active: true },
      ],
      posts: [{ id: 9, body: "Hello", image_urls: [] }],
    });

    // Header
    expect(screen.getByText("Pet Bodega")).toBeTruthy();
    // Items tab is the default (shop-first archetype); no Services tab.
    expect(screen.getByRole("button", { name: "Products" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Services" })).toBeNull();
    // Featured + discount badges on the featured/discounted product.
    expect(screen.getByText("Featured")).toBeTruthy();
    expect(screen.getByText("-20%")).toBeTruthy();
    // Struck-through "was" price.
    expect(screen.getByText("$1.000")).toBeTruthy();
  });

  it("bookable provider: renders a Services panel with a Featured badge on a featured service", () => {
    setup({
      provider: PUBLISHED,
      capabilities: ["vet"],
      services: [
        { id: 1, name: "Checkup", price_cents: 5000, active: true, is_featured: true, sort_order: 0, created_at: "2024-01-01" },
        { id: 2, name: "Vaccine", price_cents: 3000, active: true, is_featured: false, sort_order: 0, created_at: "2024-02-01" },
      ],
      locations: [{ id: 5, name: "Main" }],
    });

    // Services is the default tab for a bookable provider.
    expect(screen.getByRole("button", { name: "Services" })).toBeTruthy();
    expect(screen.getByText("Checkup")).toBeTruthy();
    expect(screen.getByText("Featured")).toBeTruthy();
  });

  it("honors storefront_section_order (override reorders the tab bar)", () => {
    setup({
      provider: { ...PUBLISHED, storefront_section_order: ["about", "services"] },
      capabilities: ["vet"],
      services: [{ id: 1, name: "Checkup", price_cents: 5000, active: true }],
      posts: [{ id: 2, body: "hi", image_urls: [] }],
      locations: [{ id: 3, name: "Main" }],
    });

    const tabs = screen
      .getAllByRole("button")
      .map((b) => b.textContent.trim())
      .filter((t) => ["Services", "Posts", "Reviews", "Locations", "About"].includes(t));
    // Override puts About + Services first; the rest append in default order.
    expect(tabs.slice(0, 2)).toEqual(["About", "Services"]);
  });

  it("marks an inactive product with a Hidden chip (owner sees what the live store hides)", () => {
    setup({
      provider: PUBLISHED,
      capabilities: ["shop"],
      products: [
        { id: 1, name: "Retired Item", price_cents: 5000, currency: "ARS", stock_qty: 0, image_urls: [], active: false },
      ],
    });
    expect(screen.getByText("Hidden")).toBeTruthy();
  });

  it("shows a draft banner for an unpublished provider", () => {
    setup({ provider: { ...PUBLISHED, status: "draft" }, capabilities: ["vet"], services: [{ id: 1, name: "X", price_cents: 100, active: true }] });
    expect(screen.getByText(/Draft preview/i)).toBeTruthy();
  });

  it("has an 'Edit storefront' toggle that swaps the read-only view for the editor", () => {
    setup({ provider: PUBLISHED, capabilities: ["vet"], services: [{ id: 1, name: "Checkup", price_cents: 5000, active: true }] });
    // Read-only view first (no editor).
    expect(screen.queryByTestId("storefront-editor-stub")).toBeNull();
    fireEvent.click(screen.getByTestId("storefront-edit-toggle"));
    // Now the editor is shown in place of the read-only shell.
    expect(screen.getByTestId("storefront-editor-stub")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Services" })).toBeNull();
  });

  it("does not render a discount badge when compare_at_cents is absent", () => {
    setup({
      provider: PUBLISHED,
      capabilities: ["shop"],
      products: [{ id: 2, name: "Chew Toy", price_cents: 150000, currency: "ARS", stock_qty: 3, image_urls: [], active: true }],
    });
    expect(screen.queryByText(/-\d+%/)).toBeNull();
  });
});
