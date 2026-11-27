import { useState } from "react";
import useAuth from "@/utils/useAuth";
import { isMobileAuthWebview } from "@/utils/resolveCallbackUrl";
import {
  validatePassword,
  passwordStrength,
  PASSWORD_MIN_LENGTH,
} from "@/app/api/utils/passwordStrength";
import SocialSignInButtons from "@/components/auth/SocialSignInButtons";
import { TERMS_OF_SERVICE_URL, PRIVACY_POLICY_URL } from "@/constants/legal";
import { ACCOUNT_COPY, legalUrlFor, serverMessage } from "@/lib/account/copy";
import { useVisitorLang } from "@/lib/publicPet/useVisitorLang";
import {
  BusinessEyebrow,
  BusinessLanguageSwitch,
  PetOwnerNote,
} from "@/components/auth/BusinessNotes";

const METER_COLORS = ["#E2E0DE", "#E25C4B", "#E89B3C", "#3FB07A", "#2E8F62"];

// Record Terms/Privacy consent server-side AFTER the account exists. Best-effort: retry once,
// then log and proceed — we must NEVER block a user out of an already-created account because a
// consent write failed (the versions are stamped server-side from the session). Versions are not
// sent from here; the endpoint owns them.
async function recordConsent(source) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch("/api/legal/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include", // carry the session cookie just set by sign-up
        body: JSON.stringify({ source }),
      });
      if (res.ok) return true;
    } catch {
      // network error — fall through to the retry, then give up
    }
  }
  console.error("[signup] consent POST failed after retry; proceeding to redirect");
  return false;
}

// A legal link that opens the hosted doc in a new tab when configured, else renders as plain
// bold text (Guideline 1.2 — the checkbox still gates submit even before the URLs are published).
function LegalLink({ href, children }) {
  if (!href) return <span className="font-semibold text-[#3B241B]">{children}</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="font-semibold text-[#FF6F61] hover:underline"
    >
      {children}
    </a>
  );
}

export default function SignUpPage() {
  // { say(copy, lang) } rather than a sentence, so a shown message follows the ES / EN switch.
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  const { signUpWithCredentials } = useAuth();
  const { lang, setLang } = useVisitorLang();
  const copy = ACCOUNT_COPY[lang];
  // On the website this is the business sign-up; the app opens the same page for pet owners.
  const forBusiness = !isMobileAuthWebview(typeof window !== "undefined" ? window.location.search : "");

  // Live strength feedback mirrors the same rule the server enforces (2.32).
  const strength = passwordStrength(formData.password);
  const passwordValid = strength.valid;
  const canSubmit =
    !loading &&
    formData.name.trim().length > 0 &&
    formData.email.trim().length > 0 &&
    passwordValid &&
    formData.password === formData.confirmPassword &&
    agreedToTerms;

  const onSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Validation
    if (!formData.name.trim()) {
      setError({ say: (c) => c.signup.missingName });
      setLoading(false);
      return;
    }

    if (!formData.email || !formData.password) {
      setError({ say: (c) => c.signup.missingFields });
      setLoading(false);
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError({ say: (c) => c.signup.mismatch });
      setLoading(false);
      return;
    }

    if (!agreedToTerms) {
      setError({ say: (c) => c.signup.mustAccept });
      setLoading(false);
      return;
    }

    const { valid, errors } = validatePassword(formData.password);
    if (!valid) {
      setError({
        say: (c, l) => (errors[0] ? serverMessage(l, { error: errors[0] }) : c.password.chooseStronger),
      });
      setLoading(false);
      return;
    }

    try {
      // redirect:false so we can persist consent on the freshly-created session BEFORE
      // navigating. signIn then RESOLVES (instead of redirecting) with { ok, url, error }.
      const result = await signUpWithCredentials({
        name: formData.name.trim(),
        email: formData.email,
        password: formData.password,
        // Standalone-web default. The mobile bridge passes its own ?callbackUrl=
        // which takes precedence (see resolveCallbackUrl), so this only applies
        // to a business owner opening the page directly.
        callbackUrl: "/provider",
        redirect: false,
      });

      // Auth.js error codes → friendly copy (with redirect:false, signIn RETURNS these in
      // result.error instead of throwing).
      if (!result || result.error) {
        setError({ say: (c) => c.signup.errors[result?.error] || c.genericError });
        setLoading(false);
        return;
      }

      // Account created. Record Terms/Privacy consent against the new session. A sign-up is a
      // mobile one only when ?callbackUrl= is one of the mobile web-auth bridge targets (see
      // isMobileAuthWebview); web pages also pass a callbackUrl to bring the visitor back.
      const isMobileBridge =
        typeof window !== "undefined" &&
        isMobileAuthWebview(window.location.search);
      await recordConsent(isMobileBridge ? "mobile_signup" : "web_signup");

      // Perform the redirect manually to the resolved callback url.
      window.location.href = result.url || "/provider";
    } catch (err) {
      setError({
        say: (c) => c.signup.errors[err?.code] || c.signup.errors[err?.message] || c.genericError,
      });
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
            {copy.signup.title}
          </h1>
          <p className="text-sm text-[#7A6254]">
            {forBusiness ? copy.business.signupSubtitle : copy.signup.subtitle}
          </p>
        </div>

        {/* Form Fields */}
        <div className="space-y-5">
          {/* Full Name */}
          <div>
            <label className="mb-2 block text-sm font-semibold text-[#3B241B]">
              {copy.signup.fullName}
            </label>
            <input
              required
              name="name"
              type="text"
              value={formData.name}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, name: e.target.value }))
              }
              placeholder={copy.signup.namePlaceholder}
              className="w-full rounded-xl border-2 border-[#FFD9B3] bg-[#FFF7EF] px-4 py-3 text-base text-[#3B241B] outline-none transition-colors focus:border-[#FF6F61]"
            />
          </div>

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
              placeholder={copy.password.atLeastPlaceholder}
              className="w-full rounded-xl border-2 border-[#FFD9B3] bg-[#FFF7EF] px-4 py-3 text-base text-[#3B241B] outline-none transition-colors focus:border-[#FF6F61]"
            />

            {/* Live strength meter + requirements (mirrors the server rule) */}
            {formData.password.length > 0 && (
              <div className="mt-2">
                <div className="flex gap-1" aria-hidden="true">
                  {[1, 2, 3, 4].map((seg) => (
                    <div
                      key={seg}
                      className="h-1.5 flex-1 rounded-full transition-colors"
                      style={{
                        backgroundColor:
                          strength.score >= seg
                            ? METER_COLORS[strength.score]
                            : "#EFEAE6",
                      }}
                    />
                  ))}
                </div>
                <p
                  className="mt-1 text-xs font-semibold"
                  style={{ color: METER_COLORS[strength.score] }}
                >
                  {copy.password.strength[strength.score]}
                </p>
                <ul className="mt-1 space-y-0.5 text-xs text-[#7A6254]">
                  <li className={formData.password.length >= PASSWORD_MIN_LENGTH ? "text-[#2E8F62]" : ""}>
                    {formData.password.length >= PASSWORD_MIN_LENGTH ? "✓" : "•"}{" "}
                    {copy.password.atLeast}
                  </li>
                  <li className={strength.classCount >= 3 ? "text-[#2E8F62]" : ""}>
                    {strength.classCount >= 3 ? "✓" : "•"} {copy.password.mix}
                  </li>
                  <li className={passwordValid ? "text-[#2E8F62]" : ""}>
                    {passwordValid ? "✓" : "•"} {copy.password.notCommon}
                  </li>
                </ul>
              </div>
            )}
          </div>

          {/* Confirm Password */}
          <div>
            <label className="mb-2 block text-sm font-semibold text-[#3B241B]">
              {copy.signup.confirm}
            </label>
            <input
              required
              name="confirmPassword"
              type="password"
              value={formData.confirmPassword}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  confirmPassword: e.target.value,
                }))
              }
              placeholder={copy.password.reenter}
              className="w-full rounded-xl border-2 border-[#FFD9B3] bg-[#FFF7EF] px-4 py-3 text-base text-[#3B241B] outline-none transition-colors focus:border-[#FF6F61]"
            />
          </div>

          {/* Error Message */}
          {error && (
            <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
              {error.say(copy, lang)}
            </div>
          )}

          {/* Terms acceptance gate (Guideline 1.2) — required, unchecked by default. */}
          <label className="flex cursor-pointer items-start gap-3 text-sm text-[#7A6254]">
            <input
              type="checkbox"
              name="agreeToTerms"
              aria-label={copy.signup.agreeLabel}
              checked={agreedToTerms}
              onChange={(e) => setAgreedToTerms(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 accent-[#FF6F61]"
            />
            <span>
              {copy.signup.agreePrefix}{" "}
              <LegalLink href={legalUrlFor(TERMS_OF_SERVICE_URL, lang)}>{copy.signup.terms}</LegalLink>{" "}
              {copy.signup.and}{" "}
              <LegalLink href={legalUrlFor(PRIVACY_POLICY_URL, lang)}>{copy.signup.privacy}</LegalLink>
              {copy.signup.agreeSuffix}
            </span>
          </label>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full rounded-xl bg-[#FF6F61] px-4 py-3.5 text-base font-bold text-white shadow-md transition-all hover:bg-[#E85D51] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? copy.signup.submitting : copy.createAccount}
          </button>

          {/* Divider + buttons render only when a provider is available (and never in the mobile webview) */}
          <SocialSignInButtons callbackUrl="/provider" />

          {/* Login Link */}
          <p className="text-center text-sm text-[#7A6254]">
            {copy.signup.haveAccount}{" "}
            <a
              href={`/account/signin${
                typeof window !== "undefined" ? window.location.search : ""
              }`}
              className="font-semibold text-[#FF6F61] hover:underline"
            >
              {copy.logIn}
            </a>
          </p>
          {forBusiness && <PetOwnerNote copy={copy} lang={lang} />}
        </div>
      </form>
    </div>
  );
}
