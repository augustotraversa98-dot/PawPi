import { useEffect, useState } from "react";
import useAuth from "@/utils/useAuth";
import { isMobileAuthWebview } from "@/utils/resolveCallbackUrl";

// Env-gated social sign-in for the hosted /account/{signin,signup} pages. Renders "Continue
// with Google/Apple" ONLY for providers the server actually lists at Auth.js's own
// /api/auth/providers endpoint, and nothing else — an unavailable provider is simply absent
// (no disabled "coming soon" placeholders).
//
// - Google: shown when "google" is listed.
// - Apple: shown only when a web "apple" provider is listed. "apple-native" is the native-only
//   credentials provider and never renders a web button.
// - Mobile auth webview: renders nothing (no buttons, no divider). The native Welcome screen
//   already offers Apple/Google, and Google blocks OAuth inside embedded webviews anyway.
// - The "Or continue with" divider is owned here so it only shows when a button does.
//
// callbackUrl: the mobile auth webview passes its own ?callbackUrl=, which useAuth's
// signInWith* already lets win; we default to "/provider" for standalone web.

export default function SocialSignInButtons({ callbackUrl = "/provider" }) {
  const { signInWithGoogle, signInWithApple } = useAuth();
  const [enabled, setEnabled] = useState({ google: false, apple: false });
  const inWebview =
    typeof window !== "undefined" && isMobileAuthWebview(window.location.search);

  useEffect(() => {
    if (inWebview) return undefined;
    let active = true;
    fetch("/api/auth/providers")
      .then((r) => (r.ok ? r.json() : {}))
      .then((data) => {
        if (!active || !data) return;
        setEnabled({ google: !!data.google, apple: !!data.apple });
      })
      .catch(() => {
        /* leave both hidden */
      });
    return () => {
      active = false;
    };
  }, [inWebview]);

  if (inWebview || (!enabled.google && !enabled.apple)) return null;

  return (
    <>
      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-[#FFD9B3]"></div>
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="bg-white px-4 text-[#7A6254]">Or continue with</span>
        </div>
      </div>

      <div className="space-y-3">
        {enabled.google && (
          <button
            type="button"
            data-testid="oauth-google"
            onClick={() => signInWithGoogle({ callbackUrl })}
            className="w-full rounded-xl border-2 border-[#FFD9B3] bg-white px-4 py-3 text-base font-semibold text-[#3B241B] transition-colors hover:bg-[#FFF7EF]"
          >
            Continue with Google
          </button>
        )}

        {enabled.apple && (
          <button
            type="button"
            data-testid="oauth-apple"
            onClick={() => signInWithApple({ callbackUrl })}
            className="w-full rounded-xl border-2 border-[#3B241B] bg-[#3B241B] px-4 py-3 text-base font-semibold text-white transition-colors hover:bg-[#241510]"
          >
            Continue with Apple
          </button>
        )}
      </div>
    </>
  );
}
