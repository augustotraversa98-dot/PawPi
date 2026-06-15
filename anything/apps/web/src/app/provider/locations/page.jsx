import ProviderShell from "../components/ProviderShell";
import ProviderLocations from "../components/ProviderLocations";

// /provider/locations — manage the provider's locations (c2b). The shell
// resolves auth + the active provider context and hands the resolved providerId
// to the screen, so the locations list never renders without a provider.
export default function ProviderLocationsPage() {
  return (
    <ProviderShell active="locations">
      {(providerId) => <ProviderLocations providerId={providerId} />}
    </ProviderShell>
  );
}
