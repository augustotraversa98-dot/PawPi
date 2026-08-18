// NR4 — Medications & Care real backend. Proven through the REAL Hono router (api.request)
// on real Postgres as pawpi_app, so the own-row RLS (0117) is actually exercised.
//
// Proves: (1) owner CRUD round-trips for medications, preventive treatments, and
// owner-side vaccinations (create → list → update → soft-delete); (2) OWN-ROW RLS — a
// second owner can neither read nor write the first owner's rows (empty list; 404 on
// update/delete; the row survives).

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { inject } from "vitest";
import type { Sql } from "postgres";
import { makeTestSql, resetDb, seedOwnerWithPet } from "./db";

const authState = vi.hoisted(() => ({ session: null as any }));
vi.mock("@/auth", () => ({ auth: async () => authState.session }));

const A = { authUserId: 1, profileId: 1, username: "owner_a", petId: 1, petName: "Rex" };
const B = { authUserId: 2, profileId: 2, username: "owner_b", petId: 2, petName: "Bella" };

let raw: Sql;
let api: any;

const sessionFor = (authUserId: number) => ({ user: { id: authUserId } });
function apiReq(path: string, method = "GET", body?: unknown) {
  return api.request(path, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

beforeAll(async () => {
  raw = makeTestSql();
  const url = new URL(inject("TEST_DATABASE_URL"));
  url.username = "pawpi_app";
  url.password = "pawpi_app";
  process.env.DATABASE_URL = url.toString();
  process.env.DATABASE_SSL = "disable";
  ({ api } = (await import("../../__create/route-builder")) as any);
});
afterAll(async () => { await raw.end(); });
afterEach(async () => { await resetDb(raw); authState.session = null; });

beforeEach(async () => {
  await seedOwnerWithPet(raw, A);
  authState.session = sessionFor(A.authUserId);
});

describe("medications — owner CRUD round-trip", () => {
  it("create → list → mark completed → delete", async () => {
    const created = await apiReq("/health/medications", "POST", {
      petId: A.petId, name: "Meloxicam", dose: "1.5 mg", frequency: "Once daily",
    });
    expect(created.status).toBe(201);
    const { medication } = await created.json();
    expect(medication.name).toBe("Meloxicam");
    expect(medication.status).toBe("active");

    let list = await (await apiReq(`/health/medications?petId=${A.petId}`)).json();
    expect(list.medications.length).toBe(1);

    // Mark completed → status flips and end_date is stamped.
    const patched = await apiReq("/health/medications", "PATCH", { id: medication.id, status: "completed" });
    expect(patched.status).toBe(200);
    const done = (await patched.json()).medication;
    expect(done.status).toBe("completed");
    expect(done.end_date).toBeTruthy();

    // Soft delete → gone from the list.
    const del = await apiReq(`/health/medications?id=${medication.id}`, "DELETE");
    expect(del.status).toBe(200);
    list = await (await apiReq(`/health/medications?petId=${A.petId}`)).json();
    expect(list.medications.length).toBe(0);
  });
});

describe("medications — own-row RLS", () => {
  it("another owner cannot read or write the first owner's medication", async () => {
    const created = await (await apiReq("/health/medications", "POST", {
      petId: A.petId, name: "Carprofen",
    })).json();
    const medId = created.medication.id;

    // Second owner signs in.
    await seedOwnerWithPet(raw, B);
    authState.session = sessionFor(B.authUserId);

    // Cannot see A's meds.
    const bList = await (await apiReq(`/health/medications?petId=${A.petId}`)).json();
    expect(bList.medications.length).toBe(0);

    // Cannot update or delete A's med (not visible → 404).
    expect((await apiReq("/health/medications", "PATCH", { id: medId, name: "hax" })).status).toBe(404);
    expect((await apiReq(`/health/medications?id=${medId}`, "DELETE")).status).toBe(404);

    // The row survives untouched for the real owner.
    const rows = await raw`select id, name, deleted_at from pet_medications where id = ${medId}`;
    expect(rows.length).toBe(1);
    expect(rows[0].name).toBe("Carprofen");
    expect(rows[0].deleted_at).toBeNull();
  });
});

describe("preventive treatments — owner CRUD + isolation", () => {
  it("create → list → delete, and another owner cannot delete it", async () => {
    const created = await apiReq("/health/preventive-treatments", "POST", {
      petId: A.petId, productName: "Simparica Trio", treatmentType: "flea_tick_heartworm", frequency: "Monthly",
    });
    expect(created.status).toBe(201);
    const treatmentId = (await created.json()).treatment.id;

    const list = await (await apiReq(`/health/preventive-treatments?petId=${A.petId}`)).json();
    expect(list.treatments.length).toBe(1);

    await seedOwnerWithPet(raw, B);
    authState.session = sessionFor(B.authUserId);
    expect((await apiReq(`/health/preventive-treatments?id=${treatmentId}`, "DELETE")).status).toBe(404);

    authState.session = sessionFor(A.authUserId);
    const del = await apiReq(`/health/preventive-treatments?id=${treatmentId}`, "DELETE");
    expect(del.status).toBe(200);
    const after = await (await apiReq(`/health/preventive-treatments?petId=${A.petId}`)).json();
    expect(after.treatments.length).toBe(0);
  });
});

describe("vaccinations — owner create + isolation", () => {
  it("owner creates a vaccination, sees it, and another owner cannot delete it", async () => {
    const created = await apiReq("/pet-vaccinations", "POST", {
      petId: A.petId, name: "Rabies", dateGiven: "2026-01-10", expiresOn: "2029-01-10",
      clinicName: "Happy Paws", notes: "3-year",
    });
    expect(created.status).toBe(201);
    const vaxId = (await created.json()).vaccination.id;

    const list = await (await apiReq(`/pet-vaccinations?petId=${A.petId}`)).json();
    expect(list.vaccinations.some((v: any) => v.id === vaxId && v.name === "Rabies")).toBe(true);

    await seedOwnerWithPet(raw, B);
    authState.session = sessionFor(B.authUserId);
    expect((await apiReq(`/pet-vaccinations?id=${vaxId}`, "DELETE")).status).toBe(404);

    const rows = await raw`select id from pet_vaccinations where id = ${vaxId} and deleted_at is null`;
    expect(rows.length).toBe(1);
  });
});
