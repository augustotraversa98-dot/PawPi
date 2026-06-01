import { randomUUID } from "node:crypto";
import { auth } from "@/auth";

const BUCKET = "media";

// Uploads an image to Supabase Storage (public `media` bucket) server-side,
// using the service_role key so the key never reaches the device. Accepts
// multipart/form-data with a `file` field and returns { url, mimeType } where
// `url` is the public URL — the same shape the mobile useUpload hook expects.
export async function POST(request) {
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

    const mimeType = file.type || "application/octet-stream";
    const ext =
      (file.name?.split(".").pop() || mimeType.split("/").pop() || "bin")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "") || "bin";
    const objectPath = `uploads/${randomUUID()}.${ext}`;

    const bytes = await file.arrayBuffer();

    const uploadResponse = await fetch(
      `${supabaseUrl}/storage/v1/object/${BUCKET}/${objectPath}`,
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

    const url = `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${objectPath}`;
    return Response.json({ url, mimeType });
  } catch (error) {
    console.error("[api/upload] Error:", error);
    return Response.json({ error: "Upload failed" }, { status: 500 });
  }
}
