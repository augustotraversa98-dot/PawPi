import { describe, it, expect, vi, beforeEach } from "vitest";

// Adoptable-listings POST/GET — foster/urgent/featured flags (ticket 2.57). POST persists the new
// columns (admin); GET returns them + orders featured first. auth/sql/providerAuth mocked.

import { POST, GET } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";
import { requireProviderCapability, requireProviderRole } from "@/app/api/utils/providerAuth";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/providerAuth", () => {
  class ProviderAuthError extends Error { constructor(m) { super(m); this.status = 403; } }
  return { requireProviderCapability: vi.fn(), requireProviderRole: vi.fn(), ProviderAuthError };
});

const SESSION = { user: { id: 42 } };
const PARAMS = { params: { id: "10" } };
const PROFILE = [{ id: 7 }];

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  // application_questions (0086) binds via sql.json(); the create INSERT calls it.
  sql.json = (v) => v;
  requireProviderCapability.mockResolvedValue(undefined);
  requireProviderRole.mockResolvedValue(undefined);
});

it("POST persists placement_type + urgent/featured flags", async () => {
  auth.mockResolvedValue(SESSION);
  sql.mockResolvedValueOnce(PROFILE).mockResolvedValueOnce([{ id: 1, placement_type: "both", is_urgent: true }]);
  const res = await POST(
    new Request("http://localhost/api/providers/10/adoptable-listings", {
      method: "POST",
      body: JSON.stringify({ name: "Pongo", placement_type: "both", is_urgent: true, urgent_reason: "Medical", is_featured: true }),
    }), PARAMS,
  );
  expect(res.status).toBe(201);
  const insert = sql.mock.calls[1][0].join(" ");
  expect(insert).toContain("placement_type");
  expect(insert).toContain("is_urgent");
  expect(insert).toContain("is_featured");
});

it("POST persists age_years + age_months (fixes the 'age unknown' default)", async () => {
  auth.mockResolvedValue(SESSION);
  sql.mockResolvedValueOnce(PROFILE).mockResolvedValueOnce([{ id: 1, age_years: 3, age_months: 6 }]);
  const res = await POST(
    new Request("http://localhost/api/providers/10/adoptable-listings", {
      method: "POST",
      body: JSON.stringify({ name: "Pongo", age_years: 3, age_months: 6 }),
    }), PARAMS,
  );
  expect(res.status).toBe(201);
  const insert = sql.mock.calls[1][0].join(" ");
  expect(insert).toContain("age_years");
  expect(insert).toContain("age_months");
  const values = sql.mock.calls[1].slice(1);
  expect(values).toContain(3);
  expect(values).toContain(6);
});

it("POST rejects an out-of-range months (must be 0–11) before any insert", async () => {
  auth.mockResolvedValue(SESSION);
  sql.mockResolvedValueOnce(PROFILE); // resolveUserId only — validation stops before INSERT
  const res = await POST(
    new Request("http://localhost/api/providers/10/adoptable-listings", {
      method: "POST",
      body: JSON.stringify({ name: "Pongo", age_years: 2, age_months: 12 }),
    }), PARAMS,
  );
  expect(res.status).toBe(400);
  expect((await res.json()).error).toMatch(/months/i);
  expect(sql.mock.calls.length).toBe(1); // no INSERT issued
});

it("POST rejects a negative age_years before any insert", async () => {
  auth.mockResolvedValue(SESSION);
  sql.mockResolvedValueOnce(PROFILE);
  const res = await POST(
    new Request("http://localhost/api/providers/10/adoptable-listings", {
      method: "POST",
      body: JSON.stringify({ name: "Pongo", age_years: -1 }),
    }), PARAMS,
  );
  expect(res.status).toBe(400);
  expect(sql.mock.calls.length).toBe(1);
});

it("GET orders featured listings first + returns the new columns", async () => {
  auth.mockResolvedValue(SESSION);
  sql.mockResolvedValueOnce(PROFILE).mockResolvedValueOnce([{ id: 1, is_featured: true }]);
  const res = await GET(new Request("http://localhost/api/providers/10/adoptable-listings"), PARAMS);
  expect(res.status).toBe(200);
  const select = sql.mock.calls[1][0].join(" ");
  expect(select).toContain("is_featured DESC");
  expect(select).toContain("placement_type");
  expect(select).toContain("application_questions"); // 0086: questions in the projection
});

// ── application questions (adoption applications v2, migration 0086) ──────────────
it("POST persists application_questions (sanitized) on create", async () => {
  auth.mockResolvedValue(SESSION);
  sql.mockResolvedValueOnce(PROFILE).mockResolvedValueOnce([{ id: 1, application_questions: ["Best contact number"] }]);
  const res = await POST(
    new Request("http://localhost/api/providers/10/adoptable-listings", {
      method: "POST",
      body: JSON.stringify({ name: "Rex", application_questions: ["  Best contact number  ", "", 7] }),
    }), PARAMS,
  );
  expect(res.status).toBe(201);
  const insert = sql.mock.calls[1][0].join(" ");
  expect(insert).toContain("application_questions");
  // Sanitized to non-empty trimmed strings.
  expect(sql.mock.calls[1].slice(1)).toContainEqual(["Best contact number"]);
});

it("PRE-MIGRATION: POST retries WITHOUT application_questions on a 42703 (still 201)", async () => {
  auth.mockResolvedValue(SESSION);
  sql
    .mockResolvedValueOnce(PROFILE) // resolveUserId
    .mockRejectedValueOnce(Object.assign(new Error('column "application_questions" does not exist'), { code: "42703" }))
    .mockResolvedValueOnce([{ id: 1 }]); // fallback insert
  const res = await POST(
    new Request("http://localhost/api/providers/10/adoptable-listings", {
      method: "POST",
      body: JSON.stringify({ name: "Rex", application_questions: ["Q"] }),
    }), PARAMS,
  );
  expect(res.status).toBe(201);
  // The fallback insert (call 2) omits the column.
  expect(sql.mock.calls[2][0].join(" ")).not.toContain("application_questions");
});

it("PRE-MIGRATION: GET retries with a [] fallback on a 42703 (still 200)", async () => {
  auth.mockResolvedValue(SESSION);
  sql
    .mockResolvedValueOnce(PROFILE) // resolveUserId
    .mockRejectedValueOnce(Object.assign(new Error('column "application_questions" does not exist'), { code: "42703" }))
    .mockResolvedValueOnce([{ id: 1, application_questions: [] }]); // fallback select
  const res = await GET(new Request("http://localhost/api/providers/10/adoptable-listings"), PARAMS);
  expect(res.status).toBe(200);
  expect(sql.mock.calls[2][0].join(" ")).toContain("'[]'::jsonb");
});
