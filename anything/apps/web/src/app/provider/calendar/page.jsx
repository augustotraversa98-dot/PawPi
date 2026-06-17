import ProviderShell from "../components/ProviderShell";
import ProviderCalendar from "../components/ProviderCalendar";

// /provider/calendar — the week/day bookings calendar (ticket 2.24), the provider's
// primary daily screen. The shell resolves auth + the active provider and hands the
// providerId to the grid, so it never renders without a provider.
export default function ProviderCalendarPage() {
  return (
    <ProviderShell active="calendar">
      {(providerId) => <ProviderCalendar providerId={providerId} />}
    </ProviderShell>
  );
}
