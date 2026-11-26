import { sendPush, resolveRecipientLocale } from "@/app/api/utils/push";
import { ownerSettingsAllowPush } from "@/app/api/utils/ownerNotifications";
import { composeFinderText } from "@/lib/publicPet/finder";

// The push for "someone found your pet and wrote to you" (public tag page).
//
//   • Whether it is URGENT is decided by the database and the sender limits (0146): an urgent one asks iOS to break
//     through Focus modes (interruption level "time-sensitive"; needs the app entitlement, and a build without it
//     simply receives a normal push). Any other is an ordinary notification.
//   • The OWNER's push ignores quiet hours, the daily cap and category switches on purpose.
//   • Family members and caregivers are also notified, but each one's own settings apply: the "Lost pet alerts"
//     switch and quiet hours. A setting only silences the phone; their in-app notification is already saved.
// Called AFTER the request transaction has committed, so a slow or failing push can never lose the in-app message.

/** The existing preference category that covers finder messages for family members and caregivers. */
export const MEMBER_PUSH_CATEGORY = "owner_lost_alerts";

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

async function sendOne(recipient, { petId, petName, finder, urgent }) {
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
      priority: urgent ? "high" : "default",
      // Expo's push API spells it with a hyphen.
      interruptionLevel: urgent ? "time-sensitive" : "active",
    },
    { type: "emergency_contact", category: null, subjectRef, cap: null },
  );
}

/** Never throws. One recipient's failure never stops the others. */
export async function sendEmergencyFinderPush({ recipient, members = [], ...message }) {
  let timer;
  const guarded = (job) =>
    job().catch((e) => console.error("[sendEmergencyFinderPush] non-fatal:", e?.message));
  try {
    const sends = [
      guarded(() => sendOne(recipient, message)),
      ...members.map((member) =>
        guarded(async () => {
          if (await ownerSettingsAllowPush(member, MEMBER_PUSH_CATEGORY)) await sendOne(member, message);
        }),
      ),
    ];
    await Promise.race([
      Promise.all(sends),
      new Promise((resolve) => {
        timer = setTimeout(resolve, PUSH_WAIT_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
