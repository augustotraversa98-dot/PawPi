import { describe, it, expect } from "vitest";

// Upload type/size gate (#3). Blocks active-markup content-types (stored-XSS) and oversized files,
// while allowing every type the app legitimately uploads (images, PDF, CSV/XLSX).

import {
  validateUpload,
  resolveUploadType,
  MAX_UPLOAD_BYTES,
  ALLOWED_UPLOAD_MIME,
} from "./uploadValidation";

describe("validateUpload", () => {
  it("accepts each legitimately-uploaded type", () => {
    for (const mime of ALLOWED_UPLOAD_MIME) {
      const r = validateUpload({ mimeType: mime, filename: "x", size: 100 });
      expect(r.ok, mime).toBe(true);
    }
  });

  it("returns { url, mimeType }-ready image type + ext for a normal photo", () => {
    expect(validateUpload({ mimeType: "image/png", filename: "photo.png", size: 10 })).toEqual({
      ok: true,
      mime: "image/png",
      ext: "png",
    });
  });

  it("rejects active-markup content types (stored-XSS vectors)", () => {
    for (const bad of ["text/html", "image/svg+xml", "application/xhtml+xml", "text/xml", "application/javascript"]) {
      const r = validateUpload({ mimeType: bad, filename: "x.bin", size: 10 });
      expect(r.ok, bad).toBe(false);
      expect(r.status).toBe(400);
    }
  });

  it("rejects a .html filename even with a spoofed image content-type mismatch", () => {
    // image/png IS allowed and wins — but the stored ext comes from the validated mime, not the name.
    expect(validateUpload({ mimeType: "image/png", filename: "evil.html", size: 10 })).toMatchObject({
      ok: true,
      ext: "png",
    });
    // An octet-stream .html gets no valid type → rejected.
    expect(validateUpload({ mimeType: "application/octet-stream", filename: "evil.html", size: 10 })).toMatchObject({
      ok: false,
      status: 400,
    });
  });

  it("recovers a valid type from the extension when the client sends octet-stream", () => {
    expect(resolveUploadType({ mimeType: "application/octet-stream", filename: "scan.pdf" })).toEqual({
      mime: "application/pdf",
      ext: "pdf",
    });
    expect(resolveUploadType({ mimeType: "", filename: "list.xlsx" })).toEqual({
      mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ext: "xlsx",
    });
  });

  it("rejects a file larger than the cap", () => {
    expect(validateUpload({ mimeType: "image/png", filename: "big.png", size: MAX_UPLOAD_BYTES + 1 })).toEqual({
      ok: false,
      status: 413,
      error: "File too large",
    });
  });

  it("allows a file exactly at the cap", () => {
    expect(validateUpload({ mimeType: "image/png", filename: "x.png", size: MAX_UPLOAD_BYTES }).ok).toBe(true);
  });
});
