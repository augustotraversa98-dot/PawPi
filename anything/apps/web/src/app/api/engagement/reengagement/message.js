// E12 — the win-back copy (push body + email), EN + ES. WARM, never guilt: no "you haven't", no
// streak-shaming, no escalation. Tied to a REAL hook only (milestone / friend / the pet's own memory).
// The PUSH body is a compact JSON payload localized on the client; the EMAIL is server-rendered and
// defaults to the app's es-AR fallback (both languages live here).

/** Compact JSON body for the 'winback' notification; localized client-side by hook. */
export function winbackPushBody({ hook, petName, friendName = null, milestoneKind = null, inDays = null }) {
  return JSON.stringify({
    hook: hook || "memory",
    pet: petName ?? null,
    friend: friendName ?? null,
    milestone_kind: milestoneKind ?? null,
    in_days: inDays ?? null,
  });
}

const EMAIL = {
  es: {
    subject: (n) => `${n} te extraña 🐾`,
    milestoneGotcha: (n, d) =>
      `Se viene el día de adopción de ${n} en ${d} días 🎉 Un momento perfecto para volver a verse. Abrí PawPi cuando quieras.`,
    milestoneBirthday: (n, d) =>
      `El cumple de ${n} es en ${d} días 🎂 Sería lindo celebrarlo juntos. Te esperamos en PawPi.`,
    friend: (n, f) =>
      `${f} anduvo publicando esta semana y ${n} seguro quiere saludar 🐾 Pasá por PawPi cuando tengas un ratito.`,
    memory: (n) =>
      `${n} te espera con la cola lista 🐾 Una foto o un paseo cortito y vuelven a estar en sintonía. Sin apuro.`,
  },
  en: {
    subject: (n) => `${n} misses you 🐾`,
    milestoneGotcha: (n, d) =>
      `${n}'s gotcha day is in ${d} days 🎉 A perfect moment to reconnect. Open PawPi whenever you like.`,
    milestoneBirthday: (n, d) =>
      `${n}'s birthday is in ${d} days 🎂 It'd be lovely to celebrate together. We'll be in PawPi.`,
    friend: (n, f) =>
      `${f} has been posting this week and ${n} would love to say hi 🐾 Drop by PawPi when you have a minute.`,
    memory: (n) =>
      `${n} is waiting, tail ready 🐾 One photo or a short walk and you're back in sync. No rush at all.`,
  },
};

/** Render the win-back email { subject, text } for a locale (default es-AR fallback). */
export function winbackEmail({
  locale = "es",
  hook = "memory",
  petName,
  friendName = null,
  milestoneKind = null,
  inDays = null,
}) {
  const L = EMAIL[locale] || EMAIL.es;
  const n = petName || (locale === "en" ? "your pup" : "tu compañero");
  let text;
  if (hook === "milestone" && milestoneKind === "birthday") text = L.milestoneBirthday(n, inDays ?? 0);
  else if (hook === "milestone") text = L.milestoneGotcha(n, inDays ?? 0);
  else if (hook === "friend" && friendName) text = L.friend(n, friendName);
  else text = L.memory(n);
  return { subject: L.subject(n), text };
}
