import { useMemo } from "react";
import { useMyProviders } from "@/hooks/useProviders";
import useActiveProviderStore from "@/store/activeProviderStore";

// Business mode v2: the single source of truth for WHICH business is active across all four
// business tabs (Today/Bookings/Messages/Profile). Resolves the persisted activeProviderId
// against the fetched providers list, falling back to the first provider when the stored id is
// stale/absent — the exact resolver the Today header uses. Because every tab reads THIS hook, the
// provider switcher (which writes activeProviderId) makes all tabs follow in lockstep.
export function useActiveProvider() {
  const { data: providers = [], isLoading } = useMyProviders();
  const activeProviderId = useActiveProviderStore((s) => s.activeProviderId);

  const activeProvider = useMemo(() => {
    if (providers.length === 0) return null;
    const found = providers.find((p) => String(p.id) === String(activeProviderId));
    return found ?? providers[0];
  }, [providers, activeProviderId]);

  return { activeProvider, providers, isLoading };
}

export default useActiveProvider;
