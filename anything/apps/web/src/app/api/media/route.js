import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { resolvePetLogOwner } from "@/app/api/utils/petLogAccess";
import { withRequestContext } from "@/app/api/utils/requestContext";
import {
  parsePrivateMediaKey,
  createSignedMediaUrl,
} from "@/app/api/utils/mediaAccess";

// GET /api/media?key=pets/<petId>/<uuid>.<ext> — AUDIT A-04.
//
// The authenticated gateway to a PRIVATE medical/chat file. Authorises the caller
// against the pet the key is scoped to (owner OR accepted family caregiver), then
// 302-redirects to a 60 s signed URL for the object in the private bucket. The
// file is therefore never a permanent unauthenticated bearer URL.
//
// Provider staff with an active care grant (assertCareAccess('medical_read')) are
// a documented follow-up — the owner/family path is the common case and is what
// the public-bucket leak exposed. See the storage runbook.
async function GET(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const key = searchParams.get("key");
    const parsed = parsePrivateMediaKey(key);
    if (!parsed) {
      return Response.json({ error: "Invalid media key" }, { status: 400 });
    }

    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    // Owner OR accepted family caregiver of the pet the key is scoped to. A
    // caller with neither gets the same 403/404 the owner-only gate returns —
    // existence is not leaked beyond "you can't see this".
    const access = await resolvePetLogOwner(userId, parsed.petId);
    if (access.error) {
      return Response.json({ error: access.error }, { status: access.status });
    }

    let signedUrl;
    try {
      signedUrl = await createSignedMediaUrl(key, 60);
    } catch (e) {
      console.error("[api/media] sign failed:", e?.message);
      return Response.json({ error: "Media not available" }, { status: 502 });
    }

    // 302 to the short-lived signed URL. Never cache the redirect (the signed URL
    // expires in 60 s).
    return new Response(null, {
      status: 302,
      headers: { Location: signedUrl, "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[api/media] Error:", error?.message);
    return Response.json({ error: "Media not available" }, { status: 500 });
  }
}

const wrappedGET = withRequestContext(GET);
export { wrappedGET as GET };
