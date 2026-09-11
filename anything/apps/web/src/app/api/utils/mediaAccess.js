// AUDIT A-04 — private medical/chat media.
//
// Medical files (vet PDFs, health/stool/vomit photos, chat attachments) live in
// a PRIVATE bucket (`media-private`, created by the storage runbook), under an
// owner-scoped prefix `pets/<petId>/<uuid>.<ext>`. The DB stores the object KEY,
// not a URL. Access goes through GET /api/media?key=… which authorises the caller
// against that pet and hands back a short-lived signed URL — so the file is never
// a permanent unauthenticated bearer URL the way the public bucket made it.

export const PRIVATE_BUCKET = "media-private";

// A valid private key is exactly `pets/<positive int>/<uuid>.<ext>`. This bounds
// what GET /api/media will sign (no path traversal, no arbitrary bucket object)
// and lets the gate pull the petId to authorise against.
const KEY_RE = /^pets\/(\d+)\/[a-zA-Z0-9._-]+$/;

export function parsePrivateMediaKey(key) {
  if (typeof key !== "string") return null;
  // Reject traversal + absolute paths defensively even before the regex.
  if (key.includes("..") || key.startsWith("/")) return null;
  const m = KEY_RE.exec(key);
  if (!m) return null;
  return { petId: Number(m[1]) };
}

// Build the owner-scoped object key for a fresh private upload.
export function buildPrivateMediaKey(petId, uuid, ext) {
  return `pets/${Number(petId)}/${uuid}.${ext}`;
}

// Ask Supabase Storage for a short-lived signed URL for a private object. Uses
// the service-role key (server-only). Returns the absolute URL or throws.
export async function createSignedMediaUrl(key, expiresIn = 60) {
  const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error("Storage not configured");
  }
  const res = await fetch(
    `${supabaseUrl}/storage/v1/object/sign/${PRIVATE_BUCKET}/${key}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ expiresIn }),
    },
  );
  if (!res.ok) {
    throw new Error(`sign failed: ${res.status}`);
  }
  const data = await res.json();
  // Supabase returns { signedURL: "/object/sign/<bucket>/<key>?token=…" }.
  const signed = data.signedURL || data.signedUrl;
  if (!signed) throw new Error("sign response missing signedURL");
  return `${supabaseUrl}/storage/v1${signed}`;
}
