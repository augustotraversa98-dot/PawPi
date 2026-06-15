import ProviderShell from "../components/ProviderShell";
import BookingsInbox from "../components/BookingsInbox";

// /provider/bookings — the bookings inbox. The shell resolves auth + the active
// provider context and hands the resolved providerId to the screen via a
// render-prop, so the inbox never renders without a valid provider.
export default function ProviderBookingsPage() {
  return (
    <ProviderShell active="bookings">
      {(providerId) => <BookingsInbox providerId={providerId} />}
    </ProviderShell>
  );
}
