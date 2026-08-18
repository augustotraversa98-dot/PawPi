import { describe, it, expect, vi, beforeEach } from "vitest";

// /api/vet-record/full-summary — real date-ranged Vet Summary aggregation (ticket 2.50).
// Owner+pet scoped; structured shape; no mock data.

import { GET } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/requestContext", () => ({ withRequestContext: (fn) => fn }));

const SESSION = { user: { id: 99 }, expires: "9999999999" };
const url = (qs) => new Request(`http://localhost/api/vet-record/full-summary${qs}`);

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

it("401 unauthenticated", async () => {
  auth.mockResolvedValue(null);
  expect((await GET(url("?petId=1&from=2026-06-01&to=2026-06-18"))).status).toBe(401);
});

it("400 when range params are missing", async () => {
  auth.mockResolvedValue(SESSION);
  sql.mockImplementation((s) => {
    const q = (s || []).join(" ");
    if (q.includes("FROM user_profiles WHERE auth_user_id")) return Promise.resolve([{ id: 7 }]);
    return Promise.resolve([]);
  });
  expect((await GET(url("?petId=1"))).status).toBe(400);
});

it("403 when the pet is not the caller's", async () => {
  auth.mockResolvedValue(SESSION);
  sql.mockImplementation((s) => {
    const q = (s || []).join(" ");
    if (q.includes("FROM user_profiles WHERE auth_user_id")) return Promise.resolve([{ id: 7 }]);
    if (q.includes("FROM pets")) return Promise.resolve([]); // not owned
    return Promise.resolve([]);
  });
  expect((await GET(url("?petId=2&from=2026-06-01&to=2026-06-18"))).status).toBe(403);
});

it("aggregates real data into the structured summary shape (owner-scoped)", async () => {
  auth.mockResolvedValue(SESSION);
  sql.mockImplementation((s) => {
    const q = (s || []).join(" ");
    if (q.includes("FROM user_profiles WHERE auth_user_id")) return Promise.resolve([{ id: 7 }]);
    if (q.includes("FROM pets")) return Promise.resolve([{ id: 1, name: "Rex", breed: "Lab" }]);
    if (q.includes("FROM health_food_logs")) return Promise.resolve([{ appetite: "low", amount: "1 cup" }, { appetite: "normal" }]);
    if (q.includes("FROM health_poo_logs")) return Promise.resolve([{ blood: true }, { blood: false, mucus: false, straining: false }]);
    if (q.includes("FROM health_pee_logs")) return Promise.resolve([{ increased_thirst: true }]);
    if (q.includes("FROM health_vomit_logs")) return Promise.resolve([{ number_of_episodes: 2, appearance: "bile" }]);
    if (q.includes("FROM health_weight_logs")) return Promise.resolve([
      { logged_at: "2026-06-01", weight: 50, weight_unit: "lbs" },
      { logged_at: "2026-06-15", weight: 45, weight_unit: "lbs" },
    ]);
    if (q.includes("FROM health_medical_care_logs")) return Promise.resolve([
      { name: "Apoquel", dose: "16mg", status: "given" },
      { name: "Apoquel", dose: "16mg", status: "missed" },
    ]);
    if (q.includes("FROM health_photo_checks")) return Promise.resolve([{ body_area: "paws", image_url: "p" }, { body_area: "paws" }]);
    if (q.includes("FROM health_walk_logs")) return Promise.resolve([
      { start_time: "2026-06-15T08:00:00Z", duration_minutes: 30, distance: 1.5 },
      { start_time: "2026-06-10T08:00:00Z", duration_minutes: null, distance: 0.5 }, // counts, but omitted from items
    ]);
    if (q.includes("FROM health_wellness_logs")) return Promise.resolve([{ check_type: "general" }]);
    if (q.includes("FROM health_general_checks")) return Promise.resolve([
      {
        logged_at: "2026-06-14T09:00:00Z",
        areas: {
          ears: { status: "changed", changes: ["redness"], notes: "right ear red" },
          eyes: { status: "usual", changes: [], notes: "" },
          paws: { status: "changed", changes: [], notes: null },
        },
        ears_status: "changed",
        eyes_status: "usual",
        notes: "ears: right ear red",
      },
      {
        logged_at: "2026-06-12T09:00:00Z",
        areas: null, // pre-0118 fallback row: read "changed" from flat *_status columns
        skin_fur_status: "changed",
        notes: null,
      },
    ]);
    if (q.includes("FROM pet_allergies")) return Promise.resolve([{ allergen: "Chicken" }]);
    if (q.includes("FROM pet_conditions")) return Promise.resolve([{ condition: "Arthritis", status: "active" }]);
    if (q.includes("FROM pet_vaccinations")) return Promise.resolve([{ name: "Rabies", date_given: "2026-01-01" }]);
    if (q.includes("FROM vet_notes")) return Promise.resolve([{ note_date: "2026-06-10", note: "checkup", vet_name: "Dr A" }]);
    return Promise.resolve([]);
  });

  const res = await GET(url("?petId=1&from=2026-06-01&to=2026-06-18"));
  expect(res.status).toBe(200);
  const { summary } = await res.json();
  expect(summary.pet.name).toBe("Rex");
  expect(summary.food.lowAppetiteCount).toBe(1);
  expect(summary.poo.abnormalCount).toBe(1);
  expect(summary.pee.concernCount).toBe(1);
  expect(summary.vomit.episodes).toBe(2);
  expect(summary.weight.series).toHaveLength(2);
  // meds grouped with adherence
  expect(summary.meds[0]).toMatchObject({ name: "Apoquel", given: 1, missed: 1, total: 2 });
  expect(summary.photoChecks.byArea.paws).toBe(2);
  // Quick Checks are counted (the "0 things logged" bug) and expose changed areas —
  // from the `areas` jsonb AND the pre-0118 flat *_status fallback row.
  expect(summary.generalChecks.count).toBe(2);
  expect(summary.generalChecks.changedCount).toBe(3); // ears + paws (row 1) + skin (row 2, flat)
  expect(summary.generalChecks.areasChanged).toEqual(
    expect.arrayContaining(["ears", "paws", "skin"]),
  );
  expect(summary.generalChecks.areasChanged).not.toContain("eyes"); // "usual" is not flagged
  expect(summary.generalChecks.items[0].changedAreas).toEqual(
    expect.arrayContaining([expect.objectContaining({ area: "ears", changes: ["redness"] })]),
  );
  // Walks enrichment (2.102): count/totalMinutes unchanged; items expose per-walk durations
  // (null-duration walk omitted) and perWeek is the window average (guarded > 0 here).
  expect(summary.walks.count).toBe(2);
  expect(summary.walks.totalMinutes).toBe(30);
  expect(summary.walks.items).toHaveLength(1);
  expect(summary.walks.items[0]).toMatchObject({ duration_minutes: 30, distance: 1.5 });
  expect(summary.walks.perWeek).toBeGreaterThan(0);
  expect(summary.disclaimer).toMatch(/does not diagnose/);
  // owner scoping present on every query
  const text = sql.mock.calls.map((c) => (c?.[0] ?? []).join(" ")).join(" | ");
  expect(text).toContain("owner_user_id =");
});
