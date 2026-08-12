import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Check, ChevronRight, PawPrint } from "lucide-react";
import { COLORS } from "../lib/colors";
import { computeProviderActivation } from "../lib/activation";
import {
  useProvider,
  useProviderServices,
  useShopProducts,
  useAvailabilityWindows,
  useProviderLocations,
  useProviderPosts,
} from "../hooks/useProviders";

// "Getting started" activation card on the provider dashboard (ticket 2.99). A persistent card at
// the top of the dashboard whose items each DERIVE completion from existing provider data (no new
// table). It retires at 100% after a brief success state. Web mirror of the mobile owner checklist.

// Per-item copy + the screen each row jumps to.
const ITEM_META = {
  profile: {
    title: "Complete your business profile",
    desc: "Add a logo and a short description",
    to: "/provider/profile",
  },
  offering: {
    title: "Add what you offer",
    desc: "List a service or a product",
    to: "/provider/services",
  },
  hours: {
    title: "Set your hours",
    desc: "Add your open hours so people can book",
    to: "/provider/profile",
  },
  location: {
    title: "Add a location",
    desc: "Put your business on the map",
    to: "/provider/locations",
  },
  post: {
    title: "Share your first post",
    desc: "Introduce your business to followers",
    to: "/provider/storefront",
  },
};

const CELEBRATED_KEY = (providerId) =>
  `pawpi:provider:gettingStartedCelebrated:${providerId}`;
const CELEBRATION_MS = 4000;

export default function GettingStartedChecklist({ providerId }) {
  const navigate = useNavigate();

  const { data: detail } = useProvider(providerId);
  const provider = detail?.provider;
  const capabilities = detail?.capabilities ?? [];
  const hasShop = capabilities.includes("shop");

  const { data: services = [] } = useProviderServices(providerId);
  // Products live behind the 'shop' capability server-side — only query when held (else 403 loop).
  const { data: products = [] } = useShopProducts(providerId, { enabled: hasShop });
  const { data: availability } = useAvailabilityWindows(providerId);
  const { data: locations = [] } = useProviderLocations(providerId);
  const { data: posts = [] } = useProviderPosts(providerId);

  const activation = computeProviderActivation({
    provider,
    services,
    products,
    windows: availability?.windows ?? [],
    locations,
    posts,
  });

  // Celebrate once per provider, then retire for good (localStorage-backed, like the mobile card).
  const [celebrated, setCelebrated] = useState(true); // assume until we read storage (no flash)
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || providerId == null) return;
    try {
      setCelebrated(window.localStorage.getItem(CELEBRATED_KEY(providerId)) === "1");
    } catch {
      setCelebrated(false);
    }
  }, [providerId]);

  const isComplete = activation.isComplete;
  useEffect(() => {
    if (!isComplete || celebrated || dismissed) return;
    try {
      window.localStorage.setItem(CELEBRATED_KEY(providerId), "1");
    } catch {
      /* ignore */
    }
    const timer = setTimeout(() => setDismissed(true), CELEBRATION_MS);
    return () => clearTimeout(timer);
  }, [isComplete, celebrated, dismissed, providerId]);

  // Nothing until the provider profile has loaded.
  if (!provider) return null;

  // Complete: show the celebration once, then retire.
  if (isComplete) {
    if (celebrated || dismissed) return null;
    return (
      <div
        data-testid="provider-getting-started-celebration"
        className="mb-6 flex flex-col items-center rounded-2xl border bg-white p-8 text-center"
        style={{ borderColor: COLORS.coral }}
      >
        <PawPrint className="h-9 w-9" style={{ color: COLORS.coral }} fill={COLORS.coral} />
        <p className="mt-2 text-lg font-bold text-[#3B241B]">You're all set! 🎉</p>
        <p className="mt-1 text-sm text-[#7A6254]">
          Your storefront has everything it needs to shine.
        </p>
      </div>
    );
  }

  return (
    <div
      data-testid="provider-getting-started"
      className="mb-6 rounded-2xl border border-[#FFD9B3] bg-white p-5"
    >
      <div className="flex items-center gap-4">
        {/* % badge — a coral ring with the percentage centered. */}
        <div
          data-testid="provider-getting-started-badge"
          className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full border-4"
          style={{ borderColor: COLORS.coral, backgroundColor: COLORS.coral + "14" }}
        >
          <span className="text-sm font-extrabold" style={{ color: COLORS.coral }}>
            {activation.percent}%
          </span>
        </div>
        <div>
          <h2 className="text-base font-bold text-[#3B241B]">Getting started</h2>
          <p className="text-sm text-[#7A6254]">
            {activation.completed} of {activation.total} done — finish setting up your storefront.
          </p>
        </div>
      </div>

      {/* Progress bar. */}
      <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-[#F8EBDD]">
        <div
          data-testid="provider-getting-started-fill"
          className="h-full rounded-full"
          style={{ width: `${activation.percent}%`, backgroundColor: COLORS.coral }}
        />
      </div>

      {/* Checklist rows. */}
      <ul className="mt-3">
        {activation.items.map((item) => {
          const meta = ITEM_META[item.key];
          return (
            <li key={item.key}>
              <button
                type="button"
                data-testid={`provider-gs-item-${item.key}`}
                onClick={() => navigate(meta.to)}
                className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-[#FFF7EF]"
              >
                <span
                  data-testid={`provider-gs-check-${item.key}${item.done ? "-done" : ""}`}
                  className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full"
                  style={
                    item.done
                      ? { backgroundColor: COLORS.coral }
                      : { border: `2px solid ${COLORS.peach}` }
                  }
                >
                  {item.done ? <Check className="h-3.5 w-3.5 text-white" /> : null}
                </span>
                <span className="flex-1">
                  <span
                    className={`block text-sm font-semibold ${
                      item.done ? "text-[#7A6254] line-through" : "text-[#3B241B]"
                    }`}
                  >
                    {meta.title}
                  </span>
                  {!item.done ? (
                    <span className="block text-xs text-[#7A6254]">{meta.desc}</span>
                  ) : null}
                </span>
                {!item.done ? (
                  <ChevronRight className="h-4 w-4 flex-shrink-0 text-[#B8A99D]" />
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
