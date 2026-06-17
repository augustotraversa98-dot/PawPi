import { useState } from "react";
import useAuth from "@/utils/useAuth";

export default function SignInPage() {
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });

  const { signInWithCredentials } = useAuth();

  const onSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (!formData.email || !formData.password) {
      setError("Please fill in all fields");
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
      const errorMessages = {
        CredentialsSignin: "Incorrect email or password. Please try again.",
        OAuthSignin: "Could not sign in. Please try again.",
        OAuthCallback: "Sign-in failed. Please try again.",
      };

      setError(
        errorMessages[err.message] || "Something went wrong. Please try again.",
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
            Welcome Back
          </h1>
          <p className="text-sm text-[#7A6254]">Sign in to continue</p>
        </div>

        {/* Form Fields */}
        <div className="space-y-5">
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
              placeholder="Enter your password"
              className="w-full rounded-xl border-2 border-[#FFD9B3] bg-[#FFF7EF] px-4 py-3 text-base text-[#3B241B] outline-none transition-colors focus:border-[#FF6F61]"
            />
          </div>

          {/* Forgot Password Link */}
          <div className="text-right">
            <a
              href="/account/forgot-password"
              className="text-sm font-semibold text-[#FF6F61] hover:underline"
            >
              Forgot password?
            </a>
          </div>

          {/* Error Message */}
          {error && (
            <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-[#FF6F61] px-4 py-3.5 text-base font-bold text-white shadow-md transition-all hover:bg-[#E85D51] disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Log in"}
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

          <div className="space-y-3">
            <button
              type="button"
              disabled
              className="w-full rounded-xl border-2 border-[#FFD9B3] bg-white px-4 py-3 text-base font-semibold text-[#7A6254] opacity-50"
            >
              Continue with Google (Coming soon)
            </button>
            <button
              type="button"
              disabled
              className="w-full rounded-xl border-2 border-[#FFD9B3] bg-white px-4 py-3 text-base font-semibold text-[#7A6254] opacity-50"
            >
              Continue with Apple (Coming soon)
            </button>
          </div>

          {/* Sign Up Link */}
          <p className="text-center text-sm text-[#7A6254]">
            Don't have an account?{" "}
            <a
              href={`/account/signup${
                typeof window !== "undefined" ? window.location.search : ""
              }`}
              className="font-semibold text-[#FF6F61] hover:underline"
            >
              Create account
            </a>
          </p>
        </div>
      </form>
    </div>
  );
}
