// aiDocConsent: the person's permission for PawPi to send the documents they upload to the Vet Record to Anthropic (Claude), the AI
// provider that reads them and suggests records (Apple guideline 5.1.2(i): name the third party and ask first).
//
// Stored on this device, per signed-in user, in AsyncStorage. Three states:
//   "granted"  they allowed it (the only state in which the app may ask the server to read a document)
//   "denied"   they said Not now, or switched it off in Settings
//   null       never asked, no signed-in user, or the stored value could not be read
//
// It is account data: sign-out and account deletion remove it with the other account keys (utils/accountStorage keeps only
// device-level keys), so the next sign-in is asked again.

import AsyncStorage from "@react-native-async-storage/async-storage";

export const AI_DOC_CONSENT_PREFIX = "pawpi.aiDocConsent.";
export const aiDocConsentKey = (userId) => `${AI_DOC_CONSENT_PREFIX}${userId}`;

const hasUser = (userId) => userId !== undefined && userId !== null && userId !== "";

// An open Settings screen has to follow a choice made on the permission screen, otherwise it could show "off" while reading is on.
const listeners = new Set();

/** @returns {() => void} unsubscribe */
export function subscribeAiDocConsent(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Never throws. @returns {Promise<"granted" | "denied" | null>} */
export async function getAiDocConsent(userId) {
  if (!hasUser(userId)) return null;
  try {
    const value = await AsyncStorage.getItem(aiDocConsentKey(userId));
    return value === "granted" || value === "denied" ? value : null;
  } catch {
    return null;
  }
}

/** Never throws. @returns {Promise<boolean>} whether the choice was saved */
export async function setAiDocConsent(userId, allowed) {
  if (!hasUser(userId)) return false;
  const value = allowed ? "granted" : "denied";
  try {
    await AsyncStorage.setItem(aiDocConsentKey(userId), value);
  } catch {
    return false;
  }
  listeners.forEach((listener) => listener(userId, value));
  return true;
}
