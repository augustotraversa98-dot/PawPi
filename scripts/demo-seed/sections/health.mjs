// Health → Today + history: weight, food, walks, wellness, photo checks,
// general checks, meds, preventives, poo/pee/vomit, and medical-care history.
import { iso, daysAgo, atHour } from "../lib.mjs";

// Create records for one tracker only if it doesn't already have enough.
async function topUp(r, A, { label, listUrl, listKey, have, target, makers }) {
  let existing = 0;
  try {
    const res = await A.get(listUrl);
    const arr = (res.data && (res.data[listKey] || [])) || [];
    existing = arr.length;
  } catch {
    /* treat as empty */
  }
  if (existing >= target) {
    r.skipped(`${label} (${existing} already)`);
    return;
  }
  const toMake = makers.slice(0, target - existing);
  for (const make of toMake) {
    try {
      const { path, body, idKey } = make();
      const res = await A.post(path, body);
      const created = res.data && (res.data[idKey] || res.data.log);
      if (res.ok && created) r.created(`${label}: ${created.id ?? "ok"}`);
      else r.error(`${label}: ${res.status} ${JSON.stringify(res.data).slice(0, 160)}`);
    } catch (e) {
      r.error(`${label}: ${e.message}`);
    }
  }
}

export default async function seedHealth(ctx) {
  const { A, img, mango, report } = ctx;
  const r = report.section("Health");
  const petId = mango.id;

  // Upload photos used by photo-checks up front (cached).
  let teethPhoto, pawsPhoto;
  try {
    teethPhoto = await img("dog-moment-2.jpg");
    pawsPhoto = await img("dog-moment-4.jpg");
  } catch (e) {
    r.note(`photo upload issue: ${e.message}`);
  }

  await topUp(r, A, {
    label: "weight log",
    listUrl: `/api/health/weight-logs?petId=${petId}`,
    listKey: "logs",
    target: 2,
    makers: [
      () => ({ path: "/api/health/weight-logs", idKey: "log", body: { petId, weight: 14.3, weightUnit: "kg", bodyShapeEstimate: "ideal", notes: "Peso estable, en forma" } }),
      () => ({ path: "/api/health/weight-logs", idKey: "log", body: { petId, weight: 14.1, weightUnit: "kg", bodyShapeEstimate: "ideal", notes: "Control mensual" } }),
    ],
  });

  await topUp(r, A, {
    label: "food log",
    listUrl: `/api/health/food-logs?petId=${petId}`,
    listKey: "logs",
    target: 2,
    makers: [
      () => ({ path: "/api/health/food-logs", idKey: "log", body: { petId, mealType: "breakfast", foodName: "Balanceado pollo y arroz", amount: "1.5 tazas", appetite: "ansioso", finishedMeal: true } }),
      () => ({ path: "/api/health/food-logs", idKey: "log", body: { petId, mealType: "dinner", foodName: "Balanceado pollo y arroz", amount: "1.5 tazas", appetite: "normal", finishedMeal: true } }),
    ],
  });

  await topUp(r, A, {
    label: "walk log",
    listUrl: `/api/health/walk-logs?petId=${petId}`,
    listKey: "logs",
    target: 2,
    makers: [
      () => ({ path: "/api/health/walk-logs", idKey: "log", body: { petId, startTime: iso(atHour(daysAgo(0), 8, 0)), durationMinutes: 35, distance: 2.4, distanceUnit: "km", energyAfter: "feliz", routeOrLocation: "Bosques de Palermo", pottyEvents: { pee: 2, poo: 1 } } }),
      () => ({ path: "/api/health/walk-logs", idKey: "log", body: { petId, startTime: iso(atHour(daysAgo(1), 19, 30)), durationMinutes: 25, distance: 1.7, distanceUnit: "km", energyAfter: "tranquilo", routeOrLocation: "Vuelta a la manzana", pottyEvents: { pee: 1, poo: 0 } } }),
    ],
  });

  await topUp(r, A, {
    label: "wellness log",
    listUrl: `/api/health/wellness-logs?petId=${petId}`,
    listKey: "logs",
    target: 2,
    makers: [
      () => ({ path: "/api/health/wellness-logs", idKey: "log", body: { petId, checkType: "skin_coat", valuesJson: { coat: "brillante", dryness: "ninguna" }, notes: "Pelaje sano" } }),
      () => ({ path: "/api/health/wellness-logs", idKey: "log", body: { petId, checkType: "mood_energy", valuesJson: { mood: "juguetón", energy: "alta" }, notes: "Muy activo hoy" } }),
    ],
  });

  await topUp(r, A, {
    label: "photo check",
    listUrl: `/api/health/photo-checks?petId=${petId}`,
    listKey: "photoChecks",
    target: 2,
    makers: [
      () => ({ path: "/api/health/photo-checks", idKey: "photoCheck", body: { petId, bodyArea: "teeth", imageUrl: teethPhoto, notes: "Dientes limpios, sin sarro" } }),
      () => ({ path: "/api/health/photo-checks", idKey: "photoCheck", body: { petId, bodyArea: "paws", imageUrl: pawsPhoto, notes: "Almohadillas en buen estado" } }),
    ].filter(() => teethPhoto && pawsPhoto),
  });
  if (!(teethPhoto && pawsPhoto)) r.note("photo checks skipped (no image URL)");

  await topUp(r, A, {
    label: "general check",
    listUrl: `/api/health/general-checks?petId=${petId}`,
    listKey: "checks",
    target: 1,
    makers: [
      () => ({ path: "/api/health/general-checks", idKey: "check", body: { petId, eyesStatus: "claros", earsStatus: "limpias", teethStatus: "ok", skinFurStatus: "sano", pawsStatus: "ok", mood: "juguetón", energy: "alta", notes: "Revisión general sin novedades" } }),
    ],
  });

  await topUp(r, A, {
    label: "medication",
    listUrl: `/api/health/medications?petId=${petId}`,
    listKey: "medications",
    target: 1,
    makers: [
      () => ({ path: "/api/health/medications", idKey: "medication", body: { petId, name: "Apoquel", dose: "16mg", frequency: "una vez al día", prescribedBy: "Dra. Reyes", startDate: "2026-08-01", reminderEnabled: true } }),
    ],
  });

  await topUp(r, A, {
    label: "preventive treatment",
    listUrl: `/api/health/preventive-treatments?petId=${petId}`,
    listKey: "treatments",
    target: 2,
    makers: [
      () => ({ path: "/api/health/preventive-treatments", idKey: "treatment", body: { petId, productName: "NexGard", treatmentType: "flea_tick", frequency: "mensual", lastGiven: "2026-08-01", nextDue: "2026-09-01", reminderEnabled: true } }),
      () => ({ path: "/api/health/preventive-treatments", idKey: "treatment", body: { petId, productName: "Milbemax", treatmentType: "heartworm", frequency: "mensual", lastGiven: "2026-08-05", nextDue: "2026-09-05", reminderEnabled: true } }),
    ],
  });

  await topUp(r, A, {
    label: "poo log",
    listUrl: `/api/health/poo-logs?petId=${petId}`,
    listKey: "logs",
    target: 1,
    makers: [
      () => ({ path: "/api/health/poo-logs", idKey: "log", body: { petId, amount: "normal", shape: "firme", color: "marrón", straining: false, notes: "Todo normal" } }),
    ],
  });

  await topUp(r, A, {
    label: "pee log",
    listUrl: `/api/health/pee-logs?petId=${petId}`,
    listKey: "logs",
    target: 1,
    makers: [
      () => ({ path: "/api/health/pee-logs", idKey: "log", body: { petId, frequency: "4 veces", volume: "normal", color: "amarillo claro", notes: "Hidratado" } }),
    ],
  });

  await topUp(r, A, {
    label: "vomit log",
    listUrl: `/api/health/vomit-logs?petId=${petId}`,
    listKey: "logs",
    target: 1,
    makers: [
      () => ({ path: "/api/health/vomit-logs", idKey: "log", body: { petId, numberOfEpisodes: 1, appearance: "espuma clara", relationToFood: "antes del desayuno", diarrheaPresent: false, notes: "Comió tan rápido, después bien" } }),
    ],
  });

  await topUp(r, A, {
    label: "medical-care log",
    listUrl: `/api/health/medical-care-logs?petId=${petId}`,
    listKey: "logs",
    target: 2,
    makers: [
      () => ({ path: "/api/health/medical-care-logs", idKey: "log", body: { petId, careType: "vaccine", name: "Séxtuple", dose: "1ml", status: "completed", givenAt: iso(atHour(daysAgo(20), 10, 0)) } }),
      () => ({ path: "/api/health/medical-care-logs", idKey: "log", body: { petId, careType: "flea_tick", name: "NexGard", dose: "1 comprimido", status: "given", givenAt: iso(atHour(daysAgo(3), 9, 0)) } }),
    ],
  });
}
