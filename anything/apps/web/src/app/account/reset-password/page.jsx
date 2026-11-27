import { useState } from "react";
import { useSearchParams } from "react-router";
import {
  passwordStrength,
  PASSWORD_MIN_LENGTH,
} from "@/app/api/utils/passwordStrength";
import { ACCOUNT_COPY, keepLang, serverMessage } from "@/lib/account/copy";
import { useVisitorLang } from "@/lib/publicPet/useVisitorLang";

// Set a new password — step 2 of the self-service reset, and the target of the emailed link
// (/account/reset-password?token=…).
//
// The token stays in the URL and is posted back verbatim; the server hashes it and looks it up
// (migration 0069). It never becomes app state beyond this form.
//
// The live meter is the SAME 2.32 passwordStrength util the sign-up form and src/auth.js use —
// imported, not reimplemented, so the meter can never drift from what the server enforces.
//
// This page is also the mobile surface: the emailed link opens in the phone's browser, and the
// flow ends with the user logging in normally in the app.

const METER_COLORS = ["#D9534F", "#D9534F", "#E8A33D", "#5BA85A", "#2E8F62"];

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const { lang } = useVisitorLang();
  const copy = ACCOUNT_COPY[lang];
  const search = typeof window !== "undefined" ? window.location.search : "";
  const signInHref = keepLang("/account/signin", search);

  const strength = passwordStrength(password);
  const passwordValid = strength.valid;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!passwordValid) {
      setError(copy.reset.chooseStronger);
      return;
    }
    if (password !== confirmPassword) {
      setError(copy.reset.mismatch);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/account/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
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

  // No token in the URL at all — a hand-typed or truncated link. Say so before the user types a
  // password that could never be saved.
  if (!token) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-[#FFF7EF] p-4">
        <div className="w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-lg">
          <div className="mb-6 text-5xl">🔗</div>
          <h1 className="mb-4 text-2xl font-bold text-[#3B241B]">
            {copy.reset.incompleteTitle}
          </h1>
          <p className="mb-8 text-[#7A6254]">
            {copy.reset.incompleteBody}
          </p>
          <a
            href={keepLang("/account/forgot-password", search)}
            className="inline-block w-full rounded-xl bg-[#FF6F61] px-4 py-3.5 text-base font-bold text-white shadow-md transition-all hover:bg-[#E85D51]"
          >
            {copy.reset.requestNew}
          </a>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-[#FFF7EF] p-4">
        <div className="w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-lg">
          <div className="mb-6 text-5xl">🎉</div>
          <h1 className="mb-4 text-2xl font-bold text-[#3B241B]">
            {copy.reset.doneTitle}
          </h1>
          <p className="mb-8 text-[#7A6254]">
            {copy.reset.doneBody}
          </p>
          <a
            href={signInHref}
            className="inline-block w-full rounded-xl bg-[#FF6F61] px-4 py-3.5 text-base font-bold text-white shadow-md transition-all hover:bg-[#E85D51]"
          >
            {copy.reset.goToLogin}
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
            {copy.reset.title}
          </h1>
          <p className="text-sm text-[#7A6254]">
            {copy.reset.subtitle}
          </p>
        </div>

        <div className="space-y-5">
          {/* New password */}
          <div>
            <label className="mb-2 block text-sm font-semibold text-[#3B241B]">
              {copy.reset.newPassword}
            </label>
            <input
              required
              name="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={copy.password.atLeastPlaceholder}
              className="w-full rounded-xl border-2 border-[#FFD9B3] bg-[#FFF7EF] px-4 py-3 text-base text-[#3B241B] outline-none transition-colors focus:border-[#FF6F61]"
            />

            {/* Live strength meter + requirements (mirrors the server rule) */}
            {password.length > 0 && (
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
                  <li
                    className={
                      password.length >= PASSWORD_MIN_LENGTH
                        ? "text-[#2E8F62]"
                        : ""
                    }
                  >
                    {password.length >= PASSWORD_MIN_LENGTH ? "✓" : "•"}{" "}
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

          {/* Confirm password */}
          <div>
            <label className="mb-2 block text-sm font-semibold text-[#3B241B]">
              {copy.reset.confirm}
            </label>
            <input
              required
              name="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder={copy.password.reenter}
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
            {loading ? copy.reset.saving : copy.reset.save}
          </button>

          <p className="text-center text-sm text-[#7A6254]">
            {copy.reset.remembered}{" "}
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
