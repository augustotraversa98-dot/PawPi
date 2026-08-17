import { useEffect, useMemo } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { useNavigate, Link } from "react-router";
import {
  CalendarCheck,
  Building2,
  Tag,
  MapPin,
  Users,
  Stethoscope,
  DollarSign,
  MessageSquare,
  ChevronDown,
  PawPrint,
  Loader2,
  MailCheck,
  Home,
  GraduationCap,
  ShoppingBag,
  LayoutDashboard,
  Store,
  CalendarDays,
  CalendarClock,
  Pill,
  Shield,
  ShieldAlert,
} from "lucide-react";
import useUser from "@/utils/useUser";
import { getProviderQueryClient } from "../lib/queryClient";
import { COLORS } from "../lib/colors";
import {
  useProviders,
  useMyProviderInvites,
  useAdminModerationSummary,
} from "../hooks/useProviders";
import { useProviderSelection } from "../store/providerSelection";
import { BOOKABLE_CAPS } from "../lib/storefrontTabs";
import CreateProviderForm from "./CreateProviderForm";

// Dashboard sections. Bookings (c1), Profile (c2a), Services + Locations (c2b),
// Staff (c2c), Clinical (c3), Chats (2.5), Sales (2.69) are wired and navigate to
// their routes. Any remaining disabled entries are clearly-marked "coming soon"
// stubs and never dead-end.
//
// `group` is a purely presentational bucket (Phase 1 nav grouping): the sidebar
// renders items in array order, inserting a small header whenever the group
// changes. `null` = the headerless top group. NAV_ITEMS is ordered to match the
// grouped render (top → Schedule → Store → Care → Business); nothing is hidden.
const NAV_ITEMS = [
  {
    key: "dashboard",
    label: "Dashboard",
    Icon: LayoutDashboard,
    enabled: true,
    href: "/provider",
    group: null,
  },
  {
    key: "chats",
    label: "Chats",
    Icon: MessageSquare,
    enabled: true,
    href: "/provider/chats",
    group: null,
  },
  {
    key: "bookings",
    label: "Bookings",
    Icon: CalendarCheck,
    enabled: true,
    href: "/provider/bookings",
    group: "Schedule",
  },
  {
    key: "calendar",
    label: "Calendar",
    Icon: CalendarDays,
    enabled: true,
    href: "/provider/calendar",
    group: "Schedule",
  },
  {
    key: "calendar-import",
    label: "Calendar import",
    Icon: CalendarClock,
    enabled: true,
    href: "/provider/calendar-import",
    group: "Schedule",
  },
  {
    key: "storefront",
    label: "Storefront",
    Icon: Store,
    enabled: true,
    href: "/provider/storefront",
    group: "Store",
  },
  {
    key: "services",
    label: "Services",
    Icon: Tag,
    enabled: true,
    href: "/provider/services",
    group: "Store",
  },
  {
    key: "shop",
    label: "Products",
    Icon: ShoppingBag,
    enabled: true,
    href: "/provider/shop",
    group: "Store",
  },
  {
    key: "locations",
    label: "Locations",
    Icon: MapPin,
    enabled: true,
    href: "/provider/locations",
    group: "Store",
  },
  {
    key: "clinical",
    label: "Clinical",
    Icon: Stethoscope,
    enabled: true,
    href: "/provider/clinical",
    group: "Care",
  },
  {
    key: "daycare",
    label: "Daycare",
    Icon: Home,
    enabled: true,
    href: "/provider/daycare",
    group: "Care",
  },
  {
    key: "training",
    label: "Training",
    Icon: GraduationCap,
    enabled: true,
    href: "/provider/training",
    group: "Care",
  },
  {
    key: "adoption",
    label: "Adoption",
    Icon: PawPrint,
    enabled: true,
    href: "/provider/adoption",
    group: "Care",
  },
  {
    key: "pharmacy",
    label: "Rx Fulfillment",
    Icon: Pill,
    enabled: true,
    href: "/provider/pharmacy",
    group: "Care",
  },
  {
    key: "insurance",
    label: "Policies",
    Icon: Shield,
    enabled: true,
    href: "/provider/insurance",
    group: "Care",
  },
  {
    key: "profile",
    label: "Profile",
    Icon: Building2,
    enabled: true,
    href: "/provider/profile",
    group: "Business",
  },
  {
    key: "staff",
    label: "Staff",
    Icon: Users,
    enabled: true,
    href: "/provider/staff",
    group: "Business",
  },
  {
    key: "sales",
    label: "Sales",
    Icon: DollarSign,
    enabled: true,
    href: "/provider/sales",
    group: "Business",
  },
];

// Phase 2 — which capability (if any) unlocks each nav section. Any key NOT listed
// here is ALWAYS shown (Dashboard, Profile, Storefront, Chats, Sales, Staff). The
// value "bookable" means "any BOOKABLE_CAPS capability"; any other value is a single
// required capability. This only controls what the sidebar shows BY DEFAULT — the
// per-module server capability guards remain the real enforcement, and every route
// still renders (a hidden module's page shows its own "doesn't offer this" CTA).
const NAV_REQUIRES = {
  bookings: "bookable",
  calendar: "bookable",
  "calendar-import": "bookable",
  services: "bookable",
  locations: "bookable",
  shop: "shop",
  clinical: "vet",
  daycare: "daycare",
  training: "trainer",
  adoption: "adoption",
  pharmacy: "pharmacy",
  insurance: "insurance",
};

// Is a nav item visible for a provider holding `capabilities`? A capability-gated
// section shows ONLY when the provider holds its capability (driven by the offerings
// selected on the Business Profile); a structural section (no NAV_REQUIRES entry)
// always shows. There is no override — an unselected offering is never listed.
function navItemVisible(item, capabilities) {
  const req = NAV_REQUIRES[item.key];
  if (!req) return true; // always-on structural section
  if (req === "bookable") {
    return capabilities.some((c) => BOOKABLE_CAPS.includes(c));
  }
  return capabilities.includes(req); // a single required capability
}

function FullScreen({ children }) {
  return (
    <div
      className="flex min-h-screen w-full items-center justify-center p-6"
      style={{ backgroundColor: COLORS.cream }}
    >
      {children}
    </div>
  );
}

function Spinner({ label }) {
  return (
    <FullScreen>
      <div className="flex flex-col items-center gap-3 text-[#3B241B]">
        <Loader2 className="h-7 w-7 animate-spin" style={{ color: COLORS.coral }} />
        <p className="text-sm text-[#7A6254]">{label}</p>
      </div>
    </FullScreen>
  );
}

function ProviderSwitcher({ providers, activeProviderId, onSelect }) {
  if (providers.length <= 1) {
    const only = providers[0];
    return (
      <div className="px-4 py-3">
        <p className="truncate text-base font-bold text-[#3B241B]">
          {only?.name}
        </p>
        <p className="truncate text-xs text-[#7A6254] capitalize">
          {only?.provider_type}
        </p>
      </div>
    );
  }
  return (
    <div className="px-4 py-3">
      <label className="mb-1 block text-xs font-semibold text-[#7A6254]">
        Provider
      </label>
      <div className="relative">
        <select
          aria-label="Select provider"
          value={String(activeProviderId)}
          onChange={(e) => onSelect(e.target.value)}
          className="w-full appearance-none rounded-xl border-2 border-[#FFD9B3] bg-[#FFF7EF] px-3 py-2 pr-8 text-sm font-semibold text-[#3B241B] outline-none focus:border-[#FF6F61]"
        >
          {providers.map((p) => (
            <option key={p.id} value={String(p.id)}>
              {p.name}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7A6254]" />
      </div>
    </div>
  );
}

// One nav row — an enabled item is a real Link to its route; a disabled stub
// stays an inert div so it never dead-ends. Extracted so the grouped render
// stays readable. The active-key highlight + "Soon" pill are unchanged.
function NavItem({ item, active }) {
  const { key, label, Icon, enabled, href } = item;
  const isActive = enabled && key === active;
  const className = `flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-semibold ${
    isActive
      ? "text-white"
      : enabled
        ? "text-[#3B241B] hover:bg-[#FFF7EF]"
        : "cursor-not-allowed text-[#B8A99D]"
  }`;
  const style = isActive ? { backgroundColor: COLORS.coral } : undefined;
  const inner = (
    <>
      <span className="flex items-center gap-3">
        <Icon className="h-4 w-4" />
        {label}
      </span>
      {!enabled && (
        <span className="rounded-full bg-[#FFF1E2] px-2 py-0.5 text-[10px] font-semibold text-[#B8A99D]">
          Soon
        </span>
      )}
    </>
  );
  return enabled ? (
    <Link
      to={href}
      aria-current={isActive ? "page" : undefined}
      className={className}
      style={style}
    >
      {inner}
    </Link>
  ) : (
    <div aria-disabled className={className}>
      {inner}
    </div>
  );
}

// Admin-only moderation entry point in the sidebar (MOD2 PR2). Renders NOTHING unless the
// capability probe (GET /api/admin/moderation-summary) confirms app_is_admin() — a non-admin never
// sees it, so no data or even the link leaks. Carries the open-report count as a badge. It is a
// cross-area route (/admin has its own page), reached via the app's single React Router.
function AdminModerationNav() {
  const { data } = useAdminModerationSummary();
  if (!data?.is_admin) return null;
  const open = Number(data.open_count) || 0;
  return (
    <div className="border-t border-[#FFF1E2] px-3 py-4">
      <p className="px-3 pb-1 text-[11px] font-bold uppercase tracking-wide text-[#B8A99D]">
        Admin
      </p>
      <Link
        to="/admin/moderation"
        className="flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-semibold text-[#3B241B] hover:bg-[#FFF7EF]"
      >
        <span className="flex items-center gap-3">
          <ShieldAlert className="h-4 w-4" />
          Moderation
        </span>
        {open > 0 && (
          <span
            aria-label={`${open} open reports`}
            className="rounded-full px-2 py-0.5 text-[11px] font-bold text-white"
            style={{ backgroundColor: COLORS.coral }}
          >
            {open}
          </span>
        )}
      </Link>
    </div>
  );
}

// The same admin entry point for a no-provider admin (MOD2 PR2) — a prominent card ABOVE the
// create-your-provider onboarding, so an admin who signs in (web callbackUrl=/provider) is NOT
// forced through "pick a type of business" to reach the console. Non-admins never see it.
function AdminModerationBanner() {
  const { data } = useAdminModerationSummary();
  if (!data?.is_admin) return null;
  const open = Number(data.open_count) || 0;
  return (
    <div className="flex justify-center px-6 pt-6">
      <Link
        to="/admin/moderation"
        className="flex w-full max-w-lg items-center gap-3 rounded-2xl border border-[#FFD9B3] bg-white px-5 py-4 shadow-sm transition-colors hover:bg-[#FFFBF6]"
      >
        <div
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
          style={{ backgroundColor: COLORS.peach }}
        >
          <ShieldAlert className="h-5 w-5" style={{ color: COLORS.terracotta }} />
        </div>
        <div className="flex-1">
          <p className="font-semibold text-[#3B241B]">
            You're an admin{open > 0 ? ` — ${open} open report${open === 1 ? "" : "s"}` : ""}
          </p>
          <p className="text-sm text-[#7A6254]">
            Open the Moderation console — you don't need to set up a business.
          </p>
        </div>
        <span
          className="rounded-xl px-3 py-2 text-sm font-bold text-white"
          style={{ backgroundColor: COLORS.coral }}
        >
          Open
        </span>
      </Link>
    </div>
  );
}

function Sidebar({ active, providers, activeProviderId, onSelect, capabilities }) {
  // The left nav lists ONLY the sections this business offers: a capability-gated
  // section shows when its offering is selected on the Business Profile, structural
  // sections always show, and there is no "reveal everything" override. Filter first,
  // then render — group headers key off the FILTERED list, so a group with no visible
  // items drops its header automatically. The currently-active section is never hidden
  // (e.g. a deep link into a not-yet-enabled module still highlights its nav row
  // instead of vanishing).
  const items = NAV_ITEMS.filter(
    (item) => navItemVisible(item, capabilities) || item.key === active,
  );

  return (
    <aside className="flex w-64 flex-shrink-0 flex-col border-r border-[#FFD9B3] bg-white">
      <div className="flex items-center gap-2 px-5 py-5">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-xl"
          style={{ backgroundColor: COLORS.peach }}
        >
          <PawPrint className="h-5 w-5" style={{ color: COLORS.terracotta }} />
        </div>
        <span className="text-lg font-bold text-[#3B241B]">PawPi Provider</span>
      </div>

      <div className="border-y border-[#FFF1E2]">
        <ProviderSwitcher
          providers={providers}
          activeProviderId={activeProviderId}
          onSelect={onSelect}
        />
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {items.map((item, i) => {
          // Insert a small group header whenever the group changes (skipping the
          // headerless top group). Items are already in grouped order, so a
          // simple "differs from the previous item" check is enough.
          const showHeader = item.group && item.group !== items[i - 1]?.group;
          return (
            <div key={item.key}>
              {showHeader && (
                <p className="px-3 pb-1 pt-4 text-[11px] font-bold uppercase tracking-wide text-[#B8A99D]">
                  {item.group}
                </p>
              )}
              <NavItem item={item} active={active} />
            </div>
          );
        })}
      </nav>

      {/* Admin-only moderation entry point (hidden for everyone else). */}
      <AdminModerationNav />
    </aside>
  );
}

// Shown when the user is active staff of no provider. The create-your-provider
// onboarding is always offered; if they ALSO have ≥1 pending invitation, a banner
// points them to the accept surface — this is how an invited (not-yet-active) user
// discovers their invites, since they don't appear in the active-only providers
// list. Invites load quietly; the banner only appears once ≥1 is known.
function NoProviderState() {
  const { data: invites } = useMyProviderInvites();
  const count = invites?.length ?? 0;

  return (
    <div className="min-h-screen w-full" style={{ backgroundColor: COLORS.cream }}>
      {/* Admin? Offer the console prominently — never force an admin through business setup. */}
      <AdminModerationBanner />
      {count > 0 && (
        <div className="flex justify-center px-6 pt-6">
          <Link
            to="/provider/invites"
            className="flex w-full max-w-lg items-center gap-3 rounded-2xl border border-[#FFD9B3] bg-white px-5 py-4 shadow-sm transition-colors hover:bg-[#FFFBF6]"
          >
            <div
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
              style={{ backgroundColor: COLORS.peach }}
            >
              <MailCheck className="h-5 w-5" style={{ color: COLORS.terracotta }} />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-[#3B241B]">
                You have {count} pending invitation{count === 1 ? "" : "s"}
              </p>
              <p className="text-sm text-[#7A6254]">
                Review and accept to join a provider's team.
              </p>
            </div>
            <span
              className="rounded-xl px-3 py-2 text-sm font-bold text-white"
              style={{ backgroundColor: COLORS.coral }}
            >
              View
            </span>
          </Link>
        </div>
      )}
      <CreateProviderForm />
    </div>
  );
}

// Inner shell — runs INSIDE the QueryClientProvider so it can read useProviders.
function ProviderShellInner({ active, children }) {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useUser();
  const { selectedProviderId, setSelectedProviderId } = useProviderSelection();
  const {
    data: providers,
    isLoading: providersLoading,
    isError,
    error,
  } = useProviders();

  // Auth gate: no session → bounce to sign-in (client-side; provider pages only
  // render after ClientOnly mounts, so window/navigate are available).
  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/account/signin");
    }
  }, [authLoading, user, navigate]);

  // Resolve the active provider: honor a valid persisted selection, else default
  // to the first. A stale id (removed staff) silently falls back to the first.
  const activeProviderId = useMemo(() => {
    const list = providers ?? [];
    if (list.length === 0) return null;
    const found = list.find((p) => String(p.id) === String(selectedProviderId));
    return found ? found.id : list[0].id;
  }, [providers, selectedProviderId]);

  if (authLoading || (user && providersLoading)) {
    return <Spinner label="Loading your dashboard…" />;
  }
  if (!user) {
    return <Spinner label="Redirecting to sign in…" />;
  }
  if (isError) {
    return (
      <FullScreen>
        <div className="w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-lg">
          <h1 className="mb-2 text-xl font-bold text-[#3B241B]">
            Couldn't load your providers
          </h1>
          <p className="text-sm text-[#7A6254]">
            {error?.message || "Please try again in a moment."}
          </p>
        </div>
      </FullScreen>
    );
  }
  if (!providers || providers.length === 0) {
    return <NoProviderState />;
  }

  const content =
    typeof children === "function" ? children(activeProviderId) : children;

  // The active provider's capabilities drive which nav sections show by default.
  const activeProvider = providers.find((p) => p.id === activeProviderId);
  const capabilities = activeProvider?.capabilities ?? [];

  return (
    <div
      className="flex min-h-screen w-full"
      style={{ backgroundColor: COLORS.cream }}
    >
      <Sidebar
        active={active}
        providers={providers}
        activeProviderId={activeProviderId}
        onSelect={setSelectedProviderId}
        capabilities={capabilities}
      />
      <main className="flex-1 overflow-x-auto">{content}</main>
    </div>
  );
}

// Public entry. Wraps the provider area's own QueryClientProvider (the app root
// has none) and renders the shell. `children` may be a render-prop receiving the
// resolved active providerId, or plain nodes.
export default function ProviderShell({ active, children }) {
  return (
    <QueryClientProvider client={getProviderQueryClient()}>
      <ProviderShellInner active={active}>{children}</ProviderShellInner>
    </QueryClientProvider>
  );
}

export { NAV_ITEMS };
