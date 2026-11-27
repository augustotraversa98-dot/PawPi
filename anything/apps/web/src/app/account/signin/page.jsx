import { useState } from "react";
import useAuth from "@/utils/useAuth";
import SocialSignInButtons from "@/components/auth/SocialSignInButtons";
import { ACCOUNT_COPY, keepLang } from "@/lib/account/copy";
import { isMobileAuthWebview } from "@/utils/resolveCallbackUrl";
import {
  BusinessEyebrow,
  BusinessLanguageSwitch,
  PetOwnerNote,
} from "@/components/auth/BusinessNotes";
import { useVisitorLang } from "@/lib/publicPet/useVisitorLang";

export default function SignInPage() {
  // { say(copy) } rather than a sentence, so a shown message follows the ES / EN switch.
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });

  const { signInWithCredentials } = useAuth();
  const { lang, setLang } = useVisitorLang();
  const copy = ACCOUNT_COPY[lang];
  const search = typeof window !== "undefined" ? window.location.search : "";
  // On the website this is the business sign-in; the app opens the same page for pet owners.
  const forBusiness = !isMobileAuthWebview(search);
  // A sign-in that failed away from this page (a provider, or a wrong password) comes back as ?error=.
  const returnedError = new URLSearchParams(search).get("error");
  const shownError =
    error?.say(copy) ||
    (returnedError ? copy.signin.errors[returnedError] || copy.genericError : null);

  const onSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (!formData.email || !formData.password) {
      setError({ say: (c) => c.signin.missingFields });
      setLoading(false);
      return;
    }

    try {
      await signInWithCredentials({
        email: formData.email,
        password: formData.password,
        // Standalone-web default. The mobile bridge passes its own ?callbackUrl=
        // which takes precedence (see resolveCallbackUrl), so this only applies
        // to a business owner opening the page directly.
        callbackUrl: "/provider",
        redirect: true,
      });
    } catch (err) {
      setError({ say: (c) => c.signin.errors[err.message] || c.genericError });
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-[#FFF7EF] p-4">
      <form
        noValidate
        onSubmit={onSubmit}
        className="w-full max-w-md rounded-3xl bg-white p-8 shadow-lg"
      >
        {forBusiness && (
          <BusinessLanguageSwitch copy={copy} lang={lang} setLang={setLang} />
        )}

        {/* Header */}
        <div className="mb-8 text-center">
          {forBusiness && <BusinessEyebrow copy={copy} />}
          <h1 className="mb-2 text-3xl font-bold text-[#3B241B]">
            {copy.signin.title}
          </h1>
          <p className="text-sm text-[#7A6254]">
            {forBusiness ? copy.business.signinSubtitle : copy.signin.subtitle}
          </p>
        </div>

        {/* Form Fields */}
        <div className="space-y-5">
          {/* Email */}
          <div>
            <label className="mb-2 block text-sm font-semibold text-[#3B241B]">
              {copy.email}
            </label>
            <input
              required
              name="email"
              type="email"
              value={formData.email}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, email: e.target.value }))
              }
              placeholder={copy.emailPlaceholder}
              className="w-full rounded-xl border-2 border-[#FFD9B3] bg-[#FFF7EF] px-4 py-3 text-base text-[#3B241B] outline-none transition-colors focus:border-[#FF6F61]"
            />
          </div>

          {/* Password */}
          <div>
            <label className="mb-2 block text-sm font-semibold text-[#3B241B]">
              {copy.password.label}
            </label>
            <input
              required
              name="password"
              type="password"
              value={formData.password}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, password: e.target.value }))
              }
              placeholder={copy.signin.passwordPlaceholder}
              className="w-full rounded-xl border-2 border-[#FFD9B3] bg-[#FFF7EF] px-4 py-3 text-base text-[#3B241B] outline-none transition-colors focus:border-[#FF6F61]"
            />
          </div>

          {/* Forgot Password Link */}
          <div className="text-right">
            <a
              href={keepLang("/account/forgot-password", search)}
              className="text-sm font-semibold text-[#FF6F61] hover:underline"
            >
              {copy.signin.forgot}
            </a>
          </div>

          {/* Error Message */}
          {shownError && (
            <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
              {shownError}
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-[#FF6F61] px-4 py-3.5 text-base font-bold text-white shadow-md transition-all hover:bg-[#E85D51] disabled:opacity-50"
          >
            {loading ? copy.signin.submitting : copy.logIn}
          </button>

          {/* Divider + buttons render only when a provider is available (and never in the mobile webview) */}
          <SocialSignInButtons callbackUrl="/provider" />

          {/* Sign Up Link */}
          <p className="text-center text-sm text-[#7A6254]">
            {copy.signin.noAccount}{" "}
            <a
              href={`/account/signup${search}`}
              className="font-semibold text-[#FF6F61] hover:underline"
            >
              {copy.createAccount}
            </a>
          </p>
          {forBusiness && <PetOwnerNote copy={copy} lang={lang} />}
        </div>
      </form>
    </div>
  );
}
