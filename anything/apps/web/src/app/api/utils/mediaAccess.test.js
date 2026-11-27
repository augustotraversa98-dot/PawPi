import { describe, it, expect, vi, afterEach } from "vitest";
import {
  parsePrivateMediaKey,
  buildPrivateMediaKey,
  createSignedMediaUrl,
} from "./mediaAccess";

describe("parsePrivateMediaKey (AUDIT A-04)", () => {
  it("accepts a well-formed owner-scoped key", () => {
    expect(parsePrivateMediaKey("pets/42/abc-123.jpg")).toEqual({ petId: 42 });
  });
  it("rejects path traversal", () => {
    expect(parsePrivateMediaKey("pets/42/../../secret.jpg")).toBeNull();
    expect(parsePrivateMediaKey("../etc/passwd")).toBeNull();
  });
  it("rejects absolute paths and other buckets", () => {
    expect(parsePrivateMediaKey("/pets/42/a.jpg")).toBeNull();
    expect(parsePrivateMediaKey("uploads/a.jpg")).toBeNull();
    expect(parsePrivateMediaKey("pets/notanumber/a.jpg")).toBeNull();
  });
  it("rejects junk", () => {
    expect(parsePrivateMediaKey(null)).toBeNull();
    expect(parsePrivateMediaKey("")).toBeNull();
    expect(parsePrivateMediaKey("pets/42")).toBeNull();
  });
});

describe("buildPrivateMediaKey", () => {
  it("builds the owner-scoped key", () => {
    expect(buildPrivateMediaKey(7, "uuid", "pdf")).toBe("pets/7/uuid.pdf");
  });
});

describe("createSignedMediaUrl", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("gives the storage service five seconds to answer", async () => {
    vi.stubEnv("SUPABASE_URL", "https://storage.example.test");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-key");
    const waited = new AbortController();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(waited.signal);
    const fetchMock = vi.fn(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const pending = createSignedMediaUrl("pets/7/a.pdf", 60);
    expect(timeout).toHaveBeenCalledWith(5000);
    expect(fetchMock.mock.calls[0][1].signal).toBe(waited.signal);
    waited.abort();
    await expect(pending).rejects.toThrow("aborted");
  });
});

