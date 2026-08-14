// E11 — the delivered weekly-digest copy (push body + email), EN + ES.
//
// The PUSH body is a compact JSON payload the mobile client localizes by type (the booking/adoption
// notification pattern) — the server never guesses the user's language for the in-app surface. The
// EMAIL is server-rendered; PawPi has no per-user locale column yet, so the job defaults to the app's
// Spanish (es-AR) fallback while both languages live here so the copy is EN+ES and ready when a locale
// signal exists. Warm and honest for every `state`: a quiet/empty week is never a shame frame.

/** The compact JSON body stored on the 'weekly_digest' notification; localized on the client. */
export function digestPushBody({ petName, walks, ringDays, streak, state, weekStart }) {
  return JSON.stringify({
    pet: petName ?? null,
    walks: Number(walks) || 0,
    ring_days: Number(ringDays) || 0,
    streak: Number(streak) || 0,
    state: state || "rich",
    week_start: weekStart ?? null,
  });
}

const EMAIL = {
  es: {
    subjectRich: (n) => `La semana de ${n} 🐾`,
    subjectQuiet: (n) => `Un lindo momento de ${n} esta semana 🐾`,
    subjectEmpty: (n) => `${n} te espera esta semana 🐾`,
    rich: (n, w, r, s) =>
      `¡Qué semana la de ${n}! ${w} paseos, ${r}/7 días con el aro cerrado` +
      (s > 0 ? `, y una racha de ${s} días` : "") +
      `. Abrí PawPi para ver el resumen y compartirlo. 🐾`,
    quiet: (n) =>
      `Una semana más tranquila para ${n} — y está perfecto. Guardamos un lindo momento para vos. ` +
      `Un paseo corto es una hermosa forma de arrancar la semana. 🐾`,
    empty: (n) =>
      `Esta semana estuvo tranquila. Cuando quieras, una foto o un paseo de ${n} arrancan de nuevo el aro. ` +
      `Te esperamos. 🐾`,
  },
  en: {
    subjectRich: (n) => `${n}'s week 🐾`,
    subjectQuiet: (n) => `One nice moment from ${n} this week 🐾`,
    subjectEmpty: (n) => `${n} is waiting for you this week 🐾`,
    rich: (n, w, r, s) =>
      `What a week for ${n}! ${w} walks, ${r}/7 days with the ring closed` +
      (s > 0 ? `, and a ${s}-day streak` : "") +
      `. Open PawPi to see the recap and share it. 🐾`,
    quiet: (n) =>
      `A quieter week for ${n} — and that's okay. We saved one nice moment for you. ` +
      `A short walk is a lovely way to start the week. 🐾`,
    empty: (n) =>
      `A quiet week. Whenever you're ready, a photo or a walk with ${n} starts the ring again. ` +
      `We're here. 🐾`,
  },
};

/** Render the email { subject, text } for a locale (default es-AR fallback). */
export function digestEmail({ locale = "es", petName, walks = 0, ringDays = 0, streak = 0, state = "rich" }) {
  const L = EMAIL[locale] || EMAIL.es;
  const n = petName || (locale === "en" ? "your pup" : "tu compañero");
  if (state === "empty") return { subject: L.subjectEmpty(n), text: L.empty(n) };
  if (state === "quiet") return { subject: L.subjectQuiet(n), text: L.quiet(n) };
  return { subject: L.subjectRich(n), text: L.rich(n, walks, ringDays, streak) };
}
