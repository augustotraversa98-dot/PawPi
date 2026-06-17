import ProviderShell from "../components/ProviderShell";
import ProviderShop from "../components/ProviderShop";

// /provider/shop — the Shop workspace (ticket 2.11). The shell resolves auth + the active
// provider context and hands the resolved providerId to the screen via a render-prop, so the
// workspace never renders without a valid provider. Catalog/inventory + order fulfillment;
// orders + payments reuse the 2.3 layer.
export default function ProviderShopPage() {
  return (
    <ProviderShell active="shop">
      {(providerId) => <ProviderShop providerId={providerId} />}
    </ProviderShell>
  );
}
