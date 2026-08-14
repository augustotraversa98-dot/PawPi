import { describe, it, expect, vi, beforeEach } from "vitest";

// PUT /api/user-profile/locale (FF1) — persists the owner's preferred EMAIL locale ('en'|'es'),
// clearing to NULL for anything else. Owner-scoped by auth_user_id; degrades cleanly pre-0107.

import { PUT } from "./route";
import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));

const SESSION = { user: { id: 42 }, expires: "9999999999" };
const put = (body) =>
  new Request("http://localhost/api/user-profile/locale", {
    method: "PUT",
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("PUT /api/user-profile/locale", () => {
  it("anonymous → 401", async () => {
    auth.mockResolvedValue(undefined);
    expect((await PUT(put({ locale: "en" }))).status).toBe(401);
  });

  it("persists a valid 'en' locale and echoes it back", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([{ preferred_locale: "en" }]);
    const res = await PUT(put({ locale: "en" }));
    expect(res.status).toBe(200);
    expect((await res.json()).preferred_locale).toBe("en");
    // Bound the scoping id + the resolved locale.
    expect(sql.mock.calls[0][0].join(" ")).toContain("preferred_locale");
    expect(sql.mock.calls[0]).toContain(42); // auth_user_id
    expect(sql.mock.calls[0]).toContain("en"); // locale value
  });

  it("normalizes 'es-AR' → 'es'", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([{ preferred_locale: "es" }]);
    const res = await PUT(put({ locale: "es-AR" }));
    expect(res.status).toBe(200);
    expect(sql.mock.calls[0]).toContain("es");
  });

  it("clears to NULL for 'system' / unsupported languages", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([{ preferred_locale: null }]);
    const res = await PUT(put({ locale: "system" }));
    expect(res.status).toBe(200);
    expect((await res.json()).preferred_locale).toBeNull();
    expect(sql.mock.calls[0]).toContain(null); // bound NULL
  });

  it("no profile row → 404", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([]);
    expect((await PUT(put({ locale: "en" }))).status).toBe(404);
  });

  it("pre-0107 (undefined_column) → clean 200 no-op", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockRejectedValueOnce({ code: "42703" });
    const res = await PUT(put({ locale: "en" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.preferred_locale).toBeNull();
    expect(json.note).toMatch(/not applied/);
  });
});
