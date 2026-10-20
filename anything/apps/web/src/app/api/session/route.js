import { auth } from "@/auth";

// GET /api/session — "is my bearer token still a live session?". The mobile app calls it ONCE
// when a first-party request comes back 401 WITHOUT the session_expired code, to decide whether
// that 401 was a dead session or something else. It goes through the same guards as every other
// /api route (including the server-side revocation check in __create/index.ts), needs no DB
// access, and never creates anything. A 401 gets the session_expired code from
// stampSessionExpired().
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return Response.json({ ok: true });
}
