// A signed-in visitor of a record link gets their identity on the request even before their first use of the app, so
// what they add carries their name and stays theirs. A signed-out one has none.

import { auth } from "@/auth";
import { resolveOrCreateUserId } from "./currentUser";
import { cleanText } from "./cleanText";

export async function identifyVisitor() {
  const session = await auth();
  if (session?.user?.id) {
    const user = { ...session.user, name: cleanText(session.user.name) };
    await resolveOrCreateUserId({ ...session, user });
  }
}
