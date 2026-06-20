import { queryClient } from "@/utils/queryClient";

// Moderation actions (Guideline 1.2, ticket T4) — report content + block a user. Plain async
// functions (NOT react-query hooks) so the shared ModerationMenu can drop into any surface
// without that surface's tree providing a QueryClientProvider. Cache invalidation after a block
// goes through the app's shared queryClient singleton. The patched global fetch injects the auth
// JWT + base URL, so relative paths are enough.

async function postJSON(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Request failed");
  }
  return res.json();
}

// Social caches that should drop a blocked user's content on the next fetch (enforced by T3).
const BLOCK_SENSITIVE_KEYS = [
  "posts",
  "forum-threads",
  "forum-thread",
  "dm-threads",
  "dm-messages",
  "threads",
  "thread-messages",
  "events",
  "social-walks",
  "pet-social-profile",
  "providers",
];

/**
 * Report a piece of UGC. Reporting is idempotent server-side (one open report per
 * (reporter,target)), so a double-report is a safe no-op.
 */
export async function reportContent({ targetType, targetId, reason, details }) {
  return postJSON("/api/reports", {
    target_type: targetType,
    target_id: targetId,
    reason,
    details,
  });
}

/**
 * Block a user. On success, invalidate the social caches so the blocked user's content
 * disappears on the next fetch (the read-path enforcement lives in T3).
 */
export async function blockUser({ blockedUserId }) {
  const res = await postJSON("/api/blocks", { blocked_user_id: blockedUserId });
  for (const key of BLOCK_SENSITIVE_KEYS) {
    queryClient.invalidateQueries({ queryKey: [key] });
  }
  return res;
}
