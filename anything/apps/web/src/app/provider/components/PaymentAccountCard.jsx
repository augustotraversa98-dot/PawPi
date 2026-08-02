import { useState } from "react";
import { CreditCard, CheckCircle2, Loader2 } from "lucide-react";
import { usePaymentAccounts } from "../hooks/useProviders";
import { COLORS } from "../lib/colors";

// Payment-account connection card for the Sales dashboard (ACTION 2 §1). Shows whether the
// provider has linked their own MercadoPago account and starts the OAuth connect flow. PawPi
// charges each payment THROUGH the provider's connected account, so until this is connected
// checkout stays "payments not configured" for this provider.
//
// The connect button asks the backend for the authorization URL (GET .../mercadopago/connect,
// which mints the state + returns authUrl) and sends the browser there. MercadoPago redirects
// back to the fixed return page (/provider/payments/mercadopago/return), which completes it.
export default function PaymentAccountCard({ providerId }) {
  const { data, isLoading } = usePaymentAccounts(providerId);
  const mp = data?.accounts?.mercadopago ?? null;
  const connected = mp?.connected === true;

  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState(null);

  const startConnect = async () => {
    setError(null);
    setConnecting(true);
    try {
      const res = await fetch(
        `/api/providers/${providerId}/payment-accounts/mercadopago/connect`,
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.authUrl) {
        setConnecting(false);
        setError(
          res.status === 503
            ? "Payments aren't set up on PawPi yet. Please try again later."
            : body.error || "Couldn't start the connection. Please try again.",
        );
        return;
      }
      // Hand off to MercadoPago; it redirects back to the return page.
      window.location.href = body.authUrl;
    } catch {
      setConnecting(false);
      setError("Couldn't reach the server. Check your connection and try again.");
    }
  };

  return (
    <div className="mb-6 rounded-2xl border border-[#FFD9B3] bg-white p-5">
      <div className="mb-3 flex items-center gap-2">
        <CreditCard className="h-5 w-5" style={{ color: COLORS.coral }} />
        <h2 className="text-base font-bold text-[#3B241B]">Payment account</h2>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-[#7A6254]">
          <Loader2 className="h-4 w-4 animate-spin" /> Checking connection…
        </div>
      ) : connected ? (
        <div className="flex items-center gap-2 text-sm font-semibold text-[#2E8F62]">
          <CheckCircle2 className="h-5 w-5" />
          MercadoPago connected
          {mp?.account_ref ? (
            <span className="font-normal text-[#7A6254]">
              (account {mp.account_ref})
            </span>
          ) : null}
        </div>
      ) : (
        <div>
          <p className="mb-3 text-sm text-[#7A6254]">
            Connect your MercadoPago account to start receiving payments for your
            services and products.
          </p>
          <button
            type="button"
            onClick={startConnect}
            disabled={connecting}
            className="inline-flex items-center gap-2 rounded-xl bg-[#FF6F61] px-4 py-2.5 text-sm font-bold text-white shadow-md transition-all hover:bg-[#E85D51] disabled:opacity-50"
          >
            {connecting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Redirecting…
              </>
            ) : (
              "Connect MercadoPago"
            )}
          </button>
          {error ? (
            <p className="mt-3 text-sm text-red-600">{error}</p>
          ) : null}
        </div>
      )}
    </div>
  );
}
