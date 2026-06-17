import ProviderShell from "../components/ProviderShell";
import ProviderDaycare from "../components/ProviderDaycare";

// /provider/daycare — the Daycare & Boarding workspace (ticket 2.8). The shell resolves
// auth + the active provider context and hands the resolved providerId to the screen via a
// render-prop, so the workspace never renders without a valid provider.
export default function ProviderDaycarePage() {
  return (
    <ProviderShell active="daycare">
      {(providerId) => <ProviderDaycare providerId={providerId} />}
    </ProviderShell>
  );
}
