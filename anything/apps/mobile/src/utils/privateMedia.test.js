import {
  isPrivateMediaKey,
  resolvePrivateMediaUrl,
} from "./privateMedia";

// AUDIT A-04 — key detection + resolver. The hook (usePrivateMediaUri) is thin
// glue over these; the logic worth pinning is "is this a private key vs a URL"
// and "keys round-trip to a signed URL, everything else passes through".

describe("isPrivateMediaKey", () => {
  it("accepts a well-formed pets/<id>/<file> key", () => {
    expect(isPrivateMediaKey("pets/5/abc-123.jpg")).toBe(true);
    expect(isPrivateMediaKey("pets/42/9f8e.pdf")).toBe(true);
  });

  it("rejects public URLs and local uris (passthrough cases)", () => {
    expect(isPrivateMediaKey("https://sb/storage/v1/object/public/media/uploads/x.jpg")).toBe(false);
    expect(isPrivateMediaKey("http://example.com/a.png")).toBe(false);
    expect(isPrivateMediaKey("file:///var/mobile/x.jpg")).toBe(false);
    expect(isPrivateMediaKey("data:image/png;base64,AAAA")).toBe(false);
  });

  it("rejects traversal, absolute paths, empties and non-strings", () => {
    expect(isPrivateMediaKey("pets/5/../secret")).toBe(false);
    expect(isPrivateMediaKey("/pets/5/a.jpg")).toBe(false);
    expect(isPrivateMediaKey("uploads/a.jpg")).toBe(false);
    expect(isPrivateMediaKey("")).toBe(false);
    expect(isPrivateMediaKey(null)).toBe(false);
    expect(isPrivateMediaKey(undefined)).toBe(false);
  });
});

describe("resolvePrivateMediaUrl", () => {
  afterEach(() => {
    global.fetch = undefined;
  });

  it("returns null for empty input without any fetch", async () => {
    global.fetch = jest.fn();
    expect(await resolvePrivateMediaUrl(null)).toBe(null);
    expect(await resolvePrivateMediaUrl("")).toBe(null);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("passes a public URL straight through (no streamer round-trip)", async () => {
    global.fetch = jest.fn();
    const url = "https://sb/storage/v1/object/public/media/uploads/x.jpg";
    expect(await resolvePrivateMediaUrl(url)).toBe(url);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("exchanges a private key for a signed URL via /api/media?json=1", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ url: "https://sb/sign/media-private/pets/5/a.jpg?token=t" }),
    });
    const out = await resolvePrivateMediaUrl("pets/5/a.jpg");
    expect(out).toContain("token=t");
    const calledWith = global.fetch.mock.calls[0][0];
    expect(calledWith).toContain("/api/media?");
    expect(calledWith).toContain("key=pets%2F5%2Fa.jpg");
    expect(calledWith).toContain("json=1");
  });

  it("forwards providerId for the provider path", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ url: "https://sb/sign/x?token=p" }),
    });
    await resolvePrivateMediaUrl("pets/5/a.jpg", { providerId: 12 });
    expect(global.fetch.mock.calls[0][0]).toContain("providerId=12");
  });

  it("throws when the streamer errors", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 403 });
    await expect(resolvePrivateMediaUrl("pets/5/a.jpg")).rejects.toThrow();
  });
});
