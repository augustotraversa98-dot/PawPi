import { describe, it, expect, vi, beforeEach } from "vitest";

// GET /api/vet-record/summary — section counts for the Vet Record hub.
//
// Under test: the "Vaccination History" count now reads pet_vaccinations (the
// vaccination SSOT, migration 0018), NOT the old health_medical_care_logs
// care_type='vaccine' DISTINCT-item query. Semantics intentionally change from
// "distinct vaccine routine items" to "vaccination events/records" (deleted_at IS
// NULL). `auth` + `sql` mocked at the module boundary.
//
// Call order: sql 1 = user_profiles lookup, sql 2 = pet-ownership check, then the
// Promise.all block fires 11 count queries IN THIS ARRAY ORDER: allergies,
// conditions, medications, vaccines, upcomingAppointments, completedAppointments,
// surgeries, labResults, documents, photoChecks, vetNotes.

import { GET } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));

const SESSION = { user: { id: 42 }, expires: "9999999999" };
const PROFILE_ROW = { id: 7, auth_user_id: 42 };

const getReq = (qs = "?petId=55") =>
  new Request(`http://localhost/api/vet-record/summary${qs}`, { method: "GET" });

const queryText = (call) => (call?.[0] ?? []).join(" ");

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/vet-record/summary — vaccines count from pet_vaccinations", () => {
  it("401 when unauthenticated", async () => {
    auth.mockResolvedValue(null);
    const res = await GET(getReq());
    expect(res.status).toBe(401);
    expect(sql).not.toHaveBeenCalled();
  });

  it("400 when petId missing", async () => {
    auth.mockResolvedValue(SESSION);
    const res = await GET(getReq(""));
    expect(res.status).toBe(400);
  });

  it("counts pet_vaccinations rows (deleted_at IS NULL), not vaccine logs", async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // user_profiles
      .mockResolvedValueOnce([{ id: 55 }]) // pet ownership
      .mockResolvedValueOnce([{ count: 1 }]) // allergies
      .mockResolvedValueOnce([{ count: 2 }]) // conditions
      .mockResolvedValueOnce([{ count: 3 }]) // medications
      .mockResolvedValueOnce([{ count: 4 }]) // vaccines  ← pet_vaccinations
      .mockResolvedValueOnce([{ count: 5 }]) // upcomingAppointments
      .mockResolvedValueOnce([{ count: 6 }]) // completedAppointments
      .mockResolvedValueOnce([{ count: 7 }]) // surgeries
      .mockResolvedValueOnce([{ count: 8 }]) // labResults
      .mockResolvedValueOnce([{ count: 9 }]) // documents
      .mockResolvedValueOnce([{ count: 10 }]) // photoChecks
      .mockResolvedValueOnce([{ count: 11 }]); // vetNotes

    const res = await GET(getReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.vaccinesCount).toBe(4);

    // The vaccines query reads the SSOT table with a soft-delete filter — and does
    // NOT count vaccine medical-care logs the old way.
    const vaccQuery = sql.mock.calls.find((c) =>
      queryText(c).includes("FROM pet_vaccinations"),
    );
    expect(vaccQuery).toBeTruthy();
    expect(queryText(vaccQuery)).toContain("deleted_at IS NULL");
    const anyVaccineLogCount = sql.mock.calls.some((c) =>
      queryText(c).includes("care_type = 'vaccine'"),
    );
    expect(anyVaccineLogCount).toBe(false);
  });
});
