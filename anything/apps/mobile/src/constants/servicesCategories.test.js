// Taxonomy split (ticket D1) — Stores & Vets vs Care, and the allowed-set deep-link fallback.
import {
  SERVICE_CATEGORIES,
  STORES_VETS_CATEGORIES,
  CARE_CATEGORIES,
  CARE_CATEGORY_KEYS,
  resolveInitialCategory,
} from "./servicesCategories";

const keys = (arr) => arr.map((c) => c.key);

test("CARE_CATEGORIES are exactly the four care keys", () => {
  expect(keys(CARE_CATEGORIES).sort()).toEqual(
    ["daycare", "sitting", "training", "walking"].sort(),
  );
});

test("STORES_VETS_CATEGORIES contain no care keys", () => {
  for (const k of keys(STORES_VETS_CATEGORIES)) {
    expect(CARE_CATEGORY_KEYS.has(k)).toBe(false);
  }
  expect(keys(STORES_VETS_CATEGORIES)).toEqual(
    expect.arrayContaining(["vet", "shop", "adoption", "transport", "insurance"]),
  );
});

test("SERVICE_CATEGORIES is the union of both groups (no keys lost)", () => {
  expect(keys(SERVICE_CATEGORIES).sort()).toEqual(
    [...keys(STORES_VETS_CATEGORIES), ...keys(CARE_CATEGORIES)].sort(),
  );
});

test("resolveInitialCategory with an allowed set drops out-of-hub keys to 'all'", () => {
  const storesVetsKeys = new Set(keys(STORES_VETS_CATEGORIES));
  // A care deep-link (alias walker→walking) is not in Stores & Vets → falls back to All.
  expect(resolveInitialCategory("walker", storesVetsKeys)).toBe("all");
  expect(resolveInitialCategory("walking", storesVetsKeys)).toBe("all");
  // An in-hub key resolves normally.
  expect(resolveInitialCategory("vet", storesVetsKeys)).toBe("vet");
  // With no allowed set (back-compat), a care key still resolves.
  expect(resolveInitialCategory("walker")).toBe("walking");
});
