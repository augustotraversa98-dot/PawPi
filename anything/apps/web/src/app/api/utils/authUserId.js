// auth_users.id is an integer, so a session `sub` is only trustworthy if it is a positive
// integer string/number. Anything else (e.g. the random-UUID sub minted by the pre-#582 Google
// OAuth path, which never created a user row) is a "ghost" session: using it in a query throws
// 22P02, which aborts the request transaction and 500s the whole request. Validate here, before
// any query, and treat a failure as unauthenticated (→ 401).
export function isValidAuthUserId(sub) {
  if (sub == null) return false;
  const s = String(sub);
  return /^[1-9]\d{0,14}$/.test(s);
}
