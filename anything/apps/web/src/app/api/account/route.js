import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext, withSavepoint } from "@/app/api/utils/requestContext";
import { forgetCachedProfileId } from "@/app/api/utils/requestIdentity";
import { notifyPetShare, actorDisplayName } from "@/app/api/utils/petShareNotify";

// DELETE /api/account — in-app ACCOUNT DELETION (App Store readiness, ticket 2.78; Apple 5.1.1(v)).
// Irreversibly deletes the CALLER's account + all owner-scoped data via the SECURITY DEFINER delete_my_account() (0062, reworked by 0142),
// then the client clears its session/token and returns to onboarding. This is DISTINCT from "Reset App Data" (a local logout) — it removes
// the account server-side.
//
// FAMILY SHARING (PR 4, owner decision 1):
//   • An OWNER deleting their account takes the pet and everything on it with it — but the people it was shared with are TOLD FIRST
//     (`pet_share_owner_deleted`, in this same transaction: if the deletion fails, nothing was sent).
//   • A MEMBER deleting their account does NOT delete what they contributed to someone else's pet: their posts there, their vet-record
//     attribution and their grant history are re-attributed to an anonymous "Former member" (done inside the DEFINER function, 0142). The
//     owners of the pets they were actively caring for are told (`pet_share_left`). `?delete_contributions=1` (or {"delete_contributions":true})
//     deletes the member's POSTS on others' pets instead (the optional, stricter choice) — without migration 0142 the previous behaviour
//     (everything the member wrote is deleted) applies either way.
//
// DB is porsager's tagged-template `sql`.
async function DELETE(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    // The process-wide auth id -> profile id cache must not outlive the account (requestIdentity.js).
    forgetCachedProfileId(session.user.id);
    // Establish the caller's identity so delete_my_account() resolves current_app_user_id(). A user
    // with no profile yet (never created a pet) still has an auth row — fall back to deleting that.
    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      await sql`DELETE FROM auth_users WHERE id = ${session.user.id}`;
      return Response.json({ ok: true, deleted: "auth_only" });
    }

    let deleteContributions = false;
    try {
      const url = new URL(request.url);
      deleteContributions = url.searchParams.get("delete_contributions") === "1";
      if (!deleteContributions && request.headers.get("content-type")?.includes("json")) {
        const body = await request.json().catch(() => null);
        deleteContributions = body?.delete_contributions === true;
      }
    } catch {
      /* no options */
    }

    await notifyBeforeDeletion(userId);

    let res;
    if (deleteContributions) {
      try {
        res = await withSavepoint(() => sql`SELECT app_delete_my_account(true) AS ok`);
      } catch (e) {
        if (e?.code !== "42883") throw e;
        // migration 0142 absent: the previous delete_my_account() already deletes everything the member wrote
        res = await sql`SELECT delete_my_account() AS ok`;
      }
    } else {
      res = await sql`SELECT delete_my_account() AS ok`;
    }
    if (!res[0]?.ok) {
      return Response.json({ error: "Account not found" }, { status: 404 });
    }
    return Response.json({ ok: true });
  } catch (error) {
    console.error("[DELETE /api/account] Error:", error.message);
    return Response.json({ error: "Failed to delete account" }, { status: 500 });
  }
}

// Tell the people this deletion affects, BEFORE the data goes (same transaction). Best-effort and savepoint-isolated: a notification problem
// can never block someone from deleting their account.
async function notifyBeforeDeletion(userId) {
  try {
    const actorName = await actorDisplayName(userId);
    // (a) members of the caller's pets: the dog will no longer be shared with them
    let members = [];
    await withSavepoint(async () => {
      members = await sql`
        SELECT DISTINCT pc.grantee_user_id AS recipient, pc.pet_id, p.name AS pet_name
        FROM pet_caregivers pc
        JOIN pets p ON p.id = pc.pet_id
        WHERE pc.owner_user_id = ${userId} AND pc.status IN ('pending', 'active')
      `;
    });
    for (const m of members) {
      await notifyPetShare({ type: "pet_share_owner_deleted", recipient: m.recipient, actor: userId, petId: m.pet_id, petName: m.pet_name, actorName });
    }
    // (b) owners of the pets the caller was actively caring for: this member is gone
    let owners = [];
    await withSavepoint(async () => {
      owners = await sql`
        SELECT DISTINCT pc.owner_user_id AS recipient, pc.pet_id, p.name AS pet_name
        FROM pet_caregivers pc
        JOIN pets p ON p.id = pc.pet_id
        WHERE pc.grantee_user_id = ${userId} AND pc.status = 'active'
      `;
    });
    for (const o of owners) {
      await notifyPetShare({ type: "pet_share_left", recipient: o.recipient, actor: userId, petId: o.pet_id, petName: o.pet_name, actorName });
    }
  } catch (e) {
    console.error("[DELETE /api/account] notify-before-delete non-fatal:", e?.message);
  }
}

const wrappedDELETE = withRequestContext(DELETE);
export { wrappedDELETE as DELETE };
