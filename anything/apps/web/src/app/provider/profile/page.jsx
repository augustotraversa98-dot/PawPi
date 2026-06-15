import ProviderShell from "../components/ProviderShell";
import ProviderProfile from "../components/ProviderProfile";

// /provider/profile — the provider profile editor + publish toggle (c2a). The
// shell resolves auth + the active provider context and hands the resolved
// providerId to the screen, so the profile never renders without a provider.
export default function ProviderProfilePage() {
  return (
    <ProviderShell active="profile">
      {(providerId) => <ProviderProfile providerId={providerId} />}
    </ProviderShell>
  );
}
