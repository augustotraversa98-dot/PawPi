// Inviting a vet on PawPi (migration 0154), through the real Hono router + real Postgres as pawpi_app.
//   A. which businesses a search finds, and what it says      B. sending an invitation
//   C. what the invited business sees                         D. accepting and declining
//   E. the owner's later decision wins                        F. withdrawing
//   G. the database rules on their own                        H. a database without 0154
//   I. verify_0154.sql passes, can fail, re-applies

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, inject, it, vi } from "vitest";
import postgres from "postgres";
import type { Sql } from "postgres";
import {
  MIGRATIONS_DIR, makeTestSql, resetDb, seedCapability, seedOwnerWithPet, seedPetCaregiver, seedProviderWithStaff,
  seedStaff, seedUser,
} from "./db";

const authState = vi.hoisted(() => ({ session: null as any }));
vi.mock("@/auth", () => ({ auth: async () => authState.session }));

const OWNER = { authUserId: 1, profileId: 1, username: "owner", fullName: "Olivia Owner", petId: 1, petName: "Rex" };
const OTHER = { authUserId: 2, profileId: 2, username: "other", petId: 2, petName: "Duke" };
const VET = { authUserId: 3, profileId: 3, username: "drpaula", fullName: "Dr. Paula" };
const VET2 = { authUserId: 4, profileId: 4, username: "secondvet" };
const NURSE = { authUserId: 5, profileId: 5, username: "nurse" };
const FAMILY = { authUserId: 6, profileId: 6, username: "family" };
const GROOMER = { authUserId: 7, profileId: 7, username: "groomer" };
const FORMER = { authUserId: 8, profileId: 8, username: "former" };
const P1 = 1;
const P2 = 2;
const P_GROOM = 3;
const PET = OWNER.petId;

type Person = { authUserId: number; profileId: number };

let raw: Sql;
let app: Sql;
let api: any;

const as = (u: Person | null) => { authState.session = u ? { user: { id: u.authUserId } } : null; };
const req = (path: string, method = "GET", body?: unknown) =>
  api.request(path, {
    method,
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const search = async (q: string, user: Person | null = OWNER) => {
  as(user);
  return req(`/care-access/vets?q=${encodeURIComponent(q)}`);
};
const found = async (q: string, user: Person = OWNER) => {
  const res = await search(q, user);
  expect(res.status).toBe(200);
  return ((await res.json()).vets as any[]).map((v) => v.id);
};
const choice = (over: Record<string, unknown> = {}) => ({
  petId: PET, providerId: P1, sections: ["vaccines"], expiry: "7d", ...over,
});
const send = (over: Record<string, unknown> = {}, user: Person | null = OWNER) => {
  as(user);
  return req("/care-access/offers", "POST", choice(over));
};
async function offer(over: Record<string, unknown> = {}) {
  const res = await send(over);
  expect(res.status).toBe(201);
  return (await res.json()).offer.id as number;
}
const mine = async (user: Person = OWNER, query = "") => {
  as(user);
  const res = await req(`/care-access/offers${query}`);
  expect(res.status).toBe(200);
  return (await res.json()).offers as any[];
};
const withdraw = (id: number | string, user: Person | null = OWNER) => {
  as(user);
  return req(`/care-access/offers/${id}`, "PATCH", { action: "withdraw" });
};
const waiting = (user: Person | null = VET, providerId: number | string = P1) => {
  as(user);
  return req(`/providers/${providerId}/share-offers`);
};
const respond = (id: number | string, action: string, user: Person | null = VET, providerId = P1) => {
  as(user);
  return req(`/providers/${providerId}/share-offers/${id}`, "POST", { action });
};
const record = (user: Person = VET, providerId = P1) => { as(user); return req(`/providers/${providerId}/pets/${PET}/record`); };
const share = (body: Record<string, unknown>) => {
  as(OWNER);
  return req("/care-access/grants", "POST", { petId: PET, providerId: P1, ...body });
};
const patchGrant = (id: number, action: string) => {
  as(OWNER);
  return req(`/care-access/grants/${id}`, "PATCH", { action });
};
const grants = () => raw`select * from care_access_grants order by id`;
const offers = () => raw`select * from care_share_offers order by id`;
const notices = (type: string) => raw`select * from notifications where type = ${type} order by id`;
const lapse = (id: number) =>
  raw`update care_share_offers set created_at = now() - interval '8 days', lapses_at = now() - interval '1 day' where id = ${id}`;
const transfer = (to: number) =>
  raw.begin(async (tx) => {
    await tx`select set_config('app.current_user_id', ${String(OWNER.profileId)}, true)`;
    await tx`update pets set owner_user_id = ${to} where id = ${PET}`;
  });
const block = (from: number, to: number) =>
  raw`insert into user_blocks (blocker_user_id, blocked_user_id) values (${from}, ${to})`;

function asApp<T>(userId: number | null, fn: (tx: Sql) => Promise<T>): Promise<T> {
  return app.begin(async (tx) => {
    await tx`select set_config('app.current_user_id', ${userId === null ? "" : String(userId)}, true)`;
    return fn(tx as unknown as Sql);
  }) as Promise<T>;
}

const migration = (name: string) => readFileSync(join(MIGRATIONS_DIR, name), "utf8");
const verify0154 = () => readFileSync(join(MIGRATIONS_DIR, "..", "verify_0154.sql"), "utf8");

beforeAll(async () => {
  raw = makeTestSql();
  // Other files re-apply older migrations on the shared database, which narrows the notification types.
  await raw.unsafe(migration("0154_vet_share_offers.sql"));
  const url = new URL(inject("TEST_DATABASE_URL"));
  url.username = "pawpi_app";
  url.password = "pawpi_app";
  app = postgres(url.toString(), { max: 1, onnotice: () => {} });
  process.env.DATABASE_URL = url.toString();
  process.env.DATABASE_SSL = "disable";
  ({ api } = (await import("../../__create/route-builder")) as any);
});
afterAll(async () => {
  // The router's pool belongs to this file: releasing it keeps the shared database under its connection limit.
  const { pool } = (await import("@/app/api/utils/sql")) as any;
  await pool.end({ timeout: 5 });
  await raw.end();
  await app.end();
});
afterEach(async () => { await resetDb(raw); authState.session = null; vi.restoreAllMocks(); });

const business = async (
  providerId: number, staff: Person, status: "published" | "draft" = "published", capability = "vet", slug = `biz-${providerId}`,
) => {
  await seedProviderWithStaff(raw, {
    providerId, ownerUserProfileId: staff.profileId, staffUserProfileId: staff.profileId, staffRole: "owner", slug,
    providerStatus: status,
  });
  await seedCapability(raw, { providerId, capability });
};

beforeEach(async () => {
  await seedOwnerWithPet(raw, OWNER);
  await seedOwnerWithPet(raw, OTHER);
  for (const u of [VET, VET2, NURSE, FAMILY, GROOMER, FORMER]) await seedUser(raw, u);
  await raw`select setval(pg_get_serial_sequence('auth_users', 'id'), 100), setval(pg_get_serial_sequence('user_profiles', 'id'), 100)`;
  await business(P1, VET, "published", "vet", "north-clinic");
  await raw`update providers set name = 'North Clinic' where id = ${P1}`;
  await raw`insert into provider_locations (provider_id, name, address) values (${P1}, 'Centro', 'Calle 1')`;
  await business(P2, VET2, "published", "vet", "south-clinic");
  await raw`update providers set name = 'South Clinic' where id = ${P2}`;
  await business(P_GROOM, GROOMER, "published", "groomer", "north-groom");
  await raw`update providers set name = 'North Grooming' where id = ${P_GROOM}`;
  await seedStaff(raw, { providerId: P1, userProfileId: NURSE.profileId });
  await seedStaff(raw, { providerId: P1, userProfileId: FORMER.profileId, status: "removed" });
  await seedPetCaregiver(raw, { id: 1, petId: PET, ownerUserId: OWNER.profileId, granteeUserId: FAMILY.profileId, role: "family" });
  await raw`insert into pet_vaccinations (pet_id, owner_user_id, name) values (${PET}, ${OWNER.profileId}, 'VACCINE')`;
  await raw`insert into vet_notes (pet_id, owner_user_id, note_date, note) values (${PET}, ${OWNER.profileId}, '2026-01-02', 'SECRET-note')`;
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe("A. the search", () => {
  it("finds a vet business by name, handle or its owner's username, with public fields only", async () => {
    for (const q of ["north cli", "NORTH-CLINIC", "drpaula"]) expect(await found(q)).toEqual([P1]);
    expect(await found("clinic")).toEqual([P1, P2]);
    const body = await (await search("north cli")).json();
    expect(body).toEqual({
      available: true,
      vets: [{ id: P1, name: "North Clinic", handle: "north-clinic", logo_url: null, location_name: "Centro", address: "Calle 1" }],
    });
  });

  it("matches the owner's username only when typed in full, in any case, and never a staff member's", async () => {
    expect(await found("DrPaula")).toEqual([P1]);
    for (const q of ["drpaul", "rpaula", "paula", "dr", "nurse"]) expect(await found(q)).toEqual([]);
  });

  it("answers nothing under two characters, and takes wildcards and a NUL as text", async () => {
    for (const q of ["", "n", "%%", "__", "\\", "no%th"]) expect(await found(q)).toEqual([]);
    expect(await found(`nor${String.fromCharCode(0)}th cli`)).toEqual([P1]);
  });

  it.each([
    ["unpublished", () => raw`update providers set status = 'draft' where id = ${P1}`],
    ["a demo business", () => raw`update providers set is_demo = true where id = ${P1}`],
    ["an unclaimed listing", () => raw`update providers set claim_status = 'unclaimed' where id = ${P1}`],
    ["without the vet capability", () => raw`delete from provider_capabilities where provider_id = ${P1}`],
    ["with no active team", () => raw`update provider_staff set status = 'removed' where provider_id = ${P1}`],
    ["with only a banned team", () => raw`update user_profiles set banned_at = now() where id in (${VET.profileId}, ${NURSE.profileId})`],
    ["blocked by the owner", () => block(OWNER.profileId, VET.profileId)],
    ["blocking the owner", () => block(VET.profileId, OWNER.profileId)],
  ])("leaves out a business that is %s, and it cannot be invited", async (_name, change) => {
    await change();
    expect(await found("north cli")).toEqual([]);
    expect((await send()).status).toBe(404);
    expect(await offers()).toHaveLength(0);
  });

  it("needs a signed-in account and is rate limited with the other searches", async () => {
    expect((await search("north", null)).status).toBe(401);
    await raw`insert into rate_limit_hits (bucket, subject, window_start, hits)
              values ('search_query', ${`u:${OWNER.profileId}`}, to_timestamp(floor(extract(epoch from now()) / 60) * 60), 1000)`;
    expect((await search("north")).status).toBe(429);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe("B. sending an invitation", () => {
  it("stores the choice, opens nothing and tells the business's team", async () => {
    const res = await send({ sections: ["vet_notes", "vaccines"], expiry: "30d" });
    expect(res.status).toBe(201);
    const { offer: sent } = await res.json();
    expect(sent).toMatchObject({ pet_id: PET, provider_id: P1, sections: ["vet_notes", "vaccines"], expiry: "30d", status: "open" });
    expect((Date.parse(sent.lapses_at) - Date.parse(sent.created_at)) / 86_400_000).toBeCloseTo(7, 5);
    expect(await grants()).toHaveLength(0);
    expect((await record()).status).toBe(403);
    const told = await notices("care_share_offered");
    expect(told.map((n) => n.recipient_user_id).sort()).toEqual([VET.profileId, NURSE.profileId]);
    expect(told[0]).toMatchObject({ actor_user_id: OWNER.profileId, subject_ref: String(P1) });
    expect(told[0].body).toBe(
      "Olivia Owner quiere compartir la ficha veterinaria de Rex con tu equipo. No se ve nada hasta que aceptes: respondé en Historias clínicas, en el área de proveedores.",
    );
  });

  it("does not tell a team member who has a block with the owner", async () => {
    await block(NURSE.profileId, OWNER.profileId);
    await offer();
    expect((await notices("care_share_offered")).map((n) => n.recipient_user_id)).toEqual([VET.profileId]);
  });

  it.each([
    ["no sections", { sections: [] }],
    ["an unknown section", { sections: ["allergies"] }],
    ["a repeated section", { sections: ["files", "files"] }],
    ["no length", { expiry: undefined }],
    ["an unknown length", { expiry: "2y" }],
    ["no business", { providerId: undefined }],
    ["no pet", { petId: undefined }],
  ])("refuses %s", async (_name, over) => {
    expect((await send(over)).status).toBe(400);
    expect(await offers()).toHaveLength(0);
  });

  it("only the pet's owner invites", async () => {
    for (const user of [FAMILY, OTHER, VET]) expect((await send({}, user)).status).toBe(404);
    expect((await send({}, null)).status).toBe(401);
    expect(await offers()).toHaveLength(0);
  });

  it("a repeat returns the waiting one and tells nobody again; a different choice is refused", async () => {
    const id = await offer({ sections: ["vaccines", "files"] });
    const repeat = await send({ sections: ["files", "vaccines"] });
    expect(repeat.status).toBe(200);
    expect(await repeat.json()).toMatchObject({ deduped: true, offer: { id } });
    for (const over of [{ sections: ["vaccines"] }, { sections: ["vaccines", "files"], expiry: "1y" }]) {
      const different = await send(over);
      expect(different.status).toBe(409);
      expect(await different.json()).toMatchObject({ code: "offer_open", offer: { id } });
    }
    expect(await offers()).toHaveLength(1);
    expect(await notices("care_share_offered")).toHaveLength(2);
  });

  it("keeps one waiting invitation when sends arrive together", async () => {
    as(OWNER);
    const results = await Promise.all([1, 2, 3, 4].map(() => req("/care-access/offers", "POST", choice())));
    expect(results.map((r) => r.status).sort()).toEqual([200, 200, 200, 201]);
    expect(await offers()).toHaveLength(1);
    expect(await notices("care_share_offered")).toHaveLength(2);
  });

  it("a lapsed one never blocks a new one", async () => {
    const first = await offer();
    await lapse(first);
    expect((await mine())[0].status).toBe("lapsed");
    const second = await offer({ expiry: "1y" });
    expect(second).not.toBe(first);
    expect((await offers()).map((o) => o.status)).toEqual(["lapsed", "open"]);
  });

  it("one left by a previous owner of the pet never blocks the new one", async () => {
    await offer();
    await transfer(OTHER.profileId);
    expect((await send({}, OTHER)).status).toBe(201);
    expect((await offers()).map((o) => [o.owner_user_id, o.status])).toEqual([
      [OWNER.profileId, "lapsed"], [OTHER.profileId, "open"],
    ]);
  });

  it("keeps at most 20 waiting per owner", async () => {
    for (let i = 0; i < 20; i++) {
      await business(20 + i, VET2, "published", "vet", `extra-${i}`);
      await raw`insert into care_share_offers (pet_id, owner_user_id, provider_id, sections, duration)
                values (${PET}, ${OWNER.profileId}, ${20 + i}, ${["vaccines"]}, '7d')`;
    }
    const refused = await send();
    expect(refused.status).toBe(409);
    expect(await refused.json()).toMatchObject({ code: "offer_limit", limit: 20 });
    await raw`update care_share_offers set status = 'withdrawn' where provider_id = 20`;
    expect((await send()).status).toBe(201);
  });

  it("limits sending per owner", async () => {
    for (let i = 0; i < 20; i++) expect([200, 201]).toContain((await send()).status);
    expect((await send()).status).toBe(429);
  });

  it("lists the owner's invitations only to the owner", async () => {
    const id = await offer();
    expect(await mine(OWNER, `?petId=${PET}`)).toEqual([
      expect.objectContaining({ id, pet_name: "Rex", provider_name: "North Clinic", status: "open", expiry: "7d" }),
    ]);
    for (const user of [OTHER, FAMILY, VET]) expect(await mine(user)).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe("C. what the invited business sees", () => {
  it("the pet's name, the owner's display name, the parts and the length, and nothing else", async () => {
    const id = await offer({ sections: ["vet_notes"] });
    for (const user of [VET, NURSE]) {
      const res = await waiting(user);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.available).toBe(true);
      expect(Object.keys(body.offers[0]).sort()).toEqual(
        ["created_at", "expiry", "id", "lapses_at", "owner_name", "pet_name", "sections"],
      );
      expect(body.offers[0]).toMatchObject({ id, pet_name: "Rex", owner_name: "Olivia Owner", sections: ["vet_notes"], expiry: "7d" });
      expect(JSON.stringify(body)).not.toContain("SECRET");
      expect((await record(user)).status).toBe(403);
      expect(await (await req(`/providers/${P1}/shared-pets`)).json()).toEqual({ pets: [] });
    }
  });

  it("never shows an e-mail address as the owner's name", async () => {
    await raw`update user_profiles set full_name = 'olivia@example.com' where id = ${OWNER.profileId}`;
    await offer();
    expect((await (await waiting()).json()).offers[0].owner_name).toBeNull();
    expect((await notices("care_share_offered"))[0].body).not.toContain("@");
  });

  it("only that business's active staff", async () => {
    const id = await offer();
    for (const user of [VET2, FORMER, OWNER, OTHER]) {
      expect((await waiting(user)).status).toBe(403);
      expect((await respond(id, "accept", user)).status).toBe(403);
    }
    expect((await waiting(null)).status).toBe(401);
    expect((await (await waiting(VET2, P2)).json()).offers).toEqual([]);
    expect((await respond(id, "accept", VET2, P2)).status).toBe(404);
    expect((await offers())[0].status).toBe("open");
    expect(await grants()).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe("D. answering", () => {
  it.each([
    ["7d", 7], ["30d", 30], ["1y", 365], ["until_revoked", null],
  ])("accepting gives exactly the offered parts for %s, counted from the acceptance", async (expiry, days) => {
    const id = await offer({ sections: ["vaccines"], expiry });
    await raw`update care_share_offers set created_at = now() - interval '3 days', lapses_at = now() + interval '4 days'`;
    const res = await respond(id, "accept");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "accepted", pet_id: PET, pet_name: "Rex" });
    const [grant] = await grants();
    expect(grant).toMatchObject({
      pet_id: PET, owner_user_id: OWNER.profileId, provider_id: P1, status: "active", requested_by: "owner",
      scopes: ["record_sections"], sections: ["vaccines"],
    });
    expect(Math.abs(Date.now() - grant.granted_at.getTime())).toBeLessThan(60_000);
    if (days === null) expect(grant.expires_at).toBeNull();
    else {
      const length = (grant.expires_at.getTime() - grant.granted_at.getTime()) / 86_400_000;
      expect(Math.abs(length - days)).toBeLessThanOrEqual(1.01);
    }
    expect((await offers())[0]).toMatchObject({ status: "accepted", grant_id: grant.id, responded_by_user_id: VET.profileId });
    const shown = await (await record()).json();
    expect(shown.sharedSections).toEqual(["vaccines"]);
    expect(JSON.stringify(shown)).toContain("VACCINE");
    expect(JSON.stringify(shown)).not.toContain("SECRET");
  });

  it("tells the owner once, in their language", async () => {
    const id = await offer({ expiry: "until_revoked" });
    await respond(id, "accept");
    const [told] = await notices("care_share_accepted");
    expect(told).toMatchObject({ recipient_user_id: OWNER.profileId, actor_user_id: VET.profileId });
    expect(told.body).toBe("North Clinic aceptó tu invitación y ya puede ver las partes que elegiste de la ficha de Rex hasta que lo revoques.");
  });

  it("accepting again, by anyone on the team, changes nothing", async () => {
    const id = await offer();
    await respond(id, "accept");
    for (const user of [VET, NURSE]) {
      const again = await respond(id, "accept", user);
      expect(again.status).toBe(200);
      expect(await again.json()).toMatchObject({ status: "accepted", already: true });
    }
    expect(await grants()).toHaveLength(1);
    expect(await notices("care_share_accepted")).toHaveLength(1);
    expect((await respond(id, "decline")).status).toBe(409);
    expect((await grants())[0].status).toBe("active");
  });

  it("answers arriving together make exactly one access", async () => {
    const id = await offer();
    as(VET);
    const results = await Promise.all([1, 2, 3, 4].map(() => req(`/providers/${P1}/share-offers/${id}`, "POST", { action: "accept" })));
    expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200]);
    expect((await Promise.all(results.map((r) => r.json()))).filter((b) => !b.already)).toHaveLength(1);
    expect(await grants()).toHaveLength(1);
    expect(await notices("care_share_accepted")).toHaveLength(1);
  });

  it("declining opens nothing, tells the owner and is final", async () => {
    const id = await offer();
    expect(await (await respond(id, "decline")).json()).toMatchObject({ status: "declined" });
    expect(await (await respond(id, "decline", NURSE)).json()).toMatchObject({ status: "declined", already: true });
    expect((await respond(id, "accept")).status).toBe(409);
    expect(await grants()).toHaveLength(0);
    const told = await notices("care_share_declined");
    expect(told).toHaveLength(1);
    expect(told[0].body).toBe("North Clinic rechazó tu invitación para ver la ficha de Rex. No se compartió nada.");
    expect((await (await waiting()).json()).offers).toEqual([]);
    expect((await send()).status).toBe(201);
  });

  it.each([
    ["was withdrawn", (id: number) => withdraw(id)],
    ["lapsed", (id: number) => lapse(id)],
    ["belongs to a pet that changed owner", () => transfer(OTHER.profileId)],
    ["comes from an owner who blocked the person answering", () => block(OWNER.profileId, VET.profileId)],
    ["comes from an owner the person answering blocked", () => block(VET.profileId, OWNER.profileId)],
  ])("an invitation that %s cannot be accepted and is not listed", async (_name, change) => {
    const id = await offer();
    await change(id);
    const res = await respond(id, "accept");
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("offer_not_open");
    expect(await grants()).toHaveLength(0);
    expect((await (await waiting()).json()).offers).toEqual([]);
    expect(await notices("care_share_accepted")).toHaveLength(0);
  });

  it("a block between the owner and the business's owner stops every member of the team", async () => {
    const id = await offer();
    await block(OWNER.profileId, VET.profileId);
    expect((await (await waiting(NURSE)).json()).offers).toEqual([]);
    expect((await respond(id, "accept", NURSE)).status).toBe(409);
    expect(await grants()).toHaveLength(0);
  });

  it("only a published vet business accepts; it can still decline", async () => {
    const id = await offer();
    await raw`update providers set status = 'draft' where id = ${P1}`;
    const res = await respond(id, "accept");
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("not_eligible");
    expect(await grants()).toHaveLength(0);
    expect((await respond(id, "decline")).status).toBe(200);
  });

  it("answers the business's own pending request with the offered parts only", async () => {
    const id = await offer({ sections: ["files"], expiry: "7d" });
    await raw`insert into care_access_grants (pet_id, owner_user_id, provider_id, scopes, status, requested_by)
              values (${PET}, ${OWNER.profileId}, ${P1}, ${["medical_read", "medical_write"]}, 'pending', 'provider')`;
    expect((await respond(id, "accept")).status).toBe(200);
    const rows = await grants();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "active", scopes: ["record_sections"], sections: ["files"], requested_by: "provider" });
  });

  it("an unknown invitation or action", async () => {
    const id = await offer();
    expect((await respond(999, "accept")).status).toBe(404);
    expect((await respond("abc", "accept")).status).toBe(404);
    expect((await respond(id, "maybe")).status).toBe(400);
    expect((await offers())[0].status).toBe("open");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe("E. the owner's later decision wins", () => {
  const stillRefused = async (id: number) => {
    expect((await offers())[0].status).toBe("withdrawn");
    const before = await grants();
    expect((await respond(id, "accept")).status).toBe(409);
    expect(await grants()).toEqual(before);
  };

  it("sharing directly with that business withdraws the invitation, so accepting cannot widen it", async () => {
    const id = await offer({ sections: ["vet_notes", "files"], expiry: "1y" });
    expect((await share({ sections: ["vaccines"], expiry: "7d" })).status).toBe(201);
    await stillRefused(id);
    expect((await grants())[0].sections).toEqual(["vaccines"]);
  });

  it("revoking that business's access withdraws a waiting invitation", async () => {
    const granted = await (await share({ sections: ["vaccines"], expiry: "7d" })).json();
    const id = await offer();
    expect((await patchGrant(granted.grant.id, "revoke")).status).toBe(200);
    await stillRefused(id);
  });

  it.each(["approve", "deny"])("answering that business's request (%s) withdraws a waiting invitation", async (action) => {
    const id = await offer();
    const [pending] = await raw`
      insert into care_access_grants (pet_id, owner_user_id, provider_id, scopes, status, requested_by)
      values (${PET}, ${OWNER.profileId}, ${P1}, ${["medical_read"]}, 'pending', 'provider') returning id`;
    expect((await patchGrant(pending.id, action)).status).toBe(200);
    await stillRefused(id);
  });

  it("a repeated share that changes no access also withdraws a waiting invitation", async () => {
    expect((await share({})).status).toBe(201);
    const id = await offer();
    const repeat = await share({});
    expect(repeat.status).toBe(200);
    expect((await repeat.json()).deduped).toBe(true);
    await stillRefused(id);
  });

  it("access ended while an answer is on its way: the owner's change goes through and nothing is accepted", async () => {
    const granted = await (await share({ sections: ["vaccines"], expiry: "7d" })).json();
    const grantId = granted.grant.id as number;
    const id = await offer({ sections: ["files"], expiry: "1y" });
    let answer: Promise<Response> | undefined;
    await asApp(OWNER.profileId, async (tx) => {
      await tx`select id from care_access_grants where id = ${grantId} for update`;
      answer = Promise.resolve(respond(id, "accept"));
      // The answer is waiting for the row the owner holds.
      await vi.waitFor(
        async () => {
          const [{ n }] = await raw`select count(*)::int as n from pg_stat_activity where wait_event_type = 'Lock'`;
          expect(n).toBeGreaterThan(0);
        },
        { timeout: 10_000, interval: 25 },
      );
      await tx`update care_access_grants set status = 'revoked', revoked_at = now(), updated_at = now() where id = ${grantId}`;
    });
    const res = await answer!;
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("offer_not_open");
    expect((await grants()).map((g) => g.status)).toEqual(["revoked"]);
    expect((await offers())[0].status).toBe("withdrawn");
  });

  it("leaves an invitation to another business alone, and so does a request from the invited business", async () => {
    const id = await offer({ providerId: P2 });
    expect((await share({ sections: ["vaccines"], expiry: "7d" })).status).toBe(201);
    await raw`insert into care_access_grants (pet_id, owner_user_id, provider_id, scopes, status, requested_by)
              values (${PET}, ${OWNER.profileId}, ${P2}, ${["medical_read"]}, 'pending', 'provider')`;
    expect((await offers())[0]).toMatchObject({ id, status: "open" });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe("F. withdrawing", () => {
  it("the owner withdraws their own, repeatably, and withdrawing is never rate limited", async () => {
    const id = await offer();
    for (const user of [OTHER, FAMILY, VET]) expect((await withdraw(id, user)).status).toBe(404);
    expect((await offers())[0].status).toBe("open");
    for (let i = 0; i < 25; i++) expect((await withdraw(id)).status).toBe(200);
    expect((await offers())[0].status).toBe("withdrawn");
    expect((await withdraw("x")).status).toBe(404);
  });

  it("says when it was already answered", async () => {
    const accepted = await offer();
    await respond(accepted, "accept");
    const taken = await withdraw(accepted);
    expect(taken.status).toBe(409);
    expect((await taken.json()).code).toBe("offer_accepted");
    expect((await grants())[0].status).toBe("active");
    const declined = await offer({ providerId: P2 });
    await respond(declined, "decline", VET2, P2);
    expect((await (await withdraw(declined)).json()).code).toBe("offer_closed");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe("G. the database rules", () => {
  it("only the owner reads an invitation row, and nobody but the database accepts one", async () => {
    const id = await offer();
    for (const user of [VET.profileId, NURSE.profileId, OTHER.profileId, FAMILY.profileId, null]) {
      expect(await asApp(user, (tx) => tx`select * from care_share_offers`)).toHaveLength(0);
      expect((await asApp(user, (tx) => tx`update care_share_offers set status = 'withdrawn' where id = ${id}`)).count).toBe(0);
    }
    for (const status of ["accepted", "declined", "open"]) {
      await expect(
        asApp(OWNER.profileId, (tx) => tx`update care_share_offers set status = ${status} where id = ${id}`),
      ).rejects.toThrow(/row-level security/);
    }
    expect((await asApp(OWNER.profileId, (tx) => tx`delete from care_share_offers where id = ${id}`)).count).toBe(0);
  });

  it("only the owner creates one, for their pet and a business that can receive it", async () => {
    const insert = (user: number, owner: number, providerId: number, status = "open") =>
      asApp(user, (tx) => tx`
        insert into care_share_offers (pet_id, owner_user_id, provider_id, sections, duration, status)
        values (${PET}, ${owner}, ${providerId}, ${["vaccines"]}, '7d', ${status})`);
    await expect(insert(OTHER.profileId, OTHER.profileId, P1)).rejects.toThrow(/row-level security/);
    await expect(insert(OTHER.profileId, OWNER.profileId, P1)).rejects.toThrow(/row-level security/);
    await expect(insert(OWNER.profileId, OWNER.profileId, P_GROOM)).rejects.toThrow(/row-level security/);
    await expect(insert(OWNER.profileId, OWNER.profileId, P1, "accepted")).rejects.toThrow(/row-level security/);
  });

  it("the functions answer nothing to someone outside the business", async () => {
    const id = await offer();
    for (const user of [VET2.profileId, OWNER.profileId, FORMER.profileId, null]) {
      expect(await asApp(user, (tx) => tx`select * from app_provider_share_offers(${P1})`)).toHaveLength(0);
      const [result] = await asApp(user, (tx) => tx`select * from app_respond_share_offer(${id}, ${P1}, true)`);
      expect(result.outcome).toBe("not_found");
      expect((await asApp(user, (tx) => tx`select app_lapse_share_offers(${PET}, ${P1}) as n`))[0].n).toBe(0);
    }
    expect(await asApp(null, (tx) => tx`select * from app_search_share_vets('north')`)).toHaveLength(0);
    expect(await grants()).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe("H. a database without 0154", () => {
  beforeAll(async () => {
    await raw.unsafe(`
      drop trigger if exists care_access_grants_close_share_offers on care_access_grants;
      drop function if exists app_close_superseded_share_offers();
      drop function if exists app_search_share_vets(text);
      drop function if exists app_provider_share_offers(integer);
      drop function if exists app_respond_share_offer(integer, integer, boolean);
      drop function if exists app_lapse_share_offers(integer, integer);
      drop table if exists care_share_offers;
      drop function if exists app_vet_can_receive_share(integer);
    `);
  });
  afterAll(async () => {
    await raw.unsafe(migration("0154_vet_share_offers.sql"));
  });

  it("reports inviting as not available, to the owner and to the business", async () => {
    expect(await (await search("north")).json()).toEqual({ available: false, vets: [] });
    as(OWNER);
    expect(await (await req("/care-access/offers")).json()).toEqual({ available: false, offers: [] });
    const sent = await send();
    expect(sent.status).toBe(409);
    expect((await sent.json()).code).toBe("share_offers_unavailable");
    expect((await withdraw(1)).status).toBe(404);
    expect(await (await waiting()).json()).toEqual({ available: false, offers: [] });
    const answered = await respond(1, "accept");
    expect(answered.status).toBe(409);
    expect((await answered.json()).code).toBe("share_offers_unavailable");
    expect(await raw`select * from notifications`).toHaveLength(0);
  });

  it("leaves direct sharing and revoking working", async () => {
    expect((await share({ providerId: P2 })).status).toBe(201);
    expect((await (await share({ providerId: P2 })).json()).deduped).toBe(true);
    const granted = await share({ sections: ["vaccines"], expiry: "7d" });
    expect(granted.status).toBe(201);
    expect((await record()).status).toBe(200);
    expect((await patchGrant((await granted.json()).grant.id, "revoke")).status).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe("I. verify_0154.sql", () => {
  const failing = async () =>
    ((await raw.unsafe(verify0154())) as any[]).filter((r) => r.status !== "PASS").map((r) => r.ord);

  it("reads PASS on every row of the migrated database, also after re-applying", async () => {
    await raw.unsafe(migration("0154_vet_share_offers.sql"));
    await raw.unsafe(migration("0154_vet_share_offers.sql"));
    const rows = (await raw.unsafe(verify0154())) as any[];
    expect(rows).toHaveLength(17);
    for (const r of rows) expect(r.status, `${r.ord} ${r.check_name} :: ${r.detail}`).toBe("PASS");
  });

  it("can fail: a staff policy, an exposed function, a missing index and a missing trigger are flagged", async () => {
    try {
      await raw.unsafe(`
        create policy care_share_offers_staff on care_share_offers for select using (app_is_active_staff_of(provider_id));
        grant execute on function app_respond_share_offer(integer, integer, boolean) to public;
        drop index idx_care_share_offers_open;
        drop trigger care_access_grants_close_share_offers on care_access_grants;
      `);
      expect(await failing()).toEqual([3, 7, 13, 17]);
    } finally {
      await raw.unsafe("drop policy if exists care_share_offers_staff on care_share_offers");
      await raw.unsafe(migration("0154_vet_share_offers.sql"));
    }
    expect(await failing()).toEqual([]);
  });
});
