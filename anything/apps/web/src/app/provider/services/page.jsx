import ProviderShell from "../components/ProviderShell";
import ProviderServices from "../components/ProviderServices";

// /provider/services — manage the provider's services (c2b). The shell resolves
// auth + the active provider context and hands the resolved providerId to the
// screen, so the services list never renders without a provider.
export default function ProviderServicesPage() {
  return (
    <ProviderShell active="services">
      {(providerId) => <ProviderServices providerId={providerId} />}
    </ProviderShell>
  );
}
