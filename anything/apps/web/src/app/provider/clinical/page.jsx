import ProviderShell from "../components/ProviderShell";
import ProviderClinical from "../components/ProviderClinical";

// /provider/clinical — the clinical index (c3): the distinct pets the provider
// sees through bookings, each linking into its consent-gated record. Surfaces no
// medical data itself. The shell hands the resolved providerId to the screen.
export default function ProviderClinicalPage() {
  return (
    <ProviderShell active="clinical">
      {(providerId) => <ProviderClinical providerId={providerId} />}
    </ProviderShell>
  );
}
