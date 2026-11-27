// A signed-in visitor of a record link gets their identity on the request even before their first use of the app, so
// what they add carries their name and stays theirs. A signed-out one has none.

import { auth } from "@/auth";
import { resolveOrCreateUserId } from "./currentUser";

// The database's text cannot hold the NUL character, so it is left out of what is stored.
export const withoutNul = (text) => (typeof text === "string" ? text.replaceAll("\u0000", "") : text);

export async function identifyVisitor() {
  const session = await auth();
  if (session?.user?.id) {
    const user = { ...session.user, name: withoutNul(session.user.name) };
    await resolveOrCreateUserId({ ...session, user });
  }
}
