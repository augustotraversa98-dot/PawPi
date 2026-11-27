import sql from "@/app/api/utils/sql";
import { withRequestContext, withSavepoint } from "@/app/api/utils/requestContext";
import { createSignedMediaUrl, parsePrivateMediaKey } from "@/app/api/utils/mediaAccess";
import {
  RECORD_LINK_FILE_SECONDS,
  answer,
  hashLinkToken,
  isLinkToken,
  isMissingSchema,
  limitPublicRequest,
  linkNotValid,
} from "@/app/api/utils/recordLink";

const KINDS = ["document", "photo"];

// POST /api/public/record-link/file { token, kind: 'document'|'photo', id } → 200 { url, expiresIn }: a signed address
// of about a minute for one file of a section this link shares. Checked on every call.
//   403 'link_not_valid' (unusable link, or nothing of what it shares) · 409 'file_not_available' (shared, but its file
//   is not a private file of this pet: it is not handed out through a link) · 429 · 502
async function POST(request) {
  try {
    const limited = await limitPublicRequest("record_link_file", request);
    if (limited) return limited;

    const body = (await request.json().catch(() => null)) ?? {};
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

    let url;
    try {
      url = await createSignedMediaUrl(key, RECORD_LINK_FILE_SECONDS);
    } catch (e) {
      console.error("[POST /api/public/record-link/file] sign failed:", e?.message);
      return answer({ error: "File not available right now" }, 502);
    }
    return answer({ url, expiresIn: RECORD_LINK_FILE_SECONDS });
  } catch (error) {
    console.error("[POST /api/public/record-link/file] Error:", error.message);
    return answer({ error: "File not available right now" }, 500);
  }
}

const wrappedPOST = withRequestContext(POST);
export { wrappedPOST as POST };
