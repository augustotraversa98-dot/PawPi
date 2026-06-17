import ProviderShell from "../components/ProviderShell";
import ProviderStorefront from "../components/ProviderStorefront";

// /provider/storefront — compose the public storefront (cover + posts) (ticket 2.22).
// The shell resolves auth + the active provider context and hands the resolved
// providerId to the screen.
export default function ProviderStorefrontPage() {
  return (
    <ProviderShell active="storefront">
      {(providerId) => <ProviderStorefront providerId={providerId} />}
    </ProviderShell>
  );
}
