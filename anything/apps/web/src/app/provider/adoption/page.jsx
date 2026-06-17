import ProviderShell from "../components/ProviderShell";
import ProviderAdoption from "../components/ProviderAdoption";

// /provider/adoption — the Adoption workspace (ticket 2.12). The shell resolves auth + the
// active provider context and hands the resolved providerId to the screen via a render-prop, so
// the workspace never renders without a valid provider. Manage adoptable-dog listings +
// review applications; fees/donations + chat reuse the 2.3 / 2.5 layers.
export default function ProviderAdoptionPage() {
  return (
    <ProviderShell active="adoption">
      {(providerId) => <ProviderAdoption providerId={providerId} />}
    </ProviderShell>
  );
}
