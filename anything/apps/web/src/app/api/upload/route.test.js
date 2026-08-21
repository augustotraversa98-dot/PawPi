import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// POST /api/upload — type/size gate (#3). The route stores the VALIDATED mime (never the raw client
// one) and rejects unsupported types up front, so active-markup content can't be served from the
// public bucket. Storage write is mocked (global fetch).

import { POST } from "./route";
import { auth } from "@/auth";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
// Mocked sql → withRequestContext passes through and the rate limiter is a no-op (no real tx),
// so these tests exercise the upload handler exactly as before the #6 wrapper was added.
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));

const OLD_ENV = { ...process.env };

// A minimal file-like with exactly the props the route reads (type/name/size/arrayBuffer). Avoids
// depending on the test environment's File/FormData impl (the env File has no arrayBuffer()).
function fileLike({ type, name, bytes = new Uint8Array([1, 2, 3]) }) {
  return {
    type,
    name,
    size: bytes.byteLength,
    arrayBuffer: async () => bytes.buffer,
  };
}

// Fake request: the route only calls request.formData().get("file").
function upload(file) {
  return {
    async formData() {
      return { get: (key) => (key === "file" ? file : null) };
    },
  };
}

beforeEach(() => {
  process.env.SUPABASE_URL = "https://proj123.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key-test";
  vi.restoreAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  process.env = { ...OLD_ENV };
});

describe("POST /api/upload", () => {
  it("anonymous → 401", async () => {
    auth.mockResolvedValue(undefined);
    expect((await POST(upload(fileLike({ type: "image/png", name: "x.png" })))).status).toBe(401);
  });

  it("valid image → 200, stores the validated content-type", async () => {
    auth.mockResolvedValue({ user: { id: "a" } });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, text: async () => "" });
    const res = await POST(upload(fileLike({ type: "image/png", name: "photo.png" })));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mimeType).toBe("image/png");
    expect(body.url).toContain("/storage/v1/object/public/media/uploads/");
    // Supabase object write used the validated Content-Type.
    expect(fetchMock.mock.calls[0][1].headers["Content-Type"]).toBe("image/png");
  });

  it("active-markup type (text/html) → 400, no storage write", async () => {
    auth.mockResolvedValue({ user: { id: "a" } });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true });
    const res = await POST(upload(fileLike({ type: "text/html", name: "x.html" })));
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("PDF (vet document / provider price-list) → 200", async () => {
    auth.mockResolvedValue({ user: { id: "a" } });
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, text: async () => "" });
    const res = await POST(upload(fileLike({ type: "application/pdf", name: "bloodwork.pdf" })));
    expect(res.status).toBe(200);
    expect((await res.json()).mimeType).toBe("application/pdf");
  });
});
