import { describe, it, expect, vi, beforeEach } from "vitest";

// GET /api/media?key=… — AUDIT A-04: auth-gated access to a private medical file,
// 302 to a short-lived signed URL, owner/family only.

import { GET } from "./route";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { resolvePetLogOwner } from "@/app/api/utils/petLogAccess";
import { createSignedMediaUrl } from "@/app/api/utils/mediaAccess";
import { assertCareAccess } from "@/app/api/utils/careAccess";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/currentUser", () => ({ resolveUserId: vi.fn() }));
vi.mock("@/app/api/utils/petLogAccess", () => ({
  resolvePetLogOwner: vi.fn(),
}));
vi.mock("@/app/api/utils/careAccess", () => ({ assertCareAccess: vi.fn() }));
// withSavepoint just runs its callback in these unit tests (no real tx).
vi.mock("@/app/api/utils/requestContext", () => ({
  withRequestContext: (fn) => fn,
  withSavepoint: (fn) => fn(),
}));
vi.mock("@/app/api/utils/mediaAccess", async (orig) => {
  const actual = await orig();
  return { ...actual, createSignedMediaUrl: vi.fn() };
});

const SESSION = { user: { id: 42 } };
const req = (key, providerId) =>
  new Request(
    `http://localhost/api/media?key=${key == null ? "" : encodeURIComponent(key)}` +
      (providerId == null ? "" : `&providerId=${providerId}`),
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  auth.mockResolvedValue(SESSION);
  resolveUserId.mockResolvedValue(7);
});

it("401 when unauthenticated", async () => {
  auth.mockResolvedValueOnce(undefined);
  expect((await GET(req("pets/5/a.jpg"))).status).toBe(401);
});

it("400 on an invalid / traversal key", async () => {
  expect((await GET(req("pets/5/../x"))).status).toBe(400);
  expect((await GET(req("uploads/a.jpg"))).status).toBe(400);
});

it("403 when the caller is neither owner nor family", async () => {
  resolvePetLogOwner.mockResolvedValue({ error: "Pet not found or access denied", status: 403 });
  const res = await GET(req("pets/5/a.jpg"));
  expect(res.status).toBe(403);
  expect(createSignedMediaUrl).not.toHaveBeenCalled();
});

it("302 to a signed URL for the owner", async () => {
  resolvePetLogOwner.mockResolvedValue({ ownerUserId: 7, isOwner: true });
  createSignedMediaUrl.mockResolvedValue("https://sb/storage/v1/object/sign/media-private/pets/5/a.jpg?token=xyz");
  const res = await GET(req("pets/5/a.jpg"));
  expect(res.status).toBe(302);
  expect(res.headers.get("Location")).toContain("token=xyz");
  expect(res.headers.get("Cache-Control")).toBe("no-store");
  expect(createSignedMediaUrl).toHaveBeenCalledWith("pets/5/a.jpg", 60);
});

it("502 when signing fails", async () => {
  resolvePetLogOwner.mockResolvedValue({ ownerUserId: 7, isOwner: true });
  createSignedMediaUrl.mockRejectedValue(new Error("sign failed"));
  expect((await GET(req("pets/5/a.jpg"))).status).toBe(502);
});

it("?json=1 returns the signed URL as JSON (mobile path) instead of a 302", async () => {
  resolvePetLogOwner.mockResolvedValue({ ownerUserId: 7, isOwner: true });
  createSignedMediaUrl.mockResolvedValue("https://sb/sign/media-private/pets/5/a.jpg?token=json");
  const res = await GET(
    new Request("http://localhost/api/media?key=pets%2F5%2Fa.jpg&json=1"),
  );
  expect(res.status).toBe(200);
  expect(res.headers.get("Cache-Control")).toBe("no-store");
  expect((await res.json()).url).toContain("token=json");
});

it("302 for a provider with a medical_read grant (via ?providerId)", async () => {
  resolvePetLogOwner.mockResolvedValue({ error: "Pet not found or access denied", status: 403 });
  assertCareAccess.mockResolvedValue({ id: 99 }); // grant row
  createSignedMediaUrl.mockResolvedValue("https://sb/sign/media-private/pets/5/a.jpg?token=prov");
  const res = await GET(req("pets/5/a.jpg", 12));
  expect(res.status).toBe(302);
  expect(res.headers.get("Location")).toContain("token=prov");
  expect(assertCareAccess).toHaveBeenCalledWith(5, 12, "medical_read", {
    staffUserId: 7,
    action: "read",
    resource: "media:pets/5/a.jpg",
  });
});

it("403 for a provider WITHOUT the grant (assertCareAccess throws)", async () => {
  resolvePetLogOwner.mockResolvedValue({ error: "Pet not found or access denied", status: 403 });
  assertCareAccess.mockRejectedValue(Object.assign(new Error("no grant"), { status: 403 }));
  const res = await GET(req("pets/5/a.jpg", 12));
  expect(res.status).toBe(403);
  expect(createSignedMediaUrl).not.toHaveBeenCalled();
});

it("does not attempt the provider branch without ?providerId (owner/family only)", async () => {
  resolvePetLogOwner.mockResolvedValue({ error: "Pet not found or access denied", status: 403 });
  const res = await GET(req("pets/5/a.jpg"));
  expect(res.status).toBe(403);
  expect(assertCareAccess).not.toHaveBeenCalled();
});
