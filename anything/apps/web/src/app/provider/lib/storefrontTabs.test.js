import { describe, it, expect } from "vitest";

// Parity tests for the WEB mirror of mobile getStorefrontTabs (Storefront Phase 2b). These
// mirror apps/mobile/src/constants/storefrontTabs.test.js so the two resolvers stay in
// lockstep — the four archetype orders + the sectionOrder override/validation must match.
import { getStorefrontTabs } from "./storefrontTabs";

const keys = (args) => getStorefrontTabs(args).map((t) => t.key);

describe("getStorefrontTabs (web mirror) — archetype parity", () => {
  it("empty profile → Reviews + About only", () => {
    expect(keys({})).toEqual(["reviews", "about"]);
  });

  it("shop-first (products, no services) → Items, Posts, Reviews, About", () => {
    expect(
      keys({ capabilities: ["shop"], products: [{ id: 1 }], posts: [{ id: 2 }] }),
    ).toEqual(["items", "posts", "reviews", "about"]);
  });

  it("bookable vet → Services, Posts, Reviews, Locations, About", () => {
    expect(
      keys({ capabilities: ["vet"], services: [{ id: 1 }], posts: [{ id: 2 }], locations: [{ id: 3 }] }),
    ).toEqual(["services", "posts", "reviews", "locations", "about"]);
  });

  it("mixed (shop + bookable) → Services, Items, Posts, Reviews, Locations, About", () => {
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

  it("fallback (no known capability) with services → Services, Reviews, About", () => {
    expect(keys({ capabilities: [], services: [{ id: 1 }] })).toEqual([
      "services",
      "reviews",
      "about",
    ]);
  });

  it("drops a tab when its data is absent (no products → no Items)", () => {
    expect(keys({ capabilities: ["vet"], services: [{ id: 1 }] })).not.toContain("items");
  });

  it("each tab carries the mirrored storefront.tabs.* label key", () => {
    for (const tab of getStorefrontTabs({ capabilities: ["vet"], services: [{ id: 1 }] })) {
      expect(tab.labelKey).toBe(`storefront.tabs.${tab.key}`);
      expect(tab.panel).toBe(tab.key);
    }
  });
});

describe("getStorefrontTabs (web mirror) — sectionOrder validation", () => {
  const mixed = {
    capabilities: ["vet", "shop"],
    services: [{ id: 1 }],
    products: [{ id: 2 }],
    posts: [{ id: 3 }],
    locations: [{ id: 4 }],
  };
  const mixedDefault = ["services", "items", "posts", "reviews", "locations", "about"];

  it("NULL / absent / empty override leaves the archetype order unchanged", () => {
    expect(keys(mixed)).toEqual(mixedDefault);
    expect(keys({ ...mixed, sectionOrder: null })).toEqual(mixedDefault);
    expect(keys({ ...mixed, sectionOrder: [] })).toEqual(mixedDefault);
  });

  it("a full valid override is honored in the given order", () => {
    expect(
      keys({ ...mixed, sectionOrder: ["items", "services", "about", "reviews", "posts", "locations"] }),
    ).toEqual(["items", "services", "about", "reviews", "posts", "locations"]);
  });

  it("unknown keys are dropped and omitted allowed sections append in default order", () => {
    expect(keys({ ...mixed, sectionOrder: ["clearance", "items", "services"] })).toEqual([
      "items",
      "services",
      "posts",
      "reviews",
      "locations",
      "about",
    ]);
  });

  it("never introduces a section absent from data, even if the override names it", () => {
    const bookable = { capabilities: ["vet"], services: [{ id: 1 }], posts: [{ id: 2 }], locations: [{ id: 3 }] };
    const k = keys({ ...bookable, sectionOrder: ["items", "reviews", "services"] });
    expect(k).not.toContain("items");
    expect(k.slice(0, 2)).toEqual(["reviews", "services"]);
  });

  it("de-duplicates repeated keys in the override", () => {
    expect(keys({ ...mixed, sectionOrder: ["items", "items", "services"] })).toEqual([
      "items",
      "services",
      "posts",
      "reviews",
      "locations",
      "about",
    ]);
  });
});
