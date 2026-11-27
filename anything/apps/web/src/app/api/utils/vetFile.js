// A document a vet adds to an owner's record: a PDF or a photo, stored in the PRIVATE bucket under the pet's prefix
// (see mediaAccess.js). The type is checked against the file's first bytes, not only against what the sender declares.

import { randomUUID } from "node:crypto";
import { PRIVATE_BUCKET, buildPrivateMediaKey } from "./mediaAccess";
import { resolveUploadType } from "./uploadValidation";

const ascii = (bytes, from, to) => String.fromCharCode(...bytes.subarray(from, to));
const startsWith = (bytes, ...values) => values.every((v, i) => bytes[i] === v);

const SIGNATURES = {
  "application/pdf": (b) => ascii(b, 0, 5) === "%PDF-",
  "image/jpeg": (b) => startsWith(b, 0xff, 0xd8, 0xff),
  "image/png": (b) => startsWith(b, 0x89, 0x50, 0x4e, 0x47),
  "image/webp": (b) => ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP",
  "image/heic": (b) => ascii(b, 4, 8) === "ftyp",
  "image/heif": (b) => ascii(b, 4, 8) === "ftyp",
};

/**
 * @returns {Promise<{ bytes: Uint8Array, mime: string, ext: string } | { status: number, code: string }>}
 */
export async function readVetFile(file, maxBytes) {
  if (!file || typeof file === "string") return { status: 400, code: "file_required" };
  if (file.size > maxBytes) return { status: 413, code: "file_too_large" };
  const type = resolveUploadType({ mimeType: file.type, filename: file.name });
  if (!type || !SIGNATURES[type.mime]) return { status: 400, code: "file_type" };
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength > maxBytes) return { status: 413, code: "file_too_large" };
  if (bytes.byteLength === 0 || !SIGNATURES[type.mime](bytes)) return { status: 400, code: "file_type" };
  return { bytes, ...type };
}

function storage() {
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Storage not configured");
  return { url, headers: { Authorization: `Bearer ${key}`, apikey: key } };
}

const STORAGE_TIMEOUT_MS = 30000;

/** Stores the checked file as a private file of the pet and returns its key. */
export async function storeVetFile(petId, { bytes, mime, ext }) {
  const { url, headers } = storage();
  const key = buildPrivateMediaKey(petId, randomUUID(), ext);
  const response = await fetch(`${url}/storage/v1/object/${PRIVATE_BUCKET}/${key}`, {
    method: "POST",
    headers: { ...headers, "Content-Type": mime },
    body: bytes,
    signal: AbortSignal.timeout(STORAGE_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`upload failed: ${response.status}`);
  return key;
}

/** Best effort: removes a file whose record was not saved. */
export async function discardVetFile(key) {
  try {
    const { url, headers } = storage();
    await fetch(`${url}/storage/v1/object/${PRIVATE_BUCKET}/${key}`, {
      method: "DELETE",
      headers,
      signal: AbortSignal.timeout(STORAGE_TIMEOUT_MS),
    });
  } catch (error) {
    console.error("[discardVetFile] could not remove an unsaved file:", error?.message);
  }
}

export const DOCUMENT_CATEGORIES = ["vaccine", "lab", "visit", "invoice", "other"];

/** The document fields of a form, as the database function takes them. */
export const documentData = (form, key, names) => ({
  name: form.get("name") ?? "",
  category: DOCUMENT_CATEGORIES.includes(form.get("category")) ? form.get("category") : "",
  document_date: form.get(names.date) ?? "",
  notes: form.get("notes") ?? "",
  file_key: key,
});
