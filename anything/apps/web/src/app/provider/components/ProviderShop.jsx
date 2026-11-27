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
import shopCopy from "../i18n/shop";
import { useProviderCopy } from "../i18n/lib/useProviderCopy";
import { fill, formatMoney } from "../i18n/lib/format";
import { serverErrorMessage } from "../i18n/lib/serverError";

// /provider/shop — the SHOP's catalog/inventory + order workspace (ticket 2.11). Manage
// PRODUCTS (price, stock, Rx flag, active) and advance incoming ORDERS' FULFILLMENT
// (placed → shipped → delivered). All data flows through the already-built backend; RLS
// (0037) + the 'shop' capability gate + provider-admin writes are the real guards. Orders +
// payments REUSE the 2.3 layer; this never duplicates them.

const FULFILLMENT_OPTIONS = ["placed", "shipped", "delivered", "cancelled"];

function money(cents, currency = "ARS", lang = "en") {
  if (cents == null) return "";
  if (lang === "es") return formatMoney(cents, currency, lang);
  return `${currency} ${(cents / 100).toFixed(2)}`;
}

// A stored order value in the viewer's language; a value without a name is shown as stored.
const named = (names, value) => (Object.hasOwn(names, value) ? names[value] : value);

export default function ProviderShop({ providerId }) {
  const { t } = useProviderCopy(shopCopy);
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
        {t.loading}
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
          <h1 className="text-xl font-bold text-[#3B241B]">{t.title}</h1>
          <p className="text-sm text-[#7A6254]">{t.subtitle}</p>
        </div>
      </div>

      <CreateProductForm providerId={providerId} />

      <h2 className="mb-3 mt-8 text-sm font-bold uppercase tracking-wide text-[#7A6254]">
        {t.headings.products}
      </h2>
      <ProductList providerId={providerId} />

      <h2 className="mb-3 mt-10 text-sm font-bold uppercase tracking-wide text-[#7A6254]">
        {t.headings.orders}
      </h2>
      <OrderList providerId={providerId} />
    </div>
  );
}

// Not-enabled state (ticket 2.90) — replaces the old "This business doesn't have the shop
// capability" message. Plain language a shop owner understands + one button that turns Products
// on (the same `shop` offering the Business Profile controls) and lands them on add-a-product.
function ProductsIntro({ providerId }) {
  const { t, lang } = useProviderCopy(shopCopy);
  const add = useAddCapability(providerId);
  const enable = () =>
    add.mutate("shop", {
      onError: (err) =>
        toast.error(serverErrorMessage(err, lang, t.intro.failed, shopCopy)),
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
        <h1 className="mt-4 text-xl font-bold text-[#3B241B]">{t.intro.title}</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-[#7A6254]">{t.intro.body}</p>
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
          {add.isPending ? t.intro.enabling : t.intro.enable}
        </button>
      </div>
    </div>
  );
}

function CreateProductForm({ providerId }) {
  const { t, lang } = useProviderCopy(shopCopy);
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
      toast.error(t.form.invalid);
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
      toast.success(t.form.added);
      setName("");
      setPrice("");
      setStock("");
      setCategory("");
      setIsRx(false);
      setImages([]);
    } catch (err) {
      toast.error(serverErrorMessage(err, lang, t.form.addFailed, shopCopy));
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
          placeholder={t.form.name}
          className="rounded-lg border px-3 py-2 text-sm"
          style={{ borderColor: COLORS.peach }}
        />
        <input
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder={t.form.price}
          inputMode="decimal"
          className="rounded-lg border px-3 py-2 text-sm"
          style={{ borderColor: COLORS.peach }}
        />
        <input
          value={stock}
          onChange={(e) => setStock(e.target.value)}
          placeholder={t.form.stock}
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
            placeholder={t.form.category}
            className="w-full rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: COLORS.peach }}
          />
          <ImageUploader label={t.form.photos} value={images} onChange={setImages} />
          <label className="flex items-center gap-2 text-sm text-[#7A6254]">
            <input
              type="checkbox"
              checked={isRx}
              onChange={(e) => setIsRx(e.target.checked)}
            />
            {t.form.rx}
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
        {create.isPending ? t.form.adding : t.form.add}
      </button>
    </form>
  );
}

function ProductList({ providerId }) {
  const { t, lang } = useProviderCopy(shopCopy);
  const { data: products, isLoading, isError, error } = useShopProducts(providerId);
  const update = useUpdateShopProduct(providerId);
  const del = useDeleteShopProduct(providerId);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-12 text-[#7A6254]">
        <Loader2 className="h-5 w-5 animate-spin" style={{ color: COLORS.coral }} />
        {t.products.loading}
      </div>
    );
  }
  if (isError) {
    return (
      <p className="py-8 text-sm text-[#B4452F]">
        {serverErrorMessage(error, lang, t.products.loadFailed, shopCopy)}
      </p>
    );
  }
  if (!products || products.length === 0) {
    return (
      <EmptyCard title={t.products.emptyTitle} body={t.products.emptyBody} />
    );
  }

  const restock = async (p) => {
    const next = (p.stock_qty ?? 0) + 10;
    try {
      await update.mutateAsync({ productId: p.id, stock_qty: next });
      toast.success(fill(t.products.restocked, { count: next }));
    } catch (err) {
      toast.error(serverErrorMessage(err, lang, t.products.restockFailed, shopCopy));
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
  const { t, lang } = useProviderCopy(shopCopy);
  const [editing, setEditing] = useState(false);
  const [images, setImages] = useState(
    Array.isArray(p.image_urls) ? p.image_urls : [],
  );
  const thumb = Array.isArray(p.image_urls) ? p.image_urls[0] : null;

  const savePhotos = async () => {
    try {
      await update.mutateAsync({ productId: p.id, image_urls: images });
      toast.success(t.products.photosUpdated);
      setEditing(false);
    } catch (err) {
      toast.error(serverErrorMessage(err, lang, t.products.photosFailed, shopCopy));
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
                <Pill className="h-3 w-3" /> {t.rx}
              </span>
            ) : null}
            {!p.active ? (
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-500">
                {t.products.inactive}
              </span>
            ) : null}
          </div>
          <p className="text-sm text-[#7A6254]">
            {money(p.price_cents, p.currency, lang)} ·{" "}
            {fill(t.products.inStock, { count: p.stock_qty })}
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
            {t.products.photos}
          </button>
          <button
            onClick={onRestock}
            className="rounded-lg border px-3 py-1.5 text-xs font-semibold text-[#3B241B]"
            style={{ borderColor: COLORS.peach }}
          >
            {t.products.addStock}
          </button>
          {p.active ? (
            <button
              onClick={onDeactivate}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold"
              style={{ color: COLORS.terracotta }}
            >
              {t.products.deactivate}
            </button>
          ) : (
            <button
              onClick={onReactivate}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold"
              style={{ color: COLORS.coral }}
            >
              {t.products.reactivate}
            </button>
          )}
        </div>
      </div>

      {editing && (
        <div className="mt-4 border-t pt-4" style={{ borderColor: COLORS.peach }}>
          <ImageUploader label={t.form.photos} value={images} onChange={setImages} />
          <div className="mt-3 flex gap-2">
            <button
              onClick={savePhotos}
              disabled={update.isPending}
              className="rounded-lg px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
              style={{ backgroundColor: COLORS.coral }}
            >
              {update.isPending ? t.products.saving : t.products.savePhotos}
            </button>
            <button
              onClick={() => {
                setImages(Array.isArray(p.image_urls) ? p.image_urls : []);
                setEditing(false);
              }}
              className="rounded-lg border px-4 py-2 text-xs font-semibold text-[#7A6254]"
              style={{ borderColor: COLORS.peach }}
            >
              {t.products.cancel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function OrderList({ providerId }) {
  const { t, lang } = useProviderCopy(shopCopy);
  const { data: orders, isLoading, isError, error } = useShopOrders(providerId);
  const setFulfillment = useSetOrderFulfillment(providerId);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-12 text-[#7A6254]">
        <Loader2 className="h-5 w-5 animate-spin" style={{ color: COLORS.coral }} />
        {t.orders.loading}
      </div>
    );
  }
  if (isError) {
    return (
      <p className="py-8 text-sm text-[#B4452F]">
        {serverErrorMessage(error, lang, t.orders.loadFailed, shopCopy)}
      </p>
    );
  }
  if (!orders || orders.length === 0) {
    return <EmptyCard title={t.orders.emptyTitle} body={t.orders.emptyBody} />;
  }

  const advance = async (orderId, status) => {
    try {
      await setFulfillment.mutateAsync({ orderId, fulfillment_status: status });
      toast.success(fill(t.orders.marked, { status: named(t.fulfillment, status) }));
    } catch (err) {
      toast.error(serverErrorMessage(err, lang, t.orders.updateFailed, shopCopy));
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
            <span className="font-semibold text-[#3B241B]">
              {fill(t.orders.number, { id: o.id })}
            </span>
            <span className="text-sm font-semibold" style={{ color: COLORS.coral }}>
              {money(o.amount_cents, o.currency, lang)}
            </span>
          </div>
          <p className="mt-1 text-sm text-[#7A6254]">
            {fill(t.orders.summary, {
              payment: named(t.paymentStatus, o.status),
              fulfillment: named(t.fulfillment, o.fulfillment_status),
            })}
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
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${
                  lang === "en" ? "capitalize" : ""
                }`}
                style={{
                  borderColor: COLORS.peach,
                  color: o.fulfillment_status === s ? COLORS.coral : "#3B241B",
                }}
              >
                {named(t.fulfillment, s)}
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
