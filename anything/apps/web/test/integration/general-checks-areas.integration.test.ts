// QC-B — Quick Check per-area detail round-trip, proven through the REAL Hono router
// (api.request) on real Postgres as pawpi_app. The form collects, per body area, a
// status + "what changed" selections + a note + photos; migration 0118 adds an additive
// `areas jsonb` column on health_general_checks so that full per-area object survives.
//
// Proves: POST a multi-area check with changes + notes + photos → GET returns the SAME
// `areas` jsonb (all areas, not just the first) AND the flat *_status columns are still
// populated; another owner never sees this pet's check (owner scoping).

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { inject } from "vitest";
import type { Sql } from "postgres";
import { makeTestSql, resetDb, seedOwnerWithPet } from "./db";

const authState = vi.hoisted(() => ({ session: null as any }));
vi.mock("@/auth", () => ({ auth: async () => authState.session }));

const OWNER = { authUserId: 1, profileId: 1, username: "owner", petId: 1, petName: "Rex" };
const OTHER = { authUserId: 2, profileId: 2, username: "other", petId: 2, petName: "Bella" };

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
  await seedOwnerWithPet(raw, OWNER);
  await seedOwnerWithPet(raw, OTHER);
  authState.session = sessionFor(OWNER.authUserId);
});

const AREAS = {
  eyes: { status: "usual", changes: [], notes: "clear", photos: ["https://cdn/eye.jpg"] },
  ears: {
    status: "changed",
    changes: ["redness", "bad_smell"],
    notes: "left ear a bit red",
    photos: [],
  },
  skin: {
    status: "usual",
    changes: [],
    notes: "",
    photos: ["https://cdn/skin1.jpg", "https://cdn/skin2.jpg"],
  },
};

const postCheck = (extra: Record<string, unknown> = {}) =>
  apiReq("/health/general-checks", "POST", {
    petId: OWNER.petId,
    eyesStatus: "usual",
    earsStatus: "changed",
    skinFurStatus: "usual",
    notes: "Eyes: clear\nEars: left ear a bit red",
    areas: AREAS,
    ...extra,
  });

describe("QC-B — general check per-area detail", () => {
  it("persists the full areas jsonb (all areas, with changes/notes/photos)", async () => {
    const res = await postCheck();
    expect(res.status).toBe(201);

    const list = await (await apiReq(`/health/general-checks?petId=${OWNER.petId}`)).json();
    expect(list.checks).toHaveLength(1);
    const check = list.checks[0];

    // The full per-area object round-trips untouched (jsonb parsed back to an object).
    expect(check.areas).toEqual(AREAS);
    // ...and the flat status columns are still written alongside for existing consumers.
    expect(check.eyes_status).toBe("usual");
    expect(check.ears_status).toBe("changed");
    expect(check.skin_fur_status).toBe("usual");
  });

  it("keeps every area's photos and changes (multi-area, not just the first)", async () => {
    await postCheck();
    const [row] = await raw`
      select areas from health_general_checks where pet_id = ${OWNER.petId}
    `;
    expect(row.areas.eyes.photos).toEqual(["https://cdn/eye.jpg"]);
    expect(row.areas.ears.changes).toEqual(["redness", "bad_smell"]);
    expect(row.areas.skin.photos).toHaveLength(2);
  });

  it("another owner never sees this pet's check (owner scoping)", async () => {
    await postCheck();
    authState.session = sessionFor(OTHER.authUserId);
    const list = await (await apiReq(`/health/general-checks?petId=${OWNER.petId}`)).json();
    expect(list.checks ?? []).toHaveLength(0);
  });

  it("a check with no areas still saves (areas is optional)", async () => {
    const res = await apiReq("/health/general-checks", "POST", {
      petId: OWNER.petId,
      eyesStatus: "usual",
      notes: "quick one",
    });
    expect(res.status).toBe(201);
    const [row] = await raw`select areas from health_general_checks where pet_id = ${OWNER.petId}`;
    expect(row.areas).toBeNull();
  });
});
