import sql from "@/app/api/utils/sql";
import { identifyVisitor } from "@/app/api/utils/recordLinkVisitor";
import { cleanText } from "@/app/api/utils/cleanText";
import { withRequestContext, withSavepoint } from "@/app/api/utils/requestContext";
import { refuseAddition } from "@/app/api/utils/recordLinkAdd";
import {
  RECORD_LINK_NOTE_BODY_BYTES,
  answer,
  hashLinkToken,
  isLinkToken,
  isMissingSchema,
  limitPublicRequest,
  linkNotValid,
  readSmallJson,
  tooLarge,
} from "@/app/api/utils/recordLink";

// POST /api/public/record-link/records { token, section: 'vaccines' | 'lab_results', data } → 201 { record: { id },
// author_name }: adds one vaccination or lab result through a link whose owner allows it (migration 0160). No account
// needed. The author is whoever the session says is signed in, otherwise nobody. Nothing can be changed or removed.
//   vaccines data: { name*, date_given?, expires_on?, lot?, clinic_name?, notes? }
//   lab_results data: { test_name*, test_date*, results?, ordered_by?, notes? }
//   403 'link_not_valid' | 'add_not_allowed' · 400 'bad_data' · 409 'add_unavailable' · 413
//   429 'record_limit' | 'rate_limited'

const SECTIONS = ["vaccines", "lab_results"];
const FIELDS = {
  vaccines: ["name", "date_given", "expires_on", "lot", "clinic_name", "notes"],
  lab_results: ["test_name", "test_date", "results", "ordered_by", "notes"],
};

async function addRecord(request, { body }) {
  try {
    const limited = await limitPublicRequest("record_link_add", request);
    if (limited) return limited;

    if (!isLinkToken(body.token)) return linkNotValid();
    if (!SECTIONS.includes(body.section)) return refuseAddition("not_allowed");
    // Only the known text fields of this part are passed on.
    const data = {};
    for (const field of FIELDS[body.section]) {
      const value = body.data?.[field];
      if (typeof value === "string") data[field] = cleanText(value);
    }

    await identifyVisitor();

    let rows;
    try {
      rows = await withSavepoint(async () => {
        return await sql`
          SELECT outcome, record_id, author
          FROM app_record_link_add_record(
            ${hashLinkToken(body.token)}, ${body.section}, ${JSON.stringify(data)}::text::jsonb)
        `;
      });
    } catch (error) {
      if (!isMissingSchema(error)) throw error;
      return refuseAddition("unavailable");
    }
    const result = rows?.[0];
    if (result?.outcome === "added") {
      return answer({ record: { id: result.record_id }, author_name: result.author }, 201);
    }
    return refuseAddition(result?.outcome);
  } catch (error) {
    console.error("[POST /api/public/record-link/records] Error:", error.message);
    return answer({ error: "Failed to add the record" }, 500);
  }
}

const inTransaction = withRequestContext(addRecord);

// The body is read, and capped, before a database transaction or a counter lock is held.
async function receive(request) {
  const body = await readSmallJson(request, RECORD_LINK_NOTE_BODY_BYTES * 4);
  if (body === null) return tooLarge();
  return inTransaction(request, { body });
}
export { receive as POST };
