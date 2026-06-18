import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";

// PATCH /api/insurance-policies/[id] — the OWNER cancels, or activates after paying (Wave 7 ticket
// 2.72). Activation runs ONLY through the activate_insurance_policy DEFINER, which verifies an
// APPROVED 2.3 payment tied to this policy's owner+insurer — the owner can never self-activate via a
// raw status write (RLS owner_update forbids 'active'). A non-owner touches ZERO rows → 404.
//
// DB is porsager's tagged-template `sql`.
async function PATCH(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }
    const id = params.id;
    const body = (await request.json()) ?? {};
    const { action, payment_id } = body;

    if (action === "activate") {
      if (!payment_id) {
        return Response.json(
          { error: "payment_id is required to activate" },
          { status: 400 },
        );
      }
      // Owner must own this policy (else the DEFINER returns 'forbidden').
      const owns = await sql`
        SELECT id FROM insurance_policies WHERE id = ${id} AND owner_user_id = ${userId}
      `;
      if (owns.length === 0) {
        return Response.json(
          { error: "Policy not found or not authorized" },
          { status: 404 },
        );
      }
      const res = await sql`SELECT activate_insurance_policy(${id}, ${payment_id}) AS result`;
      const result = res[0]?.result;
      if (result === "active") {
        const row = await sql`SELECT * FROM insurance_policies WHERE id = ${id}`;
        return Response.json({ policy: row[0], result });
      }
      const code =
        result === "forbidden" ? 403 : result === "not_found" ? 404 : 409;
      return Response.json({ error: result }, { status: code });
    }

    if (action === "cancel") {
      const updated = await sql`
        UPDATE insurance_policies
        SET status = 'cancelled', updated_at = now()
        WHERE id = ${id} AND owner_user_id = ${userId}
        RETURNING *
      `;
      if (updated.length === 0) {
        return Response.json(
          { error: "Policy not found or not authorized" },
          { status: 404 },
        );
      }
      return Response.json({ policy: updated[0] });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    if (/row-level security/i.test(e?.message ?? "")) {
      return Response.json(
        { error: "That change isn't allowed on this policy" },
        { status: 400 },
      );
    }
    console.error("[PATCH /api/insurance-policies/[id]] Error:", e?.message);
    return Response.json({ error: "Failed to update policy" }, { status: 500 });
  }
}

const wrappedPATCH = withRequestContext(PATCH);
export { wrappedPATCH as PATCH };
