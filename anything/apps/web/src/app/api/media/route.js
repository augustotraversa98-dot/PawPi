import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { resolvePetLogOwner } from "@/app/api/utils/petLogAccess";
import { withRequestContext, withSavepoint } from "@/app/api/utils/requestContext";
import { assertCareAccess } from "@/app/api/utils/careAccess";
import {
  parsePrivateMediaKey,
  createSignedMediaUrl,
} from "@/app/api/utils/mediaAccess";

// GET /api/media?key=pets/<petId>/<uuid>.<ext>[&providerId=<id>] — AUDIT A-04.
//
// The authenticated gateway to a PRIVATE medical/chat file. Authorises the caller
// against the pet the key is scoped to, then 302-redirects to a 60 s signed URL
// for the object in the private bucket. The file is therefore never a permanent
// unauthenticated bearer URL.
//
// Two authorised callers:
//   • OWNER or accepted FAMILY caregiver of the pet (resolvePetLogOwner) — the
//     common case (owner-side vet record / health photos / chat).
//   • PROVIDER staff acting as ?providerId, holding an active `medical_read`
//     care-access grant for the pet (assertCareAccess). The key carries only the
//     petId, so a provider states which provider it acts as via ?providerId; the
//     grant check + append-only audit row are exactly the sanctioned provider→
//     pet-data path (docs/provider-design.md §3). Used e.g. when a vet opens an
//     attachment the owner sent in provider chat.
// A caller who is neither gets the same 403/404 the owner-only gate returns —
// existence is never leaked beyond "you can't see this".
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

    // 1) Owner OR accepted family caregiver of the pet the key is scoped to.
    const access = await resolvePetLogOwner(userId, parsed.petId);
    let authorized = !access.error;

    // 2) Provider fallback: active staff of ?providerId holding a medical_read
    //    grant for this pet. assertCareAccess writes an append-only audit row on
    //    success, so wrap it in a savepoint — a denial (CareAccessError) or a
    //    failed audit insert then rolls back cleanly and can never poison the
    //    outer request transaction (see withRequestContext gotcha).
    if (!authorized) {
      const providerId = Number(searchParams.get("providerId"));
      if (Number.isInteger(providerId) && providerId > 0) {
        try {
          await withSavepoint(() =>
            assertCareAccess(parsed.petId, providerId, "medical_read", {
              staffUserId: userId,
              action: "read",
              resource: `media:${key}`,
            }),
          );
          authorized = true;
        } catch {
          // Not authorised via this provider → fall through to the deny below.
        }
      }
    }

    if (!authorized) {
      return Response.json(
        { error: access.error ?? "Pet not found or access denied" },
        { status: access.status ?? 403 },
      );
    }

    let signedUrl;
    try {
      signedUrl = await createSignedMediaUrl(key, 60);
    } catch (e) {
      console.error("[api/media] sign failed:", e?.message);
      return Response.json({ error: "Media not available" }, { status: 502 });
    }

    // Two response shapes, both short-lived (never cache — the signed URL expires
    // in 60 s):
    //   • default: 302 → the signed URL (a browser <img>/<a> follows it directly).
    //   • ?json=1: { url } as JSON — the mobile client uses this because React
    //     Native's fetch can't reliably read a manual-redirect Location, and a
    //     native <Image> can't carry the caller's Authorization header. The app
    //     fetches the signed URL as JSON (auth handled by the fetch wrapper) and
    //     renders that URL, which needs no auth.
    if (searchParams.get("json") === "1") {
      return Response.json(
        { url: signedUrl },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
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
