import { useEffect, useState } from "react";
import useAuth from "@/utils/useAuth";

// Env-gated social sign-in buttons (ticket 2.46). Renders "Continue with Google/Apple" ONLY
// for providers the server actually configured — discovered from Auth.js's own
// /api/auth/providers endpoint, which lists a provider only when its env keys are present.
// With no keys configured, the original disabled "Coming soon" placeholders are shown, so
// the page looks exactly as it did before — no behavior change, no lock-out risk.
//
// callbackUrl: the mobile auth webview passes its own ?callbackUrl=, which useAuth's
// signInWith* already lets win; we default to "/provider" for standalone web.

export default function SocialSignInButtons({ callbackUrl = "/provider" }) {
  const { signInWithGoogle, signInWithApple } = useAuth();
  const [enabled, setEnabled] = useState({ google: false, apple: false });

  useEffect(() => {
    let active = true;
    fetch("/api/auth/providers")
      .then((r) => (r.ok ? r.json() : {}))
      .then((data) => {
        if (!active || !data) return;
        setEnabled({ google: !!data.google, apple: !!data.apple });
      })
      .catch(() => {
        /* leave both disabled — placeholders show */
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="space-y-3">
      {enabled.google ? (
        <button
          type="button"
          data-testid="oauth-google"
          onClick={() => signInWithGoogle({ callbackUrl })}
          className="w-full rounded-xl border-2 border-[#FFD9B3] bg-white px-4 py-3 text-base font-semibold text-[#3B241B] transition-colors hover:bg-[#FFF7EF]"
        >
          Continue with Google
        </button>
      ) : (
        <button
          type="button"
          disabled
          className="w-full rounded-xl border-2 border-[#FFD9B3] bg-white px-4 py-3 text-base font-semibold text-[#7A6254] opacity-50"
        >
          Continue with Google (Coming soon)
        </button>
      )}

      {enabled.apple ? (
        <button
          type="button"
          data-testid="oauth-apple"
          onClick={() => signInWithApple({ callbackUrl })}
          className="w-full rounded-xl border-2 border-[#3B241B] bg-[#3B241B] px-4 py-3 text-base font-semibold text-white transition-colors hover:bg-[#241510]"
        >
          Continue with Apple
        </button>
      ) : (
        <button
          type="button"
          disabled
          className="w-full rounded-xl border-2 border-[#FFD9B3] bg-white px-4 py-3 text-base font-semibold text-[#7A6254] opacity-50"
        >
          Continue with Apple (Coming soon)
        </button>
      )}
    </div>
  );
}
