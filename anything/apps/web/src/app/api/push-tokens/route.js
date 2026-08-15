import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";

// /api/push-tokens — the caller's device Expo push-token registry (BN2 PR1).
// Owner-scoped (device_push_tokens is own-row FOR ALL under FORCE RLS, 0109). The
// mobile app registers/refreshes its token here after auth; the web push-send layer
// (utils/push.js) resolves a recipient's tokens via a DEFINER reader to ring the phone.
//
//   POST   : upsert one { token, platform } for the caller (idempotent on the token).
//   DELETE : remove one { token } for the caller (called on logout / token change).
//
// DB is porsager's tagged-template `sql` (SCHEMA_NOTES "neon→porsager"). Degrades
// clean while unmigrated (42P01 → friendly 503) — the app never depends on it to work.

async function POST(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    const body = (await request.json().catch(() => ({}))) ?? {};
    const token = typeof body.token === "string" ? body.token.trim() : "";
    const platform = body.platform === "android" ? "android" : "ios";
    if (!token) {
      return Response.json({ error: "token is required" }, { status: 400 });
    }

    // Upsert the caller's token. RLS (own-row) makes user_id load-bearing; the
    // UNIQUE(user_id, token) drives the conflict so a re-register is idempotent.
    let rows;
    try {
      rows = await sql`
        INSERT INTO device_push_tokens (user_id, token, platform)
        VALUES (${userId}, ${token}, ${platform})
        ON CONFLICT (user_id, token)
        DO UPDATE SET platform = EXCLUDED.platform, updated_at = now()
        RETURNING id, platform
      `;
    } catch (e) {
      if (e?.code === "42P01") {
        return Response.json(
          { error: "Push tokens are not available yet" },
          { status: 503 },
        );
      }
      throw e;
    }
    return Response.json({ ok: true, id: rows[0]?.id ?? null }, { status: 201 });
  } catch (e) {
    console.error("[POST /api/push-tokens] Error:", e?.message);
    return Response.json({ error: "Failed to register push token" }, { status: 500 });
  }
}

async function DELETE(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }
    const body = (await request.json().catch(() => ({}))) ?? {};
    const token = typeof body.token === "string" ? body.token.trim() : "";
    if (!token) {
      return Response.json({ error: "token is required" }, { status: 400 });
    }
    try {
      await sql`
        DELETE FROM device_push_tokens
        WHERE user_id = ${userId} AND token = ${token}
      `;
    } catch (e) {
      if (e?.code === "42P01") return Response.json({ ok: true });
      throw e;
    }
    return Response.json({ ok: true });
  } catch (e) {
    console.error("[DELETE /api/push-tokens] Error:", e?.message);
    return Response.json({ error: "Failed to remove push token" }, { status: 500 });
  }
}

const wrappedPOST = withRequestContext(POST);
const wrappedDELETE = withRequestContext(DELETE);
export { wrappedPOST as POST, wrappedDELETE as DELETE };
