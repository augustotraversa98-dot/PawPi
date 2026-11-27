// The three requests the shared record page makes. The token only ever travels in the body.
//
// Reading needs no identity, so no cookie is sent with it. Adding a note sends this site's session cookie when there is
// one, which is how a signed-in visitor's name reaches the note.

export async function postRecordLink(path, body, { withSession = false } = {}) {
  try {
    const response = await fetch(`/api/public/record-link/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: withSession ? "same-origin" : "omit",
      cache: "no-store",
      referrerPolicy: "no-referrer",
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => null);
    return { status: response.status, data };
  } catch {
    return { status: 0, data: null };
  }
}
