// The requests the shared record page makes. The token only ever travels in the body.
//
// The session cookie is sent only when it matters: adding or editing a note (the author's name, and whose note it is),
// and reading the record while signed in (which of the notes are the visitor's own to edit).

export async function postRecordLink(path, body, { withSession = false, method = "POST" } = {}) {
  try {
    const response = await fetch(`/api/public/record-link/${path}`, {
      method,
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
