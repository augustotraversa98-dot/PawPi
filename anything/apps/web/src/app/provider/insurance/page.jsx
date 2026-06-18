import ProviderShell from "../components/ProviderShell";
import InsurancePolicies from "../components/InsurancePolicies";

// /provider/insurance — the insurer's Policies view (Wave 7 ticket 2.72). Capability-gated server-
// side to `insurance`; the shell resolves the active provider and hands it the providerId.
export default function ProviderInsurancePage() {
  return (
    <ProviderShell active="insurance">
      {(providerId) => <InsurancePolicies providerId={providerId} />}
    </ProviderShell>
  );
}
