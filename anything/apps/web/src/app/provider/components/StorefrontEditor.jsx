import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  horizontalListSortingStrategy,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Star, Loader2, Package } from "lucide-react";
import { toast } from "sonner";
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
  providerKey,
  shopProductsKey,
  servicesKey,
} from "../hooks/useProviders";
import { getStorefrontTabs } from "../lib/storefrontTabs";
import {
  moveById,
  discountPct,
  validateCompareAt,
  computeSaveActions,
  applyOptimisticSave,
} from "../lib/storefrontEditor";
import { centsToInput, dollarsToCents } from "../lib/money";
import { COLORS } from "../lib/colors";

// /provider/storefront → "View as customer" → "Edit storefront" (Storefront Phase 2c-ii). The
// editable twin of the read-only 2b preview: drag sections + items into order and set
// promote/discount, then Save (optimistic + rollback) via the 2c-i endpoints. Only the
// archetype-allowed sections (from the MIRRORED getStorefrontTabs) are shown/draggable; a shop
// edits PRODUCTS, a bookable provider its SERVICES, a mixed provider both. Hardcoded English
// (extranet has no i18n). The non-edit view is StorefrontPreview — this is a distinct edit UI,
// not a fork of that render.
const MUTED = "#7A6254";
const TAB_LABELS = {
  services: "Services",
  items: "Products",
  posts: "Posts",
  reviews: "Reviews",
  locations: "Locations",
  about: "About",
};

const money = (cents, currency = "ARS") => {
  if (cents == null || Number.isNaN(cents)) return "";
  const code = (currency || "ARS").toUpperCase();
  const whole = Math.trunc(Math.abs(cents) / 100);
  const frac = Math.abs(cents) % 100;
  if (code === "ARS") {
    const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return `$${grouped}${frac === 0 ? "" : `,${String(frac).padStart(2, "0")}`}`;
  }
  return `${code} ${whole}.${String(frac).padStart(2, "0")}`;
};

// Customer-facing service order (matches the public read: featured → sort_order → created_at).
const byMerchandising = (a, b) => {
  if (!!b.is_featured !== !!a.is_featured) return b.is_featured ? 1 : -1;
  const so = (a.sort_order ?? 0) - (b.sort_order ?? 0);
  if (so !== 0) return so;
  return String(a.created_at ?? "").localeCompare(String(b.created_at ?? ""));
};

export default function StorefrontEditor({ providerId, onDone }) {
  const queryClient = useQueryClient();
  const { data: providerData, isLoading } = useProvider(providerId);
  const { data: services = [] } = useProviderServices(providerId);
  // Only a shop-capable provider can read shop-products (the endpoint 403s otherwise), so skip
  // the fetch entirely for non-shop providers — no 403 refetch loop.
  const { data: products = [] } = useShopProducts(providerId, {
    enabled: (providerData?.capabilities ?? []).includes("shop"),
  });
  const { data: posts = [] } = useProviderPosts(providerId);
  const { data: locations = [] } = useProviderLocations(providerId);

  const setLayout = useSetStorefrontLayout(providerId);
  const reorderProducts = useReorderShopProducts(providerId);
  const reorderServices = useReorderServices(providerId);
  const updateProduct = useUpdateShopProduct(providerId);
  const updateService = useUpdateService(providerId);

  const provider = providerData?.provider;
  const capabilities = providerData?.capabilities ?? [];

  // Server baseline: archetype-allowed section order + the customer-facing item orders.
  const baseline = useMemo(() => {
    const sections = getStorefrontTabs({
      capabilities,
      locations,
      services,
      products,
      posts,
      sectionOrder: provider?.storefront_section_order,
    }).map((t) => t.key);
    return {
      sections,
      products: products.map((p) => ({ ...p })), // already featured/sort ordered by the endpoint
      services: [...services].sort(byMerchandising),
    };
  }, [capabilities, locations, services, products, posts, provider?.storefront_section_order]);

  const baselineSig = JSON.stringify({
    s: baseline.sections,
    p: baseline.products.map((p) => [p.id, !!p.is_featured, p.compare_at_cents ?? null]),
    v: baseline.services.map((s) => [s.id, !!s.is_featured]),
  });

  const [pending, setPending] = useState(baseline);
  const [saleText, setSaleText] = useState({}); // productId → raw dollars string for compare-at
  const [active, setActive] = useState(null);
  const [saving, setSaving] = useState(false);

  // (Re)seed local state whenever the SERVER baseline changes (first load, or after a Save
  // refetch). A background refetch that returns identical data leaves the signature unchanged,
  // so in-progress edits are not clobbered.
  useEffect(() => {
    setPending({
      sections: baseline.sections.slice(),
      products: baseline.products.map((p) => ({ ...p })),
      services: baseline.services.map((s) => ({ ...s })),
    });
    const seed = {};
    for (const p of baseline.products) seed[p.id] = centsToInput(p.compare_at_cents ?? null);
    setSaleText(seed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baselineSig]);

  const activeKey = pending.sections.includes(active) ? active : pending.sections[0];
  const actions = useMemo(() => computeSaveActions(baseline, pending), [baseline, pending]);
  // Client-side guard: a compare-at price must beat the current price (server enforces the 0077
  // CHECK too). Any invalid row blocks Save so we never fire a request the server will 422.
  const hasSaleError = pending.products.some(
    (p) => validateCompareAt(p.compare_at_cents ?? null, p.price_cents) != null,
  );
  const canSave = actions.hasChanges && !hasSaleError && !saving;

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-16 text-[#7A6254]">
        <Loader2 className="h-5 w-5 animate-spin" style={{ color: COLORS.coral }} /> Loading…
      </div>
    );
  }
  if (!provider) {
    return <p className="py-16 text-center text-sm text-[#7A6254]">No provider to edit.</p>;
  }

  // --- reorder handlers (tested via the pure moveById; jsdom can't do real drags) ----------
  const onSectionDragEnd = ({ active: a, over: o }) => {
    if (!o) return;
    setPending((prev) => ({ ...prev, sections: moveById(prev.sections, a.id, o.id) }));
  };
  const reorderList = (list, aId, oId) => {
    const ids = moveById(list.map((x) => x.id), aId, oId);
    const byId = new Map(list.map((x) => [x.id, x]));
    return ids.map((id) => byId.get(id));
  };
  const onProductDragEnd = ({ active: a, over: o }) => {
    if (!o) return;
    setPending((prev) => ({ ...prev, products: reorderList(prev.products, a.id, o.id) }));
  };
  const onServiceDragEnd = ({ active: a, over: o }) => {
    if (!o) return;
    setPending((prev) => ({ ...prev, services: reorderList(prev.services, a.id, o.id) }));
  };

  // --- per-item edits ---------------------------------------------------------------------
  const toggleProductFeatured = (id) =>
    setPending((prev) => ({
      ...prev,
      products: prev.products.map((p) => (p.id === id ? { ...p, is_featured: !p.is_featured } : p)),
    }));
  const toggleServiceFeatured = (id) =>
    setPending((prev) => ({
      ...prev,
      services: prev.services.map((s) => (s.id === id ? { ...s, is_featured: !s.is_featured } : s)),
    }));
  const changeSale = (id, raw) => {
    setSaleText((prev) => ({ ...prev, [id]: raw }));
    const { cents } = dollarsToCents(raw); // undefined when blank/invalid → treat blank as clear
    const next = raw.trim() === "" ? null : cents ?? undefined;
    if (next === undefined) return; // keep the current value while an invalid amount is typed
    setPending((prev) => ({
      ...prev,
      products: prev.products.map((p) => (p.id === id ? { ...p, compare_at_cents: next } : p)),
    }));
  };

  // --- save (optimistic + rollback) -------------------------------------------------------
  const onSave = async () => {
    setSaving(true);
    // Optimistic cache entries — only the reads that changed.
    const entries = [];
    if (actions.sectionOrder !== undefined) {
      entries.push({
        key: providerKey(providerId),
        next: { ...providerData, provider: { ...provider, storefront_section_order: actions.sectionOrder } },
      });
    }
    if (actions.productOrder !== undefined || actions.productPatches.length > 0) {
      entries.push({ key: shopProductsKey(providerId), next: pending.products });
    }
    if (actions.serviceOrder !== undefined || actions.servicePatches.length > 0) {
      entries.push({ key: servicesKey(providerId), next: pending.services });
    }
    // Save calls — only what changed.
    const calls = [];
    if (actions.sectionOrder !== undefined) calls.push(() => setLayout.mutateAsync(actions.sectionOrder));
    if (actions.productOrder !== undefined) calls.push(() => reorderProducts.mutateAsync(actions.productOrder));
    if (actions.serviceOrder !== undefined) calls.push(() => reorderServices.mutateAsync(actions.serviceOrder));
    for (const patch of actions.productPatches) calls.push(() => updateProduct.mutateAsync(patch));
    for (const patch of actions.servicePatches) calls.push(() => updateService.mutateAsync(patch));

    const result = await applyOptimisticSave({ queryClient, entries, calls });
    setSaving(false);
    if (result.ok) {
      toast.success("Storefront updated");
      queryClient.invalidateQueries({ queryKey: providerKey(providerId) });
      queryClient.invalidateQueries({ queryKey: shopProductsKey(providerId) });
      queryClient.invalidateQueries({ queryKey: servicesKey(providerId) });
      onDone?.();
    } else {
      toast.error(result.error?.message || "Couldn't save changes");
    }
  };

  const onDiscard = () => {
    setPending({
      sections: baseline.sections.slice(),
      products: baseline.products.map((p) => ({ ...p })),
      services: baseline.services.map((s) => ({ ...s })),
    });
    const seed = {};
    for (const p of baseline.products) seed[p.id] = centsToInput(p.compare_at_cents ?? null);
    setSaleText(seed);
  };

  return (
    <div className="mx-auto w-full max-w-[440px] px-3 py-6" data-testid="storefront-editor">
      {/* Save bar */}
      <div className="mb-4 flex items-center justify-between gap-2">
        <span className="text-sm font-bold" style={{ color: COLORS.brown }}>Editing storefront</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onDiscard}
            disabled={!actions.hasChanges || saving}
            className="rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-40"
            style={{ color: MUTED, border: `1px solid ${COLORS.peach}` }}
          >
            Discard
          </button>
          <button
            type="button"
            data-testid="storefront-save"
            onClick={onSave}
            disabled={!canSave}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
            style={{ backgroundColor: COLORS.coral }}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save
          </button>
        </div>
      </div>

      {/* Section reorder */}
      <p className="mb-2 text-xs font-bold uppercase tracking-wide" style={{ color: MUTED }}>
        Sections — drag to reorder
      </p>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onSectionDragEnd}>
        <SortableContext items={pending.sections} strategy={horizontalListSortingStrategy}>
          <div className="mb-5 flex flex-wrap gap-2">
            {pending.sections.map((key) => (
              <SortableSection
                key={key}
                id={key}
                label={TAB_LABELS[key] ?? key}
                selected={key === activeKey}
                onSelect={() => setActive(key)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {/* Active section body */}
      {activeKey === "items" ? (
        <ProductEditor
          products={pending.products}
          saleText={saleText}
          sensors={sensors}
          onDragEnd={onProductDragEnd}
          onToggleFeatured={toggleProductFeatured}
          onChangeSale={changeSale}
        />
      ) : activeKey === "services" ? (
        <ServiceEditor
          services={pending.services}
          sensors={sensors}
          onDragEnd={onServiceDragEnd}
          onToggleFeatured={toggleServiceFeatured}
        />
      ) : (
        <p className="rounded-xl border p-6 text-center text-sm" style={{ borderColor: COLORS.peach, color: MUTED }}>
          Use the section chips above to move “{TAB_LABELS[activeKey] ?? activeKey}”. Items in this
          section aren’t individually reorderable.
        </p>
      )}
    </div>
  );
}

function SortableSection({ id, label, selected, onSelect }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 };
  return (
    <div
      ref={setNodeRef}
      style={{ ...style, borderColor: COLORS.peach, backgroundColor: selected ? COLORS.coral : "#fff" }}
      className="flex items-center gap-1 rounded-full border px-2 py-1"
    >
      <button
        type="button"
        aria-label={`Drag ${label}`}
        data-testid={`section-grip-${id}`}
        className="cursor-grab touch-none"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-3.5 w-3.5" style={{ color: selected ? "#fff" : MUTED }} />
      </button>
      <button
        type="button"
        onClick={onSelect}
        className="text-sm font-bold"
        style={{ color: selected ? "#fff" : COLORS.brown }}
      >
        {label}
      </button>
    </div>
  );
}

function ProductEditor({ products, saleText, sensors, onDragEnd, onToggleFeatured, onChangeSale }) {
  if (products.length === 0) {
    return <p className="text-sm" style={{ color: MUTED }}>No products to arrange yet.</p>;
  }
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={products.map((p) => p.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          {products.map((p) => (
            <SortableProductRow
              key={p.id}
              product={p}
              saleRaw={saleText[p.id] ?? ""}
              onToggleFeatured={() => onToggleFeatured(p.id)}
              onChangeSale={(raw) => onChangeSale(p.id, raw)}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function SortableProductRow({ product, saleRaw, onToggleFeatured, onChangeSale }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: product.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 };
  const saleError = validateCompareAt(product.compare_at_cents ?? null, product.price_cents);
  const pct = discountPct(product.price_cents, product.compare_at_cents);
  return (
    <div
      ref={setNodeRef}
      style={{ ...style, borderColor: COLORS.peach }}
      className="rounded-xl border p-2"
      data-testid={`product-row-${product.id}`}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Drag product"
          data-testid={`product-grip-${product.id}`}
          className="cursor-grab touch-none"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" style={{ color: MUTED }} />
        </button>
        {Array.isArray(product.image_urls) && product.image_urls[0] ? (
          <img src={product.image_urls[0]} alt="" className="h-9 w-9 rounded object-cover" style={{ backgroundColor: COLORS.cream }} />
        ) : (
          <div className="flex h-9 w-9 items-center justify-center rounded" style={{ backgroundColor: COLORS.cream }}>
            <Package className="h-4 w-4" style={{ color: COLORS.coral }} />
          </div>
        )}
        <span className="min-w-0 flex-1 truncate text-sm font-bold" style={{ color: COLORS.brown }}>
          {product.name}
        </span>
        <span className="text-sm font-bold" style={{ color: COLORS.coral }}>{money(product.price_cents, product.currency)}</span>
        <button
          type="button"
          onClick={onToggleFeatured}
          aria-pressed={!!product.is_featured}
          aria-label="Promote product"
          data-testid={`product-feature-${product.id}`}
          className="rounded-full p-1"
          style={{ backgroundColor: product.is_featured ? "#FFF0EC" : "transparent" }}
        >
          <Star className="h-4 w-4" style={{ color: COLORS.coral, fill: product.is_featured ? COLORS.coral : "none" }} />
        </button>
      </div>
      <div className="mt-2 flex items-center gap-2 pl-6">
        <label className="text-xs font-semibold" style={{ color: MUTED }}>Compare-at (was)</label>
        <input
          type="text"
          inputMode="decimal"
          value={saleRaw}
          onChange={(e) => onChangeSale(e.target.value)}
          placeholder="—"
          data-testid={`product-sale-${product.id}`}
          className="w-24 rounded border px-2 py-1 text-sm"
          style={{ borderColor: saleError ? COLORS.terracotta : COLORS.peach }}
        />
        {pct != null && !saleError ? (
          <span className="text-xs font-extrabold" style={{ color: COLORS.terracotta }}>-{pct}%</span>
        ) : null}
        {saleError ? (
          <span className="text-xs font-semibold" style={{ color: COLORS.terracotta }} data-testid={`product-sale-error-${product.id}`}>
            {saleError}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function ServiceEditor({ services, sensors, onDragEnd, onToggleFeatured }) {
  if (services.length === 0) {
    return <p className="text-sm" style={{ color: MUTED }}>No services to arrange yet.</p>;
  }
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={services.map((s) => s.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          {services.map((s) => (
            <SortableServiceRow key={s.id} service={s} onToggleFeatured={() => onToggleFeatured(s.id)} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function SortableServiceRow({ service, onToggleFeatured }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: service.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 };
  return (
    <div
      ref={setNodeRef}
      style={{ ...style, borderColor: COLORS.peach }}
      className="flex items-center gap-2 rounded-xl border p-2"
      data-testid={`service-row-${service.id}`}
    >
      <button
        type="button"
        aria-label="Drag service"
        data-testid={`service-grip-${service.id}`}
        className="cursor-grab touch-none"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" style={{ color: MUTED }} />
      </button>
      <span className="min-w-0 flex-1 truncate text-sm font-bold" style={{ color: COLORS.brown }}>{service.name}</span>
      {service.price_cents != null ? (
        <span className="text-sm font-bold" style={{ color: COLORS.coral }}>{money(service.price_cents)}</span>
      ) : null}
      <button
        type="button"
        onClick={onToggleFeatured}
        aria-pressed={!!service.is_featured}
        aria-label="Promote service"
        data-testid={`service-feature-${service.id}`}
        className="rounded-full p-1"
        style={{ backgroundColor: service.is_featured ? "#FFF0EC" : "transparent" }}
      >
        <Star className="h-4 w-4" style={{ color: COLORS.coral, fill: service.is_featured ? COLORS.coral : "none" }} />
      </button>
    </div>
  );
}
