import { describe, it, expect, vi, beforeEach } from "vitest";

// POST /api/health/medical-care-logs — owner logs a medical-care completion.
//
// The contract under test is the vaccination WRITE-THROUGH (ticket
// vaccination-reconciliation / migration 0018): the route still inserts the
// health_medical_care_logs row UNCHANGED (it is the reminder-resolution record),
// and — in the SAME CTE statement — ALSO inserts a pet_vaccinations row when, and
// only when, the log is an ADMINISTERED vaccine (care_type='vaccine' AND status in
// ('given','completed')). pet_vaccinations is the vaccination-history SSOT.
//
// `auth` + `sql` are mocked at the module boundary (no live DB). Call order in the
// POST: sql 1 = user_profiles lookup, then the access gate (utils/petLogAccess, mocked), then sql 2 = the
// log(+vaccination) CTE insert.

import { POST } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";
import { resolvePetLogOwner } from "@/app/api/utils/petLogAccess";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/petLogAccess", () => ({ resolvePetLogOwner: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => {
  const fn = vi.fn();
  // sql.json(value) binds the RAW value to a jsonb param (reaction_or_issue).
  fn.json = vi.fn((value) => ({ __jsonb: value }));
  return { default: fn };
});

// Identity chain: auth_users.id (42) -> user_profiles.auth_user_id (42) ->
// user_profiles.id (7) = owner_user_id on the log + vaccination rows.
const SESSION = { user: { id: 42 }, expires: "9999999999" };
const PROFILE_ROW = { id: 7, auth_user_id: 42 };
const PET_ROW = { id: 55 };
const LOG_ROW = { id: 900, pet_id: 55, owner_user_id: 7 };

const postReq = (body) =>
  new Request("http://localhost/api/health/medical-care-logs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const lastCall = () => sql.mock.calls[sql.mock.calls.length - 1];
const lastQueryText = () => (lastCall()?.[0] ?? []).join(" ");
const lastValues = () => lastCall()?.slice(1) ?? [];

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  // The ownership/grant gate is the shared helper (utils/petLogAccess); the default here is "the caller owns the pet".
  resolvePetLogOwner.mockResolvedValue({ ownerUserId: 7, isOwner: true });
});

describe("POST /api/health/medical-care-logs — vaccination write-through", () => {
  it("401 when unauthenticated, no DB touched", async () => {
    auth.mockResolvedValue(null);
    const res = await POST(postReq({ petId: 55, status: "given" }));
    expect(res.status).toBe(401);
    expect(sql).not.toHaveBeenCalled();
  });

  it("missing petId → 400 (no insert)", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]); // profile lookup
    const res = await POST(postReq({ status: "given" }));
    expect(res.status).toBe(400);
  });

  it("403 when the pet is not owned by the caller (scoping preserved)", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]); // profile lookup
    resolvePetLogOwner.mockResolvedValue({ error: "Pet not found or access denied", status: 403 }); // not owner, no grant
    const res = await POST(postReq({ petId: 55, status: "given" }));
    expect(res.status).toBe(403);
    expect(resolvePetLogOwner).toHaveBeenCalledWith(7, 55, { allowCaregiver: true, logTable: "health_medical_care_logs" });
    // Only the profile lookup ran; the insert never did.
    expect(sql).toHaveBeenCalledTimes(1);
  });

  it("non-vaccine completion writes ONLY the medical-care log (no vaccination row)", async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce([LOG_ROW]);

    const res = await POST(
      postReq({
        petId: 55,
        careType: "medication",
        name: "Apoquel",
        status: "given",
        givenAt: "2026-06-10T08:00:00.000Z",
      }),
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ log: LOG_ROW });

    const text = lastQueryText();
    // The log insert is always present...
    expect(text).toContain("INSERT INTO health_medical_care_logs");
    // ...and the CTE carries the conditional vaccination insert, but its WHERE
    // (care_type='vaccine') means a 'medication' log inserts no vaccination row.
    expect(text).toContain("INSERT INTO pet_vaccinations");
    expect(text).toContain("care_type = 'vaccine'");
  });

  it("vaccine ADMINISTERED → both rows in one CTE, mapped owner + source + link", async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce([LOG_ROW]);

    const res = await POST(
      postReq({
        petId: 55,
        careType: "vaccine",
        name: "Rabies",
        status: "completed",
        givenAt: "2026-06-10T08:00:00.000Z",
      }),
    );
    expect(res.status).toBe(201);
    // Response shape unchanged — still just the log row.
    expect(await res.json()).toEqual({ log: LOG_ROW });

    const text = lastQueryText();
    expect(text).toContain("INSERT INTO health_medical_care_logs");
    expect(text).toContain("INSERT INTO pet_vaccinations");
    // Field mapping per design #4: from the log row, source='owner', linked id.
    expect(text).toContain("given_at::date");
    expect(text).toContain("'owner'");
    expect(text).toContain("source_medical_care_log_id");
    // Idempotent on the source-log link.
    expect(text).toContain("ON CONFLICT");

    // owner_user_id (7) and pet_id (55) are bound from the session/request, not
    // hardcoded — both stores get the same owner-scoped values.
    const values = lastValues();
    expect(values).toContain(7); // owner_user_id from session profile
    expect(values).toContain(55); // pet_id
    expect(values).toContain("Rabies"); // name
    expect(values).toContain("completed"); // status
  });

  it("vaccine 'given' also counts as administered (write-through condition)", async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce([LOG_ROW]);

    const res = await POST(
      postReq({ petId: 55, careType: "vaccine", name: "DHPP", status: "given" }),
    );
    expect(res.status).toBe(201);
    // The SQL WHERE admits status in ('given','completed').
    expect(lastQueryText()).toContain("status IN ('given', 'completed')");
  });

  it("vaccine NOT administered (issue_reported) → only the log, no vaccination row", async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce([LOG_ROW]);

    const res = await POST(
      postReq({
        petId: 55,
        careType: "vaccine",
        name: "Rabies",
        status: "issue_reported",
        reactionOrIssue: { given: "no", reaction: "yes" },
      }),
    );
    expect(res.status).toBe(201);
    // reaction_or_issue is bound via sql.json (jsonb), staying on the log only.
    expect(sql.json).toHaveBeenCalledTimes(1);
    // The vaccination insert is in the CTE but its WHERE excludes 'issue_reported',
    // so no row is created — and the request still succeeds (the log is written).
    const text = lastQueryText();
    expect(text).toContain("status IN ('given', 'completed')");
  });

  it("write-through is idempotent on the source log (ON CONFLICT DO NOTHING)", async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce([LOG_ROW]);

    await POST(
      postReq({ petId: 55, careType: "vaccine", name: "Rabies", status: "completed" }),
    );
    const text = lastQueryText();
    expect(text).toContain("ON CONFLICT");
    expect(text).toContain("DO NOTHING");
    // Scoped to the partial unique index predicate.
    expect(text).toContain("source_medical_care_log_id IS NOT NULL");
  });

  it("a caregiver/family member logs a non-vaccine completion anchored to the pet's OWNER", async () => {
    auth.mockResolvedValue(SESSION);
    resolvePetLogOwner.mockResolvedValue({ ownerUserId: 3, isOwner: false });
    sql.mockResolvedValueOnce([PROFILE_ROW]).mockResolvedValueOnce([LOG_ROW]);
    const res = await POST(postReq({ petId: 55, careType: "medication", name: "Apoquel", status: "given" }));
    expect(res.status).toBe(201);
    expect(lastValues()).toContain(3); // owner_user_id of the row = the pet's owner (3), not the caller (7)
  });

  it("a NON-owner cannot record an administered vaccine (it writes pet_vaccinations, owner-only) → friendly 403, no insert", async () => {
    auth.mockResolvedValue(SESSION);
    resolvePetLogOwner.mockResolvedValue({ ownerUserId: 3, isOwner: false });
    sql.mockResolvedValueOnce([PROFILE_ROW]);
    const res = await POST(postReq({ petId: 55, careType: "vaccine", name: "Rabies", status: "completed" }));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("vaccine_owner_only");
    expect(sql).toHaveBeenCalledTimes(1);
  });

  it("a non-owner logging a SKIPPED vaccine is fine (nothing is written to pet_vaccinations)", async () => {
    auth.mockResolvedValue(SESSION);
    resolvePetLogOwner.mockResolvedValue({ ownerUserId: 3, isOwner: false });
    sql.mockResolvedValueOnce([PROFILE_ROW]).mockResolvedValueOnce([LOG_ROW]);
    const res = await POST(postReq({ petId: 55, careType: "vaccine", name: "Rabies", status: "skipped" }));
    expect(res.status).toBe(201);
  });
});
