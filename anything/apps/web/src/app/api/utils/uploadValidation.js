// uploadValidation — type + size gate for POST /api/upload (night-run S3 / #3).
//
// The upload route stores a client file into the PUBLIC `media` bucket and previously accepted ANY
// content-type and ANY size: `mimeType = file.type || "application/octet-stream"` was passed straight
// through as the stored object's Content-Type. A user could upload `text/html` / `image/svg+xml`
// and have it served AS ACTIVE CONTENT from the app's storage domain (stored-XSS / phishing), or
// flood storage with huge files. This validates the type against the set the app actually uploads
// and caps the size — and, crucially, the route stores the VALIDATED mime we return here, never the
// raw client-declared one.
//
// The route is deliberately mime-agnostic across the product: photos (checks/avatars/posts/vet-doc
// photos), PDFs (vet documents, provider price-lists) and CSV/XLSX (provider price-lists) all go
// through it. The allowlist therefore covers those and NOTHING that renders as active markup.

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB — covers multi-page scanned vet PDFs; abuse cap.

export const ALLOWED_UPLOAD_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "application/pdf",
  "text/csv",
  "text/comma-separated-values",
  "application/vnd.ms-excel", // .xls
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
]);

// Canonical file extension for each allowed mime (the stored object's name uses this, derived from
// the VALIDATED type — never from the client filename, so a `.html` name can't ride along).
const MIME_TO_EXT = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
  "image/heif": "heif",
  "application/pdf": "pdf",
  "text/csv": "csv",
  "text/comma-separated-values": "csv",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
};

// Extension → mime, used only to recover a valid type when the client sent no/garbage content-type
// (some upload paths send application/octet-stream). Keeps legitimate uploads working without
// trusting an arbitrary client-declared type.
const EXT_TO_MIME = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  heic: "image/heic",
  heif: "image/heif",
  pdf: "application/pdf",
  csv: "text/csv",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

// Resolve the effective mime: prefer a client-declared type that is on the allowlist, otherwise fall
// back to what the filename extension maps to. Returns { mime, ext } or null when neither is allowed.
export function resolveUploadType({ mimeType, filename } = {}) {
  const declared = String(mimeType || "")
    .toLowerCase()
    .split(";")[0]
    .trim();
  if (ALLOWED_UPLOAD_MIME.has(declared)) {
    return { mime: declared, ext: MIME_TO_EXT[declared] };
  }
  const ext = String(filename || "").split(".").pop()?.toLowerCase();
  const fromExt = ext && EXT_TO_MIME[ext];
  if (fromExt) return { mime: fromExt, ext: MIME_TO_EXT[fromExt] };
  return null;
}

/**
 * Validate an upload's declared type/name and size.
 * @returns {{ok:true, mime:string, ext:string}} on success,
 *          or {{ok:false, status:number, error:string}} to return verbatim.
 */
export function validateUpload({ mimeType, filename, size } = {}) {
  if (typeof size === "number" && size > MAX_UPLOAD_BYTES) {
    return { ok: false, status: 413, error: "File too large" };
  }
  const resolved = resolveUploadType({ mimeType, filename });
  if (!resolved) {
    return { ok: false, status: 400, error: "Unsupported file type" };
  }
  return { ok: true, mime: resolved.mime, ext: resolved.ext };
}
