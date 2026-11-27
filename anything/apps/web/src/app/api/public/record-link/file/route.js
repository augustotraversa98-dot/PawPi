import sql from "@/app/api/utils/sql";
import { withRequestContext, withSavepoint } from "@/app/api/utils/requestContext";
import { createSignedMediaUrl, parsePrivateMediaKey } from "@/app/api/utils/mediaAccess";
import {
  RECORD_LINK_BODY_BYTES,
  RECORD_LINK_FILE_SECONDS,
  answer,
  hashLinkToken,
  isLinkToken,
  isMissingSchema,
  limitPublicRequest,
  linkNotValid,
  readSmallJson,
  tooLarge,
} from "@/app/api/utils/recordLink";

const KINDS = ["document", "photo"];

const notAvailable = (status) => answer({ error: "File not available right now" }, status);

// POST /api/public/record-link/file { token, kind: 'document'|'photo', id } → 200 { url, expiresIn }: a signed address
// of about a minute for one file of a section this link shares. Checked on every call.
//   403 'link_not_valid' (unusable link, or nothing of what it shares) · 409 'file_not_available' (shared, but its file
//   is not a private file of this pet: it is not handed out through a link) · 413 · 429 · 502

// The checks, inside the request transaction: an error answer, or the key of the file to sign.
async function findFile(request, { body }) {
  try {
    const limited = await limitPublicRequest("record_link_file", request);
    if (limited) return limited;

    if (!isLinkToken(body.token)) return linkNotValid();
    const id = body.id;
    if (!KINDS.includes(body.kind) || !Number.isInteger(id) || id <= 0 || id > 2147483647) {
      return answer({ error: "kind and id are required" }, 400);
    }

    let rows;
    try {
      rows = await withSavepoint(async () => {
        return await sql`
          SELECT pet_id, media_key
          FROM app_record_link_file(${hashLinkToken(body.token)}, ${body.kind}, ${id}::int)
        `;
      });
    } catch (error) {
      if (!isMissingSchema(error)) throw error;
      return linkNotValid();
    }
    if (rows.length === 0) return linkNotValid();

    const { pet_id: petId, media_key: key } = rows[0];
    if (parsePrivateMediaKey(key)?.petId !== petId) {
      return answer(
        { error: "This file is not available through a link", code: "file_not_available" },
        409,
      );
    }
    return { key };
  } catch (error) {
    console.error("[POST /api/public/record-link/file] Error:", error.message);
    return notAvailable(500);
  }
}

const inTransaction = withRequestContext(findFile);

// The body is read, and capped, before a database transaction or a counter lock is held, and the storage service is
// asked for the address after the transaction has ended.
async function receive(request) {
  const body = await readSmallJson(request, RECORD_LINK_BODY_BYTES);
  if (body === null) return tooLarge();
  const found = await inTransaction(request, { body });
  if (found instanceof Response) return found;
  try {
    const url = await createSignedMediaUrl(found.key, RECORD_LINK_FILE_SECONDS);
    return answer({ url, expiresIn: RECORD_LINK_FILE_SECONDS });
  } catch (e) {
    console.error("[POST /api/public/record-link/file] sign failed:", e?.message);
    return notAvailable(502);
  }
}
export { receive as POST };
