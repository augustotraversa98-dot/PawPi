import ProviderShell from "../components/ProviderShell";
import ProviderAvailability from "../components/ProviderAvailability";

// /provider/availability — set the working hours, slot length, and time zone that feed the
// slot engine (replacing the seeded Mon–Fri 09:00–18:00 defaults). The shell resolves auth +
// the active provider context and hands the resolved providerId to the screen.
export default function ProviderAvailabilityPage() {
  return (
    <ProviderShell active="availability">
      {(providerId) => <ProviderAvailability providerId={providerId} />}
    </ProviderShell>
  );
}
