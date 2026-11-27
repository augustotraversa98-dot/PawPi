import { Alert } from "react-native";

// A refused follow must say why: on its own the button just switches back.
export async function followFailure(response) {
  let body = null;
  try {
    body = await response.json();
  } catch {
    // no readable body: the generic message is shown
  }
  return Object.assign(new Error("Failed to toggle follow"), { code: body?.code ?? null });
}

export function alertFollowFailure(t, error, petName) {
  const name = petName || t("follows.petFallback");
  Alert.alert(
    t("follows.errorTitle"),
    error?.code === "follow_not_allowed" ? t("follows.errorNotAllowed", { name }) : t("follows.errorGeneric"),
  );
}
