import ProviderShell from "./components/ProviderShell";
import ProviderDashboard from "./components/ProviderDashboard";

// /provider — the provider dashboard HOME (Phase 2 ticket 2.14). The at-a-glance business
// overview: revenue, bookings, occupancy, rating, top services — recharts visuals, all scoped to
// the active provider's own data. The shell resolves auth + the active provider and hands the
// resolved providerId to the dashboard via a render-prop. (Was a redirect to /provider/bookings;
// the dashboard now links INTO bookings and the other sections rather than dead-ending there.)
export default function ProviderIndexPage() {
  return (
    <ProviderShell active="dashboard">
      {(providerId) => <ProviderDashboard providerId={providerId} />}
    </ProviderShell>
  );
}
