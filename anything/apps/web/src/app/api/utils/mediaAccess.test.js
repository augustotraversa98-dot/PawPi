import { describe, it, expect } from "vitest";
import {
  parsePrivateMediaKey,
  buildPrivateMediaKey,
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
