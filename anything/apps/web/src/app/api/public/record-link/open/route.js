import sql from "@/app/api/utils/sql";
import { withRequestContext, withSavepoint } from "@/app/api/utils/requestContext";
import {
  answer,
  hashLinkToken,
  isLinkToken,
  isMissingSchema,
  limitPublicRequest,
  linkNotValid,
} from "@/app/api/utils/recordLink";

// POST /api/public/record-link/open { token } → 200 { record }: the parts of the vet record the owner shared through
// this link (migration 0153). No account. POST so the token travels in the body, never in a URL. The link is checked
// on every call. 403 'link_not_valid' (one answer for every unusable link) · 429.
async function POST(request) {
  try {
    const limited = await limitPublicRequest("record_link_open", request);
    if (limited) return limited;

    const body = (await request.json().catch(() => null)) ?? {};
    if (!isLinkToken(body.token)) return linkNotValid();

    let rows;
    try {
      rows = await withSavepoint(async () => {
        return await sql`SELECT app_record_link_view(${hashLinkToken(body.token)}) AS record`;
      });
    } catch (error) {
      if (!isMissingSchema(error)) throw error;
      return linkNotValid();
    }
    const record = rows?.[0]?.record ?? null;
    if (record === null) return linkNotValid();

    return answer({ record });
  } catch (error) {
    console.error("[POST /api/public/record-link/open] Error:", error.message);
    return answer({ error: "Failed to open the link" }, 500);
  }
}

const wrappedPOST = withRequestContext(POST);
export { wrappedPOST as POST };
