import ProviderShell from "../components/ProviderShell";
import ProviderCalendarFeeds from "../components/ProviderCalendarFeeds";

// /provider/calendar-import — manage external iCal/ICS feeds that block PawPi availability
// (ticket 2.84). The shell resolves auth + the active provider and hands the providerId down.
export default function ProviderCalendarImportPage() {
  return (
    <ProviderShell active="calendar-import">
      {(providerId) => <ProviderCalendarFeeds providerId={providerId} />}
    </ProviderShell>
  );
}
