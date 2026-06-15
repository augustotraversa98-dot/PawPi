import ProviderShell from "../components/ProviderShell";
import ProviderStaff from "../components/ProviderStaff";

// /provider/staff — manage the provider's staff (c2c). The shell resolves auth +
// the active provider context and hands the resolved providerId to the screen, so
// the staff list never renders without a provider.
export default function ProviderStaffPage() {
  return (
    <ProviderShell active="staff">
      {(providerId) => <ProviderStaff providerId={providerId} />}
    </ProviderShell>
  );
}
