import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";

// /provider/payments/mercadopago/return — the OAuth REDIRECT TARGET for the MercadoPago
// marketplace connect flow (ACTION 2 §1). This is the single fixed URL registered with
// MercadoPago as the app's Redirect URL and set as MP_REDIRECT_URI on the web deploy.
//
// MercadoPago redirects the provider's browser here (a GET) with ?code=…&state=… after
// they authorize. The `state` is "<providerId>.<nonce>" (minted by the connect route), so
// we recover the provider id from it and POST { code, state } back to the per-provider
// callback route, which verifies state, exchanges the code for the provider's token, and
// stores it. The provider's session cookie rides the same-origin fetch, so the callback's
// auth() + owner|admin check pass. The token never touches this page.

const CARD =
  "w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-lg";
const WRAP =
  "flex min-h-screen w-full items-center justify-center bg-[#FFF7EF] p-4";
const CTA =
  "inline-block w-full rounded-xl bg-[#FF6F61] px-4 py-3.5 text-base font-bold text-white shadow-md transition-all hover:bg-[#E85D51]";

export default function MercadoPagoReturnPage() {
  const [searchParams] = useSearchParams();
  const code = searchParams.get("code") || "";
  const state = searchParams.get("state") || "";
  const providerId = state.split(".")[0] || "";

  // "working" | "success" | "error"
  const [status, setStatus] = useState("working");
  const [error, setError] = useState(null);

  useEffect(() => {
    // Guard against MercadoPago sending an error back (e.g. the user declined) or a
    // truncated/hand-typed link — post nothing we can't complete.
    if (!code || !providerId) {
      setStatus("error");
      setError(
        "This link is missing information from MercadoPago. Start the connection again from your dashboard.",
      );
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/providers/${providerId}/payment-accounts/mercadopago/callback`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code, state }),
          },
        );
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setStatus("error");
          setError(
            data.error ||
              "We couldn't finish connecting your MercadoPago account. Please try again.",
          );
          return;
        }
        setStatus("success");
      } catch {
        if (cancelled) return;
        setStatus("error");
        setError(
          "Couldn't reach the server. Check your connection and try again.",
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [code, state, providerId]);

  if (status === "working") {
    return (
      <div className={WRAP}>
        <div className={CARD}>
          <div className="mb-6 text-5xl">⏳</div>
          <h1 className="mb-4 text-2xl font-bold text-[#3B241B]">
            Connecting your MercadoPago account…
          </h1>
          <p className="text-[#7A6254]">This only takes a moment.</p>
        </div>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className={WRAP}>
        <div className={CARD}>
          <div className="mb-6 text-5xl">🎉</div>
          <h1 className="mb-4 text-2xl font-bold text-[#3B241B]">
            MercadoPago connected
          </h1>
          <p className="mb-8 text-[#7A6254]">
            You can now receive payments for your services and products.
          </p>
          <a href="/provider/sales" className={CTA}>
            Back to Sales
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className={WRAP}>
      <div className={CARD}>
        <div className="mb-6 text-5xl">⚠️</div>
        <h1 className="mb-4 text-2xl font-bold text-[#3B241B]">
          Couldn't connect MercadoPago
        </h1>
        <p className="mb-8 text-[#7A6254]">{error}</p>
        <a href="/provider/sales" className={CTA}>
          Back to Sales
        </a>
      </div>
    </div>
  );
}
