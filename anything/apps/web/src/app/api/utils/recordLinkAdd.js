// The answers for adding to a record through a link (migration 0160), shared by the record and document routes.

import { answer, linkNotValid } from "./recordLink";

const REFUSALS = {
  not_allowed: [403, "add_not_allowed", "This link does not allow adding that"],
  bad_data: [400, "bad_data", "Something in the entry is missing or not valid"],
  limit: [429, "record_limit", "This link reached its additions for today"],
  unavailable: [409, "add_unavailable", "Adding is not available yet"],
};

/** The answer for an outcome of the database functions; anything unknown is an unusable link. */
export function refuseAddition(outcome) {
  const refusal = REFUSALS[outcome];
  if (!refusal) return linkNotValid();
  const [status, code, error] = refusal;
  return answer({ error, code }, status);
}
