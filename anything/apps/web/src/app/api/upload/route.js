import { randomUUID } from "node:crypto";
import { auth } from "@/auth";
import {
  validateUpload,
  MAX_UPLOAD_BYTES,
} from "@/app/api/utils/uploadValidation";
import { withRequestContext } from "@/app/api/utils/requestContext";
import { withRateLimit } from "@/app/api/utils/rateLimit";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { resolvePetLogOwner } from "@/app/api/utils/petLogAccess";
import {
  PRIVATE_BUCKET,
  buildPrivateMediaKey,
} from "@/app/api/utils/mediaAccess";

const BUCKET = "media";

// Uploads an image to Supabase Storage (public `media` bucket) server-side,
// using the service_role key so the key never reaches the device. Accepts
// multipart/form-data with a `file` field and returns { url, mimeType } where
// `url` is the public URL — the same shape the mobile useUpload hook expects.
async function POST(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/+$/, "");
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
      console.error("[api/upload] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
      return Response.json({ error: "Storage not configured" }, { status: 500 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || typeof file === "string") {
      return Response.json({ error: "file is required" }, { status: 400 });
    }

    // Type + size gate (S3): only the content types the app actually uploads (images, PDF, CSV/XLSX)
    // and a size cap. We store the VALIDATED mime below, never the raw client-declared one, so an
    // active-markup type (text/html, image/svg+xml, …) can neither pass nor be served as active
    // content from the public bucket.
    const validation = validateUpload({
      mimeType: file.type,
      filename: file.name,
      size: file.size,
    });
    if (!validation.ok) {
      return Response.json({ error: validation.error }, { status: validation.status });
    }
    const mimeType = validation.mime;
    const ext = validation.ext;

    // (AUDIT A-04) Private mode: medical/chat callers pass visibility=private +
    // petId. The file goes to the PRIVATE bucket under an owner-scoped prefix
    // (pets/<petId>/<uuid>.<ext>) and the response returns the object KEY (served
    // later, auth-gated, via GET /api/media). The caller must own/have family
    // access to that pet. Public mode (the default) is unchanged.
    const visibility = formData.get("visibility");
    const isPrivate = visibility === "private";
    let bucket = BUCKET;
    let objectPath = `uploads/${randomUUID()}.${ext}`;
    if (isPrivate) {
      const petId = Number(formData.get("petId"));
      if (!Number.isInteger(petId) || petId <= 0) {
        return Response.json(
          { error: "petId is required for a private upload" },
          { status: 400 },
        );
      }
      const userId = await resolveUserId(session.user.id);
      if (userId === null) {
        return Response.json({ error: "User profile not found" }, { status: 404 });
      }
      const access = await resolvePetLogOwner(userId, petId);
      if (access.error) {
        return Response.json({ error: access.error }, { status: access.status });
      }
      bucket = PRIVATE_BUCKET;
      objectPath = buildPrivateMediaKey(petId, randomUUID(), ext);
    }

    const bytes = await file.arrayBuffer();
    // Belt-and-suspenders: file.size can be absent on some Blob shapes — enforce the cap on the
    // bytes we actually read too.
    if (bytes.byteLength > MAX_UPLOAD_BYTES) {
      return Response.json({ error: "File too large" }, { status: 413 });
    }

    const uploadResponse = await fetch(
      `${supabaseUrl}/storage/v1/object/${bucket}/${objectPath}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
          "Content-Type": mimeType,
          "x-upsert": "true",
        },
        body: bytes,
      },
    );

    if (!uploadResponse.ok) {
      const detail = await uploadResponse.text();
      console.error(
        "[api/upload] Supabase upload failed:",
        uploadResponse.status,
        detail,
      );
      return Response.json({ error: "Upload failed" }, { status: 502 });
    }

    if (isPrivate) {
      // Store the KEY, not a URL. The client persists this and later fetches the
      // file through GET /api/media?key=… (auth-gated + short-lived signed URL).
      return Response.json({ key: objectPath, mimeType });
    }

    const url = `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${objectPath}`;
    return Response.json({ url, mimeType });
  } catch (error) {
    console.error("[api/upload] Error:", error);
    return Response.json({ error: "Upload failed" }, { status: 500 });
  }
}

// #6: wrap in a request context (so the Postgres-backed limiter has a transaction to count in) and
// rate limit uploads to cap storage/cost flooding. withRequestContext is a no-op passthrough in unit
// tests (no real pool) — the route behaves exactly as before there.
const wrappedPOST = withRequestContext(withRateLimit("upload_create", POST));
export { wrappedPOST as POST };
