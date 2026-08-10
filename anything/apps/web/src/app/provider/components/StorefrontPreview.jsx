import { useState } from "react";
import {
  Store,
  Star,
  Package,
  Pill,
  Clock,
  MapPin,
  Phone,
  Globe,
  Instagram,
  Facebook,
  Map as MapIcon,
  Loader2,
  Pencil,
} from "lucide-react";
import {
  useProvider,
  useProviderServices,
  useShopProducts,
  useProviderPosts,
  useProviderLocations,
  useProviderReviews,
} from "../hooks/useProviders";
import { getStorefrontTabs } from "../lib/storefrontTabs";
import { deriveOpenNow } from "../lib/openNow";
import { COLORS } from "../lib/colors";
import StorefrontEditor from "./StorefrontEditor";

// /provider/storefront → "View as customer" (Storefront Phase 2b). A READ-ONLY, faithful web
// re-render of the mobile storefront shell (StoreHeader → tab bar → panels) so the owner sees
// their store exactly as a customer does — including the 2a ordering / featured / discount and
// the per-provider storefront_section_order. It reads the owner's OWN data (the existing
// membership-gated extranet endpoints), so it works even for a DRAFT/unpublished provider and
// shows inactive/draft items (marked) that the public view hides. No editing, no drag, no
// writes — that is Phase 2c. Section-order logic comes from lib/storefrontTabs.js, a verbatim
// mirror of the mobile resolver, so web preview and mobile render stay in lockstep.
const MUTED = "#7A6254";

// English labels (the extranet is hardcoded-English; no i18n). Keyed by section/capability.
const TAB_LABELS = {
  services: "Services",
  items: "Services/Products",
  posts: "Posts",
  reviews: "Reviews",
  locations: "Locations",
  about: "About",
};
const CAP_LABELS = {
  vet: "Vet",
  groomer: "Grooming",
  telehealth: "Telehealth",
  walker: "Walking",
  sitter: "Sitting",
  daycare: "Daycare",
  trainer: "Training",
  shop: "Shop",
  pharmacy: "Pharmacy",
};

// Mirrors mobile utils/money.js formatMoney — ARS shows as a bare "$" with es-AR grouping
// ($1.500) so the preview reads in the customer's currency; a non-ARS currency keeps its ISO
// code. Prices are integer cents; services carry no currency and fall back to ARS.
function formatMoney(cents, currency = "ARS") {
  if (cents == null || Number.isNaN(cents)) return null;
  const code = (currency || "ARS").toUpperCase();
  const sign = cents < 0 ? "-" : "";
  const absCents = Math.abs(cents);
  const whole = Math.trunc(absCents / 100);
  const frac = absCents % 100;
  if (code === "ARS") {
    const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    const decimals = frac === 0 ? "" : `,${String(frac).padStart(2, "0")}`;
    return `${sign}$${grouped}${decimals}`;
  }
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}${code} ${grouped}.${String(frac).padStart(2, "0")}`;
}

// Integer percent off, or null when there is no valid discount (mirrors mobile discountPct).
function discountPct(priceCents, compareAtCents) {
  if (!Number.isFinite(priceCents) || !Number.isFinite(compareAtCents)) return null;
  if (compareAtCents <= 0 || compareAtCents <= priceCents) return null;
  return Math.round(((compareAtCents - priceCents) / compareAtCents) * 100);
}

// Customer-facing item order (mirrors the 2a query ORDER BY): featured first, then the manual
// sort_order, then recency. Services carry no server order (SELECT * created_at ASC), so sort
// here for faithfulness; products already arrive featured-first from the shop-products route.
function byMerchandising(createdDir) {
  return (a, b) => {
    if (!!b.is_featured !== !!a.is_featured) return b.is_featured ? 1 : -1;
    const so = (a.sort_order ?? 0) - (b.sort_order ?? 0);
    if (so !== 0) return so;
    const at = String(a.created_at ?? "");
    const bt = String(b.created_at ?? "");
    return createdDir === "asc" ? at.localeCompare(bt) : bt.localeCompare(at);
  };
}

export default function StorefrontPreview({ providerId }) {
  const { data: providerData, isLoading: pLoading } = useProvider(providerId);
  const { data: services = [] } = useProviderServices(providerId);
  const { data: products = [] } = useShopProducts(providerId);
  const { data: posts = [] } = useProviderPosts(providerId);
  const { data: locations = [] } = useProviderLocations(providerId);
  const { data: reviews = [] } = useProviderReviews(providerId);

  const provider = providerData?.provider;
  const capabilities = providerData?.capabilities ?? [];

  const tabs = getStorefrontTabs({
    capabilities,
    locations,
    services,
    products,
    posts,
    sectionOrder: provider?.storefront_section_order,
  });
  const [activeKey, setActiveKey] = useState(null);
  const [editing, setEditing] = useState(false);
  const active = tabs.some((tab) => tab.key === activeKey)
    ? activeKey
    : tabs[0]?.key;
  // Shop / fallback archetypes have no Locations tab → fold locations into About.
  const includeLocationsInAbout =
    locations.length > 0 && !tabs.some((tab) => tab.key === "locations");

  // Edit mode (Phase 2c-ii) is the editable twin; the read-only render below is unchanged (2b).
  if (editing) {
    return <StorefrontEditor providerId={providerId} onDone={() => setEditing(false)} />;
  }

  if (pLoading) {
    return (
      <div className="flex items-center gap-2 py-16 text-[#7A6254]">
        <Loader2 className="h-5 w-5 animate-spin" style={{ color: COLORS.coral }} />
        Loading preview…
      </div>
    );
  }
  if (!provider) {
    return <p className="py-16 text-center text-sm text-[#7A6254]">No provider to preview.</p>;
  }

  const isDraft = provider.status !== "published";

  return (
    <div className="mx-auto w-full max-w-[420px] px-3 py-6">
      <div className="mb-3 flex justify-end">
        <button
          type="button"
          data-testid="storefront-edit-toggle"
          onClick={() => setEditing(true)}
          className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-semibold"
          style={{ color: COLORS.brown, border: `1px solid ${COLORS.peach}` }}
        >
          <Pencil className="h-4 w-4" style={{ color: COLORS.coral }} />
          Edit storefront
        </button>
      </div>

      {/* Owner-only banner — the preview shows more than the live store (drafts + hidden items). */}
      <div
        className="mb-3 rounded-xl border px-3 py-2 text-center text-xs font-semibold"
        style={{ borderColor: COLORS.peach, backgroundColor: COLORS.cream, color: MUTED }}
      >
        {isDraft
          ? "Draft preview · this is how customers will see your store once you publish"
          : "Preview · this is how customers see your store"}
      </div>

      <div
        className="overflow-hidden rounded-3xl border"
        style={{ borderColor: COLORS.peach, backgroundColor: "#fff" }}
      >
        {provider.cover_image_url ? (
          <img
            src={provider.cover_image_url}
            alt="Cover"
            className="h-32 w-full object-cover"
            style={{ backgroundColor: COLORS.cream }}
          />
        ) : (
          <div className="h-20 w-full" style={{ backgroundColor: COLORS.peach }} />
        )}

        <div className="p-4">
          <StoreHeader
            provider={provider}
            capabilities={capabilities}
            services={services}
            openNow={deriveOpenNow(locations[0]?.hours_json)}
          />

          <TabBar tabs={tabs} active={active} onSelect={setActiveKey} />

          <div className="pt-4">
            {active === "services" && <ServicesPanel services={services} />}
            {active === "items" && <ItemsPanel products={products} />}
            {active === "posts" && <PostsPanel posts={posts} />}
            {active === "reviews" && (
              <ReviewsPanel
                reviews={reviews}
                avgRating={provider.avg_rating}
                reviewCount={provider.review_count}
              />
            )}
            {active === "locations" && <LocationsPanel locations={locations} />}
            {active === "about" && (
              <AboutPanel
                provider={provider}
                locations={locations}
                includeLocations={includeLocationsInAbout}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Header ──────────────────────────────────────────────────────────────────────
function StoreHeader({ provider, capabilities, services, openNow }) {
  const prices = services.map((s) => s.price_cents).filter((c) => c != null);
  const fromPrice = prices.length ? Math.min(...prices) : null;
  return (
    <div className="flex items-start gap-3">
      {provider.logo_url ? (
        <img
          src={provider.logo_url}
          alt=""
          className="h-14 w-14 rounded-xl object-cover"
          style={{ backgroundColor: COLORS.cream }}
        />
      ) : (
        <div
          className="flex h-14 w-14 items-center justify-center rounded-xl"
          style={{ backgroundColor: COLORS.cream }}
        >
          <Store className="h-6 w-6" style={{ color: COLORS.coral }} />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-lg font-bold" style={{ color: COLORS.brown }}>
          {provider.name}
        </h2>
        {capabilities.length > 0 ? (
          <div className="mt-1 flex flex-wrap gap-1">
            {capabilities.map((c) => (
              <span
                key={c}
                className="rounded-full border px-2 py-0.5 text-xs font-bold"
                style={{ borderColor: COLORS.peach, color: COLORS.coral, backgroundColor: "#FFF3EE" }}
              >
                {CAP_LABELS[c] ?? c}
              </span>
            ))}
          </div>
        ) : provider.provider_type ? (
          <p className="mt-1 text-xs font-bold capitalize" style={{ color: COLORS.coral }}>
            {provider.provider_type}
          </p>
        ) : null}
        <div className="mt-1.5 flex flex-wrap items-center gap-3">
          <RatingSummary avg={provider.avg_rating} count={provider.review_count} />
          {openNow != null ? <OpenNowPill open={openNow} /> : null}
          {fromPrice != null ? (
            <span className="text-xs font-semibold" style={{ color: MUTED }}>
              from {formatMoney(fromPrice)}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// Mirrors the mobile RatingBadge: no reviews → muted "New"; else star + avg + (count).
function RatingSummary({ avg, count }) {
  const c = Number(count) || 0;
  const a = avg == null ? null : Number(avg);
  if (c === 0 || a == null || Number.isNaN(a)) {
    return (
      <span className="flex items-center gap-1 text-xs font-bold" style={{ color: MUTED }}>
        <Star className="h-3.5 w-3.5" /> New
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-xs">
      <Star className="h-3.5 w-3.5" style={{ color: COLORS.coral, fill: COLORS.coral }} />
      <span className="font-extrabold" style={{ color: COLORS.brown }}>{a.toFixed(1)}</span>
      <span className="font-semibold" style={{ color: MUTED }}>({c})</span>
    </span>
  );
}

function OpenNowPill({ open }) {
  return (
    <span
      className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-bold"
      style={{
        borderColor: open ? "#5FA772" : COLORS.peach,
        backgroundColor: open ? "#EAF5EC" : COLORS.cream,
        color: open ? "#3F7A50" : MUTED,
      }}
    >
      <Clock className="h-3 w-3" /> {open ? "Open now" : "Closed"}
    </span>
  );
}

// ── Tab bar ─────────────────────────────────────────────────────────────────────
function TabBar({ tabs, active, onSelect }) {
  return (
    <div className="mt-4 flex gap-1 overflow-x-auto border-b" style={{ borderColor: COLORS.peach }}>
      {tabs.map((tab) => {
        const selected = tab.key === active;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onSelect(tab.key)}
            className="whitespace-nowrap px-3 py-2 text-sm font-bold"
            style={{
              color: selected ? COLORS.coral : MUTED,
              borderBottom: `2px solid ${selected ? COLORS.coral : "transparent"}`,
            }}
          >
            {TAB_LABELS[tab.key] ?? tab.key}
          </button>
        );
      })}
    </div>
  );
}

// ── Badges / chips ──────────────────────────────────────────────────────────────
function FeaturedBadge() {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-extrabold"
      style={{ backgroundColor: "#FFF0EC", color: COLORS.coral }}
    >
      <Star className="h-2.5 w-2.5" style={{ fill: COLORS.coral }} /> Featured
    </span>
  );
}

function DiscountBadge({ priceCents, compareAtCents, currency }) {
  const pct = discountPct(priceCents, compareAtCents);
  if (pct == null) return null;
  return (
    <span className="mt-0.5 flex items-center gap-1.5 text-xs">
      <span className="font-semibold line-through" style={{ color: MUTED }}>
        {formatMoney(compareAtCents, currency)}
      </span>
      <span className="font-extrabold" style={{ color: COLORS.terracotta }}>
        -{pct}%
      </span>
    </span>
  );
}

// Owner-only marker for content the live store hides (inactive item / draft store).
function HiddenChip({ label = "Hidden" }) {
  return (
    <span
      className="rounded-full px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide"
      style={{ backgroundColor: COLORS.cream, color: MUTED, border: `1px solid ${COLORS.peach}` }}
    >
      {label}
    </span>
  );
}

function PanelTitle({ children }) {
  return (
    <h3 className="mb-3 text-xs font-extrabold uppercase tracking-wide" style={{ color: MUTED }}>
      {children}
    </h3>
  );
}

function EmptyState({ children }) {
  return (
    <div
      className="rounded-xl border p-6 text-center text-sm"
      style={{ borderColor: COLORS.peach, color: MUTED }}
    >
      {children}
    </div>
  );
}

// ── Panels ──────────────────────────────────────────────────────────────────────
function ServicesPanel({ services }) {
  const sorted = [...services].sort(byMerchandising("asc"));
  if (sorted.length === 0) return <EmptyState>No services listed yet.</EmptyState>;
  return (
    <div>
      <PanelTitle>Services</PanelTitle>
      <div className="space-y-2">
        {sorted.map((s) => (
          <div
            key={s.id}
            className="rounded-xl border p-3"
            style={{ borderColor: COLORS.peach, backgroundColor: "#fff", opacity: s.active === false ? 0.6 : 1 }}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate font-bold" style={{ color: COLORS.brown }}>{s.name}</span>
                {s.is_featured ? <FeaturedBadge /> : null}
                {s.active === false ? <HiddenChip /> : null}
              </div>
              {formatMoney(s.price_cents) ? (
                <span className="font-bold" style={{ color: COLORS.coral }}>{formatMoney(s.price_cents)}</span>
              ) : null}
            </div>
            {s.description ? (
              <p className="mt-1 text-sm" style={{ color: MUTED }}>{s.description}</p>
            ) : null}
            {s.duration_min ? (
              <p className="mt-1 flex items-center gap-1 text-xs" style={{ color: MUTED }}>
                <Clock className="h-3 w-3" /> {s.duration_min} min
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function ItemsPanel({ products }) {
  if (products.length === 0) return <EmptyState>This store hasn&apos;t listed any products yet.</EmptyState>;
  return (
    <div>
      <PanelTitle>Items</PanelTitle>
      <div className="grid grid-cols-2 gap-2">
        {products.map((p) => {
          const soldOut = p.stock_qty <= 0;
          const img = Array.isArray(p.image_urls) ? p.image_urls[0] : null;
          return (
            <div
              key={p.id}
              className="rounded-xl border p-2"
              style={{ borderColor: COLORS.peach, backgroundColor: "#fff", opacity: p.active === false || soldOut ? 0.6 : 1 }}
            >
              <div className="relative">
                {img ? (
                  <img src={img} alt="" className="h-24 w-full rounded-lg object-cover" style={{ backgroundColor: COLORS.cream }} />
                ) : (
                  <div className="flex h-24 w-full items-center justify-center rounded-lg" style={{ backgroundColor: COLORS.cream }}>
                    <Package className="h-6 w-6" style={{ color: COLORS.coral }} />
                  </div>
                )}
                {p.is_featured ? <div className="absolute left-1 top-1"><FeaturedBadge /></div> : null}
                {p.active === false ? <div className="absolute right-1 top-1"><HiddenChip /></div> : null}
              </div>
              <div className="mt-1.5 flex items-center gap-1">
                <span className="truncate text-sm font-bold" style={{ color: COLORS.brown }}>{p.name}</span>
                {p.is_rx ? (
                  <span className="inline-flex items-center gap-0.5 rounded-full px-1 py-0.5 text-[10px] font-extrabold" style={{ backgroundColor: "#F6E8DF", color: COLORS.terracotta }}>
                    <Pill className="h-2.5 w-2.5" /> Rx
                  </span>
                ) : null}
              </div>
              <div className="text-sm font-extrabold" style={{ color: COLORS.coral }}>{formatMoney(p.price_cents, p.currency)}</div>
              <DiscountBadge priceCents={p.price_cents} compareAtCents={p.compare_at_cents} currency={p.currency} />
              <div className="text-xs" style={{ color: MUTED }}>
                {soldOut ? "Sold out" : `${p.stock_qty} in stock`}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PostsPanel({ posts }) {
  if (posts.length === 0) return <EmptyState>No posts yet.</EmptyState>;
  return (
    <div>
      <PanelTitle>Posts</PanelTitle>
      <div className="space-y-2">
        {posts.map((post) => (
          <div key={post.id} className="rounded-xl border p-3" style={{ borderColor: COLORS.peach, backgroundColor: "#fff" }}>
            {post.body ? <p className="whitespace-pre-wrap text-sm" style={{ color: COLORS.brown }}>{post.body}</p> : null}
            {Array.isArray(post.image_urls) && post.image_urls.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {post.image_urls.map((url, i) => (
                  <img key={`${post.id}-${i}`} src={url} alt="" className="h-20 w-20 rounded-lg object-cover" style={{ backgroundColor: COLORS.cream }} />
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function ReviewsPanel({ reviews, avgRating, reviewCount }) {
  return (
    <div>
      <PanelTitle>Reviews</PanelTitle>
      <div className="mb-3 flex items-center gap-2">
        <RatingSummary avg={avgRating} count={reviewCount} />
      </div>
      {reviews.length === 0 ? (
        <EmptyState>No reviews yet. After a completed appointment, customers can leave the first one.</EmptyState>
      ) : (
        <div className="space-y-2">
          {reviews.map((rv) => (
            <div key={rv.id} className="rounded-xl border p-3" style={{ borderColor: COLORS.peach, backgroundColor: "#fff" }}>
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-bold" style={{ color: COLORS.brown }}>{rv.reviewer_name || "Pet parent"}</span>
                <span className="flex items-center gap-1">
                  <Star className="h-3.5 w-3.5" style={{ color: COLORS.coral, fill: COLORS.coral }} />
                  <span className="font-extrabold" style={{ color: COLORS.brown }}>{rv.rating}</span>
                </span>
              </div>
              {rv.pet_name ? <p className="mt-0.5 text-xs font-bold" style={{ color: COLORS.coral }}>with {rv.pet_name}</p> : null}
              {rv.body ? <p className="mt-1.5 text-sm" style={{ color: MUTED }}>{rv.body}</p> : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LocationsPanel({ locations }) {
  if (locations.length === 0) return <EmptyState>No locations listed yet.</EmptyState>;
  return (
    <div>
      <PanelTitle>Locations</PanelTitle>
      <div className="space-y-2">
        {locations.map((l) => (
          <div key={l.id} className="rounded-xl border p-3" style={{ borderColor: COLORS.peach, backgroundColor: "#fff" }}>
            <p className="font-bold" style={{ color: COLORS.brown }}>{l.name}</p>
            {l.address ? (
              <p className="mt-1 flex items-center gap-1 text-sm" style={{ color: MUTED }}>
                <MapPin className="h-3 w-3" /> {l.address}
              </p>
            ) : null}
            {l.phone ? (
              <p className="mt-1 flex items-center gap-1 text-sm" style={{ color: MUTED }}>
                <Phone className="h-3 w-3" /> {l.phone}
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function AboutPanel({ provider, locations, includeLocations }) {
  const links = [
    { url: provider.website_url, label: "Website", Icon: Globe },
    { url: provider.instagram_url, label: "Instagram", Icon: Instagram },
    { url: provider.facebook_url, label: "Facebook", Icon: Facebook },
    { url: provider.google_maps_url, label: "Google Maps", Icon: MapIcon },
  ].filter((l) => typeof l.url === "string" && l.url.trim().length > 0);
  const hasLocations = includeLocations && locations.length > 0;

  if (!provider.bio && links.length === 0 && !hasLocations) {
    return <EmptyState>No additional details yet.</EmptyState>;
  }
  return (
    <div>
      {provider.bio ? <p className="mb-3 text-sm leading-relaxed" style={{ color: MUTED }}>{provider.bio}</p> : null}
      {links.length > 0 ? (
        <div className="mb-3 flex flex-wrap gap-2">
          {links.map(({ url, label, Icon }) => (
            <a
              key={label}
              href={url.trim()}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-bold"
              style={{ borderColor: COLORS.peach, backgroundColor: COLORS.cream, color: COLORS.brown }}
            >
              <Icon className="h-4 w-4" style={{ color: COLORS.coral }} /> {label}
            </a>
          ))}
        </div>
      ) : null}
      {hasLocations ? <LocationsPanel locations={locations} /> : null}
    </div>
  );
}
