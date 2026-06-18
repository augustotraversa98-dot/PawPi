import ProviderShell from "../components/ProviderShell";
import PharmacyQueue from "../components/PharmacyQueue";

// /provider/pharmacy — the Rx Fulfillment queue (Wave 7 ticket 2.71). The shell resolves auth + the
// active provider and hands the providerId to the queue (capability-gated server-side to `pharmacy`).
export default function ProviderPharmacyPage() {
  return (
    <ProviderShell active="pharmacy">
      {(providerId) => <PharmacyQueue providerId={providerId} />}
    </ProviderShell>
  );
}
