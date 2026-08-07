import { describe, it, expect, vi } from "vitest";
import {
  moveById,
  discountPct,
  validateCompareAt,
  computeSaveActions,
  applyOptimisticSave,
} from "./storefrontEditor";

describe("moveById", () => {
  it("moves an item to the slot held by another id", () => {
    expect(moveById([1, 2, 3], 3, 1)).toEqual([3, 1, 2]);
    expect(moveById([1, 2, 3], 1, 3)).toEqual([2, 3, 1]);
    expect(moveById(["a", "b", "c"], "b", "c")).toEqual(["a", "c", "b"]);
  });
  it("is a no-op for missing/equal ids (returns a copy)", () => {
    const arr = [1, 2, 3];
    expect(moveById(arr, 2, 2)).toEqual([1, 2, 3]);
    expect(moveById(arr, 9, 1)).toEqual([1, 2, 3]);
    expect(moveById(arr, 1, null)).toEqual([1, 2, 3]);
    expect(moveById(arr, 1, 2)).not.toBe(arr); // new array
  });
});

describe("discountPct", () => {
  it("computes rounded percent off (compare_at is the higher was-price)", () => {
    expect(discountPct(80000, 100000)).toBe(20);
    expect(discountPct(6667, 10000)).toBe(33);
  });
  it("null when there is no valid discount", () => {
    expect(discountPct(100000, null)).toBeNull();
    expect(discountPct(100000, 100000)).toBeNull();
    expect(discountPct(100000, 90000)).toBeNull();
  });
});

describe("validateCompareAt", () => {
  it("accepts null (cleared) and a value strictly greater than price", () => {
    expect(validateCompareAt(null, 5000)).toBeNull();
    expect(validateCompareAt(6000, 5000)).toBeNull();
  });
  it("rejects a value <= the current price (the ticket's 'sale >= price' case)", () => {
    expect(validateCompareAt(5000, 5000)).toBeTruthy();
    expect(validateCompareAt(4000, 5000)).toBeTruthy();
    expect(validateCompareAt(0, 5000)).toBeTruthy();
  });
});

describe("computeSaveActions", () => {
  const baseline = {
    sections: ["items", "posts", "about"],
    products: [
      { id: 1, is_featured: false, compare_at_cents: null },
      { id: 2, is_featured: true, compare_at_cents: 10000 },
    ],
    services: [{ id: 7, is_featured: false }],
  };

  it("no changes → hasChanges false and no actions", () => {
    const actions = computeSaveActions(baseline, structuredClone(baseline));
    expect(actions.hasChanges).toBe(false);
    expect(actions.sectionOrder).toBeUndefined();
    expect(actions.productOrder).toBeUndefined();
    expect(actions.serviceOrder).toBeUndefined();
    expect(actions.productPatches).toEqual([]);
    expect(actions.servicePatches).toEqual([]);
  });

  it("detects a section reorder", () => {
    const pending = { ...structuredClone(baseline), sections: ["posts", "items", "about"] };
    const actions = computeSaveActions(baseline, pending);
    expect(actions.sectionOrder).toEqual(["posts", "items", "about"]);
    expect(actions.hasChanges).toBe(true);
  });

  it("detects a product reorder (ids only)", () => {
    const pending = structuredClone(baseline);
    pending.products = [pending.products[1], pending.products[0]];
    const actions = computeSaveActions(baseline, pending);
    expect(actions.productOrder).toEqual([2, 1]);
  });

  it("emits only the changed item fields per product", () => {
    const pending = structuredClone(baseline);
    pending.products[0].is_featured = true; // promote product 1
    pending.products[1].compare_at_cents = 12000; // change product 2's was-price
    const actions = computeSaveActions(baseline, pending);
    expect(actions.productPatches).toEqual([
      { productId: 1, is_featured: true },
      { productId: 2, compare_at_cents: 12000 },
    ]);
  });

  it("emits a service featured patch", () => {
    const pending = structuredClone(baseline);
    pending.services[0].is_featured = true;
    const actions = computeSaveActions(baseline, pending);
    expect(actions.servicePatches).toEqual([{ serviceId: 7, is_featured: true }]);
  });
});

describe("applyOptimisticSave", () => {
  function fakeClient(initial = {}) {
    const store = new Map(Object.entries(initial));
    return {
      store,
      getQueryData: (key) => store.get(JSON.stringify(key)),
      setQueryData: (key, val) => store.set(JSON.stringify(key), val),
    };
  }

  it("applies optimistic values and keeps them when all calls succeed", async () => {
    const qc = fakeClient({ '["p"]': "OLD" });
    const call = vi.fn().mockResolvedValue(undefined);
    const res = await applyOptimisticSave({
      queryClient: qc,
      entries: [{ key: ["p"], next: "NEW" }],
      calls: [call],
    });
    expect(res.ok).toBe(true);
    expect(qc.getQueryData(["p"])).toBe("NEW");
    expect(call).toHaveBeenCalledOnce();
  });

  it("rolls back to the snapshot when any call fails", async () => {
    const qc = fakeClient({ '["p"]': "OLD" });
    const ok = vi.fn().mockResolvedValue(undefined);
    const boom = vi.fn().mockRejectedValue(new Error("nope"));
    const res = await applyOptimisticSave({
      queryClient: qc,
      entries: [{ key: ["p"], next: "NEW" }],
      calls: [ok, boom],
    });
    expect(res.ok).toBe(false);
    expect(res.error.message).toBe("nope");
    expect(qc.getQueryData(["p"])).toBe("OLD"); // rolled back
  });
});
