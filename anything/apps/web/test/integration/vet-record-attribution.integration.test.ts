// VR-B — Vet Record records are addable by the owner OR a granted FAMILY (Editor), each
// row attributed (created_by_user_id + created_by_role, 0120). Proven through the REAL Hono
// router (api.request) on real Postgres as pawpi_app, so the owner-private (0022) + family
// (0049 + the 0120 vet_notes family policy) RLS is actually exercised.
//
// Proves: (1) owner adds each record type, attributed 'owner', anchored to the owner;
// (2) a FAMILY Editor adds an allergy AND a vet note, attributed 'editor', with owner_user_id
// anchored to the pet's OWNER and created_by_user_id = the editor; (3) a read-only CAREGIVER
// (Viewer) is 403 on writes; (4) an outsider (no grant) is 403 on read and write.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { inject } from "vitest";
import type { Sql } from "postgres";
import { makeTestSql, resetDb, seedOwnerWithPet, seedUser, seedPetCaregiver } from "./db";

const authState = vi.hoisted(() => ({ session: null as any }));
vi.mock("@/auth", () => ({ auth: async () => authState.session }));

const OWNER = { authUserId: 1, profileId: 1, username: "owner_a", petId: 1, petName: "Rex" };
const EDITOR = { authUserId: 2, profileId: 2, username: "editor_e" };
const VIEWER = { authUserId: 3, profileId: 3, username: "viewer_v" };
const OUT = { authUserId: 4, profileId: 4, username: "out_o" };

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
  await seedUser(raw, EDITOR);
  await seedUser(raw, VIEWER);
  await seedUser(raw, OUT);
  // EDITOR = active FAMILY grant; VIEWER = active read-only CAREGIVER grant.
  await seedPetCaregiver(raw, {
    id: 1, petId: OWNER.petId, ownerUserId: OWNER.profileId,
    granteeUserId: EDITOR.profileId, role: "family", status: "active",
  });
  await seedPetCaregiver(raw, {
    id: 2, petId: OWNER.petId, ownerUserId: OWNER.profileId,
    granteeUserId: VIEWER.profileId, role: "caregiver", status: "active",
  });
  authState.session = sessionFor(OWNER.authUserId);
});

describe("owner adds records — attributed 'owner', anchored to owner", () => {
  it("allergy create → list, with author name + role", async () => {
    const created = await apiReq("/vet-record/allergies", "POST", {
      petId: OWNER.petId, allergen: "Chicken", severity: "Moderate",
    });
    expect(created.status).toBe(200);
    const { allergy } = await created.json();
    expect(allergy.owner_user_id).toBe(OWNER.profileId);
    expect(allergy.created_by_user_id).toBe(OWNER.profileId);
    expect(allergy.created_by_role).toBe("owner");

    const list = await (await apiReq(`/vet-record/allergies?petId=${OWNER.petId}`)).json();
    expect(list.allergies.length).toBe(1);
    expect(list.allergies[0].created_by_name).toBe(OWNER.username);
    expect(list.allergies[0].created_by_role).toBe("owner");
  });

  it("condition and lab result also create (routes wired)", async () => {
    const cond = await apiReq("/vet-record/conditions", "POST", {
      petId: OWNER.petId, condition: "Arthritis", status: "managed",
    });
    expect(cond.status).toBe(200);
    expect((await cond.json()).condition.created_by_role).toBe("owner");

    const lab = await apiReq("/vet-record/lab-results", "POST", {
      petId: OWNER.petId, testName: "CBC", testDate: "2026-02-01",
    });
    expect(lab.status).toBe(200);
    expect((await lab.json()).labResult.created_by_role).toBe("owner");
  });
});

describe("family Editor adds records — attributed 'editor', anchored to owner", () => {
  it("editor adds an allergy; owner_user_id = owner, author = editor", async () => {
    authState.session = sessionFor(EDITOR.authUserId);
    const created = await apiReq("/vet-record/allergies", "POST", {
      petId: OWNER.petId, allergen: "Pollen",
    });
    expect(created.status).toBe(200);
    const { allergy } = await created.json();
    expect(allergy.owner_user_id).toBe(OWNER.profileId); // anchored to the pet's OWNER
    expect(allergy.created_by_user_id).toBe(EDITOR.profileId);
    expect(allergy.created_by_role).toBe("editor");

    // Owner sees the editor's row, attributed to the editor.
    authState.session = sessionFor(OWNER.authUserId);
    const list = await (await apiReq(`/vet-record/allergies?petId=${OWNER.petId}`)).json();
    const row = list.allergies.find((a: any) => a.allergen === "Pollen");
    expect(row.created_by_name).toBe(EDITOR.username);
    expect(row.created_by_role).toBe("editor");
  });

  it("editor adds a vet note (vet_notes family policy, 0120)", async () => {
    authState.session = sessionFor(EDITOR.authUserId);
    const created = await apiReq("/vet-record/notes", "POST", {
      petId: OWNER.petId, noteDate: "2026-02-10", note: "Recheck in 2 weeks",
    });
    expect(created.status).toBe(200);
    const { note } = await created.json();
    expect(note.owner_user_id).toBe(OWNER.profileId);
    expect(note.created_by_role).toBe("editor");
  });
});

describe("read-only Viewer + outsider are denied writes", () => {
  it("caregiver (Viewer) cannot add an allergy or a note (403)", async () => {
    authState.session = sessionFor(VIEWER.authUserId);
    expect((await apiReq("/vet-record/allergies", "POST", {
      petId: OWNER.petId, allergen: "Dust",
    })).status).toBe(403);
    expect((await apiReq("/vet-record/notes", "POST", {
      petId: OWNER.petId, noteDate: "2026-02-11", note: "nope",
    })).status).toBe(403);
  });

  it("outsider (no grant) is 403 on read and write", async () => {
    authState.session = sessionFor(OUT.authUserId);
    expect((await apiReq(`/vet-record/allergies?petId=${OWNER.petId}`)).status).toBe(403);
    expect((await apiReq("/vet-record/allergies", "POST", {
      petId: OWNER.petId, allergen: "Grass",
    })).status).toBe(403);
  });
});
