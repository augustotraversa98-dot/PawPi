import { useState } from "react";
import { CreditCard, CheckCircle2, Loader2 } from "lucide-react";
import {
  usePaymentAccounts,
  useDisconnectMercadoPago,
} from "../hooks/useProviders";
import { COLORS } from "../lib/colors";
import salesCopy from "../i18n/sales";
import { useProviderCopy } from "../i18n/lib/useProviderCopy";
import { fill } from "../i18n/lib/format";
import { serverErrorMessage } from "../i18n/lib/serverError";

// Payment-account connection card for the Sales dashboard (ACTION 2 §1). Shows whether the
// provider has linked their own MercadoPago account and starts the OAuth connect flow. PawPi
// charges each payment THROUGH the provider's connected account, so until this is connected
// checkout stays "payments not configured" for this provider.
//
// The connect button asks the backend for the authorization URL (GET .../mercadopago/connect,
// which mints the state + returns authUrl) and sends the browser there. MercadoPago redirects
// back to the fixed return page (/provider/payments/mercadopago/return), which completes it.
export default function PaymentAccountCard({ providerId }) {
  const { t, lang } = useProviderCopy(salesCopy);
  const { data, isLoading } = usePaymentAccounts(providerId);
  const mp = data?.accounts?.mercadopago ?? null;
  const connected = mp?.connected === true;

  const [connecting, setConnecting] = useState(false);
  // { message?: the server's text, key: our own text in salesCopy.account }
  const [error, setError] = useState(null);
  const disconnect = useDisconnectMercadoPago(providerId);
  const errorText =
    error &&
    serverErrorMessage(error.message, lang, t.account[error.key], salesCopy);

  const startDisconnect = async () => {
    setError(null);
    if (
      typeof window !== "undefined" &&
      !window.confirm(t.account.confirmDisconnect)
    ) {
      return;
    }
    try {
      await disconnect.mutateAsync();
    } catch (e) {
      setError({ message: e?.message, key: "disconnectFailed" });
    }
  };

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
            ? { key: "notSetUp" }
            : { message: body.error, key: "connectFailed" },
        );
        return;
      }
      // Hand off to MercadoPago; it redirects back to the return page.
      window.location.href = body.authUrl;
    } catch {
      setConnecting(false);
      setError({ key: "unreachable" });
    }
  };

  return (
    <div className="mb-6 rounded-2xl border border-[#FFD9B3] bg-white p-5">
      <div className="mb-3 flex items-center gap-2">
        <CreditCard className="h-5 w-5" style={{ color: COLORS.coral }} />
        <h2 className="text-base font-bold text-[#3B241B]">{t.account.title}</h2>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-[#7A6254]">
          <Loader2 className="h-4 w-4 animate-spin" /> {t.account.checking}
        </div>
      ) : connected ? (
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-[#2E8F62]">
            <CheckCircle2 className="h-5 w-5" />
            {t.account.connected}
            {mp?.account_ref ? (
              <span className="font-normal text-[#7A6254]">
                {fill(t.account.accountRef, { ref: mp.account_ref })}
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-xs text-[#7A6254]">{t.account.reconnectHint}</p>
          <button
            type="button"
            onClick={startDisconnect}
            disabled={disconnect.isPending}
            className="mt-3 inline-flex items-center gap-2 rounded-xl border border-[#E4D3C6] bg-white px-4 py-2 text-sm font-semibold text-[#7A6254] transition-all hover:bg-[#FFF6EE] disabled:opacity-50"
          >
            {disconnect.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />{" "}
                {t.account.disconnecting}
              </>
            ) : (
              t.account.disconnect
            )}
          </button>
          {error ? (
            <p className="mt-3 text-sm text-red-600">{errorText}</p>
          ) : null}
        </div>
      ) : (
        <div>
          <p className="mb-3 text-sm text-[#7A6254]">{t.account.intro}</p>
          <button
            type="button"
            onClick={startConnect}
            disabled={connecting}
            className="inline-flex items-center gap-2 rounded-xl bg-[#FF6F61] px-4 py-2.5 text-sm font-bold text-white shadow-md transition-all hover:bg-[#E85D51] disabled:opacity-50"
          >
            {connecting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />{" "}
                {t.account.redirecting}
              </>
            ) : (
              t.account.connect
            )}
          </button>
          {error ? (
            <p className="mt-3 text-sm text-red-600">{errorText}</p>
          ) : null}
        </div>
      )}
    </div>
  );
}
