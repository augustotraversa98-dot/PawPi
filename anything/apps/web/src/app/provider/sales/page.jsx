import ProviderShell from "../components/ProviderShell";
import ProviderSales from "../components/ProviderSales";

// /provider/sales — the Sales / payouts / reconciliation section (Wave 7 ticket 2.69). The shell
// resolves auth + the active provider and hands the providerId to the read-only Sales view, so it
// never renders without a provider.
export default function ProviderSalesPage() {
  return (
    <ProviderShell active="sales">
      {(providerId) => <ProviderSales providerId={providerId} />}
    </ProviderShell>
  );
}
