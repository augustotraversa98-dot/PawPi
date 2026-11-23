// Spanish (es-AR) coverage for text that is GENERATED at runtime outside React: reminder titles /
// descriptions / action labels, in-app reminder notifications, calendar event text, HealthKit alerts,
// snooze + reminder-type labels. Proves (a) the copy is Spanish when the app language is Spanish,
// (b) ids / types / stored values are NOT touched by the language, (c) the English fallback is still
// what a un-initialised i18n (every other unit test) sees, and (d) every key the code references exists
// in BOTH catalogs with the same English wording the code falls back to.

import fs from "fs";
import path from "path";
import { Alert } from "react-native";

let mockLang = "es";
jest.mock("react-i18next", () => {
  const catalogs = {
    en: require("@/i18n/locales/en.json"),
    es: require("@/i18n/locales/es.json"),
  };
  const resolve = (cat, key) =>
    key.split(".").reduce((o, part) => (o == null ? o : o[part]), cat);
  return {
    useTranslation: () => ({ t: (k) => k }),
    getI18n: () => ({
      t: (key, vars) => {
        const cat = catalogs[mockLang];
        let s = resolve(cat, key);
        if (typeof s !== "string" && vars && typeof vars.count === "number") {
          s = resolve(cat, key + (vars.count === 1 ? "_one" : "_other"));
        }
        if (typeof s !== "string") return key;
        if (vars)
          for (const [n, v] of Object.entries(vars))
            s = s.replace(new RegExp(`{{\\s*${n}\\s*}}`, "g"), String(v));
        return s;
      },
    }),
  };
});

import en from "@/i18n/locales/en.json";
import es from "@/i18n/locales/es.json";
import { ROUTINE_TYPES, ROUTINE_FREQUENCY } from "@/data/routinesData";
import {
  getTimeDisplay,
  SNOOZE_OPTIONS,
  REMINDER_TYPE_CONFIG,
} from "@/data/remindersData";
import { generateRemindersFromRoutine, generateOverdueInstances } from "./reminderGenerator";
import { generateNotificationFromReminder } from "./notificationGenerator";
import {
  buildEventNotes,
  formatFrequency,
  buildBookingCalendarDetails,
  buildTelehealthCalendarDetails,
  buildTransportCalendarDetails,
  buildEventCalendarDetails,
} from "./calendarFormat";
import { routeReminderLog } from "./reminderLogFlow";
import {
  getTrackingSourceDisplay,
  formatSteps,
  requestHealthKitPermission,
} from "./healthKitIntegration";
import { gt, actionLabel, photoCheckTitle, photoCheckDescription } from "./generatedCopy";

const NOW = new Date("2026-06-10T08:00:00");

beforeAll(() => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
});
afterAll(() => jest.useRealTimers());
beforeEach(() => {
  mockLang = "es";
});

const base = { id: "100", petId: "42", isActive: true, notificationEnabled: true, times: [], days: [] };
const dateInDays = (n) => {
  const d = new Date(NOW);
  d.setDate(d.getDate() + n);
  return d.toISOString().split("T")[0];
};

// A routine of every generated type, so the id/type comparison covers every generator.
const ROUTINES = [
  { ...base, type: ROUTINE_TYPES.FEEDING, meals: [{ id: "m1", name: "", time: "07:00", frequency: ROUTINE_FREQUENCY.DAILY }] },
  { ...base, type: ROUTINE_TYPES.WALK, walks: [{ id: "w1", name: "Morning walk", time: "08:30", frequency: ROUTINE_FREQUENCY.DAILY }] },
  { ...base, type: ROUTINE_TYPES.MEDICATION, frequency: ROUTINE_FREQUENCY.DAILY, times: ["09:00"], medicationName: "" },
  {
    ...base,
    type: ROUTINE_TYPES.PHOTO_CHECK,
    photoCheckSchedule: [
      { bodyArea: "ears", frequency: ROUTINE_FREQUENCY.DAILY, preferredTime: "10:00" },
      { bodyArea: "skin_fur", frequency: ROUTINE_FREQUENCY.DAILY, preferredTime: "10:00" },
    ],
  },
  { ...base, type: ROUTINE_TYPES.GENERAL_CHECK, frequency: ROUTINE_FREQUENCY.DAILY, times: ["20:00"] },
  { ...base, type: ROUTINE_TYPES.WEIGHT_CHECK, frequency: ROUTINE_FREQUENCY.DAILY, times: ["09:00"] },
  { ...base, type: ROUTINE_TYPES.PREVENTIVE, nextDue: `${dateInDays(2)}T10:00:00`, treatmentType: "flea", productName: "" },
  { ...base, type: ROUTINE_TYPES.VACCINE, nextDue: `${dateInDays(3)}T10:00:00`, vaccineName: "" },
  { ...base, type: ROUTINE_TYPES.VET_APPOINTMENT, date: dateInDays(4), times: ["11:00"], appointmentTitle: "", clinic: "", reason: "" },
  {
    ...base,
    type: ROUTINE_TYPES.WELLNESS_CHECK,
    wellnessCheckItems: [
      { checkType: "body_condition", frequency: ROUTINE_FREQUENCY.DAILY, preferredTime: "09:00" },
      { checkType: "mood_energy", frequency: ROUTINE_FREQUENCY.DAILY, preferredTime: "09:00" },
    ],
  },
  {
    ...base,
    type: ROUTINE_TYPES.MEDICAL_CARE,
    medicalCareItems: [
      { id: "c1", type: "medication", name: "", frequency: ROUTINE_FREQUENCY.DAILY, times: ["09:00"] },
      { id: "c2", type: "vaccine", name: "Rabia", nextDue: dateInDays(5), frequency: "once", times: ["09:00"] },
      { id: "c3", type: "supplement", name: "Omega", timingMode: "linked", linkedMeal: "breakfast", frequency: ROUTINE_FREQUENCY.DAILY, times: ["09:00"] },
    ],
  },
];

const generateAll = () => ROUTINES.flatMap((r) => generateRemindersFromRoutine(r, 10));
const idsAndTypes = (list) =>
  list.map((r) => ({ id: r.id, type: r.type, careType: r.careType, scheduledAt: r.scheduledAt, relatedTracker: r.relatedTracker, relatedBodyArea: r.relatedBodyArea }));

describe("reminderGenerator is localized without touching identity", () => {
  it("ids, types, schedule and trackers are identical in Spanish and English; only text differs", () => {
    mockLang = "en";
    const english = generateAll();
    mockLang = "es";
    const spanish = generateAll();
    expect(english.length).toBeGreaterThan(10);
    expect(idsAndTypes(spanish)).toEqual(idsAndTypes(english));
    // every generated type produced something
    expect(new Set(spanish.map((r) => r.type)).size).toBeGreaterThanOrEqual(10);
  });

  it("emits Spanish titles, descriptions and action labels", () => {
    const list = generateAll();
    const by = (pred) => list.find(pred);
    expect(by((r) => r.type === "feeding").title).toBe("Comida");
    expect(by((r) => r.type === "feeding").description).toBe("Es hora de comida");
    expect(by((r) => r.type === "feeding").primaryAction).toBe("Registrar comida");
    expect(by((r) => r.type === "walk").description).toBe("Es hora de morning walk"); // user-named walk stays as typed
    expect(by((r) => r.type === "walk").primaryAction).toBe("Empezar paseo");
    const med = by((r) => r.type === "medication");
    expect(med.title).toBe("Medicación");
    expect(med.description).toBe("Dosis - Dar la medicación");
    expect(med.primaryAction).toBe("Marcar aplicada");
    expect(by((r) => r.type === "photo_check" && r.relatedBodyArea === "ears").title).toBe("Foto de las orejas");
    expect(by((r) => r.type === "photo_check" && r.relatedBodyArea === "ears").description).toBe("Sacá una foto de las orejas");
    expect(by((r) => r.type === "photo_check" && r.relatedBodyArea === "skin_fur").title).toBe("Foto de la piel y el pelaje");
    expect(by((r) => r.type === "general_check").title).toBe("Chequeo general");
    expect(by((r) => r.type === "weight_check").title).toBe("Chequeo de peso");
    expect(by((r) => r.type === "weight_check").primaryAction).toBe("Registrar peso");
    expect(by((r) => r.type === "preventive").title).toBe("Cuidado preventivo");
    expect(by((r) => r.type === "preventive").description).toBe("Prevención de pulgas pendiente");
    expect(by((r) => r.type === "vaccine").title).toBe("Vence Vacuna");
    expect(by((r) => r.type === "vaccine").primaryAction).toBe("Ver registro de vacunas");
    const vet = by((r) => r.type === "vet_appointment");
    expect(vet.title).toBe("Turno veterinario");
    expect(vet.description).toBe("Visita al veterinario - Turno");
    expect(vet.primaryAction).toBe("Preparar resumen para el vet");
    const bc = by((r) => r.checkType === "body_condition");
    expect(bc.title).toBe("Chequeo de condición corporal");
    expect(bc.description).toBe("Evaluá la condición corporal de tu mascota");
    expect(bc.primaryAction).toBe("Empezar chequeo");
    expect(by((r) => r.checkType === "mood_energy").primaryAction).toBe("Registrar chequeo");
    const care = list.filter((r) => r.type === "medical_care");
    expect(care.find((r) => r.careType === "medication").title).toBe("Medicación");
    expect(care.find((r) => r.careType === "medication").primaryAction).toBe("Marcar aplicada");
    expect(care.find((r) => r.careType === "vaccine").title).toBe("Vacuna Rabia pendiente");
    expect(care.find((r) => r.careType === "vaccine").primaryAction).toBe("Agregar a la historia clínica");
    expect(care.find((r) => r.careType === "supplement").description).toBe("Con el desayuno");
  });

  it("never injects English into a Spanish reminder (except user-typed names)", () => {
    const english = /\b(Check|Due|Time for|Take photo|Mark as|Start|Log |Appointment|Medication|Vaccine|Meal|Preventive)\b/;
    for (const r of generateAll()) {
      for (const field of ["title", "description", "primaryAction"]) {
        if (r.title === "Morning walk" || /morning walk/.test(r[field] || "")) continue;
        expect({ id: r.id, field, value: r[field] }).not.toEqual(
          expect.objectContaining({ value: expect.stringMatching(english) }),
        );
      }
    }
  });

  it("falls back to English when the language is English (identical strings to before)", () => {
    mockLang = "en";
    const list = generateAll();
    expect(list.find((r) => r.type === "general_check").title).toBe("General Check");
    expect(list.find((r) => r.type === "feeding").primaryAction).toBe("Log food");
    expect(list.find((r) => r.type === "photo_check" && r.relatedBodyArea === "ears").title).toBe("EARS Check");
    expect(list.find((r) => r.type === "photo_check" && r.relatedBodyArea === "ears").description).toBe("Take photo of ears");
  });

  it("overdue photo-check instances are localized too", () => {
    const overdue = generateOverdueInstances(ROUTINES[3], { lookbackDays: 2, now: NOW });
    expect(overdue.length).toBeGreaterThan(0);
    expect(overdue[0].primaryAction).toBe("Tomar foto");
    expect(overdue.every((r) => r.title.startsWith("Foto de"))).toBe(true);
  });

  it("photoCheckTitle/Description handle unknown and missing areas without crashing", () => {
    expect(photoCheckTitle("whiskers")).toBe("Chequeo de WHISKERS");
    expect(photoCheckTitle(undefined)).toBe("Foto del cuerpo");
    expect(photoCheckDescription(undefined)).toBe("Sacá una foto de la zona del cuerpo");
    expect(photoCheckDescription("whiskers")).toBe("Sacá una foto de whiskers");
  });
});

describe("notificationGenerator (in-app reminder notifications)", () => {
  const due = (over) => ({
    id: "reminder_1",
    routineId: "100",
    petId: "42",
    status: "upcoming",
    nextTriggerAt: new Date(NOW.getTime() - 5 * 60 * 1000).toISOString(), // due now
    priority: "medium",
    timeSensitive: true,
    ...over,
  });

  it("speaks Spanish and keeps ids/types", () => {
    const n = generateNotificationFromReminder(due({ type: "general_check", title: "Chequeo general" }));
    expect(n.id).toBe("notif_reminder_1");
    expect(n.type).toBe("general_check");
    expect(n.title).toBe("Chequeo general pendiente ✅");
    expect(n.message).toBe("Es hora del chequeo de salud semanal de tu mascota.");
    expect(n.actionLabel).toBe("Empezar chequeo");
  });

  it("covers every type + the due-soon countdown with Spanish plurals", () => {
    const soon = (mins) => new Date(NOW.getTime() + mins * 60 * 1000).toISOString();
    expect(generateNotificationFromReminder(due({ type: "feeding", title: "Cena", nextTriggerAt: soon(1) })).message).toBe("Cena empieza en 1 minuto.");
    expect(generateNotificationFromReminder(due({ type: "walk", title: "Paseo", nextTriggerAt: soon(30) })).message).toBe("Paseo empieza en 30 minutos.");
    expect(generateNotificationFromReminder(due({ type: "medication", title: "Pastilla", nextTriggerAt: soon(60) })).message).toBe("Pastilla es en 1 hora.");
    expect(generateNotificationFromReminder(due({ type: "vet_appointment", title: "Control", nextTriggerAt: soon(55) })).message).toBe("Control de tu mascota es en 55 minutos.");
    expect(generateNotificationFromReminder(due({ type: "vet_appointment", title: "Control" })).message).toBe("Tu mascota tiene Control hoy.");
    const late = generateNotificationFromReminder(due({ type: "feeding", title: "Cena", nextTriggerAt: new Date(NOW.getTime() - 3 * 3600 * 1000).toISOString() }));
    expect(late.message).toBe("Cuando quieras — cena 🍽️");
    expect(generateNotificationFromReminder(due({ type: "photo_check", relatedBodyArea: "ears" })).title).toBe("Foto de las orejas pendiente 📸");
    expect(generateNotificationFromReminder(due({ type: "photo_check", relatedBodyArea: "ears" })).message).toMatch(/^Subí la foto semanal de las orejas/);
    expect(generateNotificationFromReminder(due({ type: "weight_check" })).actionLabel).toBe("Registrar peso");
    expect(generateNotificationFromReminder(due({ type: "preventive", title: "NexGard" })).message).toBe("Es hora de NexGard para tu mascota.");
    expect(generateNotificationFromReminder(due({ type: "vaccine", title: "Rabia" })).message).toBe("Vence Rabia de tu mascota.");
    expect(generateNotificationFromReminder(due({ type: "mystery" })).title).toBe("Recordatorio");
  });
});

describe("remindersData display helpers", () => {
  it("getTimeDisplay is Spanish", () => {
    const at = (mins) => ({ nextTriggerAt: new Date(NOW.getTime() + mins * 60 * 1000).toISOString() });
    expect(getTimeDisplay(at(-30))).toBe("vencido hace 30 min");
    expect(getTimeDisplay(at(0))).toBe("ahora");
    expect(getTimeDisplay(at(20))).toBe("en 20 min");
    expect(getTimeDisplay(at(60))).toBe("en 1 hora");
    expect(getTimeDisplay(at(180))).toBe("en 3 horas");
  });

  it("snooze options and reminder-type config resolve in the CURRENT language, values untouched", () => {
    expect(SNOOZE_OPTIONS.map((o) => o.label)).toEqual(["10 minutos", "30 minutos", "1 hora", "Esta noche", "Mañana"]);
    expect(SNOOZE_OPTIONS.map((o) => o.value)).toEqual([10, 30, 60, "tonight", "tomorrow"]);
    expect(REMINDER_TYPE_CONFIG.vet_appointment.label).toBe("Turno veterinario");
    expect(REMINDER_TYPE_CONFIG.medication.actionLabel).toBe("Marcar aplicada");
    expect(REMINDER_TYPE_CONFIG.photo_check.icon).toBe("📸");
    mockLang = "en";
    expect(SNOOZE_OPTIONS[3].label).toBe("Tonight");
    expect(REMINDER_TYPE_CONFIG.photo_check.label).toBe("Photo Check");
  });
});

describe("calendar event text", () => {
  it("vet notes are Spanish", () => {
    const notes = buildEventNotes("vet", {
      petName: "Mango",
      title: "Control anual",
      reasonForVisit: "Vacunas",
      veterinarian: "Dra. Pérez",
      notes: "Llevar libreta",
    });
    expect(notes).toBe(
      "Turno veterinario de Mango\n\nTurno: Control anual\nMotivo: Vacunas\nVeterinario: Dra. Pérez\n\nNotas: Llevar libreta\n\nGestionado con PawPi",
    );
    expect(buildEventNotes("vet", {})).toMatch(/^Turno veterinario de Tu mascota/);
    expect(buildEventNotes("walk")).toBe("Paseo agendado en PawPi");
  });

  it("surface builders are Spanish and keep user data verbatim", () => {
    const b = buildBookingCalendarDetails({ appointment_date: "2026-07-01", appointment_time: "10:00", reason_for_visit: "Baño" }, "Mango");
    expect(b.summary).toBe("Turno de Mango");
    expect(b.notes).toBe("Baño\nGestionado con PawPi");
    const t = buildTelehealthCalendarDetails({ starts_at: "2026-07-01T10:00:00Z", provider_name: "Dr. Gómez" }, "Mango");
    expect(t.summary).toBe("Consulta de telemedicina de Mango");
    expect(t.notes).toBe("Videoconsulta — sin lugar físico.\nPrestador: Dr. Gómez\nGestionado con PawPi");
    const tr = buildTransportCalendarDetails({ scheduled_at: "2026-07-01T10:00:00Z", provider_name: "PetTaxi", pickup_address: "Calle 1", dropoff_address: "Calle 2" });
    expect(tr.summary).toBe("Transporte de mascotas — PetTaxi");
    expect(tr.notes).toBe("Retiro: Calle 1\nEntrega: Calle 2\nGestionado con PawPi");
    expect(buildEventCalendarDetails({ starts_at: "2026-07-01T10:00:00Z" }).summary).toBe("Evento");
  });

  it("formatFrequency is Spanish", () => {
    expect(formatFrequency({ frequency: ROUTINE_FREQUENCY.DAILY })).toBe("todos los días");
    expect(formatFrequency({ frequency: ROUTINE_FREQUENCY.WEEKLY, days: [1, 3] })).toBe("cada Lun, Mié");
    expect(formatFrequency({ frequency: ROUTINE_FREQUENCY.MONTHLY, preferredDay: 5 })).toBe("mensual, el día 5");
    expect(formatFrequency({})).toBe("una sola vez");
  });
});

describe("reminder log flow option labels", () => {
  it("are Spanish; actions (stored routing values) are unchanged", () => {
    const veg = routeReminderLog({ type: "medical_care", careType: "vaccine" });
    expect(veg.options).toEqual([
      { action: "add_vet_record", label: "Agregar a la historia clínica" },
      { action: "completed", label: "Marcar como completado" },
    ]);
    const med = routeReminderLog({ type: "medical_care", careType: "medication" });
    expect(med.options).toEqual([
      { action: "given", label: "Marcar aplicada" },
      { action: "issue", label: "Algo estuvo raro" },
    ]);
    expect(routeReminderLog({ type: "feeding" }).options).toEqual([
      { action: "log_as_usual", label: "Registrar como siempre" },
      { action: "issue", label: "Algo estuvo raro" },
    ]);
    // the persisted note is a stored value — deliberately not localized
    expect(routeReminderLog({ type: "medical_care", careType: "vaccine" }, { action: "add_vet_record" }).notes).toBe("Added to vet record");
  });
});

describe("HealthKit text", () => {
  it("source labels and steps are Spanish", () => {
    expect(getTrackingSourceDisplay("apple_health")).toBe("Registrado con Apple Health");
    expect(getTrackingSourceDisplay("gps")).toBe("Registrado con GPS");
    expect(getTrackingSourceDisplay("manual")).toBe("Registrado a mano");
    expect(formatSteps(1234)).toMatch(/pasos$/);
  });

  it("the permission rationale alert is Spanish", async () => {
    const spy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const pending = requestHealthKitPermission();
    const [title, body, buttons] = spy.mock.calls[0];
    expect(title).toBe("Acceso a Apple Health");
    expect(body).toMatch(/^PawPi puede usar/);
    expect(buttons.map((b) => b.text)).toEqual(["Ahora no", "Permitir"]);
    buttons[0].onPress();
    await expect(pending).resolves.toBe(false);
    spy.mockRestore();
  });
});

describe("catalog <-> code consistency", () => {
  const files = [
    "utils/reminderGenerator.js",
    "utils/notificationGenerator.js",
    "utils/notifications.js",
    "utils/calendarFormat.js",
    "utils/calendarIntegration.js",
    "utils/healthKitIntegration.js",
    "utils/generatedCopy.js",
    "data/remindersData.js",
  ].map((f) => path.join(__dirname, "..", f));
  const get = (cat, key) => key.split(".").reduce((o, p) => (o == null ? o : o[p]), cat);
  const has = (cat, key) =>
    typeof get(cat, key) === "string" ||
    typeof get(cat, key + "_other") === "string" ||
    typeof get(cat, key + "_one") === "string";

  it("every literal gt() key exists in both catalogs, and the English fallback matches the English catalog", () => {
    const re = /gt\(\s*"(generatedUi\.[\w.]+)"\s*,\s*"((?:[^"\\]|\\.)*)"/g;
    let checked = 0;
    for (const file of files) {
      const src = fs
        .readFileSync(file, "utf8")
        .split("\n")
        .filter((line) => !/^\s*(\/\/|\*)/.test(line))
        .join("\n");
      let m;
      while ((m = re.exec(src))) {
        const [, key, fallback] = m;
        expect({ file: path.basename(file), key, inEn: has(en, key) }).toEqual({ file: path.basename(file), key, inEn: true });
        expect({ file: path.basename(file), key, inEs: has(es, key) }).toEqual({ file: path.basename(file), key, inEs: true });
        const enValue = get(en, key) ?? get(en, key + "_other");
        if (typeof enValue === "string") {
          expect({ key, fallback }).toEqual({ key, fallback: enValue });
        }
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(80);
  });

  it("every action name, area and wellness/care type used dynamically has Spanish copy", () => {
    for (const name of Object.keys(es.generatedUi.action)) {
      expect(es.generatedUi.action[name]).not.toBe(en.generatedUi.action[name] === "Done" ? "" : en.generatedUi.action[name]);
      expect(actionLabel(name)).toBe(es.generatedUi.action[name]);
    }
    for (const area of ["paws", "ears", "eyes", "teeth", "skin_fur", "face", "full_body", "other", "body"]) {
      expect(typeof es.generatedUi.areas[area]).toBe("string");
      expect(typeof es.generatedUi.photoCheckTitle[area]).toBe("string");
    }
    for (const t of ["general", "weight", "body_condition", "mobility", "mood_energy", "skin_coat", "appetite_hydration", "fallback"]) {
      expect(typeof es.generatedUi.wellness.label[t]).toBe("string");
      expect(typeof es.generatedUi.wellness.description[t]).toBe("string");
    }
  });

  it("gt falls back to interpolated English when the key is missing", () => {
    expect(gt("generatedUi.nope", "Hello {{name}}", { name: "Mango" })).toBe("Hello Mango");
  });
});
