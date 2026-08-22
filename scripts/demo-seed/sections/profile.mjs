// Profile & Settings: make sure the owner profile reads full and onboarding is
// marked complete. Add-only — only fills fields that are currently empty; never
// overwrites existing demo values.
export default async function seedProfile(ctx) {
  const { A, img, report } = ctx;
  const r = report.section("Profile & Settings");

  let profile;
  try {
    const res = await A.get("/api/user-profile");
    profile = res.data?.profile;
  } catch (e) {
    r.error(`read profile: ${e.message}`);
    return;
  }
  if (!profile) {
    r.error("no profile returned");
    return;
  }

  const patch = {};
  if (!profile.full_name) patch.full_name = "Augusto Traversa";
  if (!profile.username) patch.username = "augusto";
  if (!profile.avatar_url) {
    try {
      patch.avatar_url = await img("dog-hero.jpg");
    } catch {
      /* optional */
    }
  }
  if (!profile.onboarding_completed) patch.onboarding_completed = true;

  if (Object.keys(patch).length === 0) {
    r.skipped(`profile already complete (${profile.full_name || profile.username})`);
    return;
  }
  try {
    const res = await A.patch("/api/user-profile", patch);
    if (res.ok) r.created(`profile fields: ${Object.keys(patch).join(", ")}`);
    else r.error(`profile patch: ${res.status} ${JSON.stringify(res.data).slice(0, 140)}`);
  } catch (e) {
    r.error(`profile patch: ${e.message}`);
  }
}
