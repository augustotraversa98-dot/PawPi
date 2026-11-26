import { sendPush, resolveRecipientLocale } from "@/app/api/utils/push";
import { composeFinderText } from "@/lib/publicPet/finder";

// The push for "someone who found your pet wrote to you" (public tag page). It is the one push that asks iOS to
// break through Focus modes (interruption level "time-sensitive"; needs the app entitlement, and a build without it
// simply receives a normal push). It ignores quiet hours, the daily cap and category switches on purpose.
// Called AFTER the request transaction has committed, so a slow or failing push can never lose the in-app message.

// More messages than this for one pet within an hour are still delivered, but no longer break through Focus modes:
// the sender is anonymous.
export const TIME_SENSITIVE_PER_HOUR = 5;

// The finder is waiting for the page to answer, so the send never holds the response longer than this.
export const PUSH_WAIT_MS = 4000;

const COPY = {
  en: {
    title: (pet) => (pet ? `Someone found ${pet}` : "Someone found your pet"),
    subtitle: "Emergency",
    empty: "Open PawPi to see it.",
  },
  es: {
    title: (pet) => (pet ? `Alguien encontró a ${pet}` : "Alguien encontró a tu mascota"),
    subtitle: "Emergencia",
    empty: "Abrí PawPi para verlo.",
  },
};

/** Banner text: title with the pet's name; body = finder contact first (a locked screen cuts the end), then the message. */
export function renderEmergencyPush(locale, { petName, finder }) {
  const copy = COPY[locale === "en" ? "en" : "es"];
  const pet = String(petName ?? "").trim().slice(0, 60);
  return {
    title: copy.title(pet),
    subtitle: copy.subtitle,
    body: composeFinderText(finder ?? {}) || copy.empty,
  };
}

/** Never throws. */
export async function sendEmergencyFinderPush({ recipient, petId, petName, finder, recentCount }) {
  let timer;
  try {
    const send = (async () => {
      const locale = await resolveRecipientLocale(recipient);
      const { title, subtitle, body } = renderEmergencyPush(locale, { petName, finder });
      const subjectRef = petId == null ? null : String(petId);
      await sendPush(
        recipient,
        {
          title,
          subtitle,
          body,
          data: { type: "emergency_contact", subjectRef },
          priority: "high",
          // Expo's push API spells it with a hyphen.
          interruptionLevel: Number(recentCount) < TIME_SENSITIVE_PER_HOUR ? "time-sensitive" : "active",
        },
        { type: "emergency_contact", category: null, subjectRef, cap: null },
      );
    })();
    await Promise.race([
      send,
      new Promise((resolve) => {
        timer = setTimeout(resolve, PUSH_WAIT_MS);
      }),
    ]);
  } catch (e) {
    console.error("[sendEmergencyFinderPush] non-fatal:", e?.message);
  } finally {
    clearTimeout(timer);
  }
}
