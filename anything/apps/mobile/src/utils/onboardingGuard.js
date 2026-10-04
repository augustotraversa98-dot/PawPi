// onboardingGuard — the onboarding wizard is for accounts with NO dog yet.
//
// Incident (Oct 2026): an account that had already finished onboarding (a profile + a pet) was
// thrown back into the wizard — after tapping Services — and, filling it in again, created a
// duplicate pet each time ("Mila" ×3). Whatever navigation fault sends a user there, the wizard
// itself must never be a place an existing owner can create another dog. Two independent checks:
//   1. on mount, an account that already has a pet is sent straight back to the app;
//   2. right before the wizard would POST /api/pets, the pets list is re-read and the create is
//      skipped if a pet now exists.
// "Add another dog" is a separate flow (AddDogModal) and is unaffected.
//
// Fail-OPEN by design: a network error, non-200 or unparseable body counts as "no pets known",
// so a flaky connection can never lock a genuinely new user out of onboarding.

import { useEffect } from "react";
import { useRouter } from "expo-router";

export const APP_HOME = "/(tabs)";

/** true only when GET /api/pets answers 200 with at least one pet. Never throws. */
export async function accountAlreadyHasPets(fetchImpl = fetch) {
  try {
    const res = await fetchImpl("/api/pets");
    if (!res?.ok) return false;
    const body = await res.json();
    return Array.isArray(body?.pets) && body.pets.length > 0;
  } catch {
    return false;
  }
}

/**
 * Mount-time check for the onboarding screens: if the account already has a dog, leave the
 * wizard for the app. Runs once; the (fire-and-forget) result is ignored after unmount.
 */
export function useLeaveOnboardingIfHasPets() {
  const router = useRouter();
  useEffect(() => {
    let cancelled = false;
    accountAlreadyHasPets().then((has) => {
      if (has && !cancelled) {
        console.warn("[Onboarding] account already has a dog — leaving the wizard");
        router.replace(APP_HOME);
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
