import { useState } from "react";
import { ShoppingBag, Loader2, Plus, Package, Pill, ImageIcon } from "lucide-react";
import { toast } from "sonner";
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
import { COLORS } from "../lib/colors";
import ImageUploader from "./ImageUploader";
import AdvancedSection from "./AdvancedSection";

// /provider/shop — the SHOP's catalog/inventory + order workspace (ticket 2.11). Manage
// PRODUCTS (price, stock, Rx flag, active) and advance incoming ORDERS' FULFILLMENT
// (placed → shipped → delivered). All data flows through the already-built backend; RLS
// (0037) + the 'shop' capability gate + provider-admin writes are the real guards. Orders +
// payments REUSE the 2.3 layer; this never duplicates them.

const FULFILLMENT_OPTIONS = ["placed", "shipped", "delivered", "cancelled"];

function money(cents, currency = "ARS") {
  if (cents == null) return "";
  return `${currency} ${(cents / 100).toFixed(2)}`;
}

export default function ProviderShop({ providerId }) {
  // Does this business sell products yet? Products is the `shop` offering (the same one the
  // Business Profile turns on). Until it's enabled, we show a friendly explainer + a single
  // "Enable Products" button instead of a jargon 403 — enabling flips the SAME offering the
  // profile controls (useAddCapability) and drops the business straight into adding its first
  // product (this component re-renders into the catalog once `shop` is on).
  const { data: caps, isLoading: capsLoading } = useProviderCapabilities(providerId);
  const sellsProducts = (caps ?? []).includes("shop");

  if (capsLoading) {
    return (
      <div className="mx-auto flex w-full max-w-5xl items-center gap-2 px-6 py-16 text-[#7A6254]">
        <Loader2 className="h-5 w-5 animate-spin" style={{ color: COLORS.coral }} />
        Loading…
      </div>
    );
  }

  if (!sellsProducts) {
    return <ProductsIntro providerId={providerId} />;
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8">
      <div className="mb-6 flex items-center gap-3">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-xl"
          style={{ backgroundColor: COLORS.peach }}
        >
          <ShoppingBag className="h-5 w-5" style={{ color: COLORS.terracotta }} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-[#3B241B]">Products</h1>
          <p className="text-sm text-[#7A6254]">
            Catalog, inventory, and order fulfillment.
          </p>
        </div>
      </div>

      <CreateProductForm providerId={providerId} />

      <h2 className="mb-3 mt-8 text-sm font-bold uppercase tracking-wide text-[#7A6254]">
        Products
      </h2>
      <ProductList providerId={providerId} />

      <h2 className="mb-3 mt-10 text-sm font-bold uppercase tracking-wide text-[#7A6254]">
        Orders
      </h2>
      <OrderList providerId={providerId} />
    </div>
  );
}

// Not-enabled state (ticket 2.90) — replaces the old "This business doesn't have the shop
// capability" message. Plain language a shop owner understands + one button that turns Products
// on (the same `shop` offering the Business Profile controls) and lands them on add-a-product.
function ProductsIntro({ providerId }) {
  const add = useAddCapability(providerId);
  const enable = () =>
    add.mutate("shop", {
      onError: (err) =>
        toast.error(err?.message || "Couldn't turn on Products — please try again"),
    });

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-16">
      <div
        className="rounded-3xl border p-8 text-center"
        style={{ borderColor: COLORS.peach, backgroundColor: "#fff" }}
      >
        <div
          className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl"
          style={{ backgroundColor: COLORS.peach }}
        >
          <ShoppingBag className="h-7 w-7" style={{ color: COLORS.terracotta }} />
        </div>
        <h1 className="mt-4 text-xl font-bold text-[#3B241B]">
          Sell products to pet owners
        </h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-[#7A6254]">
          Turn on Products to list what you sell — food, toys, accessories, and more — each with
          photos and a price. Pet owners can browse and buy them right from your business page.
        </p>
        <button
          type="button"
          onClick={enable}
          disabled={add.isPending}
          className="mt-6 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white transition-opacity disabled:opacity-60"
          style={{ backgroundColor: COLORS.coral }}
        >
          {add.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          {add.isPending ? "Turning on…" : "Enable Products"}
        </button>
      </div>
    </div>
  );
}

function CreateProductForm({ providerId }) {
  const create = useCreateShopProduct(providerId);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");
  const [category, setCategory] = useState("");
  const [isRx, setIsRx] = useState(false);
  const [images, setImages] = useState([]);

  const submit = async (e) => {
    e.preventDefault();
    const priceCents = Math.round(parseFloat(price) * 100);
    if (!name || !Number.isFinite(priceCents) || priceCents < 0) {
      toast.error("Enter a name and a valid price.");
      return;
    }
    try {
      await create.mutateAsync({
        name,
        price_cents: priceCents,
        stock_qty: parseInt(stock, 10) || 0,
        category: category || null,
        is_rx: isRx,
        image_urls: images,
      });
      toast.success("Product added");
      setName("");
      setPrice("");
      setStock("");
      setCategory("");
      setIsRx(false);
      setImages([]);
    } catch (err) {
      toast.error(err.message || "Couldn't add the product");
    }
  };

  return (
    <form
      onSubmit={submit}
      className="rounded-2xl border p-4"
      style={{ borderColor: COLORS.peach, backgroundColor: "#fff" }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Product name"
          className="rounded-lg border px-3 py-2 text-sm"
          style={{ borderColor: COLORS.peach }}
        />
        <input
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="Price (e.g. 49.90)"
          inputMode="decimal"
          className="rounded-lg border px-3 py-2 text-sm"
          style={{ borderColor: COLORS.peach }}
        />
        <input
          value={stock}
          onChange={(e) => setStock(e.target.value)}
          placeholder="Stock quantity"
          inputMode="numeric"
          className="rounded-lg border px-3 py-2 text-sm"
          style={{ borderColor: COLORS.peach }}
        />
      </div>
      {/* Less-common fields (Phase 3): state lives in this component, so their
          values submit whether or not the section is expanded. */}
      <div className="mt-4">
        <AdvancedSection>
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Category (food, toys, meds…)"
            className="w-full rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: COLORS.peach }}
          />
          <ImageUploader label="Product photos" value={images} onChange={setImages} />
          <label className="flex items-center gap-2 text-sm text-[#7A6254]">
            <input
              type="checkbox"
              checked={isRx}
              onChange={(e) => setIsRx(e.target.checked)}
            />
            Requires a prescription (Rx) — buyers must have a vet relationship
          </label>
        </AdvancedSection>
      </div>
      <button
        type="submit"
        disabled={create.isPending}
        className="mt-4 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        style={{ backgroundColor: COLORS.coral }}
      >
        <Plus className="h-4 w-4" />
        {create.isPending ? "Adding…" : "Add product"}
      </button>
    </form>
  );
}

function ProductList({ providerId }) {
  const { data: products, isLoading, isError, error } = useShopProducts(providerId);
  const update = useUpdateShopProduct(providerId);
  const del = useDeleteShopProduct(providerId);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-12 text-[#7A6254]">
        <Loader2 className="h-5 w-5 animate-spin" style={{ color: COLORS.coral }} />
        Loading products…
      </div>
    );
  }
  if (isError) {
    return (
      <p className="py-8 text-sm text-[#B4452F]">
        {error?.message || "Couldn't load products."}
      </p>
    );
  }
  if (!products || products.length === 0) {
    return (
      <EmptyCard
        title="No products yet"
        body="Add your first product above to start selling."
      />
    );
  }

  const restock = async (p) => {
    const next = (p.stock_qty ?? 0) + 10;
    try {
      await update.mutateAsync({ productId: p.id, stock_qty: next });
      toast.success(`Restocked to ${next}`);
    } catch (err) {
      toast.error(err.message || "Couldn't restock");
    }
  };

  return (
    <div className="space-y-3">
      {products.map((p) => (
        <ProductRow
          key={p.id}
          product={p}
          onRestock={() => restock(p)}
          onDeactivate={() => del.mutate(p.id)}
          onReactivate={() => update.mutate({ productId: p.id, active: true })}
          update={update}
        />
      ))}
    </div>
  );
}

// One product row + an expandable photo editor (ticket 2.23). The first image is the
// thumbnail (a Package icon when there are none). "Photos" reveals the shared
// ImageUploader seeded from the product; Save persists image_urls via the PATCH route.
function ProductRow({ product: p, onRestock, onDeactivate, onReactivate, update }) {
  const [editing, setEditing] = useState(false);
  const [images, setImages] = useState(
    Array.isArray(p.image_urls) ? p.image_urls : [],
  );
  const thumb = Array.isArray(p.image_urls) ? p.image_urls[0] : null;

  const savePhotos = async () => {
    try {
      await update.mutateAsync({ productId: p.id, image_urls: images });
      toast.success("Photos updated");
      setEditing(false);
    } catch (err) {
      toast.error(err.message || "Couldn't update photos");
    }
  };

  return (
    <div
      className="rounded-2xl border p-4"
      style={{ borderColor: COLORS.peach, backgroundColor: "#fff", opacity: p.active ? 1 : 0.6 }}
    >
      <div className="flex items-center gap-4">
        {thumb ? (
          <img
            src={thumb}
            alt={p.name}
            className="h-12 w-12 flex-shrink-0 rounded-xl object-cover"
            style={{ backgroundColor: COLORS.cream }}
          />
        ) : (
          <div
            className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl"
            style={{ backgroundColor: COLORS.cream }}
          >
            <Package className="h-5 w-5" style={{ color: COLORS.coral }} />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-semibold text-[#3B241B]">{p.name}</span>
            {p.is_rx ? (
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold"
                style={{ backgroundColor: COLORS.terracotta + "22", color: COLORS.terracotta }}
              >
                <Pill className="h-3 w-3" /> Rx
              </span>
            ) : null}
            {!p.active ? (
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-500">
                Inactive
              </span>
            ) : null}
          </div>
          <p className="text-sm text-[#7A6254]">
            {money(p.price_cents, p.currency)} · {p.stock_qty} in stock
            {p.category ? ` · ${p.category}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setEditing((v) => !v)}
            className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-semibold text-[#3B241B]"
            style={{ borderColor: COLORS.peach }}
          >
            <ImageIcon className="h-3.5 w-3.5" />
            Photos
          </button>
          <button
            onClick={onRestock}
            className="rounded-lg border px-3 py-1.5 text-xs font-semibold text-[#3B241B]"
            style={{ borderColor: COLORS.peach }}
          >
            +10 stock
          </button>
          {p.active ? (
            <button
              onClick={onDeactivate}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold"
              style={{ color: COLORS.terracotta }}
            >
              Deactivate
            </button>
          ) : (
            <button
              onClick={onReactivate}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold"
              style={{ color: COLORS.coral }}
            >
              Reactivate
            </button>
          )}
        </div>
      </div>

      {editing && (
        <div className="mt-4 border-t pt-4" style={{ borderColor: COLORS.peach }}>
          <ImageUploader label="Product photos" value={images} onChange={setImages} />
          <div className="mt-3 flex gap-2">
            <button
              onClick={savePhotos}
              disabled={update.isPending}
              className="rounded-lg px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
              style={{ backgroundColor: COLORS.coral }}
            >
              {update.isPending ? "Saving…" : "Save photos"}
            </button>
            <button
              onClick={() => {
                setImages(Array.isArray(p.image_urls) ? p.image_urls : []);
                setEditing(false);
              }}
              className="rounded-lg border px-4 py-2 text-xs font-semibold text-[#7A6254]"
              style={{ borderColor: COLORS.peach }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function OrderList({ providerId }) {
  const { data: orders, isLoading, isError, error } = useShopOrders(providerId);
  const setFulfillment = useSetOrderFulfillment(providerId);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-12 text-[#7A6254]">
        <Loader2 className="h-5 w-5 animate-spin" style={{ color: COLORS.coral }} />
        Loading orders…
      </div>
    );
  }
  if (isError) {
    return (
      <p className="py-8 text-sm text-[#B4452F]">
        {error?.message || "Couldn't load orders."}
      </p>
    );
  }
  if (!orders || orders.length === 0) {
    return <EmptyCard title="No orders yet" body="Paid orders will appear here." />;
  }

  const advance = async (orderId, status) => {
    try {
      await setFulfillment.mutateAsync({ orderId, fulfillment_status: status });
      toast.success(`Marked ${status}`);
    } catch (err) {
      toast.error(err.message || "Couldn't update fulfillment");
    }
  };

  return (
    <div className="space-y-3">
      {orders.map((o) => (
        <div
          key={o.id}
          className="rounded-2xl border p-4"
          style={{ borderColor: COLORS.peach, backgroundColor: "#fff" }}
        >
          <div className="flex items-center justify-between">
            <span className="font-semibold text-[#3B241B]">Order #{o.id}</span>
            <span className="text-sm font-semibold" style={{ color: COLORS.coral }}>
              {money(o.amount_cents, o.currency)}
            </span>
          </div>
          <p className="mt-1 text-sm text-[#7A6254]">
            Payment: {o.status} · Fulfillment: {o.fulfillment_status}
          </p>
          {(o.items ?? []).map((it) => (
            <p key={it.id} className="text-sm text-[#7A6254]">
              {it.quantity} × {it.name}
            </p>
          ))}
          <div className="mt-3 flex flex-wrap gap-2">
            {FULFILLMENT_OPTIONS.map((s) => (
              <button
                key={s}
                onClick={() => advance(o.id, s)}
                disabled={o.fulfillment_status === s}
                className="rounded-lg border px-3 py-1.5 text-xs font-semibold capitalize disabled:opacity-50"
                style={{
                  borderColor: COLORS.peach,
                  color: o.fulfillment_status === s ? COLORS.coral : "#3B241B",
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyCard({ title, body }) {
  return (
    <div
      className="rounded-2xl border p-8 text-center"
      style={{ borderColor: COLORS.peach, backgroundColor: "#fff" }}
    >
      <ShoppingBag className="mx-auto h-8 w-8" style={{ color: COLORS.mutedBrown }} />
      <p className="mt-3 font-semibold text-[#3B241B]">{title}</p>
      <p className="mt-1 text-sm text-[#7A6254]">{body}</p>
    </div>
  );
}
