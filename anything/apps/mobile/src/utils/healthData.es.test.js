// Spanish (es-AR) output of the pure health data/derived-text utils: routine summaries, insight sentences,
// the shareable vet-summary text, the wellness-log schema and the Wrapped slides. English must stay the
// default (the other suites assert it); persisted/stored values must NOT change when the language does.
import i18n from "@/i18n";
import {
  ROUTINE_TYPES,
  ROUTINE_FREQUENCY,
  ROUTINE_TYPE_CONFIG,
  CADENCE_LABELS,
  getCadenceLabel,
  getScheduleSummary,
} from "@/data/routinesData";
import { detectHealthFlags, buildRecap, getDisclaimer, quickCheckAreaLabel } from "./healthInsights";
import { summaryToText } from "./vetSummaryText";
import {
  getWellnessSchema,
  validateWellnessForm,
  buildWellnessLogPayload,
} from "./wellnessLog";
import { buildWrapped, wrappedSlides } from "./memoriesWrapped";

const TUTEO = /\b(puedes|elige|toca|tienes|haz|registra tus)\b/i;

beforeAll(async () => {
  await i18n.changeLanguage("es");
});
afterAll(async () => {
  await i18n.changeLanguage("en");
});

describe("routinesData — Spanish", () => {
  it("localizes routine type names/descriptions and cadence labels (no English left)", () => {
    expect(ROUTINE_TYPE_CONFIG[ROUTINE_TYPES.FEEDING].label).toBe("Comidas");
    expect(ROUTINE_TYPE_CONFIG[ROUTINE_TYPES.WALK].label).toBe("Paseos");
    expect(ROUTINE_TYPE_CONFIG[ROUTINE_TYPES.VET_APPOINTMENT].label).toBe("Turno veterinario");
    expect(ROUTINE_TYPE_CONFIG[ROUTINE_TYPES.PHOTO_CHECK].description).toMatch(/Fotos periódicas/);
    expect(getCadenceLabel(ROUTINE_FREQUENCY.EVERY_3_MONTHS)).toBe("cada 3 meses");
    expect(CADENCE_LABELS[ROUTINE_FREQUENCY.BIWEEKLY]).toBe("cada 2 semanas");
    // the enum VALUE (what is persisted/compared) is untouched
    expect(ROUTINE_FREQUENCY.EVERY_3_MONTHS).toBe("every_3_months");
    expect(ROUTINE_TYPES.PHOTO_CHECK).toBe("photo_check");
  });

  it("builds Spanish schedule summaries", () => {
    const feeding = {
      type: ROUTINE_TYPES.FEEDING,
      isActive: true,
      meals: [
        { name: "Desayuno", time: "08:00", frequency: ROUTINE_FREQUENCY.DAILY },
        { name: "Cena", time: "20:00", frequency: ROUTINE_FREQUENCY.DAILY },
      ],
    };
    expect(getScheduleSummary(feeding)).toBe("Todos los días a las 08:00 y 20:00");
    expect(getScheduleSummary({ ...feeding, isActive: false })).toBe("Inactiva");
    expect(
      getScheduleSummary({
        type: ROUTINE_TYPES.FEEDING,
        isActive: true,
        meals: [
          { name: "A", time: "08:00", frequency: ROUTINE_FREQUENCY.WEEKDAYS },
          { name: "B", time: "20:00", frequency: ROUTINE_FREQUENCY.DAILY },
        ],
      }),
    ).toBe("2 comidas con horarios personalizados");

    const wellness = {
      type: ROUTINE_TYPES.WELLNESS_CHECK,
      isActive: true,
      wellnessCheckItems: [
        { checkType: "mood_energy", frequency: ROUTINE_FREQUENCY.WEEKLY, preferredDay: 6, preferredTime: "09:00" },
      ],
    };
    expect(getScheduleSummary(wellness)).toBe("Ánimo/Energía\nsemanal, domingo a las 09:00");

    const photo = {
      type: ROUTINE_TYPES.PHOTO_CHECK,
      isActive: true,
      photoCheckSchedule: [
        { bodyArea: "ears", frequency: ROUTINE_FREQUENCY.MONTHLY, preferredDay: 0, preferredTime: "10:00" },
      ],
    };
    expect(getScheduleSummary(photo)).toBe("Orejas\nmensual, lunes a las 10:00");

    expect(
      getScheduleSummary({
        type: ROUTINE_TYPES.MEDICATION,
        isActive: true,
        frequency: ROUTINE_FREQUENCY.WEEKLY,
        days: [0],
        times: ["21:00"],
      }),
    ).toBe("Todos los lunes a las 21:00");
    expect(
      getScheduleSummary({
        type: ROUTINE_TYPES.MEDICAL_CARE,
        isActive: true,
        medicalCareItems: [{ type: "vaccine", name: "Rabia", nextDue: "2026-12-01" }],
      }),
    ).toBe("Rabia (próxima dosis: 2026-12-01)");
  });
});

describe("healthInsights — Spanish", () => {
  const summary = {
    pet: { name: "Rex" },
    food: { count: 4, lowAppetiteCount: 3 },
    poo: { count: 3, abnormalCount: 3 },
    pee: { count: 3, concernCount: 2 },
    vomit: { episodes: 3, events: [{}] },
    weight: { series: [{ weight: 50 }, { weight: 44 }] },
    meds: [{ name: "Apoquel", given: 5, total: 7, missed: 2 }],
    generalChecks: { areasChanged: ["ears", "paws"] },
  };

  it("renders flags in Spanish with interpolation and plural forms", () => {
    const flags = detectHealthFlags(summary);
    const byKey = Object.fromEntries(flags.map((f) => [f.key, f]));
    expect(byKey["quick-check-changes"].title).toBe("El chequeo rápido marcó 2 zonas");
    expect(byKey["quick-check-changes"].detail).toBe(
      "En un chequeo rápido de este período se marcaron cambios en: Orejas, Patas.",
    );
    expect(byKey["weight-loss"].title).toBe("El peso viene bajando");
    expect(byKey["weight-loss"].detail).toBe("El peso registrado de Rex bajó cerca de un 12% en este período.");
    expect(byKey["vomiting"].detail).toBe("Se registraron 3 episodios de vómito en este período.");
    expect(byKey["med-Apoquel"].title).toBe("Apoquel: 2 dosis omitidas");
    expect(byKey["med-Apoquel"].detail).toBe("71% de cumplimiento (5/7 dosis dadas).");
    // singular
    const one = detectHealthFlags({ ...summary, generalChecks: { areasChanged: ["ears"] }, meds: [{ name: "X", given: 6, total: 7, missed: 1 }] });
    expect(one.find((f) => f.key === "quick-check-changes").title).toBe("Chequeo rápido: cambios en orejas");
    expect(one.find((f) => f.key === "med-X").title).toBe("X: 1 dosis omitida");
    for (const f of flags) expect(`${f.title} ${f.detail}`).not.toMatch(TUTEO);
  });

  it("keeps the non-diagnostic positioning in the recap and disclaimer", () => {
    const flags = detectHealthFlags(summary);
    const recap = buildRecap(summary, flags);
    expect(recap).toMatch(/no un diagnóstico/);
    expect(recap).toContain("Rex");
    expect(buildRecap({ pet: { name: "Rex" } }, [])).toMatch(/Todavía no hay suficientes registros/);
    expect(getDisclaimer()).toMatch(/No diagnostica ni reemplaza/);
    expect(quickCheckAreaLabel("teeth")).toBe("Dientes y boca");
    expect(quickCheckAreaLabel("unknown_key")).toBe("unknown_key");
  });
});

describe("vetSummaryText — Spanish", () => {
  it("produces the shareable text in Spanish", () => {
    const summary = {
      pet: { name: "Rex", breed: "Labrador" },
      range: { from: "2026-06-01", to: "2026-06-18" },
      food: { count: 6, lowAppetiteCount: 2 },
      poo: { count: 5, abnormalCount: 1 },
      pee: { count: 4, concernCount: 0 },
      vomit: { episodes: 2 },
      weight: { series: [{ weight: 50, unit: "lbs" }, { weight: 46, unit: "lbs" }] },
      walks: { count: 3, totalMinutes: 90 },
      photoChecks: { count: 4 },
      meds: [{ name: "Apoquel", dose: "16mg", given: 6, total: 7 }],
      generalChecks: { count: 2, areasChanged: ["ears", "paws"] },
      conditions: [{ condition: "Artritis" }],
      allergies: [{ allergen: "Pollo" }],
    };
    const text = summaryToText(summary, [{ title: "El peso viene bajando", detail: "cerca de un 8%" }], ["¿Es grave?"]);
    expect(text).toContain("Resumen para el veterinario de PawPi — Rex");
    expect(text).toContain("Período: 2026-06-01 → 2026-06-18");
    expect(text).toContain("Para conversar con tu veterinario:");
    expect(text).toContain("Registros de comida: 6 (2 con poco apetito)");
    expect(text).toContain("Materia fecal: 5 (1 anormales)");
    expect(text).toContain("Episodios de vómito: 2");
    expect(text).toContain("Peso: 50lbs → 46lbs (2 pesajes)");
    expect(text).toContain("Paseos: 3 (90 min)");
    expect(text).toContain("Chequeos rápidos: 2 (con cambios: Orejas, Patas)");
    expect(text).toContain("Apoquel (16mg): 6/7 dosis dadas");
    expect(text).toContain("Alergia: Pollo");
    expect(text).toContain("Preguntas para el veterinario:");
    expect(text).toMatch(/No diagnostica ni reemplaza/);
    expect(text).not.toMatch(/Vet Summary|Worth discussing|Questions for/);
  });
});

describe("wellnessLog — Spanish display, English persistence", () => {
  it("localizes the schema labels and validation messages", () => {
    const schema = getWellnessSchema("mobility");
    expect(schema.label).toBe("Movilidad");
    expect(schema.options.map((o) => o.label)).toEqual([
      "Normal",
      "Algo rígido",
      "Rígido",
      "Con cojera",
      "No apoya la pata",
    ]);
    // option KEYS (what is stored/compared) are untouched
    expect(schema.options.map((o) => o.key)).toEqual(["normal", "slightly_stiff", "stiff", "limping", "cant_bear_weight"]);
    expect(getWellnessSchema("not_a_real_type").label).toBe("Personalizado");
    expect(validateWellnessForm("weight", { value: "" })).toBe("Ingresá un peso válido");
    expect(validateWellnessForm("mobility", { value: null })).toBe("Elegí una opción");
    expect(validateWellnessForm("general", { value: "noticed_something", note: "" })).toBe(
      "Agregá una nota sobre lo que notaste",
    );
  });

  it("still PERSISTS the English option label regardless of the UI language", () => {
    const { body } = buildWellnessLogPayload(
      { petId: 1, checkType: "mobility", scheduledAt: "2026-06-11T09:00:00.000Z" },
      { value: "limping", note: "" },
      { now: "2026-06-11T12:30:00.000Z" },
    );
    expect(body.valuesJson.label).toBe("Limping");
    expect(body.valuesJson.mobility).toBe("limping");
  });
});

describe("memoriesWrapped — Spanish", () => {
  const days = ["2026-03-01", "2026-03-02", "2026-03-03", "2026-03-10"];
  it("localizes the Wrapped slides, month and date label", () => {
    const wrapped = buildWrapped({ name: "Rex" }, { postDates: days, today: "2026-06-18", friendCount: 2, walkCount: 5 });
    expect(wrapped.topMonth).toBe("Marzo");
    expect(wrapped.firstPostLabel).toBe("1 de marzo de 2026");
    const slides = wrappedSlides(wrapped);
    expect(slides[0].headline).toBe("El Wrapped de Rex");
    expect(slides.find((s) => s.key === "posts").label).toBe("momentos diarios capturados");
    expect(slides.find((s) => s.key === "walks").label).toBe("paseos registrados");
    expect(slides.find((s) => s.key === "since").headline).toBe("Juntos desde");
    expect(buildWrapped({ name: "Rex" }, { postDates: ["2026-03-01"], today: "2026-06-18" }).message).toMatch(/Seguí compartiendo/);
    expect(buildWrapped(null, { postDates: ["2026-03-01"], today: "2026-06-18" }).petName).toBe("Tu mascota");
  });
});
