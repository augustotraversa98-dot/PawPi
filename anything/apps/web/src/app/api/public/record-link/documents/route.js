import sql from "@/app/api/utils/sql";
import { identifyVisitor, withoutNul } from "@/app/api/utils/recordLinkVisitor";
import { withRequestContext, withSavepoint } from "@/app/api/utils/requestContext";
import { refuseAddition } from "@/app/api/utils/recordLinkAdd";
import { discardVetFile, documentData, readVetFile, storeVetFile } from "@/app/api/utils/vetFile";
import {
  answer,
  hashLinkToken,
  isLinkToken,
  isMissingSchema,
  limitPublicRequest,
  linkNotValid,
  tooLarge,
} from "@/app/api/utils/recordLink";

// POST /api/public/record-link/documents (multipart: token, file, name, category?, documentDate?, notes?)
// → 201 { record: { id }, author_name }: adds one PDF or photo (at most 10 MB) to the pet's documents through a link
// whose owner allows it (migration 0160). No account needed. The token travels in the body. The link is checked before
// the file is stored and again, under its lock, when the row is written; the file is stored outside any transaction.
//   403 'link_not_valid' | 'add_not_allowed' · 400 'bad_data' | 'file_required' | 'file_type' · 409 'add_unavailable'
//   413 'too_large' | 'file_too_large' · 429 'record_limit' | 'rate_limited' · 502

export const RECORD_LINK_FILE_BYTES = 10 * 1024 * 1024;
// The file plus the few text fields and the multipart wrapping.
const BODY_BYTES = RECORD_LINK_FILE_BYTES + 64 * 1024;

// The multipart form, read up to the cap: null when it is longer (the rest is never read), undefined when unreadable.
async function readCappedForm(request) {
  if (Number(request.headers.get("content-length")) > BODY_BYTES) return null;
  const reader = request.body?.getReader();
  if (!reader) return undefined;
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > BODY_BYTES) {
        reader.cancel().catch(() => {});
        return null;
      }
      chunks.push(value);
    }
    const headers = { "content-type": request.headers.get("content-type") ?? "" };
    return await new Response(Buffer.concat(chunks), { headers }).formData();
  } catch {
    return undefined;
  }
}

const check = withRequestContext(async (request, { token }) => {
  const limited = await limitPublicRequest("record_link_upload", request);
  if (limited) return limited;
  if (!isLinkToken(token)) return linkNotValid();
  let rows;
  try {
    rows = await withSavepoint(async () => {
      return await sql`
        SELECT outcome, pet_id FROM app_record_link_check_edit(${hashLinkToken(token)}, 'files')
      `;
    });
  } catch (error) {
    if (!isMissingSchema(error)) throw error;
    return refuseAddition("unavailable");
  }
  return rows?.[0]?.outcome === "ok" ? { petId: rows[0].pet_id } : refuseAddition(rows?.[0]?.outcome);
});

const save = withRequestContext(async (request, { token, data }) => {
  await identifyVisitor();
  const rows = await sql`
    SELECT outcome, record_id, author
    FROM app_record_link_add_record(${hashLinkToken(token)}, 'files', ${JSON.stringify(data)}::text::jsonb)
  `;
  const result = rows?.[0];
  if (result?.outcome === "added") {
    return answer({ record: { id: result.record_id }, author_name: result.author }, 201);
  }
  return refuseAddition(result?.outcome);
});

async function receive(request) {
  try {
    const form = await readCappedForm(request);
    if (form === null) return tooLarge();
    if (form === undefined) return refuseAddition("bad_data");
    const token = form.get("token");

    const allowed = await check(request, { token });
    if (allowed instanceof Response) return allowed;

    const clean = new Map(
      ["name", "category", "documentDate", "notes"].map((k) => [k, withoutNul(form.get(k) ?? "")]),
    );
    if (!String(clean.get("name")).trim()) return refuseAddition("bad_data");
    const file = await readVetFile(form.get("file"), RECORD_LINK_FILE_BYTES);
    if (file.status) {
      return answer({ error: "That file cannot be added", code: file.code }, file.status);
    }
    let key;
    try {
      key = await storeVetFile(allowed.petId, file);
    } catch (error) {
      console.error("[POST /api/public/record-link/documents] upload failed:", error?.message);
      return answer({ error: "File not available right now" }, 502);
    }
    const data = documentData(clean, key, { date: "documentDate" });
    const response = await save(request, { token, data });
    if (!response.ok) await discardVetFile(key);
    return response;
  } catch (error) {
    console.error("[POST /api/public/record-link/documents] Error:", error.message);
    return answer({ error: "Failed to add the document" }, 500);
  }
}
export { receive as POST };
