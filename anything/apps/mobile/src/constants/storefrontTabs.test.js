// Unit tests for the presence-aware storefront tab resolver (redesign Phase 1, PR-1).
import { getStorefrontTabs } from "./storefrontTabs";

const keys = (args) => getStorefrontTabs(args).map((t) => t.key);

describe("getStorefrontTabs", () => {
  test("empty profile → Reviews + About only (both always present)", () => {
    expect(keys({})).toEqual(["reviews", "about"]);
  });

  test("Instagram / social shop (products, IG link, no services/locations) → Items, Posts, Reviews, About", () => {
    expect(
      keys({
        capabilities: ["shop"],
        products: [{ id: 1 }],
        posts: [{ id: 2 }],
        services: [],
        locations: [],
      }),
    ).toEqual(["items", "posts", "reviews", "about"]);
  });

  test("products with no capability still read as a shop", () => {
    expect(keys({ products: [{ id: 1 }] })).toEqual([
      "items",
      "reviews",
      "about",
    ]);
  });

  test("bookable vet (services, posts, locations) → Services, Posts, Reviews, Locations, About", () => {
    expect(
      keys({
        capabilities: ["vet"],
        services: [{ id: 1 }],
        posts: [{ id: 2 }],
        locations: [{ id: 3 }],
      }),
    ).toEqual(["services", "posts", "reviews", "locations", "about"]);
  });

  test("mixed (shop + bookable) → Services, Items, Posts, Reviews, Locations, About", () => {
    expect(
      keys({
        capabilities: ["vet", "shop"],
        services: [{ id: 1 }],
        products: [{ id: 2 }],
        posts: [{ id: 3 }],
        locations: [{ id: 4 }],
      }),
    ).toEqual(["services", "items", "posts", "reviews", "locations", "about"]);
  });

  test("fallback (no known capability) with services → Services, Reviews, About", () => {
    expect(keys({ capabilities: [], services: [{ id: 1 }] })).toEqual([
      "services",
      "reviews",
      "about",
    ]);
  });

  test("a tab is dropped when its data is absent (no products → no Items)", () => {
    expect(keys({ capabilities: ["vet"], services: [{ id: 1 }] })).not.toContain(
      "items",
    );
  });

  test("shop archetype has no dedicated Locations tab (folded into About)", () => {
    const k = keys({ capabilities: ["shop"], products: [{ id: 1 }], locations: [{ id: 9 }] });
    expect(k).toContain("about");
    expect(k).not.toContain("locations");
  });

  test("posts still surface for a capability-less provider (fallback keeps Posts when present)", () => {
    expect(keys({ capabilities: [], posts: [{ id: 1 }] })).toEqual([
      "posts",
      "reviews",
      "about",
    ]);
  });

  test("each tab carries a storefront.tabs.* label key", () => {
    for (const tab of getStorefrontTabs({ capabilities: ["vet"], services: [{ id: 1 }] })) {
      expect(tab.labelKey).toBe(`storefront.tabs.${tab.key}`);
      expect(tab.panel).toBe(tab.key);
    }
  });

  describe("sectionOrder override (Phase 2a)", () => {
    const mixed = {
      capabilities: ["vet", "shop"],
      services: [{ id: 1 }],
      products: [{ id: 2 }],
      posts: [{ id: 3 }],
      locations: [{ id: 4 }],
    };
    // Default (no override) for the mixed archetype, for reference.
    const mixedDefault = ["services", "items", "posts", "reviews", "locations", "about"];

    test("NULL / absent sectionOrder leaves today's archetype order unchanged", () => {
      expect(keys(mixed)).toEqual(mixedDefault);
      expect(keys({ ...mixed, sectionOrder: null })).toEqual(mixedDefault);
    });

    test("an empty override array is ignored (falls back to the default order)", () => {
      expect(keys({ ...mixed, sectionOrder: [] })).toEqual(mixedDefault);
    });

    test("a full valid override is honored in the given order", () => {
      expect(
        keys({ ...mixed, sectionOrder: ["items", "services", "about", "reviews", "posts", "locations"] }),
      ).toEqual(["items", "services", "about", "reviews", "posts", "locations"]);
    });

    test("unknown / not-present keys in the override are dropped", () => {
      // "clearance" is not a real section; "locations" IS present here so it survives.
      expect(
        keys({ ...mixed, sectionOrder: ["clearance", "items", "services"] }),
      ).toEqual(["items", "services", "posts", "reviews", "locations", "about"]);
    });

    test("allowed-but-omitted sections are appended in the default order", () => {
      // Override only names items + services; the rest append in default order.
      expect(keys({ ...mixed, sectionOrder: ["items", "services"] })).toEqual([
        "items",
        "services",
        "posts",
        "reviews",
        "locations",
        "about",
      ]);
    });

    test("a section absent from data is never introduced by the override", () => {
      // Bookable vet with no products: "items" in the override must NOT appear.
      const bookable = { capabilities: ["vet"], services: [{ id: 1 }], posts: [{ id: 2 }], locations: [{ id: 3 }] };
      const k = keys({ ...bookable, sectionOrder: ["items", "reviews", "services"] });
      expect(k).not.toContain("items");
      expect(k[0]).toBe("reviews");
      expect(k[1]).toBe("services");
    });

    test("duplicate keys in the override are de-duplicated", () => {
      expect(
        keys({ ...mixed, sectionOrder: ["items", "items", "services"] }),
      ).toEqual(["items", "services", "posts", "reviews", "locations", "about"]);
    });
  });
});
