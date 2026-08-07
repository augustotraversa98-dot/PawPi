// Pure helpers for the storefront editor (Storefront Phase 2c-ii). Kept in a leaf module (no
// React) so the drag/reorder logic, the save-payload diff, and the optimistic-save/rollback
// orchestration are unit-testable directly — jsdom can't simulate real pointer drags, so the
// tests drive these functions instead of the Dnd surface.

// Move the item `activeId` to the slot currently held by `overId`. Pure — returns a NEW array.
// A no-op (returns a copy) when an id is missing/equal or not present in the list.
export function moveById(ids, activeId, overId) {
  if (activeId == null || overId == null || activeId === overId) return ids.slice();
  const from = ids.indexOf(activeId);
  const to = ids.indexOf(overId);
  if (from === -1 || to === -1) return ids.slice();
  const next = ids.slice();
  next.splice(to, 0, next.splice(from, 1)[0]);
  return next;
}

// Integer percent off. compare_at_cents is the higher "was" price (0077: compare_at > price),
// price_cents the current selling price. null when there is no valid discount.
export function discountPct(priceCents, compareAtCents) {
  if (!Number.isFinite(priceCents) || !Number.isFinite(compareAtCents)) return null;
  if (compareAtCents <= 0 || compareAtCents <= priceCents) return null;
  return Math.round(((compareAtCents - priceCents) / compareAtCents) * 100);
}

// Validate the compare-at ("was") price against the current price. The 0077 CHECK requires
// compare_at_cents > price_cents, so the discount's struck "was" price must be GREATER than the
// current selling price (the server enforces the same rule with a 422). The ticket names this
// the "sale-price" input; per the schema the stored field is the higher compare-at price, so we
// validate > current price. Returns an error string, or null when valid / cleared.
export function validateCompareAt(compareAtCents, priceCents) {
  if (compareAtCents == null) return null; // cleared → no discount
  if (!Number.isInteger(compareAtCents) || compareAtCents <= 0) {
    return "Enter a valid amount";
  }
  if (compareAtCents <= priceCents) {
    return "Compare-at price must be higher than the current price";
  }
  return null;
}

// Diff pending editor state against the server baseline → the MINIMAL set of save actions, so
// Save fires only the calls it needs. `baseline`/`pending` are
//   { sections: string[], products: [{id,is_featured,compare_at_cents}], services: [{id,is_featured}] }.
export function computeSaveActions(baseline, pending) {
  const actions = { productPatches: [], servicePatches: [] };

  if (JSON.stringify(pending.sections) !== JSON.stringify(baseline.sections)) {
    actions.sectionOrder = pending.sections;
  }

  const prodIds = (list) => list.map((p) => p.id);
  if (JSON.stringify(prodIds(pending.products)) !== JSON.stringify(prodIds(baseline.products))) {
    actions.productOrder = prodIds(pending.products);
  }
  const svcIds = (list) => list.map((s) => s.id);
  if (JSON.stringify(svcIds(pending.services)) !== JSON.stringify(svcIds(baseline.services))) {
    actions.serviceOrder = svcIds(pending.services);
  }

  const baseProd = new Map(baseline.products.map((p) => [p.id, p]));
  for (const p of pending.products) {
    const b = baseProd.get(p.id);
    if (!b) continue;
    const patch = { productId: p.id };
    let changed = false;
    if (!!p.is_featured !== !!b.is_featured) {
      patch.is_featured = !!p.is_featured;
      changed = true;
    }
    if ((p.compare_at_cents ?? null) !== (b.compare_at_cents ?? null)) {
      patch.compare_at_cents = p.compare_at_cents ?? null;
      changed = true;
    }
    if (changed) actions.productPatches.push(patch);
  }

  const baseSvc = new Map(baseline.services.map((s) => [s.id, s]));
  for (const s of pending.services) {
    const b = baseSvc.get(s.id);
    if (!b) continue;
    if (!!s.is_featured !== !!b.is_featured) {
      actions.servicePatches.push({ serviceId: s.id, is_featured: !!s.is_featured });
    }
  }

  actions.hasChanges =
    actions.sectionOrder !== undefined ||
    actions.productOrder !== undefined ||
    actions.serviceOrder !== undefined ||
    actions.productPatches.length > 0 ||
    actions.servicePatches.length > 0;
  return actions;
}

// Optimistically set the given cache entries, run every save call in sequence, and ROLL BACK to
// the captured snapshot if any call throws. `entries` is [{ key, next }] (react-query keys);
// `calls` is an array of thunks returning promises. Returns { ok:true } or { ok:false, error }.
export async function applyOptimisticSave({ queryClient, entries, calls }) {
  const snapshot = entries.map(({ key }) => ({ key, prev: queryClient.getQueryData(key) }));
  for (const { key, next } of entries) queryClient.setQueryData(key, next);
  try {
    for (const call of calls) await call();
    return { ok: true };
  } catch (error) {
    for (const { key, prev } of snapshot) queryClient.setQueryData(key, prev);
    return { ok: false, error };
  }
}
