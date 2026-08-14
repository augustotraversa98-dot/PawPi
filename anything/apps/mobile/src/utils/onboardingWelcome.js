// E6 onboarding — start the Care Ring after the first daily moment is posted.
//
// Calls POST /api/onboarding/welcome, which (server-side, honest, idempotent) seeds the day-1 streak
// and grants the ONE allowed labelled seeded interaction: a first paw from the official "PawPi
// Welcome" account. Never throws — onboarding must always finish even if this degrades.
//
// @param {{postId:number|string, petId:number|string}} args
// @returns {Promise<{welcomed:boolean, streak:{current_count:number}|null, welcome_actor:string}|null>}
export async function postOnboardingWelcome({ postId, petId } = {}) {
  try {
    if (!postId || !petId) return null;
    const res = await fetch("/api/onboarding/welcome", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ post_id: postId, pet_id: petId }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
