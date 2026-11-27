import { useEffect, useState } from "react";
import useAuth from "@/utils/useAuth";
import { isMobileAuthWebview } from "@/utils/resolveCallbackUrl";
import { ACCOUNT_COPY, legalUrlFor } from "@/lib/account/copy";
import { useVisitorLang } from "@/lib/publicPet/useVisitorLang";
import { TERMS_OF_SERVICE_URL, PRIVACY_POLICY_URL } from "@/constants/legal";
import { rememberSocialConsent } from "./RecordSocialConsent";

// Env-gated social sign-in for the hosted /account/{signin,signup} pages. Renders "Continue
// with Google/Apple/Microsoft" ONLY for providers the server actually lists at Auth.js's own
// /api/auth/providers endpoint, and nothing else — an unavailable provider is simply absent
// (no disabled "coming soon" placeholders).
//
// - Google: shown when "google" is listed.
// - Apple: shown only when a web "apple" provider is listed. "apple-native" is the native-only
//   credentials provider and never renders a web button.
// - Microsoft: shown when "microsoft-entra-id" is listed.
// - Mobile auth webview: renders nothing (no buttons, no divider). The app offers Apple/Google
//   itself, under this page, and Google blocks OAuth inside embedded webviews anyway.
// - The "Or continue with" divider is owned here so it only shows when a button does, and so is
//   the Terms line: continuing with a provider can create an account (see RecordSocialConsent).
//
// callbackUrl: the mobile auth webview passes its own ?callbackUrl=, which useAuth's
// signInWith* already lets win; we default to "/provider" for standalone web.

const PROVIDERS = [
  {
    key: "google",
    id: "google",
    signIn: "signInWithGoogle",
    className: "border-[#FFD9B3] bg-white text-[#3B241B] hover:bg-[#FFF7EF]",
  },
  {
    key: "apple",
    id: "apple",
    signIn: "signInWithApple",
    className: "border-[#3B241B] bg-[#3B241B] text-white hover:bg-[#241510]",
  },
  {
    key: "microsoft",
    id: "microsoft-entra-id",
    signIn: "signInWithMicrosoft",
    className: "border-[#FFD9B3] bg-white text-[#3B241B] hover:bg-[#FFF7EF]",
  },
];

function LegalLink({ href, children }) {
  if (!href) return <span className="font-semibold text-[#3B241B]">{children}</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="font-semibold text-[#FF6F61] hover:underline">
      {children}
    </a>
  );
}

export default function SocialSignInButtons({ callbackUrl = "/provider" }) {
  const auth = useAuth();
  const { lang } = useVisitorLang();
  const copy = ACCOUNT_COPY[lang];
  const [listed, setListed] = useState({});
  const inWebview =
    typeof window !== "undefined" && isMobileAuthWebview(window.location.search);

  useEffect(() => {
    if (inWebview) return undefined;
    let active = true;
    fetch("/api/auth/providers")
      .then((r) => (r.ok ? r.json() : {}))
      .then((data) => {
        if (active && data) setListed(data);
      })
      .catch(() => {
        /* leave them hidden */
      });
    return () => {
      active = false;
    };
  }, [inWebview]);

  const available = PROVIDERS.filter((p) => listed[p.id]);
  if (inWebview || available.length === 0) return null;

  return (
    <>
      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-[#FFD9B3]"></div>
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="bg-white px-4 text-[#7A6254]">{copy.social.divider}</span>
        </div>
      </div>

      <div className="space-y-3">
        {available.map((p) => (
          <button
            key={p.key}
            type="button"
            data-testid={`oauth-${p.key}`}
            onClick={() => {
              rememberSocialConsent();
              auth[p.signIn]({ callbackUrl });
            }}
            className={`w-full rounded-xl border-2 px-4 py-3 text-base font-semibold transition-colors ${p.className}`}
          >
            {copy.social[p.key]}
          </button>
        ))}
      </div>

      <p data-testid="oauth-terms" className="text-center text-xs text-[#7A6254]">
        {copy.social.agreePrefix}{" "}
        <LegalLink href={legalUrlFor(TERMS_OF_SERVICE_URL, lang)}>{copy.signup.terms}</LegalLink>{" "}
        {copy.signup.and}{" "}
        <LegalLink href={legalUrlFor(PRIVACY_POLICY_URL, lang)}>{copy.signup.privacy}</LegalLink>
        {copy.signup.agreeSuffix}
      </p>
    </>
  );
}
