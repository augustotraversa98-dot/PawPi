import { describe, it, expect, vi, beforeEach } from "vitest";

// GET /api/providers/[id]/adoption-applications — the shelter application queue.
// AUDIT A-23: the applicant email (auth_users.email, PII) is returned only to
// owner/admin roles; regular staff/vet get it nulled (contact goes through the
// application thread instead). Any active staff may still REVIEW the list.

import { GET } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";
import { resolveUserId } from "@/app/api/utils/currentUser";
import {
  requireProviderCapability,
  requireProviderRole,
} from "@/app/api/utils/providerAuth";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/currentUser", () => ({ resolveUserId: vi.fn() }));
vi.mock("@/app/api/utils/providerAuth", () => {
  class ProviderAuthError extends Error {
    constructor(m) {
      super(m);
      this.status = 403;
    }
  }
  return {
    requireProviderCapability: vi.fn(),
    requireProviderRole: vi.fn(),
    ProviderAuthError,
    ALL_PROVIDER_ROLES: ["owner", "admin", "staff", "vet"],
  };
});

const SESSION = { user: { id: 42 } };
const PARAMS = { params: { id: "10" } };
const req = () =>
  new Request("http://localhost/api/providers/10/adoption-applications");

const ROW = {
  id: 1,
  listing_id: 5,
  applicant_name: "Ana",
  applicant_email: "ana@example.com",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  auth.mockResolvedValue(SESSION);
  resolveUserId.mockResolvedValue(7);
  requireProviderCapability.mockResolvedValue(undefined);
  sql.mockResolvedValue([{ ...ROW }]);
});

it("401 unauthenticated", async () => {
  auth.mockResolvedValueOnce(undefined);
  expect((await GET(req(), PARAMS)).status).toBe(401);
});

it("owner sees the applicant email", async () => {
  requireProviderRole.mockResolvedValue({ role: "owner" });
  const res = await GET(req(), PARAMS);
  expect(res.status).toBe(200);
  const { applications } = await res.json();
  expect(applications[0].applicant_email).toBe("ana@example.com");
});

it("admin sees the applicant email", async () => {
  requireProviderRole.mockResolvedValue({ role: "admin" });
  const { applications } = await (await GET(req(), PARAMS)).json();
  expect(applications[0].applicant_email).toBe("ana@example.com");
});

it("regular staff get the email nulled (AUDIT A-23)", async () => {
  requireProviderRole.mockResolvedValue({ role: "staff" });
  const { applications } = await (await GET(req(), PARAMS)).json();
  expect(applications[0].applicant_email).toBeNull();
  // The rest of the row is still returned so the dashboard renders.
  expect(applications[0].applicant_name).toBe("Ana");
});

it("vet role also gets the email nulled", async () => {
  requireProviderRole.mockResolvedValue({ role: "vet" });
  const { applications } = await (await GET(req(), PARAMS)).json();
  expect(applications[0].applicant_email).toBeNull();
});

it("non-staff → 403 from the role gate", async () => {
  const { ProviderAuthError } = await import("@/app/api/utils/providerAuth");
  requireProviderRole.mockRejectedValue(new ProviderAuthError("nope"));
  expect((await GET(req(), PARAMS)).status).toBe(403);
});
