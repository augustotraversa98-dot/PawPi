// Decide what "/" should do from the session state. Pure leaf module (no auth /
// react imports) so it can be unit-tested without the build-only `@auth/create`
// alias. Consumes ProviderShell's useUser({ user, loading }) contract.
//   - "loading"  → session unknown: render nothing (no flash of landing).
//   - "redirect" → logged in: send to /provider, never show the marketing landing.
//   - "landing"  → logged out: show the landing with sign in / create account.
export function resolveHomeView({ loading, user }) {
  if (loading) return "loading";
  if (user) return "redirect";
  return "landing";
}
