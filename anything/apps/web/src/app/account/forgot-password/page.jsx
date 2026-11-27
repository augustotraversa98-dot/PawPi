import { useState } from "react";
import { ACCOUNT_COPY, keepLang, serverMessage } from "@/lib/account/copy";
import { useVisitorLang } from "@/lib/publicPet/useVisitorLang";

// Forgot password — step 1 of the self-service reset.
//
// This screen used to be a stub: a setTimeout that showed "check your email" with no backend at
// all. It now posts to /api/account/forgot-password, which always answers with the same generic
// message whether or not the address has an account — so this screen must NOT try to be more
// helpful than that. "We couldn't find that email" here would undo the whole point of the uniform
// server response and hand out an account-existence oracle.
//
// Reachable on mobile through the auth WebView (welcome → "Forgot password?", and the link on the
// sign-in page) — this page is the mobile surface too, exactly like sign-in and sign-up.
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const { lang } = useVisitorLang();
  const copy = ACCOUNT_COPY[lang];
  const signInHref = keepLang("/account/signin", typeof window !== "undefined" ? window.location.search : "");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!email.trim()) {
      setError(copy.forgot.missingEmail);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/account/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(serverMessage(lang, data));
        return;
      }

      setSuccess(true);
    } catch {
      setError(copy.unreachable);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-[#FFF7EF] p-4">
        <div className="w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-lg">
          <div className="mb-6 text-5xl">📧</div>
          <h1 className="mb-4 text-2xl font-bold text-[#3B241B]">
            {copy.forgot.sentTitle}
          </h1>
          <p className="mb-4 text-[#7A6254]">
            {copy.forgot.sentBefore}{" "}
            <span className="font-semibold">{email.trim()}</span>
            {copy.forgot.sentAfter}
          </p>
          <p className="mb-8 text-sm text-[#7A6254]">
            {copy.forgot.sentNote}
          </p>
          <a
            href={signInHref}
            className="inline-block w-full rounded-xl bg-[#FF6F61] px-4 py-3.5 text-base font-bold text-white shadow-md transition-all hover:bg-[#E85D51]"
          >
            {copy.forgot.back}
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-[#FFF7EF] p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-3xl bg-white p-8 shadow-lg"
      >
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="mb-2 text-3xl font-bold text-[#3B241B]">
            {copy.forgot.title}
          </h1>
          <p className="text-sm text-[#7A6254]">
            {copy.forgot.subtitle}
          </p>
        </div>

        {/* Form */}
        <div className="space-y-5">
          <div>
            <label className="mb-2 block text-sm font-semibold text-[#3B241B]">
              {copy.email}
            </label>
            <input
              required
              name="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={copy.emailPlaceholder}
              className="w-full rounded-xl border-2 border-[#FFD9B3] bg-[#FFF7EF] px-4 py-3 text-base text-[#3B241B] outline-none transition-colors focus:border-[#FF6F61]"
            />
          </div>

          {error && (
            <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-[#FF6F61] px-4 py-3.5 text-base font-bold text-white shadow-md transition-all hover:bg-[#E85D51] disabled:opacity-50"
          >
            {loading ? copy.forgot.sending : copy.forgot.send}
          </button>

          <p className="text-center text-sm text-[#7A6254]">
            {copy.forgot.remember}{" "}
            <a
              href={signInHref}
              className="font-semibold text-[#FF6F61] hover:underline"
            >
              {copy.logIn}
            </a>
          </p>
        </div>
      </form>
    </div>
  );
}
