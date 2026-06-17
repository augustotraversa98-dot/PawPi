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
} from "lucide-react";
import useUser from "@/utils/useUser";
import { getProviderQueryClient } from "../lib/queryClient";
import { COLORS } from "../lib/colors";
import { useProviders, useMyProviderInvites } from "../hooks/useProviders";
import { useProviderSelection } from "../store/providerSelection";
import CreateProviderForm from "./CreateProviderForm";

// Dashboard sections. Bookings (c1), Profile (c2a), Services + Locations (c2b),
// Staff (c2c), Clinical (c3), Chats (2.5) are wired and navigate to their routes;
// the rest are clearly-disabled "coming soon" stubs (Sales → a future layer with no
// backend yet). They never dead-end.
const NAV_ITEMS = [
  {
    key: "bookings",
    label: "Bookings",
    Icon: CalendarCheck,
    enabled: true,
    href: "/provider/bookings",
  },
  {
    key: "profile",
    label: "Profile",
    Icon: Building2,
    enabled: true,
    href: "/provider/profile",
  },
  {
    key: "services",
    label: "Services",
    Icon: Tag,
    enabled: true,
    href: "/provider/services",
  },
  {
    key: "locations",
    label: "Locations",
    Icon: MapPin,
    enabled: true,
    href: "/provider/locations",
  },
  {
    key: "staff",
    label: "Staff",
    Icon: Users,
    enabled: true,
    href: "/provider/staff",
  },
  {
    key: "clinical",
    label: "Clinical",
    Icon: Stethoscope,
    enabled: true,
    href: "/provider/clinical",
  },
  {
    key: "chats",
    label: "Chats",
    Icon: MessageSquare,
    enabled: true,
    href: "/provider/chats",
  },
  {
    key: "daycare",
    label: "Daycare",
    Icon: Home,
    enabled: true,
    href: "/provider/daycare",
  },
  {
    key: "training",
    label: "Training",
    Icon: GraduationCap,
    enabled: true,
    href: "/provider/training",
  },
  { key: "sales", label: "Sales", Icon: DollarSign, enabled: false },
];

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

function Sidebar({ active, providers, activeProviderId, onSelect }) {
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
        {NAV_ITEMS.map(({ key, label, Icon, enabled, href }) => {
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
          // Enabled items are real links to their route; disabled stubs stay
          // inert divs so they never dead-end.
          return enabled ? (
            <Link
              key={key}
              to={href}
              aria-current={isActive ? "page" : undefined}
              className={className}
              style={style}
            >
              {inner}
            </Link>
          ) : (
            <div key={key} aria-disabled className={className}>
              {inner}
            </div>
          );
        })}
      </nav>
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
