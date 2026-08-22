// Reminders / Routines. Reminders are derived, not stored — they come from
// routines plus reminder-enabled meds/vaccinations/appointments (seeded in the
// Health & Vet sections). Here we create the routine schedule so "Today" shows
// feeding, walk, medication and wellness items due.
export default async function seedReminders(ctx) {
  const { A, mango, report } = ctx;
  const r = report.section("Reminders / Routines");
  const petId = mango.id;

  let existingTypes = new Set();
  try {
    const res = await A.get(`/api/routines?petId=${petId}`);
    for (const rt of res.data?.routines || []) {
      existingTypes.add(rt.routine_type || rt.type);
    }
  } catch (e) {
    r.note(`could not read routines: ${e.message}`);
  }

  const routines = [
    {
      type: "feeding",
      title: "Comida",
      frequency: "daily",
      times: ["08:00", "18:00"],
      notificationEnabled: true,
      feedingSchedule: {
        meals: [
          { time: "08:00", portion: "1.5 tazas", food: "Balanceado pollo y arroz" },
          { time: "18:00", portion: "1.5 tazas", food: "Balanceado pollo y arroz" },
        ],
      },
    },
    {
      type: "walk",
      title: "Paseo",
      frequency: "daily",
      times: ["07:30", "20:00"],
      notificationEnabled: true,
      walkSchedule: { times: ["07:30", "20:00"], durationMinutes: 30 },
    },
    {
      type: "medication",
      title: "Apoquel",
      frequency: "daily",
      times: ["09:00"],
      notificationEnabled: true,
      medicationDetails: { name: "Apoquel", dose: "16mg", times: ["09:00"], withFood: true },
    },
    {
      type: "wellness_check",
      title: "Chequeo de bienestar",
      frequency: "weekly",
      days: ["sun"],
      notificationEnabled: true,
      wellnessCheckSchedule: { frequency: "weekly", day: "sun", time: "10:00" },
    },
  ];

  let made = 0;
  for (const routine of routines) {
    if (existingTypes.has(routine.type)) {
      r.skipped(`${routine.type} routine`);
      continue;
    }
    try {
      const res = await A.post("/api/routines", { petId, ...routine });
      if (res.ok && res.data?.routine) {
        made++;
        r.created(`${routine.type} routine (${res.data.routine.id})`);
      } else {
        r.error(`${routine.type} routine: ${res.status} ${JSON.stringify(res.data).slice(0, 140)}`);
      }
    } catch (e) {
      r.error(`${routine.type} routine: ${e.message}`);
    }
  }

  if (made === 0 && existingTypes.size > 0) {
    r.note(`routines already present: ${[...existingTypes].join(", ")}`);
  }
  r.note("A vet appointment reminder is created in the Vet Record section.");
}
