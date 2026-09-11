import { describe, it, expect, vi, beforeEach } from "vitest";

// GET /api/media?key=… — AUDIT A-04: auth-gated access to a private medical file,
// 302 to a short-lived signed URL, owner/family only.

import { GET } from "./route";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { resolvePetLogOwner } from "@/app/api/utils/petLogAccess";
import { createSignedMediaUrl } from "@/app/api/utils/mediaAccess";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/currentUser", () => ({ resolveUserId: vi.fn() }));
vi.mock("@/app/api/utils/petLogAccess", () => ({
  resolvePetLogOwner: vi.fn(),
}));
vi.mock("@/app/api/utils/mediaAccess", async (orig) => {
  const actual = await orig();
  return { ...actual, createSignedMediaUrl: vi.fn() };
});

const SESSION = { user: { id: 42 } };
const req = (key) =>
  new Request(
    `http://localhost/api/media?key=${key == null ? "" : encodeURIComponent(key)}`,
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
