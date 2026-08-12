import { describe, it, expect, vi, beforeEach } from "vitest";

// PATCH /api/providers/[id]/adoption-applications/[applicationId] — the shelter reviews one
// application AND notifies the applicant of the transition (adoption applications v2, 0086).
// auth/sql/providerAuth mocked at the module boundary; the wrapper passes through with mocked sql.

import { PATCH } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";
import { requireProviderCapability, requireProviderRole } from "@/app/api/utils/providerAuth";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/providerAuth", () => {
  class ProviderAuthError extends Error {
    constructor(m) { super(m); this.status = 403; }
  }
  return {
    requireProviderCapability: vi.fn(),
    requireProviderRole: vi.fn(),
    ProviderAuthError,
    ALL_PROVIDER_ROLES: ["owner", "admin", "staff", "vet"],
  };
});

const SESSION = { user: { id: 42 } };
const PARAMS = { params: { id: "10", applicationId: "500" } };
const PROFILE = [{ id: 7 }];
const APP_ROW = [{ id: 500, status: "submitted", applicant_owner_user_id: 3, listing_name: "Rex" }];

const patchReq = (body) =>
  new Request("http://localhost/api/providers/10/adoption-applications/500", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const notifyCall = () =>
  sql.mock.calls.find((c) => (c?.[0] ?? []).join(" ").includes("app_notify"));

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  requireProviderCapability.mockResolvedValue(undefined);
  requireProviderRole.mockResolvedValue(undefined);
});

it("under_review → 200 and notifies the applicant with adoption_under_review", async () => {
  auth.mockResolvedValue(SESSION);
  sql
    .mockResolvedValueOnce(PROFILE) // resolveUserId
    .mockResolvedValueOnce(APP_ROW) // the app lookup (+ listing name)
    .mockResolvedValueOnce([{ id: 500, status: "under_review", applicant_owner_user_id: 3 }]) // UPDATE
    .mockResolvedValueOnce([{ app_notify: 1 }]); // safeNotify → SELECT app_notify

  const res = await PATCH(patchReq({ status: "under_review" }), PARAMS);
  expect(res.status).toBe(200);

  const call = notifyCall();
  expect(call).toBeTruthy();
  // Bound values: [strings, recipient, actor, type, subjectRef, body].
  expect(call).toContain("adoption_under_review");
  expect(call).toContain(3); // recipient = applicant
  expect(call).toContain("500"); // subject_ref = application id
});

it("PRE-MIGRATION: a failed notify (type not allowed yet) never fails the review (still 200)", async () => {
  auth.mockResolvedValue(SESSION);
  sql
    .mockResolvedValueOnce(PROFILE) // resolveUserId
    .mockResolvedValueOnce(APP_ROW) // the app lookup
    .mockResolvedValueOnce([{ id: 500, status: "declined" }]) // UPDATE
    .mockRejectedValueOnce(Object.assign(new Error("violates check constraint"), { code: "23514" })); // notify blows up

  const res = await PATCH(patchReq({ status: "declined" }), PARAMS);
  expect(res.status).toBe(200); // safeNotify swallows the CHECK failure — the review still succeeds
});

it("rejects an invalid status before any SQL", async () => {
  auth.mockResolvedValue(SESSION);
  sql.mockResolvedValueOnce(PROFILE);
  const res = await PATCH(patchReq({ status: "bogus" }), PARAMS);
  expect(res.status).toBe(400);
  expect(notifyCall()).toBeFalsy();
});
