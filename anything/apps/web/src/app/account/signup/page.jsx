import { useState } from "react";
import useAuth from "@/utils/useAuth";
import {
  validatePassword,
  passwordStrength,
  PASSWORD_MIN_LENGTH,
} from "@/app/api/utils/passwordStrength";
import SocialSignInButtons from "@/components/auth/SocialSignInButtons";
import { TERMS_OF_SERVICE_URL, PRIVACY_POLICY_URL } from "@/constants/legal";

const METER_COLORS = ["#E2E0DE", "#E25C4B", "#E89B3C", "#3FB07A", "#2E8F62"];

// Auth.js error codes → friendly copy (with redirect:false, signIn RETURNS these in
// result.error instead of throwing).
const ERROR_MESSAGES = {
  CredentialsSignin: "This email is already registered. Try logging in instead.",
  EmailCreateAccount: "This email is already registered.",
  OAuthCreateAccount: "Could not create account. Please try again.",
  WeakPassword:
    "That password is too weak. Use at least 8 characters and mix letters, numbers, and symbols.",
};

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
      setError("Please enter your full name");
      setLoading(false);
      return;
    }

    if (!formData.email || !formData.password) {
      setError("Please fill in all required fields");
      setLoading(false);
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match");
      setLoading(false);
      return;
    }

    if (!agreedToTerms) {
      setError("Please accept the Terms of Service and Privacy Policy to continue");
      setLoading(false);
      return;
    }

    const { valid, errors } = validatePassword(formData.password);
    if (!valid) {
      setError(errors[0] || "Please choose a stronger password");
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

      if (!result || result.error) {
        setError(
          ERROR_MESSAGES[result?.error] ||
            "Something went wrong. Please try again.",
        );
        setLoading(false);
        return;
      }

      // Account created. Record Terms/Privacy consent against the new session. The mobile
      // web-auth bridge opens this page with an explicit ?callbackUrl= (see resolveCallbackUrl);
      // its presence is what distinguishes a mobile sign-up from a standalone-web one.
      const isMobileBridge =
        typeof window !== "undefined" &&
        new URLSearchParams(window.location.search).has("callbackUrl");
      await recordConsent(isMobileBridge ? "mobile_signup" : "web_signup");

      // Perform the redirect manually to the resolved callback url.
      window.location.href = result.url || "/provider";
    } catch (err) {
      setError(
        ERROR_MESSAGES[err?.code] ||
          ERROR_MESSAGES[err?.message] ||
          "Something went wrong. Please try again.",
      );
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
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="mb-2 text-3xl font-bold text-[#3B241B]">
            Create Account
          </h1>
          <p className="text-sm text-[#7A6254]">
            Join the PawPi community
          </p>
        </div>

        {/* Form Fields */}
        <div className="space-y-5">
          {/* Full Name */}
          <div>
            <label className="mb-2 block text-sm font-semibold text-[#3B241B]">
              Full name
            </label>
            <input
              required
              name="name"
              type="text"
              value={formData.name}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, name: e.target.value }))
              }
              placeholder="Your name"
              className="w-full rounded-xl border-2 border-[#FFD9B3] bg-[#FFF7EF] px-4 py-3 text-base text-[#3B241B] outline-none transition-colors focus:border-[#FF6F61]"
            />
          </div>

          {/* Email */}
          <div>
            <label className="mb-2 block text-sm font-semibold text-[#3B241B]">
              Email
            </label>
            <input
              required
              name="email"
              type="email"
              value={formData.email}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, email: e.target.value }))
              }
              placeholder="your@email.com"
              className="w-full rounded-xl border-2 border-[#FFD9B3] bg-[#FFF7EF] px-4 py-3 text-base text-[#3B241B] outline-none transition-colors focus:border-[#FF6F61]"
            />
          </div>

          {/* Password */}
          <div>
            <label className="mb-2 block text-sm font-semibold text-[#3B241B]">
              Password
            </label>
            <input
              required
              name="password"
              type="password"
              value={formData.password}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, password: e.target.value }))
              }
              placeholder="At least 8 characters"
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
                  {strength.label}
                </p>
                <ul className="mt-1 space-y-0.5 text-xs text-[#7A6254]">
                  <li className={formData.password.length >= PASSWORD_MIN_LENGTH ? "text-[#2E8F62]" : ""}>
                    {formData.password.length >= PASSWORD_MIN_LENGTH ? "✓" : "•"}{" "}
                    At least {PASSWORD_MIN_LENGTH} characters
                  </li>
                  <li className={strength.classCount >= 3 ? "text-[#2E8F62]" : ""}>
                    {strength.classCount >= 3 ? "✓" : "•"} Mix 3 of: lowercase,
                    uppercase, number, symbol
                  </li>
                  <li className={passwordValid ? "text-[#2E8F62]" : ""}>
                    {passwordValid ? "✓" : "•"} Not a common password
                  </li>
                </ul>
              </div>
            )}
          </div>

          {/* Confirm Password */}
          <div>
            <label className="mb-2 block text-sm font-semibold text-[#3B241B]">
              Confirm password
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
              placeholder="Re-enter password"
              className="w-full rounded-xl border-2 border-[#FFD9B3] bg-[#FFF7EF] px-4 py-3 text-base text-[#3B241B] outline-none transition-colors focus:border-[#FF6F61]"
            />
          </div>

          {/* Error Message */}
          {error && (
            <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          )}

          {/* Terms acceptance gate (Guideline 1.2) — required, unchecked by default. */}
          <label className="flex cursor-pointer items-start gap-3 text-sm text-[#7A6254]">
            <input
              type="checkbox"
              name="agreeToTerms"
              aria-label="I agree to the Terms of Service and Privacy Policy"
              checked={agreedToTerms}
              onChange={(e) => setAgreedToTerms(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 accent-[#FF6F61]"
            />
            <span>
              I agree to the{" "}
              <LegalLink href={TERMS_OF_SERVICE_URL}>Terms of Service</LegalLink> and{" "}
              <LegalLink href={PRIVACY_POLICY_URL}>Privacy Policy</LegalLink>, including PawPi's
              zero-tolerance policy for objectionable content and abusive behavior.
            </span>
          </label>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full rounded-xl bg-[#FF6F61] px-4 py-3.5 text-base font-bold text-white shadow-md transition-all hover:bg-[#E85D51] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Creating account..." : "Create account"}
          </button>

          {/* Social Login Placeholders */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[#FFD9B3]"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="bg-white px-4 text-[#7A6254]">
                Or continue with
              </span>
            </div>
          </div>

          <SocialSignInButtons callbackUrl="/provider" />

          {/* Login Link */}
          <p className="text-center text-sm text-[#7A6254]">
            Already have an account?{" "}
            <a
              href={`/account/signin${
                typeof window !== "undefined" ? window.location.search : ""
              }`}
              className="font-semibold text-[#FF6F61] hover:underline"
            >
              Log in
            </a>
          </p>
        </div>
      </form>
    </div>
  );
}
